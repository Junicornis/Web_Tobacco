/**
 * 实体对齐服务
 * 基于语义相似度进行实体对齐
 */

const embeddingProvider = require('../utils/embeddingProvider');
const GraphBuildTask = require('../models/GraphBuildTask');

class AlignmentService {
    constructor() {
        // 相似度阈值配置
        this.thresholds = {
            autoMerge: 0.9,    // 自动合并阈值
            candidate: 0.7,    // 候选对齐阈值
            maxCandidates: 3   // 最大候选数
        };
    }

    /**
     * 执行实体对齐
     * @param {string} taskId - 任务ID
     * @returns {Promise<Object>} 对齐结果
     */
    async alignEntities(taskId) {
        const task = await GraphBuildTask.findById(taskId);
        if (!task) {
            throw new Error('任务不存在');
        }

        if (!Array.isArray(task.draftEntities) || task.draftEntities.length === 0) {
            const error = new Error('未提取到任何实体，无法对齐');
            await GraphBuildTask.findByIdAndUpdate(taskId, {
                status: 'failed',
                progress: 70,
                stageMessage: '未抽取到实体，无法对齐',
                errorMessage: error.message
            });
            throw error;
        }

        await GraphBuildTask.findByIdAndUpdate(taskId, {
            status: 'aligning',
            progress: 70,
            stageMessage: '正在进行实体对齐...'
        });

        try {
            const { draftEntities } = task;
            const alignedEntities = [];
            let embeddingDim = null;
            let embeddingDegraded = false;

            // 1. 为所有新实体生成嵌入向量
            const entityTexts = draftEntities.map(e => 
                `${e.name} ${e.type} ${e.properties?.description || ''} ${e.sourceContext || ''}`
            );
            
            // 批量获取嵌入（每批10个）
            const embeddings = [];
            for (let i = 0; i < entityTexts.length; i += 10) {
                const batch = entityTexts.slice(i, i + 10);
                try {
                    const batchEmbeddings = await embeddingProvider.getEmbedding(batch);
                    if (!embeddingDim && Array.isArray(batchEmbeddings) && batchEmbeddings[0]?.length) {
                        embeddingDim = batchEmbeddings[0].length;
                    }
                    embeddings.push(...batchEmbeddings);
                } catch (error) {
                    console.error('获取嵌入向量失败:', error);
                    if (!embeddingDegraded) {
                        embeddingDegraded = true;
                        await GraphBuildTask.findByIdAndUpdate(taskId, {
                            stageMessage: '正在进行实体对齐...（Embedding 不可用，已降级）'
                        });
                    }
                    const dim = embeddingDim || 1024;
                    embeddings.push(...batch.map(() => new Array(dim).fill(0)));
                }
            }

            // 2. 为每个实体查找相似实体
            for (let i = 0; i < draftEntities.length; i++) {
                const entity = draftEntities[i];
                const embedding = embeddings[i];

                // 查找该实体的相似实体（在同批中）
                const candidates = this._findSimilarEntities(
                    entity, 
                    embedding, 
                    draftEntities, 
                    embeddings, 
                    i
                );

                // 确定对齐策略
                const alignmentSuggestion = this._determineAlignmentStrategy(
                    entity, 
                    candidates
                );

                alignedEntities.push({
                    ...entity.toObject(),
                    alignmentSuggestion
                });
            }

            // 3. 更新任务
            await GraphBuildTask.findByIdAndUpdate(taskId, {
                status: 'confirming',
                progress: 90,
                stageMessage: embeddingDegraded
                    ? '对齐完成，等待用户确认（Embedding 已降级）'
                    : '对齐完成，等待用户确认',
                draftEntities: alignedEntities
            });

            return {
                success: true,
                entityCount: alignedEntities.length,
                newCount: alignedEntities.filter(e => 
                    e.alignmentSuggestion.type === 'new'
                ).length,
                mergeCount: alignedEntities.filter(e => 
                    e.alignmentSuggestion.type === 'merge'
                ).length,
                candidateCount: alignedEntities.filter(e => 
                    e.alignmentSuggestion.type === 'candidate'
                ).length
            };

        } catch (error) {
            console.error('实体对齐失败:', error);
            await GraphBuildTask.findByIdAndUpdate(taskId, {
                status: 'failed',
                errorMessage: error.message
            });
            throw error;
        }
    }

