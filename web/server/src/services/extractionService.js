/**
 * 知识抽取服务
 * 使用大模型从文档中提取实体、关系和本体定义
 */

const glmClient = require('../utils/glmClient');
const GraphBuildTask = require('../models/GraphBuildTask');
const OntologyLibrary = require('../models/OntologyLibrary');

class ExtractionService {
    /**
     * 从文档中抽取知识
     * @param {Object} options - 抽取选项
     * @param {Array} options.files - 已解析的文件信息数组
     * @param {string} options.taskId - 任务ID
     * @param {string} options.ontologyMode - 本体模式 (auto/existing)
     * @param {string} options.ontologyId - 指定本体ID（可选）
     * @returns {Promise<Object>} 抽取结果
     */
    async extractFromDocuments(options) {
        const { files, taskId, ontologyMode, ontologyId } = options;
        
        // 更新任务状态为抽取中
        await this._updateTaskStatus(taskId, 'extracting', 30, '正在提取知识...');

        try {
            // 获取本体提示（如果使用现有本体）
            let ontologyHint = null;
            if (ontologyMode === 'existing' && ontologyId) {
                const ontology = await OntologyLibrary.findById(ontologyId);
                if (ontology) {
                    ontologyHint = {
                        entityTypes: ontology.entityTypes,
                        relationTypes: ontology.relationTypes
                    };
                }
            }

            // 合并所有文档文本
            const startedAt = new Date();
            const combinedText = files.map(f => {
                return `[文件: ${f.filename}]\n${f.parsedData.text || f.parsedData.preview || ''}`;
            }).join('\n\n---\n\n');
            await GraphBuildTask.findByIdAndUpdate(taskId, {
                extractionMeta: {
                    model: 'glm-4.7',
                    fileCount: files.length,
                    inputChars: combinedText.length,
                    startedAt
                }
            });

            // 调用大模型抽取
            const extractionResult = await glmClient.extractKnowledge(combinedText, ontologyHint);
            const validation = this.validateExtractionResult(extractionResult);
            if (!validation.valid) {
                const message = validation.errors.join('；') || '知识抽取未得到有效结果';
                await GraphBuildTask.findByIdAndUpdate(taskId, {
                    status: 'failed',
                    progress: 40,
                    stageMessage: '知识抽取未得到有效结果',
                    errorMessage: message,
                    draftOntology: {
                        entityTypes: extractionResult.entityTypes || [],
                        relationTypes: extractionResult.relationTypes || []
                    },
                    draftEntities: [],
                    draftRelations: [],
                    extractionMeta: {
                        model: 'glm-4.7',
                        fileCount: files.length,
                        inputChars: combinedText.length,
                        chunkCount: extractionResult.meta?.chunkCount ?? null,
                        entityCount: 0,
                        relationCount: 0,
                        startedAt,
                        finishedAt: new Date()
                    }
                });
                const validationError = new Error(message);
                validationError.alreadyUpdatedTask = true;
                throw validationError;
            }

            // 为每个实体生成唯一ID并补充信息
            const stamp = Date.now();
            const enrichedEntities = extractionResult.entities.map((entity, idx) => ({
                id: `entity_${stamp}_${idx}`,
                name: entity.name,
                type: entity.type,
                properties: entity.properties || {},
                sourceFile: files[0]?.fileId, // 简化为第一个文件
                sourceContext: entity.context || '',
                confidence: entity.confidence || 0.8,
                alignmentSuggestion: { type: 'new' }
            }));

            // 为每个关系生成唯一ID
            const enrichedRelations = extractionResult.relations.map((relation, idx) => ({
                id: `relation_${stamp}_${idx}`,
                source: relation.source,
                target: relation.target,
                relationType: relation.type,
                properties: relation.properties || {},
                sourceContext: relation.context || '',
                confidence: relation.confidence || 0.8
            }));

            // 更新任务状态
            await GraphBuildTask.findByIdAndUpdate(taskId, {
                status: 'aligning',
                progress: 60,
                stageMessage: '正在进行实体对齐...',
                draftOntology: {
                    entityTypes: extractionResult.entityTypes,
                    relationTypes: extractionResult.relationTypes
                },
                draftEntities: enrichedEntities,
                draftRelations: enrichedRelations,
                extractionDebug: {
                    parseError: null,
                    rawPreview: null,
                    rawLength: null,
                    chunkIndex: null,
                    chunkCount: null
                },
                extractionMeta: {
                    model: 'glm-4.7',
                    fileCount: files.length,
                    inputChars: combinedText.length,
                    chunkCount: extractionResult.meta?.chunkCount ?? null,
                    entityCount: enrichedEntities.length,
                    relationCount: enrichedRelations.length,
                    startedAt,
                    finishedAt: new Date()
                }
            });

            return {
                success: true,
                entityCount: enrichedEntities.length,
                relationCount: enrichedRelations.length
            };

        } catch (error) {
            console.error('知识抽取失败:', error);
            if (error?.alreadyUpdatedTask) {
                throw error;
            }
            const details = error?.details;
            const $set = {
                status: 'failed',
                stageMessage: '知识抽取失败',
                errorMessage: error.message,
                'extractionMeta.finishedAt': new Date()
            };
            if (details) {
                $set.extractionDebug = {
                    parseError: error.message,
                    rawPreview: details.rawPreview || null,
                    rawLength: details.rawLength ?? null,
                    chunkIndex: details.chunkIndex ?? null,
                    chunkCount: details.chunkCount ?? null
                };
            }
            await GraphBuildTask.findByIdAndUpdate(taskId, { $set });
            throw error;
        }
    }

