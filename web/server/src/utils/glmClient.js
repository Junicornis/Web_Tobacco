/**
 * 智谱GLM-4 API 客户端封装
 * 用于知识抽取和实体向量化
 */

const GLM_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const GLM_EMBEDDING_URL = 'https://open.bigmodel.cn/api/paas/v4/embeddings';
const json5 = require('json5');

class GLMClient {
    constructor() {
        this.apiKey = process.env.GLM_API_KEY;
        if (!this.apiKey) {
            console.warn('警告: GLM_API_KEY 未设置，知识图谱功能将不可用');
        }
    }

    /**
     * 聊天补全接口（用于知识抽取）
     * @param {Array} messages - 消息数组
     * @param {Object} options - 可选参数
     * @returns {Promise<Object>} API响应
     */
    async chat(messages, options = {}) {
        if (!this.apiKey) {
            throw new Error('GLM_API_KEY 未配置');
        }

        const requestBody = {
            model: options.model || 'glm-4.7',
            messages: messages,
            stream: false,
            max_tokens: options.max_tokens || 8000,
            temperature: options.temperature ?? 0.3
        };

        // 如果启用了 thinking 模式
        if (options.thinking) {
            requestBody.thinking = { type: 'enabled' };
        }

        try {
            const response = await fetch(GLM_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`GLM API 错误: ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('GLM API 调用失败:', error);
            throw error;
        }
    }

    /**
     * 提取知识（专用方法）
     * @param {string} documentText - 文档文本内容
     * @param {Object} ontologyHint - 可选的本体提示
     * @returns {Promise<Object>} 抽取的知识结构
     */
    async extractKnowledge(documentText, ontologyHint = null) {
        const systemPrompt = this._buildExtractionSystemPrompt(ontologyHint);

        // 分段处理：如果文档太长，分块抽取
        const maxChunkSize = 4000;
        const chunks = this._splitText(documentText, maxChunkSize);

        const allResults = {
            entityTypes: [],
            entities: [],
            relationTypes: [],
            relations: []
        };

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const userPrompt = `文档片段 (${i + 1}/${chunks.length}):\n\n${chunk}`;

            let response;
            let retries = 3;
            while (retries > 0) {
                try {
                    response = await this.chat([
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ], {
                        temperature: 0.3,
                        max_tokens: 30000
                    });

                    if (response && response.choices && response.choices.length > 0 && response.choices[0].message && response.choices[0].message.content) {
                        break;
                    }
                    console.warn(`Chunk ${i} extraction returned empty content, retrying... (${retries} left)`);
                    console.warn('Response Dump:', JSON.stringify(response, null, 2));
                } catch (e) {
                    console.warn(`Chunk ${i} extraction failed: ${e.message}, retrying... (${retries} left)`);
                }
                retries--;
                if (retries > 0) await new Promise(resolve => setTimeout(resolve, 2000));
            }

            const content = response?.choices?.[0]?.message?.content || '';

            // 增强的空内容检查
            if (!content || typeof content !== 'string' || !content.trim()) {
                const error = new Error(`Chunk ${i} extraction failed: Empty or invalid content from API`);
                error.details = {
                    chunkIndex: i,
                    chunkCount: chunks.length,
                    contentType: typeof content,
                    contentLength: content ? content.length : 0,
                    lastResponse: response ? 'Response received' : 'No response'
                };
                throw error;
            }

            const parsed = this._parseExtractionResult(content);
            if (!parsed.ok) {
                const error = new Error(`抽取结果解析失败: ${parsed.errorMessage}`);
                error.details = {
                    chunkIndex: i,
                    chunkCount: chunks.length,
                    rawPreview: parsed.rawPreview,
                    rawLength: parsed.rawLength
                };
                throw error;
            }
            const extracted = parsed.value;

            // 合并结果
            allResults.entityTypes.push(...extracted.entityTypes);
            allResults.entities.push(...extracted.entities);
            allResults.relationTypes.push(...extracted.relationTypes);
            allResults.relations.push(...extracted.relations);
        }

        // 去重和合并
        const deduped = this._deduplicateResults(allResults);
        deduped.meta = {
            inputChars: typeof documentText === 'string' ? documentText.length : 0,
            chunkCount: chunks.length
        };
        return deduped;
    }

    /**
     * 获取文本嵌入向量
     * @param {string|Array<string>} text - 文本或文本数组
     * @returns {Promise<Array<number>>} 嵌入向量
     */
    async getEmbedding(text) {
        if (!this.apiKey) {
            throw new Error('GLM_API_KEY 未配置');
        }

        const texts = Array.isArray(text) ? text : [text];

        try {
            const response = await fetch(GLM_EMBEDDING_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: 'embedding-3',
                    input: texts
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Embedding API 错误: ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();

            // 返回单个向量或向量数组
            if (Array.isArray(text)) {
                return data.data.map(item => item.embedding);
            }
            return data.data[0].embedding;
        } catch (error) {
            console.error('Embedding API 调用失败:', error);
            throw error;
        }
    }

    /**
     * 计算两个文本的相似度
     * @param {string} text1 
     * @param {string} text2 
     * @returns {Promise<number>} 相似度分数 (0-1)
     */
    async calculateSimilarity(text1, text2) {
        const [embedding1, embedding2] = await this.getEmbedding([text1, text2]);
        return this._cosineSimilarity(embedding1, embedding2);
    }

    /**
     * 构建抽取系统提示词
     */
    _buildExtractionSystemPrompt(ontologyHint) {
        let prompt = `你是一位专业的安全培训知识图谱构建专家。
任务：从提供的安全培训文档中提取结构化知识，构建知识图谱。

**输出格式要求（必须严格遵循以下JSON格式）：**
\`\`\`json
{
  "entityTypes": [
    {
      "name": "类型名称（英文或中文，如：设备/Equipment）",
      "description": "类型描述"
    }
  ],
  "entities": [
    {
      "name": "实体名称",
      "type": "实体类型（必须匹配entityTypes中的name）",
      "properties": {
        "属性名": "属性值"
      },
      "context": "实体出现的原文片段（100字以内）"
    }
  ],
  "relationTypes": [
    {
      "name": "关系名称（如：属于/使用/导致/预防/规定）",
      "sourceType": "源实体类型",
      "targetType": "目标实体类型",
      "description": "关系描述"
    }
  ],
  "relations": [
    {
      "source": "源实体名称",
      "target": "目标实体名称",
      "type": "关系类型",
      "context": "关系出现的原文片段"
    }
  ]
}
\`\`\`

**实体类型指导（安全培训领域）：**
- 风险单元：风险存在的具体区域或管理单元，如办公场所、档案室、配电间等
- 作业活动：在该区域进行的具体操作或管理活动，如设备使用、档案管理、巡检等
- 危险源：可能导致事故的触发因素或潜在隐患，如电源线破损、违规操作、通道堵塞等
- 后果：危险源导致的事故后果类型，如触电、火灾、人身伤害等
- 控制措施：为降低风险采取的具体技术或管理手段，如定期检查、佩戴护具、设置标识等
- 部门：涉及该风险的责任单位或部门
- 设备：灭火器、消防栓等（如果文中明确提到）
- 规范：相关法规制度（如果文中明确提到）

**特殊场景处理（安全风险辨识表）：**
如果文档内容是“安全风险辨识表”或类似表格，请严格按照以下逻辑构建图谱：
1. **逐行解析**：每一行数据通常对应一组关联的实体。
2. **实体映射**：
   - "风险单元/场所"列 -> \`风险单元\` 实体
   - "作业活动"列 -> \`作业活动\` 实体
   - "危险因素/描述"列 -> \`危险源\` 实体
   - "后果/事故类型"列 -> \`后果\` 实体
   - "控制措施"列 -> \`控制措施\` 实体
   - "责任部门"列 -> \`部门\` 实体
3. **关系构建**：
   - \`风险单元\` -[包含]-> \`作业活动\`
   - \`作业活动\` -[触发]-> \`危险源\`
   - \`危险源\` -[导致]-> \`后果\`
   - \`危险源\` -[控制]-> \`控制措施\`
   - \`风险单元\` -[涉及]-> \`部门\`

**抽取原则：**
1. 实体名称应简洁明确，避免过长描述
2. 每个实体必须有明确的类型
3. 关系必须连接真实存在的实体名称
4. 属性提取关键信息（如分值、等级、型号等），特别是风险等级相关属性（严重性、可能性、风险值等）应作为\`危险源\`的属性。
5. 置信度高的信息才提取，不确定的跳过
6. 保持原文术语，不要过度泛化
7. **表格数据处理**：当遇到表格形式的数据，请务必**逐行解析**，不要合并不同行的数据，确保每一行的风险路径（单元-活动-危险-后果-措施）是完整的。

请仅输出JSON格式的结果，不要有其他解释性文字。`;

        if (ontologyHint) {
            prompt += `\n\n**参考本体定义（请优先遵循）：**\n`;
            prompt += `实体类型：${ontologyHint.entityTypes?.map(et => et.name).join('、') || '无'}\n`;
            prompt += `关系类型：${ontologyHint.relationTypes?.map(rt => rt.name).join('、') || '无'}`;
        }

        return prompt;
    }

    /**
     * 解析抽取结果
     */
    _parseExtractionResult(content) {
        const raw = typeof content === 'string' ? content : '';
        if (!raw.trim()) {
            return {
                ok: false,
                rawLength: 0,
                rawPreview: '',
                errorMessage: 'Empty input content'
            };
        }
        const rawLength = raw.length;
        const rawPreview = raw.slice(0, 2000);
        try {
            // 尝试提取JSON代码块
            let jsonStr = raw.trim();
            const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) ||
                raw.match(/```\s*([\s\S]*?)```/);

            if (jsonMatch && jsonMatch[1]) {
                jsonStr = jsonMatch[1].trim();
            } else {
                // 如果正则没匹配到，可能是没有闭合的```，尝试手动清理
                jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
            }

            // 尝试修复未闭合的 JSON (针对 invalid end of input 错误)
            // 如果结尾缺少 ']}' 或 ']' 或 '}'，尝试补全
            // 这是一个简单的启发式修复，主要针对被截断的响应
            if (!jsonStr.endsWith('}')) {
                if (jsonStr.lastIndexOf('}') < jsonStr.lastIndexOf(']')) {
                    // 可能是数组没闭合，或者对象里的数组没闭合
                    if (!jsonStr.endsWith(']')) jsonStr += ']';
                    jsonStr += '}';
                } else {
                    jsonStr += '}';
                }
            }

            const result = json5.parse(jsonStr);

            return {
                ok: true,
                rawLength,
                rawPreview,
                value: {
                    entityTypes: Array.isArray(result.entityTypes) ? result.entityTypes : [],
                    entities: Array.isArray(result.entities) ? result.entities : [],
                    relationTypes: Array.isArray(result.relationTypes) ? result.relationTypes : [],
                    relations: Array.isArray(result.relations) ? result.relations : []
                }
            };
        } catch (error) {
            return {
                ok: false,
                rawLength,
                rawPreview,
                errorMessage: error?.message || String(error)
            };
        }
    }

    /**
     * 文本分块
     */
    _splitText(text, maxChunkSize) {
        const chunks = [];
        let currentChunk = '';

        // 按段落分割
        const paragraphs = text.split(/\n\s*\n/);

        for (const paragraph of paragraphs) {
            if ((currentChunk + paragraph).length > maxChunkSize && currentChunk.length > 0) {
                chunks.push(currentChunk.trim());
                currentChunk = paragraph;
            } else {
                currentChunk += '\n\n' + paragraph;
            }
        }

        if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
        }

        return chunks.length > 0 ? chunks : [text];
    }

