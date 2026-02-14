/**
 * 知识图谱控制器
 * 处理知识图谱相关的 HTTP 请求
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const FileUpload = require('../models/FileUpload');
const GraphBuildTask = require('../models/GraphBuildTask');
const OntologyLibrary = require('../models/OntologyLibrary');

const documentParser = require('../services/documentParser');
const extractionService = require('../services/extractionService');
const alignmentService = require('../services/alignmentService');
const graphBuilder = require('../services/graphBuilder');

// 上传目录
const UPLOAD_DIR = path.join(__dirname, '../../uploads');

// 确保上传目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

class KGController {
    /**
     * 上传文件并启动知识抽取
     */
    uploadAndExtract = async (req, res) => {
        try {
            const files = req.files;
            const { ontologyMode = 'auto', ontologyId } = req.body;
            const userId = req.user?.id || 'admin';

            if (!files || files.length === 0) {
                return res.status(400).json({ success: false, message: '请选择要上传的文件' });
            }

            if (files.length > 10) {
                return res.status(400).json({ success: false, message: '最多同时上传10个文件' });
            }

            // 1. 保存文件并创建记录
            const fileRecords = [];
            for (const file of files) {
                const fileId = uuidv4();
                const filename = `${fileId}_${file.originalname}`;
                const filePath = path.join(UPLOAD_DIR, filename);

                // 移动文件
                fs.renameSync(file.path, filePath);

                // 检测文件类型
                const fileType = documentParser.detectFileType(file.originalname);
                if (!fileType) {
                    return res.status(400).json({ 
                        success: false, 
                        message: `不支持的文件格式: ${file.originalname}` 
                    });
                }

                // 创建文件记录
                const fileRecord = await FileUpload.create({
                    filename: filename,
                    originalName: file.originalname,
                    fileType: fileType,
                    fileSize: file.size,
                    filePath: filePath,
                    status: 'pending',
                    createdBy: userId
                });

                fileRecords.push({
                    fileId: fileRecord._id,
                    filename: file.originalname,
                    fileType,
                    filePath
                });
            }

            // 2. 创建图谱构建任务
            const task = await GraphBuildTask.create({
                taskType: 'user_confirmed',
                status: 'parsing',
                progress: 10,
                stageMessage: '正在解析文档...',
                files: fileRecords.map(f => ({ fileId: f.fileId, filename: f.filename })),
                ontologyMode,
                ontologyId: ontologyId || null,
                createdBy: userId
            });

            // 3. 异步处理文档解析和知识抽取
            this._processFilesAsync(task._id, fileRecords, ontologyMode, ontologyId);

            res.json({
                success: true,
                taskId: task._id,
                status: 'processing',
                message: '文件已上传，正在处理中...',
                fileCount: files.length
            });

        } catch (error) {
            console.error('上传文件失败:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    };

    /**
     * 异步处理文件（使用箭头函数保持 this 绑定）
     */
    _processFilesAsync = async (taskId, fileRecords, ontologyMode, ontologyId) => {
        try {
            // 1. 解析所有文件
            const parsedFiles = [];
            for (const file of fileRecords) {
                await FileUpload.findByIdAndUpdate(file.fileId, { status: 'processing' });
                
                const parsed = await documentParser.parse(file.filePath, file.fileType);
                parsedFiles.push({
                    ...file,
                    parsedData: parsed
                });

                await FileUpload.findByIdAndUpdate(file.fileId, {
                    status: 'completed',
                    extractedText: parsed.text,
                    extractedData: parsed,
                    processedTime: new Date()
                });
            }

            // 2. 知识抽取
            await extractionService.extractFromDocuments({
                files: parsedFiles,
                taskId,
                ontologyMode,
                ontologyId
            });

            // 3. 实体对齐
            await alignmentService.alignEntities(taskId);

        } catch (error) {
            console.error('异步处理失败:', error);
            await GraphBuildTask.findByIdAndUpdate(taskId, {
                status: 'failed',
                errorMessage: error.message
            });
        }
    }

    /**
     * 获取抽取结果
     */
    async getExtractResult(req, res) {
        try {
            const { taskId } = req.params;
            const task = await GraphBuildTask.findById(taskId)
                .populate('files.fileId', 'originalName fileType');

            if (!task) {
                return res.status(404).json({ success: false, message: '任务不存在' });
            }

            res.json({
                success: true,
                taskId: task._id,
                status: task.status,
                progress: task.progress,
                stageMessage: task.stageMessage,
                errorMessage: task.errorMessage,
                draftOntology: task.draftOntology,
                draftEntities: task.draftEntities,
                draftRelations: task.draftRelations
            });

        } catch (error) {
            console.error('获取结果失败:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * 用户确认并构建图谱
     */
    async confirmAndBuild(req, res) {
        try {
            const { taskId } = req.params;
            const modifications = req.body.modifications || {};

            const task = await GraphBuildTask.findById(taskId);
            if (!task) {
                return res.status(404).json({ success: false, message: '任务不存在' });
            }

            if (task.status !== 'confirming' && task.status !== 'failed') {
                return res.status(400).json({ 
                    success: false, 
                    message: `当前任务状态为 ${task.status}，无法确认构建` 
                });
            }

            // 执行图谱构建
            const result = await graphBuilder.buildGraph(taskId, modifications);

            res.json({
                success: true,
                message: '知识图谱构建成功',
                stats: result.stats
            });

        } catch (error) {
            console.error('构建图谱失败:', error);
            res.status(error.status || 500).json({ success: false, message: error.message });
        }
    }

    /**
     * 获取任务列表
     */
    async getTasks(req, res) {
        try {
            const { status, page = 1, limit = 10 } = req.query;
            const query = {};

            if (status) {
                query.status = status;
            }

            const tasks = await GraphBuildTask.find(query)
                .populate('files.fileId', 'originalName fileType')
                .sort({ createdAt: -1 })
                .skip((parseInt(page) - 1) * parseInt(limit))
                .limit(parseInt(limit));

            const total = await GraphBuildTask.countDocuments(query);

            res.json({
                success: true,
                data: tasks,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total
                }
            });

        } catch (error) {
            console.error('获取任务列表失败:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * 删除任务
     */
    async deleteTask(req, res) {
        try {
            const { taskId } = req.params;

            const task = await GraphBuildTask.findById(taskId);
            if (!task) {
                return res.status(404).json({ success: false, message: '任务不存在' });
            }

            // 删除关联的文件
            const fileIds = [];
            for (const file of task.files) {
                fileIds.push(file.fileId);
                const fileRecord = await FileUpload.findById(file.fileId);
                if (fileRecord && fs.existsSync(fileRecord.filePath)) {
                    try {
                        fs.unlinkSync(fileRecord.filePath);
                    } catch (e) {
                        console.warn(`文件删除失败: ${fileRecord.filePath}`, e);
                    }
                }
                await FileUpload.findByIdAndDelete(file.fileId);
            }

            // 删除 Neo4j 中的数据
            if (fileIds.length > 0) {
                await graphBuilder.deleteTaskData(fileIds);
            }

            await GraphBuildTask.findByIdAndDelete(taskId);

            res.json({ success: true, message: '任务已删除' });

        } catch (error) {
            console.error('删除任务失败:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // ==================== 本体管理接口 ====================

    /**
     * 获取本体列表
     */
    async getOntologies(req, res) {
        try {
            const ontologies = await OntologyLibrary.find({ isActive: true })
                .sort({ createdAt: -1 });

            res.json({
                success: true,
                data: ontologies
            });

        } catch (error) {
            console.error('获取本体列表失败:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * 获取本体详情
     */
    async getOntologyById(req, res) {
        try {
            const { id } = req.params;
            const ontology = await OntologyLibrary.findById(id);

            if (!ontology) {
                return res.status(404).json({ success: false, message: '本体不存在' });
            }

            res.json({
                success: true,
                data: ontology
            });

        } catch (error) {
            console.error('获取本体详情失败:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * 创建本体
     */
    async createOntology(req, res) {
        try {
            const { name, description, entityTypes, relationTypes } = req.body;
            const userId = req.user?.id || 'admin';

            const ontology = await OntologyLibrary.create({
                name,
                description,
                entityTypes: entityTypes || [],
                relationTypes: relationTypes || [],
                createdBy: userId
            });

            res.json({
                success: true,
                message: '本体创建成功',
                data: ontology
            });

        } catch (error) {
            console.error('创建本体失败:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * 更新本体
     */
    async updateOntology(req, res) {
        try {
            const { id } = req.params;
            const updateData = req.body;

            const ontology = await OntologyLibrary.findByIdAndUpdate(
                id,
                { ...updateData, updatedAt: new Date() },
                { new: true }
            );

            if (!ontology) {
                return res.status(404).json({ success: false, message: '本体不存在' });
            }

            res.json({
                success: true,
                message: '本体更新成功',
                data: ontology
            });

        } catch (error) {
            console.error('更新本体失败:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * 删除本体
     */
    async deleteOntology(req, res) {
        try {
            const { id } = req.params;

            const ontology = await OntologyLibrary.findByIdAndUpdate(
                id,
                { isActive: false },
                { new: true }
            );

            if (!ontology) {
                return res.status(404).json({ success: false, message: '本体不存在' });
            }

            res.json({ success: true, message: '本体已删除' });

        } catch (error) {
            console.error('删除本体失败:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // ==================== 图谱查询接口 ====================

    /**
     * 查询图谱
     */
    async queryGraph(req, res) {
        try {
            const { keyword, type, limit = 50, offset = 0 } = req.query;

            const entities = await graphBuilder.queryGraph({
                keyword,
                type,
                limit,
                offset
            });

            res.json({
                success: true,
                data: entities
            });

        } catch (error) {
            console.error('查询图谱失败:', error);
            res.status(error.status || 500).json({ success: false, message: error.message });
        }
    }

    /**
     * 获取实体详情及关系网络
     */
    async getEntityNetwork(req, res) {
        try {
            const { entityId } = req.params;
            const { depth = 1 } = req.query;

            const network = await graphBuilder.getEntityNetwork(entityId, parseInt(depth));

            res.json({
                success: true,
                data: network
            });

        } catch (error) {
            console.error('获取实体网络失败:', error);
            res.status(error.status || 500).json({ success: false, message: error.message });
        }
    }

    /**
     * 获取图谱统计
     */
    async getGraphStats(req, res) {
        try {
            const stats = await graphBuilder.getGraphStats();

            res.json({
                success: true,
                data: stats
            });

        } catch (error) {
            console.error('获取图谱统计失败:', error);
            res.status(error.status || 500).json({ success: false, message: error.message });
        }
    }

    /**
     * 搜索实体（用于前端自动补全）
     */
    async searchEntities(req, res) {
        try {
            const { q, type, limit = 10 } = req.query;

            if (!q || q.length < 2) {
                return res.json({ success: true, data: [] });
            }

            const result = await graphBuilder.queryGraph({
                keyword: q,
                type,
                limit
            });

            res.json({
                success: true,
                data: result.nodes.map(e => ({
                    id: e.id,
                    name: e.name,
                    type: e.type
                }))
            });

        } catch (error) {
            console.error('搜索实体失败:', error);
            res.status(error.status || 500).json({ success: false, message: error.message });
        }
    }
}

module.exports = new KGController();
