/**
 * 图谱构建服务
 * 将确认的实体和关系写入 Neo4j 图数据库
 */

const neo4j = require('neo4j-driver');
const GraphBuildTask = require('../models/GraphBuildTask');
const FileUpload = require('../models/FileUpload');

class GraphBuilder {
    constructor() {
        // 初始化 Neo4j 连接
        this.driver = null;
        this.neo4jEnabled = false;
        this.apocAvailable = null;
        
        try {
            const uri = process.env.NEO4J_URI || 'neo4j://127.0.0.1:7687';
            const user = process.env.NEO4J_USER || 'neo4j';
            const password = process.env.NEO4J_PASSWORD;

            if (!password) {
                console.warn('Neo4j is disabled: missing NEO4J_PASSWORD');
                return;
            }

            this.driver = neo4j.driver(
                uri,
                neo4j.auth.basic(user, password)
            );
            this.neo4jEnabled = true;
            console.log('Neo4j driver initialized');
        } catch (error) {
            console.warn('Neo4j initialization failed:', error.message);
            this.neo4jEnabled = false;
        }
    }

    _createHttpError(message, status, cause) {
        const error = new Error(message);
        error.status = status;
        if (cause) error.cause = cause;
        return error;
    }

    _mapNeo4jError(error) {
        const code = error?.code || '';
        const message = error?.message || '';

        if (code.includes('Neo.ClientError.Security.Unauthorized') || /unauthorized/i.test(message)) {
            return this._createHttpError('Neo4j 认证失败，请检查 NEO4J_USER/NEO4J_PASSWORD 配置', 503, error);
        }

        if (/Unknown function\s+'apoc\./i.test(message) || /Unknown procedure\s+'apoc\./i.test(message)) {
            return this._createHttpError('Neo4j 缺少或未启用 APOC 插件，请在 Neo4j 中安装并放行 apoc.* 后重启', 503, error);
        }

        if (
            code.includes('ServiceUnavailable') ||
            /ECONNREFUSED|Failed to establish connection|ServiceUnavailable/i.test(message)
        ) {
            return this._createHttpError('Neo4j 服务不可用，请确认 Neo4j 已启动且 NEO4J_URI 配置正确', 503, error);
        }

        return error;
    }

    _isApocMissingError(error) {
        const message = error?.message || '';
        return /Unknown function\s+'apoc\./i.test(message) || /Unknown procedure\s+'apoc\./i.test(message);
    }