    /**
     * 去重和合并结果
     */
    _deduplicateResults(results) {
        // 实体类型去重
        const entityTypeMap = new Map();
        results.entityTypes.forEach(et => {
            entityTypeMap.set(et.name, et);
        });
        results.entityTypes = Array.from(entityTypeMap.values());

        // 关系类型去重
        const relationTypeMap = new Map();
        results.relationTypes.forEach(rt => {
            const key = `${rt.name}_${rt.sourceType}_${rt.targetType}`;
            relationTypeMap.set(key, rt);
        });
        results.relationTypes = Array.from(relationTypeMap.values());

        // 实体去重（基于名称+类型）
        const entityMap = new Map();
        results.entities.forEach(e => {
            const key = `${e.name}_${e.type}`;
            if (!entityMap.has(key) || e.confidence > (entityMap.get(key).confidence || 0)) {
                entityMap.set(key, { ...e, confidence: e.confidence || 0.8 });
            }
        });
        results.entities = Array.from(entityMap.values());

        // 关系去重
        const relationMap = new Map();
        results.relations.forEach(r => {
            const key = `${r.source}_${r.type}_${r.target}`;
            if (!relationMap.has(key)) {
                relationMap.set(key, { ...r, confidence: r.confidence || 0.8 });
            }
        });
        results.relations = Array.from(relationMap.values());

        return results;
    }

    /**
     * 计算余弦相似度
     */
    _cosineSimilarity(vec1, vec2) {
        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;

        for (let i = 0; i < vec1.length; i++) {
            dotProduct += vec1[i] * vec2[i];
            norm1 += vec1[i] * vec1[i];
            norm2 += vec2[i] * vec2[i];
        }

        return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    }
}

module.exports = new GLMClient();
