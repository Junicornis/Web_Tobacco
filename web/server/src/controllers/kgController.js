/**
 * 知识图谱控制器
 * 处理知识图谱相关的 HTTP 请求
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');

const FileUpload = require('../models/FileUpload');
const GraphBuildTask = require('../models/GraphBuildTask');
const OntologyLibrary = require('../models/OntologyLibrary');

const documentParser = require('../services/documentParser');
const extractionService = require('../services/extractionService');
const alignmentService = require('../services/alignmentService');
const graphBuilder = require('../services/graphBuilder');
const qaRouter = require('../services/qaRouter');
const vectorStore = require('../services/vectorStore');

function normalizeUploadedFilename(input) {
    const name = String(input || '').trim();
    if (!name) return 'file';

    const hasCjk = /[\u4e00-\u9fff]/.test(name);
    const hasLatin1 = /[\u00C0-\u00FF]/.test(name);

    let normalized = name;
    if (!hasCjk && hasLatin1) {
        const decoded = Buffer.from(name, 'latin1').toString('utf8');
        if (/[\u4e00-\u9fff]/.test(decoded) && !decoded.includes('\uFFFD')) {
            normalized = decoded;
        }
    }

    normalized = normalized
        .replace(/[\u0000-\u001F\u007F]/g, '_')
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, ' ')
        .trim();

    return normalized || 'file';
}

function splitTextToChunks(text, chunkSize = 800, chunkOverlap = 120) {
    const input = String(text || '');
    const size = Number.isFinite(Number(chunkSize)) ? Math.max(parseInt(chunkSize, 10), 1) : 800;
    const overlap = Number.isFinite(Number(chunkOverlap)) ? Math.max(parseInt(chunkOverlap, 10), 0) : 120;
    if (!input.trim()) return [];
    if (input.length <= size) return [input];
    const step = Math.max(size - overlap, 1);
    const chunks = [];
    for (let start = 0; start < input.length; start += step) {
        const end = Math.min(start + size, input.length);
        const chunk = input.slice(start, end).trim();
        if (chunk) chunks.push(chunk);
        if (end >= input.length) break;
    }
    return chunks;
}

async function findTaskByAnyId(taskId) {
    if (!taskId) return null;
    if (mongoose.Types.ObjectId.isValid(taskId)) {
        return GraphBuildTask.findById(taskId);
    }
    return GraphBuildTask.findOne({ clientTaskId: taskId });
}

function resolveTaskIdForResponse(task) {
    return task?.clientTaskId || task?._id;
}

function parseWaitOptionsFromQuery(query) {
    const wait = String(query?.wait || '').trim();
    const shouldWait = wait === '1' || wait.toLowerCase() === 'true';
    const timeoutSecRaw = Number(query?.timeoutSec);
    const timeoutSec = Number.isFinite(timeoutSecRaw) ? Math.min(Math.max(timeoutSecRaw, 1), 120) : 60;
    return { shouldWait, timeoutSec };
}

function buildTaskSummary(task) {
    const entitiesCount =
        Number.isFinite(task?.extractionMeta?.entityCount) ? task.extractionMeta.entityCount :
        Number.isFinite(task?.buildStats?.entityCount) ? task.buildStats.entityCount :
        Array.isArray(task?.draftEntities) ? task.draftEntities.length :
        null;

    const relationsCount =
        Number.isFinite(task?.extractionMeta?.relationCount) ? task.extractionMeta.relationCount :
        Number.isFinite(task?.buildStats?.relationCount) ? task.buildStats.relationCount :
        Array.isArray(task?.draftRelations) ? task.draftRelations.length :
        null;

    return {
        taskId: resolveTaskIdForResponse(task),
        status: task?.status,
        progress: task?.progress,
        stageMessage: task?.stageMessage,
        errorMessage: task?.errorMessage || null,
        entitiesCount,
        relationsCount,
        fileCount: Array.isArray(task?.files) ? task.files.length : null
    };
}

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
            const { ontologyMode = 'auto', ontologyId, clientTaskId, taskId } = req.body;
            const userId = req.user?.id || 'admin';
            const { shouldWait, timeoutSec } = parseWaitOptionsFromQuery(req.query);

            if (!files || files.length === 0) {
                return res.status(400).json({ success: false, message: '请选择要上传的文件' });
            }

            if (files.length > 10) {
                return res.status(400).json({ success: false, message: '最多同时上传10个文件' });
            }

            // 1. 保存文件并创建记录
            const fileRecords = [];
            for (const file of files) {
                const originalName = normalizeUploadedFilename(file.originalname);
                const fileId = uuidv4();
                const filename = `${fileId}_${originalName}`;
                const filePath = path.join(UPLOAD_DIR, filename);

                // 移动文件
                fs.renameSync(file.path, filePath);

                // 检测文件类型
                const fileType = documentParser.detectFileType(originalName);
                if (!fileType) {
                    return res.status(400).json({ 
                        success: false, 
                        message: `不支持的文件格式: ${originalName}` 
                    });
                }

                // 创建文件记录
                const fileRecord = await FileUpload.create({
                    filename: filename,
                    originalName,
                    fileType: fileType,
                    fileSize: file.size,
                    filePath: filePath,
                    status: 'pending',
                    createdBy: userId
                });

                fileRecords.push({
                    fileId: fileRecord._id,
                    filename: originalName,
                    fileType,
                    filePath
                });
            }

            // 2. 创建图谱构建任务
            const externalId = String(clientTaskId || taskId || '').trim() || null;
            if (externalId) {
                const existingTask = await GraphBuildTask.findOne({ clientTaskId: externalId });
                if (existingTask) {
                    return res.status(409).json({ success: false, message: '任务ID已存在，请重新上传' });
                }
            }
            const task = await GraphBuildTask.create({
                taskType: 'user_confirmed',
                status: 'parsing',
                progress: 10,
                stageMessage: '正在解析文档...',
                files: fileRecords.map(f => ({ fileId: f.fileId, filename: f.filename })),
                ontologyMode,
                ontologyId: ontologyId || null,
                clientTaskId: externalId,
                createdBy: userId
            });

            // 3. 异步处理文档解析和知识抽取
            this._processFilesAsync(task._id, fileRecords, ontologyMode, ontologyId);

            let latestTask = task;
            let timedOut = false;
            if (shouldWait) {
                const deadline = Date.now() + timeoutSec * 1000;
                latestTask = await GraphBuildTask.findById(task._id);
                while (latestTask && !['confirming', 'completed', 'failed'].includes(latestTask.status)) {
                    if (Date.now() >= deadline) {
                        timedOut = true;
                        break;
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    latestTask = await GraphBuildTask.findById(task._id);
                }
            }

            if (shouldWait && latestTask?.status === 'failed') {
                return res.status(500).json({
                    success: false,
                    taskId: resolveTaskIdForResponse(task),
                    message: latestTask?.errorMessage || '解析失败'
                });
            }

            res.json({
                success: true,
                ...buildTaskSummary(latestTask || task),
                timedOut,
                message: timedOut ? '任务仍在处理中，请在确认页继续查看' : '文件已上传，正在处理中...'
            });

        } catch (error) {
            console.error('上传文件失败:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    };

    uploadAndParse = async (req, res) => {
        try {
            const files = req.files;
            const { ontologyMode = 'auto', ontologyId, clientTaskId, taskId } = req.body;
            const userId = req.user?.id || 'admin';
            const { shouldWait, timeoutSec } = parseWaitOptionsFromQuery(req.query);

            if (!files || files.length === 0) {
                return res.status(400).json({ success: false, message: '请选择要上传的文件' });
            }

            if (files.length > 10) {
                return res.status(400).json({ success: false, message: '最多同时上传10个文件' });
            }

            const fileRecords = [];
            for (const file of files) {
                const originalName = normalizeUploadedFilename(file.originalname);
                const fileId = uuidv4();
                const filename = `${fileId}_${originalName}`;
                const filePath = path.join(UPLOAD_DIR, filename);

                fs.renameSync(file.path, filePath);

                const fileType = documentParser.detectFileType(originalName);
                if (!fileType) {
                    return res.status(400).json({
                        success: false,
                        message: `不支持的文件格式: ${originalName}`
                    });
                }

                const fileRecord = await FileUpload.create({
                    filename: filename,
                    originalName,
                    fileType: fileType,
                    fileSize: file.size,
                    filePath: filePath,
                    status: 'pending',
                    createdBy: userId
                });

                fileRecords.push({
                    fileId: fileRecord._id,
                    filename: originalName,
                    fileType,
                    filePath
                });
            }

            const externalId = String(clientTaskId || taskId || '').trim() || null;
            if (externalId) {
                const existingTask = await GraphBuildTask.findOne({ clientTaskId: externalId });
                if (existingTask) {
                    return res.status(409).json({ success: false, message: '任务ID已存在，请重新上传' });
                }
            }
            const task = await GraphBuildTask.create({
                taskType: 'user_confirmed',
                status: 'parsing',
                progress: 10,
                stageMessage: '正在解析文档...',
                files: fileRecords.map(f => ({ fileId: f.fileId, filename: f.filename })),
                ontologyMode,
                ontologyId: ontologyId || null,
                clientTaskId: externalId,
                createdBy: userId
            });

            this._parseFilesAsync(task._id, fileRecords);

            let latestTask = task;
            let timedOut = false;
            if (shouldWait) {
                const deadline = Date.now() + timeoutSec * 1000;
                latestTask = await GraphBuildTask.findById(task._id);
                while (latestTask && !['ready', 'failed'].includes(latestTask.status)) {
                    if (Date.now() >= deadline) {
                        timedOut = true;
                        break;
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    latestTask = await GraphBuildTask.findById(task._id);
                }
            }

            if (shouldWait && latestTask?.status === 'failed') {
                return res.status(500).json({
                    success: false,
                    taskId: resolveTaskIdForResponse(task),
                    message: latestTask?.errorMessage || '解析失败'
                });
            }

            res.json({
                success: true,
                ...buildTaskSummary(latestTask || task),
                timedOut,
                files: fileRecords.map(f => ({ fileId: f.fileId, filename: f.filename, fileType: f.fileType })),
                message: timedOut ? '原文仍在解析中，请稍后刷新' : '原文解析完成'
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

    _parseFilesAsync = async (taskId, fileRecords) => {
        try {
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

            await GraphBuildTask.findByIdAndUpdate(taskId, {
                status: 'ready',
                progress: 20,
                stageMessage: '已解析，等待开始构建'
            });

            return parsedFiles;
        } catch (error) {
            console.error('异步解析失败:', error);
            await GraphBuildTask.findByIdAndUpdate(taskId, {
                status: 'failed',
                errorMessage: error.message,
                stageMessage: '解析失败'
            });
            throw error;
        }
    }

    async startBuild(req, res) {
        let internalTaskId = null;
        try {
            const { taskId } = req.params;

            const task = await findTaskByAnyId(taskId);
            if (!task) {
                return res.status(404).json({ success: false, message: '任务不存在' });
            }

            if (task.status !== 'ready' && task.status !== 'failed') {
                return res.status(400).json({
                    success: false,
                    message: `当前任务状态为 ${task.status}，无法开始构建`
                });
            }

            internalTaskId = task._id;
            await GraphBuildTask.findByIdAndUpdate(internalTaskId, {
                status: 'extracting',
                progress: 25,
                stageMessage: '正在提取知识...'
            });

            const fileIds = Array.isArray(task.files) ? task.files.map(f => f.fileId).filter(Boolean) : [];
            if (fileIds.length === 0) {
                return res.status(400).json({ success: false, message: '任务未关联任何文件' });
            }

            const uploads = await FileUpload.find({ _id: { $in: fileIds } });
            const uploadMap = new Map(uploads.map(f => [String(f._id), f]));
            const parsedFiles = fileIds.map((id) => {
                const file = uploadMap.get(String(id));
                const extractedData = file?.extractedData || null;
                const extractedText = file?.extractedText || extractedData?.text || extractedData?.preview || '';
                return {
                    fileId: id,
                    filename: file?.originalName || 'file',
                    fileType: file?.fileType || null,
                    filePath: file?.filePath || null,
                    parsedData: extractedData || { text: extractedText, preview: String(extractedText).slice(0, 2000) }
                };
            });

            const missing = parsedFiles.filter(f => !f.parsedData || !(f.parsedData.text || f.parsedData.preview));
            if (missing.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: '文件尚未解析或解析内容为空，请先完成解析再开始构建'
                });
            }

            await extractionService.extractFromDocuments({
                files: parsedFiles,
                taskId: internalTaskId,
                ontologyMode: task.ontologyMode || 'auto',
                ontologyId: task.ontologyId
            });

            await alignmentService.alignEntities(internalTaskId);

            res.json({
                success: true,
                taskId: resolveTaskIdForResponse(task),
                message: '已开始构建，请稍后查看任务进度'
            });
        } catch (error) {
            console.error('开始构建失败:', error);
            const debugEnabled = process.env.ENABLE_LLM_DEBUG === 'true';
            let extractionDebug = null;
            if (debugEnabled && internalTaskId) {
                try {
                    const fresh = await GraphBuildTask.findById(internalTaskId).select('extractionDebug extractionMeta');
                    extractionDebug = fresh?.extractionDebug || null;
                } catch (e) {}
            }
            res.status(500).json({
                success: false,
                message: error.message,
                details: error?.details || null,
                extractionDebug: debugEnabled ? extractionDebug : null
            });
        }
    }

    /**
     * 获取抽取结果
     */
    async getExtractResult(req, res) {
        try {
            const { taskId } = req.params;
            const wait = String(req.query.wait || '').trim();
            const shouldWait = wait === '1' || wait.toLowerCase() === 'true';
            const timeoutSecRaw = Number(req.query.timeoutSec);
            const timeoutSec = Number.isFinite(timeoutSecRaw) ? Math.min(Math.max(timeoutSecRaw, 1), 120) : 60;
            const deadline = Date.now() + timeoutSec * 1000;

            let task = await findTaskByAnyId(taskId);
            while (shouldWait && (!task || !['confirming', 'completed', 'failed'].includes(task.status))) {
                if (Date.now() >= deadline) break;
                await new Promise(resolve => setTimeout(resolve, 1000));
                task = await findTaskByAnyId(taskId);
            }

            if (!task) {
                const statusCode = shouldWait ? 408 : 404;
                return res.status(statusCode).json({ success: false, message: shouldWait ? '解析超时' : '任务不存在' });
            }

            if (shouldWait && task.status === 'failed') {
                return res.status(500).json({ success: false, message: task.errorMessage || '解析失败' });
            }

            if (shouldWait && !['confirming', 'completed'].includes(task.status)) {
                return res.status(408).json({ success: false, message: '解析超时' });
            }

            task = await GraphBuildTask.findById(task._id).populate('files.fileId', 'originalName fileType');

            if (!task) {
                return res.status(404).json({ success: false, message: '任务不存在' });
            }

            res.json({
                success: true,
                taskId: resolveTaskIdForResponse(task),
                status: task.status,
                progress: task.progress,
                stageMessage: task.stageMessage,
                errorMessage: task.errorMessage,
                extractionDebug: process.env.ENABLE_LLM_DEBUG === 'true' ? (task.extractionDebug || null) : null,
                files: task.files.map(f => ({
                    fileId: f.fileId._id,
                    filename: f.fileId.originalName,
                    fileType: f.fileId.fileType
                })),
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
     * 获取文件解析内容
     */
    async getFileContent(req, res) {
        try {
            const { fileId } = req.params;
            const file = await FileUpload.findById(fileId);

            if (!file) {
                return res.status(404).json({ success: false, message: '文件不存在' });
            }

            // 检查是否有解析内容
            if (!file.extractedText) {
                return res.status(404).json({ success: false, message: '文件尚未解析或解析内容为空' });
            }

            res.json({
                success: true,
                data: {
                    filename: file.originalName,
                    content: file.extractedText,
                    type: file.fileType
                }
            });

        } catch (error) {
            console.error('获取文件内容失败:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * 获取任务原文链接 (Requirement 1)
     */
    async getTaskOriginalUrl(req, res) {
        try {
            const { taskId } = req.params;
            const task = await findTaskByAnyId(taskId);
            
            if (!task) {
                return res.status(404).json({ success: false, message: '任务不存在' });
            }

            // 假设返回第一个文件的链接，或者任务相关的汇总链接
            // 这里简单返回第一个文件的下载/查看链接
            let url = '';
            if (task.files && task.files.length > 0) {
                const file = await FileUpload.findById(task.files[0].fileId);
                if (file) {
                    // 假设有一个文件服务的路由 /api/files/download/:id
                    // 或者直接返回文件系统路径（仅开发环境）
                    // 这里模拟一个 URL
                    url = `/api/files/preview/${file._id}`; 
                }
            }

            res.json({
                success: true,
                url: url || '#'
            });
        } catch (error) {
            console.error('获取任务原文链接失败:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }

    /**
     * 获取知识图谱/文件原文内容 (Requirement 2)
     * 返回 Markdown 格式
     */
    async getKgOriginalContent(req, res) {
        try {
            const { kgId } = req.params; // 这里 kgId 实际上可能是 fileId
            
            // 尝试查找 FileUpload
            const file = await FileUpload.findById(kgId);
            if (file) {
                return res.json({
                    success: true,
                    content: `## ${file.originalName}\n\n${file.extractedText || '(无内容)'}`
                });
            }

            // 如果不是文件，可能是 Task？
            const task = await findTaskByAnyId(kgId);
            if (task) {
                const fileIds = Array.isArray(task.files) ? task.files.map((f) => f.fileId).filter(Boolean) : [];
                const files = await FileUpload.find({ _id: { $in: fileIds } }, { originalName: 1, extractedText: 1 });
                const sections = files.map((f) => `## ${f.originalName || f._id}\n\n${f.extractedText || '(无内容)'}\n`);
                const header = `# 任务 #${task._id}\n\n状态: ${task.status}\n\n`;
                return res.json({
                    success: true,
                    content: header + (sections.join('\n') || '(无内容)')
                });
            }

            res.status(404).json({ success: false, message: '未找到对应原文内容' });

        } catch (error) {
             console.error('获取原文内容失败:', error);
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

            const task = await findTaskByAnyId(taskId);
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
            const internalTaskId = task._id;
            const result = await graphBuilder.buildGraph(internalTaskId, modifications);
            const fileIds = Array.isArray(task.files) ? task.files.map((f) => f.fileId).filter(Boolean) : [];
            let rag = { indexed: false, fileCount: 0, chunkCount: 0, error: null };

            try {
                const files = await FileUpload.find(
                    { _id: { $in: fileIds } },
                    { originalName: 1, extractedText: 1 }
                );

                const chunkSize = parseInt(process.env.RAG_CHUNK_SIZE || '800', 10);
                const chunkOverlap = parseInt(process.env.RAG_CHUNK_OVERLAP || '120', 10);

                const documents = [];
                for (const file of files) {
                    const chunks = splitTextToChunks(file.extractedText, chunkSize, chunkOverlap);
                    for (let i = 0; i < chunks.length; i += 1) {
                        documents.push({
                            pageContent: chunks[i],
                            metadata: {
                                taskId: String(resolveTaskIdForResponse(task)),
                                fileId: String(file._id),
                                fileName: file.originalName || '未知',
                                chunkIndex: i,
                                source: 'kg_workbench'
                            }
                        });
                    }
                }

                await vectorStore.deleteByFileIds(fileIds.map((id) => String(id)));
                if (documents.length > 0) {
                    await vectorStore.addDocuments(documents);
                }

                rag = {
                    indexed: true,
                    fileCount: files.length,
                    chunkCount: documents.length,
                    error: null
                };
            } catch (e) {
                rag = {
                    indexed: false,
                    fileCount: 0,
                    chunkCount: 0,
                    error: e?.message || String(e)
                };
            }

            res.json({
                success: true,
                message: '知识图谱构建成功',
                stats: result.stats,
                rag
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

            const task = await findTaskByAnyId(taskId);
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

            await GraphBuildTask.findByIdAndDelete(task._id);

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

    /**
     * 智能问答
     */
    async chat(req, res) {
        try {
            const { question, history } = req.body;
            
            if (!question) {
                return res.status(400).json({ success: false, message: '问题不能为空' });
            }

            const result = await qaRouter.answer(question, history);

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            console.error('问答失败:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = new KGController();