    _parseJsonObjectOrEmpty(value) {
        if (!value || typeof value !== 'string') return {};
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
            return {};
        } catch {
            return {};
        }
    }

    /**
     * 检查 Neo4j 是否可用
     */
    _checkNeo4j() {
        if (!this.neo4jEnabled || !this.driver) {
            throw this._createHttpError('Neo4j 服务不可用，请确认 Neo4j 已启动并配置了 NEO4J_PASSWORD', 503);
        }
    }

    /**
     * 根据用户确认结果构建图谱
     * @param {string} taskId - 任务ID
     * @param {Object} modifications - 用户修正内容
     * @returns {Promise<Object>} 构建结果
     */
    async buildGraph(taskId, modifications = {}) {
        this._checkNeo4j();
        const task = await GraphBuildTask.findById(taskId);
        if (!task) {
            throw new Error('任务不存在');
        }

        // 更新任务状态
        await GraphBuildTask.findByIdAndUpdate(taskId, {
            status: 'building',
            progress: 95,
            stageMessage: '正在写入图数据库...',
            userModifications: modifications
        });

        const session = this.driver.session();

        try {
            // 1. 应用用户修改
            const { entities, relations } = this._applyModifications(
                task.draftEntities,
                task.draftRelations,
                modifications
            );

            // 2. 构建实体
            const entityResults = await this._buildEntities(session, entities, task.files);

            // 3. 构建关系
            const relationResults = await this._buildRelations(session, relations, entityResults);

            // 4. 更新任务完成状态
            await GraphBuildTask.findByIdAndUpdate(taskId, {
                status: 'completed',
                progress: 100,
                stageMessage: '构建完成',
                completedAt: new Date(),
                buildStats: {
                    entityCount: entityResults.length,
                    relationCount: relationResults.length,
                    mergedCount: modifications.mergedEntities?.length || 0
                }
            });

            // 5. 更新文件状态
            for (const file of task.files) {
                await FileUpload.findByIdAndUpdate(file.fileId, {
                    status: 'completed',
                    processedTime: new Date()
                });
            }

            return {
                success: true,
                entityCount: entityResults.length,
                relationCount: relationResults.length,
                stats: {
                    newEntities: entityResults.filter(e => e.isNew).length,
                    mergedEntities: entityResults.filter(e => e.isMerged).length,
                    updatedEntities: entityResults.filter(e => e.isUpdated).length
                }
            };

        } catch (error) {
            const mappedError = this._mapNeo4jError(error);
            console.error('图谱构建失败:', mappedError);
            await GraphBuildTask.findByIdAndUpdate(taskId, {
                status: 'failed',
                errorMessage: mappedError.message
            });
            throw mappedError;
        } finally {
            await session.close();
        }
    }

    /**
     * 应用用户修改
     */
    _applyModifications(draftEntities, draftRelations, modifications) {
        let entities = [...draftEntities];
        let relations = [...draftRelations];

        // 删除实体
        if (modifications.deletedEntityIds?.length > 0) {
            entities = entities.filter(e => !modifications.deletedEntityIds.includes(e.id));
        }

        // 删除关系
        if (modifications.deletedRelationIds?.length > 0) {
            relations = relations.filter(r => !modifications.deletedRelationIds.includes(r.id));
        }

        // 修改实体
        if (modifications.modifiedEntities?.length > 0) {
            modifications.modifiedEntities.forEach(mod => {
                const idx = entities.findIndex(e => e.id === mod.entityId);
                if (idx !== -1) {
                    entities[idx] = { ...entities[idx], ...mod.newValue };
                }
            });
        }

        // 添加实体
        if (modifications.addedEntities?.length > 0) {
            entities.push(...modifications.addedEntities);
        }

        // 添加关系
        if (modifications.addedRelations?.length > 0) {
            relations.push(...modifications.addedRelations);
        }

        return { entities, relations };
    }

    /**
     * 构建实体节点
     */
    async _buildEntities(session, entities, sourceFiles) {
        const results = [];
        const fileIds = sourceFiles.map(f => f.fileId.toString());

        for (const entity of entities) {
            const entityId = entity.alignmentSuggestion?.type === 'merge' 
                ? entity.alignmentSuggestion.targetEntity.id 
                : entity.id;

            const isNew = entity.alignmentSuggestion?.type === 'new';
            const isMerged = entity.alignmentSuggestion?.type === 'merge';

            // 构建属性JSON
            const properties = {
                ...entity.properties,
                name: entity.name,
                type: entity.type
            };

            const apocQuery = `
                MERGE (e:Entity {id: $entityId})
                ON CREATE SET 
                    e.name = $name,
                    e.type = $type,
                    e.properties = $propertiesJson,
                    e.sourceFiles = $fileIds,
                    e.createdAt = datetime(),
                    e.updatedAt = datetime(),
                    e.version = 1
                ON MATCH SET 
                    e.properties = apoc.convert.toJson(apoc.convert.fromJsonMap(COALESCE(e.properties, '{}')) + $properties),
                    e.sourceFiles = CASE 
                        WHEN $fileIds[0] IN e.sourceFiles THEN e.sourceFiles 
                        ELSE e.sourceFiles + $fileIds[0] 
                    END,
                    e.updatedAt = datetime(),
                    e.version = COALESCE(e.version, 1) + 1
                RETURN e
            `;

            const mergeWithoutApocQuery = `
                MERGE (e:Entity {id: $entityId})
                ON CREATE SET 
                    e.name = $name,
                    e.type = $type,
                    e.properties = $propertiesJson,
                    e.sourceFiles = $fileIds,
                    e.createdAt = datetime(),
                    e.updatedAt = datetime(),
                    e.version = 1
                ON MATCH SET 
                    e.sourceFiles = CASE 
                        WHEN $fileIds[0] IN e.sourceFiles THEN e.sourceFiles 
                        ELSE e.sourceFiles + $fileIds[0] 
                    END,
                    e.updatedAt = datetime(),
                    e.version = COALESCE(e.version, 1) + 1
                RETURN e.properties AS existingPropertiesJson
            `;

            const updatePropertiesQuery = `
                MATCH (e:Entity {id: $entityId})
                SET e.properties = $propertiesJson
                RETURN e
            `;

            try {
                const params = {
                    entityId,
                    name: entity.name,
                    type: entity.type,
                    propertiesJson: JSON.stringify(properties),
                    properties: properties,
                    fileIds
                };

                if (this.apocAvailable !== false) {
                    try {
                        await session.run(apocQuery, params);
                        this.apocAvailable = true;
                    } catch (error) {
                        if (this._isApocMissingError(error)) {
                            this.apocAvailable = false;
                            const mergeResult = await session.run(mergeWithoutApocQuery, params);
                            const nodesCreated = mergeResult.summary.counters.updates().nodesCreated;

                            if (nodesCreated === 0) {
                                const record = mergeResult.records[0];
                                const existingPropertiesJson = record?.get('existingPropertiesJson');
                                const existingProperties = this._parseJsonObjectOrEmpty(existingPropertiesJson);
                                const mergedProperties = { ...existingProperties, ...properties };

                                await session.run(updatePropertiesQuery, {
                                    entityId,
                                    propertiesJson: JSON.stringify(mergedProperties)
                                });
                            }
                        } else {
                            throw error;
                        }
                    }
                } else {
                    const mergeResult = await session.run(mergeWithoutApocQuery, params);
                    const nodesCreated = mergeResult.summary.counters.updates().nodesCreated;

                    if (nodesCreated === 0) {
                        const record = mergeResult.records[0];
                        const existingPropertiesJson = record?.get('existingPropertiesJson');
                        const existingProperties = this._parseJsonObjectOrEmpty(existingPropertiesJson);
                        const mergedProperties = { ...existingProperties, ...properties };

                        await session.run(updatePropertiesQuery, {
                            entityId,
                            propertiesJson: JSON.stringify(mergedProperties)
                        });
                    }
                }

                results.push({
                    id: entityId,
                    name: entity.name,
                    type: entity.type,
                    isNew,
                    isMerged,
                    isUpdated: !isNew && !isMerged
                });
            } catch (error) {
                console.error(`创建实体失败 [${entity.name}]:`, error);
                throw error;
            }
        }

        return results;
    }

    /**
     * 构建关系边
     */
    async _buildRelations(session, relations, entityResults) {
        const results = [];

        for (const relation of relations) {
            // 查找实体ID映射
            const sourceEntity = entityResults.find(e => e.name === relation.source || e.id === relation.source);
            const targetEntity = entityResults.find(e => e.name === relation.target || e.id === relation.target);

            if (!sourceEntity || !targetEntity) {
                console.warn(`关系跳过: 找不到实体 [${relation.source}] -> [${relation.target}]`);
                continue;
            }

            const query = `
                MATCH (source:Entity {id: $sourceId})
                MATCH (target:Entity {id: $targetId})
                MERGE (source)-[r:RELATION {type: $relationType}]->(target)
                ON CREATE SET 
                    r.properties = $propertiesJson,
                    r.confidence = $confidence,
                    r.createdAt = datetime(),
                    r.updatedAt = datetime()
                ON MATCH SET 
                    r.properties = $propertiesJson,
                    r.updatedAt = datetime()
                RETURN r
            `;

            try {
                const result = await session.run(query, {
                    sourceId: sourceEntity.id,
                    targetId: targetEntity.id,
                    relationType: relation.relationType,
                    propertiesJson: JSON.stringify(relation.properties || {}),
                    confidence: relation.confidence || 0.8
                });

                results.push({
                    source: sourceEntity.name,
                    target: targetEntity.name,
                    type: relation.relationType
                });
            } catch (error) {
                console.error(`创建关系失败 [${relation.source} -> ${relation.target}]:`, error);
            }
        }

        return results;
    }

    /**
     * 增量更新图谱
     */
    async incrementalUpdate(fileId, newEntities, newRelations) {
        const session = this.driver.session();

        try {
            // 1. 查找该文件已存在的实体
            const existingQuery = `
                MATCH (e:Entity)
                WHERE $fileId IN e.sourceFiles
                RETURN e.id as id, e.name as name, e.type as type
            `;
            const existingResult = await session.run(existingQuery, { fileId });
            const existingEntities = existingResult.records.map(r => ({
                id: r.get('id'),
                name: r.get('name'),
                type: r.get('type')
            }));

            // 2. 对比差异
            const entitiesToUpdate = [];
            const entitiesToCreate = [];

            for (const newEntity of newEntities) {
                const existing = existingEntities.find(e => 
                    e.name === newEntity.name && e.type === newEntity.type
                );
                if (existing) {
                    entitiesToUpdate.push({ ...newEntity, id: existing.id });
                } else {
                    entitiesToCreate.push(newEntity);
                }
            }

            // 3. 执行更新
            for (const entity of entitiesToUpdate) {
                await session.run(`
                    MATCH (e:Entity {id: $id})
                    SET e.properties = $propertiesJson,
                        e.updatedAt = datetime(),
                        e.version = COALESCE(e.version, 1) + 1
                `, {
                    id: entity.id,
                    propertiesJson: JSON.stringify(entity.properties)
                });
            }

            // 4. 创建新实体
            for (const entity of entitiesToCreate) {
                await session.run(`
                    CREATE (e:Entity {
                        id: $id,
                        name: $name,
                        type: $type,
                        properties: $propertiesJson,
                        sourceFiles: [$fileId],
                        createdAt: datetime(),
                        updatedAt: datetime(),
                        version: 1
                    })
                `, {
                    id: entity.id,
                    name: entity.name,
                    type: entity.type,
                    propertiesJson: JSON.stringify(entity.properties),
                    fileId
                });
            }

            return {
                updated: entitiesToUpdate.length,
                created: entitiesToCreate.length
            };

        } finally {
            await session.close();
        }
    }

    /**
     * 查询图谱
     */
    async queryGraph(options = {}) {
        this._checkNeo4j();
        const session = this.driver.session();

        try {
            const { keyword, type, limit = 100, offset = 0 } = options;
            const safeOffsetRaw = Number.isFinite(Number(offset)) ? parseInt(offset, 10) : 0;
            const safeOffset = Math.max(safeOffsetRaw, 0);
            const safeLimitRaw = Number.isFinite(Number(limit)) ? parseInt(limit, 10) : 100;
            const safeLimit = Math.min(Math.max(safeLimitRaw, 1), 500);

            let query = 'MATCH (e:Entity)';
            const params = {};

            // 添加过滤条件
            const conditions = [];
            if (keyword) {
                conditions.push('(e.name CONTAINS $keyword OR e.properties CONTAINS $keyword)');
                params.keyword = keyword;
            }
            if (type) {
                conditions.push('e.type = $type');
                params.type = type;
            }

            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
            }

            query += ' RETURN e ORDER BY e.name SKIP $offset LIMIT $limit';
            params.offset = neo4j.int(safeOffset);
            params.limit = neo4j.int(safeLimit);

            let result;
            try {
                result = await session.run(query, params);
            } catch (error) {
                throw this._mapNeo4jError(error);
            }

            const nodes = result.records.map(r => {
                const node = r.get('e');
                let properties = {};
                try {
                    properties = JSON.parse(node.properties.properties || '{}');
                } catch (error) {
                    throw this._createHttpError('实体 properties 字段不是合法 JSON，无法解析', 500, error);
                }
                return {
                    id: node.properties.id,
                    name: node.properties.name,
                    type: node.properties.type,
                    properties,
                    sourceFiles: node.properties.sourceFiles || [],
                    createdAt: node.properties.createdAt,
                    updatedAt: node.properties.updatedAt
                };
            });

            // 获取节点之间的关系
            const nodeIds = nodes.map(n => n.id);
            const edges = [];
            
            if (nodeIds.length > 0) {
                const relationQuery = `
                    MATCH (a:Entity)-[r:RELATION]->(b:Entity)
                    WHERE a.id IN $nodeIds AND b.id IN $nodeIds
                    RETURN a.id as sourceId, b.id as targetId, r
                `;
                
                try {
                    const relationResult = await session.run(relationQuery, { nodeIds });
                    relationResult.records.forEach(r => {
                        const rel = r.get('r');
                        edges.push({
                            source: r.get('sourceId'),
                            target: r.get('targetId'),
                            type: rel.properties.type || '关联',
                            properties: rel.properties
                        });
                    });
                } catch (error) {
                    console.error('获取关系失败:', error);
                    // 关系获取失败不应阻塞节点返回
                }
            }

            return { nodes, edges };

        } finally {
            await session.close();
        }
    }

    /**
     * 获取实体关系网络
     */
    async getEntityNetwork(entityId, depth = 1) {
        this._checkNeo4j();
        const session = this.driver.session();

        try {
            const query = `
                MATCH path = (center:Entity {id: $entityId})-[:RELATION*0..${depth}]-(connected:Entity)
                RETURN center, connected, relationships(path) as rels
            `;

            const result = await session.run(query, { entityId });

            const nodes = new Map();
            const edges = [];
            // 用于映射 Neo4j 内部 ID 到 UUID
            const idMap = new Map();

            result.records.forEach(record => {
                const center = record.get('center');
                const connected = record.get('connected');
                const rels = record.get('rels');

                // 添加节点并记录 ID 映射
                [center, connected].forEach(node => {
                    // 兼容 neo4j-driver v4/v5 (identity vs elementId)
                    const internalId = node.elementId || node.identity.toString();
                    const uuid = node.properties.id;
                    
                    idMap.set(internalId, uuid);

                    if (!nodes.has(uuid)) {
                        nodes.set(uuid, {
                            id: uuid,
                            name: node.properties.name,
                            type: node.properties.type,
                            properties: JSON.parse(node.properties.properties || '{}')
                        });
                    }
                });

                // 添加关系
                rels.forEach(rel => {
                    const startId = rel.startNodeElementId || rel.start.toString();
                    const endId = rel.endNodeElementId || rel.end.toString();
                    
                    const sourceUuid = idMap.get(startId);
                    const targetUuid = idMap.get(endId);

                    if (sourceUuid && targetUuid) {
                        edges.push({
                            source: sourceUuid,
                            target: targetUuid,
                            type: rel.properties.type || '关联',
                            properties: rel.properties
                        });
                    }
                });
            });

            // 去重关系
            const uniqueEdges = [];
            const edgeSet = new Set();
            
            edges.forEach(edge => {
                const key = `${edge.source}-${edge.target}-${edge.type}`;
                if (!edgeSet.has(key)) {
                    edgeSet.add(key);
                    uniqueEdges.push(edge);
                }
            });

            return {
                nodes: Array.from(nodes.values()),
                edges: uniqueEdges
            };

        } finally {
            await session.close();
        }
    }

    /**
     * 删除任务相关数据
     * @param {string[]} fileIds - 文件ID列表
     */
    async deleteTaskData(fileIds) {
        if (!this.neo4jEnabled || !fileIds || fileIds.length === 0) {
            return;
        }

        const session = this.driver.session();
        try {
            // 将所有 fileId 转换为字符串，确保匹配
            const fileIdStrings = fileIds.map(id => id.toString());
            
            for (const fileId of fileIdStrings) {
                // 1. 从实体的 sourceFiles 中移除该 fileId
                // 2. 如果实体的 sourceFiles 为空，则删除该实体及其关联关系
                const query = `
                    MATCH (n:Entity)
                    WHERE $fileId IN n.sourceFiles
                    SET n.sourceFiles = [x IN n.sourceFiles WHERE x <> $fileId]
                    WITH n
                    WHERE size(n.sourceFiles) = 0
                    DETACH DELETE n
                `;
                
                await session.run(query, { fileId });
            }
            console.log(`已清理文件关联的Neo4j数据: ${fileIdStrings.length} 个文件`);
        } catch (error) {
            console.error('删除Neo4j数据失败:', error);
            // 不抛出错误，以免影响主流程
        } finally {
            await session.close();
        }
    }

    /**
     * 获取图谱统计
     */
    async getGraphStats() {
        this._checkNeo4j();
        const session = this.driver.session();

        try {
            const entityCount = await session.run('MATCH (e:Entity) RETURN count(e) as count');
            const relationCount = await session.run('MATCH ()-[r:RELATION]->() RETURN count(r) as count');
            const typeStats = await session.run(`
                MATCH (e:Entity) 
                RETURN e.type as type, count(e) as count 
                ORDER BY count DESC
            `);

            return {
                entityCount: entityCount.records[0].get('count').toNumber(),
                relationCount: relationCount.records[0].get('count').toNumber(),
                typeDistribution: typeStats.records.map(r => ({
                    type: r.get('type'),
                    count: r.get('count').toNumber()
                }))
            };

        } finally {
            await session.close();
        }
    }

    /**
     * 关闭连接
     */
    async close() {
        if (this.driver) {
            await this.driver.close();
        }
    }
}

module.exports = new GraphBuilder();
