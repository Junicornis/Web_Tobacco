const { GraphCypherQAChain } = require("@langchain/community/chains/graph_qa/cypher");
const { chatModel } = require("../utils/langchainClient");
const neo4j = require("neo4j-driver");
const { PromptTemplate } = require("@langchain/core/prompts");

class GraphQAService {
    constructor() {
        this.driver = null;
        const uri = process.env.NEO4J_URI || 'neo4j://127.0.0.1:7687';
        const user = process.env.NEO4J_USER || 'neo4j';
        const password = process.env.NEO4J_PASSWORD;

        if (password) {
            this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
        }
    }

    _stringifyCypherWithTemplateParams(cypher) {
        if (typeof cypher !== "string") return "";
        return cypher.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, "${$1}");
    }

    _sanitizeNeo4jValue(value) {
        if (neo4j.isInt && neo4j.isInt(value)) {
            return value.toNumber();
        }

        if (value instanceof neo4j.types.Node) {
            return {
                __type: "node",
                identity: this._sanitizeNeo4jValue(value.identity),
                labels: value.labels,
                properties: this._sanitizeNeo4jValue(value.properties),
            };
        }

        if (value instanceof neo4j.types.Relationship) {
            return {
                __type: "relationship",
                identity: this._sanitizeNeo4jValue(value.identity),
                start: this._sanitizeNeo4jValue(value.start),
                end: this._sanitizeNeo4jValue(value.end),
                type: value.type,
                properties: this._sanitizeNeo4jValue(value.properties),
            };
        }

        if (value instanceof neo4j.types.Path) {
            return {
                __type: "path",
                start: this._sanitizeNeo4jValue(value.start),
                end: this._sanitizeNeo4jValue(value.end),
                segments: this._sanitizeNeo4jValue(value.segments),
                length: value.length,
            };
        }

        if (Array.isArray(value)) {
            return value.map((v) => this._sanitizeNeo4jValue(v));
        }

        if (value && typeof value === "object") {
            const out = {};
            for (const [k, v] of Object.entries(value)) {
                out[k] = this._sanitizeNeo4jValue(v);
            }
            return out;
        }

        return value;
    }

    async _fallbackAnswer(question, capture) {
        if (!this.driver) return null;

        const session = this.driver.session();
        try {
            const anchorCypher = `
                MATCH (e:Entity)
                WHERE $q CONTAINS e.name
                RETURN e.id AS id, e.name AS name, e.type AS type
                ORDER BY size(e.name) DESC
                LIMIT 3
                `;
            const anchorParams = { q: question };
            const anchorResult = await session.run(anchorCypher, anchorParams);

            const anchors = anchorResult.records.map((r) => ({
                id: r.get("id"),
                name: r.get("name"),
                type: r.get("type"),
            }));

            if (anchors.length === 0) return null;

            const blocks = [];
            const graphData = { anchors: [], details: [] };
            if (capture) {
                capture.cypherStatements = [
                    {
                        cypher: this._stringifyCypherWithTemplateParams(anchorCypher),
                        params: anchorParams,
                    },
                ];
            }
            graphData.anchors = anchors.map((a) => ({ ...a }));

            for (const a of anchors) {
                const hazardsCypher = `
                    MATCH (a:Entity {id: $id})-[:RELATION*1..6]-(h:Entity)
                    WHERE h.type IN ['危险源', '隐患']
                    RETURN DISTINCT h.name AS name
                    LIMIT 20
                    `;
                const hazardsParams = { id: a.id };
                const hazardsRes = await session.run(hazardsCypher, hazardsParams);
                const hazards = hazardsRes.records.map((r) => r.get("name")).filter(Boolean);

                const consequencesCypher = `
                    MATCH (a:Entity {id: $id})-[:RELATION*1..8]-(c:Entity)
                    WHERE c.type = '后果'
                    RETURN DISTINCT c.name AS name
                    LIMIT 20
                    `;
                const consequencesParams = { id: a.id };
                const consequencesRes = await session.run(consequencesCypher, consequencesParams);
                const consequences = consequencesRes.records.map((r) => r.get("name")).filter(Boolean);

                const measuresCypher = `
                    MATCH (a:Entity {id: $id})-[:RELATION*1..8]-(m:Entity)
                    WHERE m.type = '控制措施'
                    RETURN DISTINCT m.name AS name
                    LIMIT 20
                    `;
                const measuresParams = { id: a.id };
                const measuresRes = await session.run(measuresCypher, measuresParams);
                const measures = measuresRes.records.map((r) => r.get("name")).filter(Boolean);

                const lines = [];
                lines.push(`关联对象：${a.name}${a.type ? `（${a.type}）` : ''}`);
                if (hazards.length > 0) lines.push(`- 安全隐患/危险源：${hazards.join('、')}`);
                if (consequences.length > 0) lines.push(`- 可能后果：${consequences.join('、')}`);
                if (measures.length > 0) lines.push(`- 建议措施：${measures.join('、')}`);

                blocks.push(lines.join('\n'));

                graphData.details.push({
                    anchor: { ...a },
                    hazards: hazards.map((h) => ({ name: h })),
                    consequences: consequences.map((c) => ({ name: c })),
                    measures: measures.map((m) => ({ name: m })),
                });

                if (capture) {
                    capture.cypherStatements.push(
                        {
                            cypher: this._stringifyCypherWithTemplateParams(hazardsCypher),
                            params: hazardsParams,
                        },
                        {
                            cypher: this._stringifyCypherWithTemplateParams(consequencesCypher),
                            params: consequencesParams,
                        },
                        {
                            cypher: this._stringifyCypherWithTemplateParams(measuresCypher),
                            params: measuresParams,
                        }
                    );
                }
            }

            if (capture) {
                capture.graphData = this._sanitizeNeo4jValue(graphData);
            }
            return blocks.join('\n\n');
        } finally {
            await session.close();
        }
    }

    async getChain(capture) {
        if (!this.driver) {
            throw new Error("Neo4j 未连接");
        }

        // 自定义 Prompt，适应通用的 Entity 节点设计
        const CYPHER_GENERATION_TEMPLATE = `
Task: Generate Cypher statement to query a graph database.
Instructions:
1. All nodes in this graph are labeled as \`Entity\`.
2. Different types of entities are distinguished by the \`type\` property (e.g., e.type = '风险单元', e.type = '危险源').
3. All relationships are labeled as \`RELATION\`.
4. Different types of relationships are distinguished by the \`type\` property on the relationship (e.g., r.type = '包含', r.type = '导致').
5. Node properties are stored in a JSON string field named \`properties\`, but for search, use \`name\` or \`type\`.
6. Do not wrap the output in any markdown block.

Schema:
{schema}

Notes:
Node properties: name, type, id
Relationship properties: type

Type hints (common in this project):
- 部门, 风险单元, 作业活动, 危险源, 后果, 控制措施

Query hints:
- Prefer CONTAINS for entity name matching.
- If relationship types are unclear, do not force r.type filters.
- Use variable-length patterns when unsure, e.g. -[:RELATION*1..4]->

Examples:
Question: "配电房有哪些风险？"
Cypher: MATCH (p:Entity)-[r:RELATION]->(h:Entity) WHERE p.type = '风险单元' AND h.type = '危险源' AND p.name CONTAINS '配电房' AND r.type = '包含' RETURN h.name, h.type

Question: "触电事故是由什么引起的？"
Cypher: MATCH (h:Entity)-[r:RELATION]->(c:Entity) WHERE h.type = '危险源' AND c.type = '后果' AND c.name CONTAINS '触电' AND r.type = '导致' RETURN h.name

Question: "后勤部的安全隐患有什么？"
Cypher: MATCH (d:Entity)-[:RELATION*1..4]->(h:Entity) WHERE d.name CONTAINS '后勤部' AND h.type = '危险源' RETURN DISTINCT h.name LIMIT 20

The question is:
{question}
`;

        const cypherPrompt = PromptTemplate.fromTemplate(CYPHER_GENERATION_TEMPLATE);

        const chain = GraphCypherQAChain.fromLLM({
            llm: chatModel,
            graph: {
                // 我们手动提供 schema 描述，避免自动抓取导致 token 过多或误解
                query: async (cypher) => {
                    const session = this.driver.session();
                    try {
                        const result = await session.run(cypher);
                        const rows = result.records.map((record) => this._sanitizeNeo4jValue(record.toObject()));
                        if (capture) {
                            capture.cypherStatements = [this._stringifyCypherWithTemplateParams(cypher)];
                            capture.graphData = rows;
                        }
                        return rows;
                    } finally {
                        await session.close();
                    }
                },
                getSchema: () => `
Node labels: [Entity]
Relationship types: [RELATION]
Node properties: [name, type, id]
Relationship properties: [type]
                `
            },
            cypherPrompt,
            returnDirect: false, // 让 LLM 基于查询结果生成自然语言回答
        });

        return chain;
    }

    async ask(question, options = {}) {
        try {
            const includeEvidence = options && options.includeEvidence === true;
            const capture = includeEvidence ? { cypherStatements: [], graphData: null } : null;
            const chain = await this.getChain(capture);
            const result = await chain.invoke({ query: question });
            const text = result?.result;
            const normalized = typeof text === "string" ? text.trim() : "";
            if (!normalized || /我不知道|无法确定|无法回答/.test(normalized)) {
                const fallback = await this._fallbackAnswer(question, capture);
                const finalText = fallback || text;
                if (includeEvidence) return { text: finalText, evidence: capture };
                return finalText;
            }
            if (includeEvidence) return { text, evidence: capture };
            return text;
        } catch (error) {
            console.error("GraphQA Error:", error);
            // 降级处理：如果 Cypher 生成失败或执行错误，返回 null，交给 Router 处理
            const includeEvidence = options && options.includeEvidence === true;
            const capture = includeEvidence ? { cypherStatements: [], graphData: null } : null;
            const fallback = await this._fallbackAnswer(question, capture);
            if (includeEvidence) return { text: fallback, evidence: capture };
            return fallback;
        }
    }
}

module.exports = new GraphQAService();