    /**
     * 批量抽取（用于多个文件）
     */
    async batchExtract(files, options = {}) {
        const results = [];
        
        for (const file of files) {
            try {
                const result = await this.extractFromDocuments({
                    files: [file],
                    ...options
                });
                results.push({ file: file.filename, success: true, result });
            } catch (error) {
                results.push({ file: file.filename, success: false, error: error.message });
            }
        }

        return results;
    }

    /**
     * 增量抽取（对比已有本体）
     */
    async incrementalExtract(newDocuments, existingOntology) {
        // 1. 抽取新知识
        const newKnowledge = await this.extractFromDocuments({
            files: newDocuments,
            ontologyMode: 'existing',
            ontologyId: existingOntology._id
        });

        // 2. 对比差异
        const differences = this._compareWithExisting(
            newKnowledge,
            existingOntology
        );

        return {
            newEntities: differences.newEntities,
            updatedEntities: differences.updatedEntities,
            newRelations: differences.newRelations,
            conflicts: differences.conflicts
        };
    }

    /**
     * 验证抽取结果
     */
    validateExtractionResult(result) {
        const errors = [];

        // 验证实体
        if (!result.entities || result.entities.length === 0) {
            errors.push('未提取到任何实体');
        } else {
            result.entities.forEach((entity, idx) => {
                if (!entity.name) {
                    errors.push(`实体[${idx}]缺少名称`);
                }
                if (!entity.type) {
                    errors.push(`实体[${idx}]缺少类型`);
                }
            });
        }

        // 验证关系（关系可以没有）
        if (result.relations) {
            result.relations.forEach((relation, idx) => {
                if (!relation.source) {
                    errors.push(`关系[${idx}]缺少源实体`);
                }
                if (!relation.target) {
                    errors.push(`关系[${idx}]缺少目标实体`);
                }
                if (!relation.type) {
                    errors.push(`关系[${idx}]缺少关系类型`);
                }
            });
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * 更新任务状态
     */
    async _updateTaskStatus(taskId, status, progress, message) {
        await GraphBuildTask.findByIdAndUpdate(taskId, {
            status,
            progress,
            stageMessage: message
        });
    }

    /**
     * 对比与已有本体的差异
     */
    _compareWithExisting(newKnowledge, existingOntology) {
        const existingEntityNames = new Set(
            existingOntology.entities?.map(e => `${e.name}_${e.type}`) || []
        );

        const newEntities = [];
        const updatedEntities = [];
        const conflicts = [];

        newKnowledge.entities.forEach(entity => {
            const key = `${entity.name}_${entity.type}`;
            if (!existingEntityNames.has(key)) {
                newEntities.push(entity);
            } else {
                // 检查是否有属性更新
                const existing = existingOntology.entities.find(
                    e => e.name === entity.name && e.type === entity.type
                );
                if (existing && JSON.stringify(existing.properties) !== JSON.stringify(entity.properties)) {
                    updatedEntities.push({ entity, existing });
                }
            }
        });

        return {
            newEntities,
            updatedEntities,
            newRelations: newKnowledge.relations || [],
            conflicts
        };
    }
}

module.exports = new ExtractionService();