    /**
     * 查找相似实体
     */
    _findSimilarEntities(currentEntity, currentEmbedding, allEntities, allEmbeddings, currentIndex) {
        const candidates = [];

        for (let i = 0; i < allEntities.length; i++) {
            if (i === currentIndex) continue;

            const otherEntity = allEntities[i];
            const otherEmbedding = allEmbeddings[i];

            // 只比较同类型实体
            if (otherEntity.type !== currentEntity.type) continue;

            // 计算相似度
            const similarity = this._cosineSimilarity(currentEmbedding, otherEmbedding);

            if (similarity >= this.thresholds.candidate) {
                candidates.push({
                    id: otherEntity.id,
                    name: otherEntity.name,
                    similarity: similarity,
                    properties: otherEntity.properties
                });
            }
        }

        // 按相似度排序并取前N个
        return candidates
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, this.thresholds.maxCandidates);
    }

    /**
     * 确定对齐策略
     */
    _determineAlignmentStrategy(entity, candidates) {
        if (candidates.length === 0) {
            return { type: 'new' };
        }

        const bestMatch = candidates[0];

        // 自动合并：相似度极高或名称完全相同
        if (bestMatch.similarity >= this.thresholds.autoMerge || 
            bestMatch.name === entity.name) {
            return {
                type: 'merge',
                targetEntity: {
                    id: bestMatch.id,
                    name: bestMatch.name,
                    similarity: bestMatch.similarity
                }
            };
        }

        // 候选对齐
        return {
            type: 'candidate',
            candidates: candidates
        };
    }

    /**
     * 计算余弦相似度
     */
    _cosineSimilarity(vec1, vec2) {
        if (!vec1 || !vec2 || vec1.length !== vec2.length) {
            return 0;
        }

        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;

        for (let i = 0; i < vec1.length; i++) {
            dotProduct += vec1[i] * vec2[i];
            norm1 += vec1[i] * vec1[i];
            norm2 += vec2[i] * vec2[i];
        }

        if (norm1 === 0 || norm2 === 0) return 0;

        return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    }

    /**
     * 计算实体相似度（基于属性）
     */
    _calculatePropertySimilarity(entity1, entity2) {
        const props1 = entity1.properties || {};
        const props2 = entity2.properties || {};

        const keys1 = Object.keys(props1);
        const keys2 = Object.keys(props2);

        if (keys1.length === 0 || keys2.length === 0) return 0;

        // 计算共同属性
        const commonKeys = keys1.filter(k => keys2.includes(k));
        const matchingValues = commonKeys.filter(k => props1[k] === props2[k]);

        // 简单相似度 = 相同属性值 / 最大属性数
        return matchingValues.length / Math.max(keys1.length, keys2.length);
    }

    /**
     * 合并两个实体
     */
    mergeEntities(entity1, entity2, strategy = 'union') {
        const merged = {
            id: entity1.id, // 保留第一个实体的ID
            name: entity1.name || entity2.name,
            type: entity1.type || entity2.type,
            properties: {},
            sourceFiles: [...new Set([
                ...(entity1.sourceFiles || []),
                ...(entity2.sourceFiles || [])
            ])],
            mergedFrom: [entity2.id]
        };

        // 属性合并策略
        if (strategy === 'union') {
            merged.properties = { ...entity2.properties, ...entity1.properties };
        } else if (strategy === 'intersection') {
            const keys1 = Object.keys(entity1.properties || {});
            const keys2 = Object.keys(entity2.properties || {});
            const commonKeys = keys1.filter(k => keys2.includes(k));
            commonKeys.forEach(k => {
                merged.properties[k] = entity1.properties[k];
            });
        }

        return merged;
    }

    /**
     * 批量对齐（用于多个任务的实体）
     */
    async batchAlign(taskIds) {
        const results = [];
        for (const taskId of taskIds) {
            try {
                const result = await this.alignEntities(taskId);
                results.push({ taskId, success: true, result });
            } catch (error) {
                results.push({ taskId, success: false, error: error.message });
            }
        }
        return results;
    }
}

module.exports = new AlignmentService();
