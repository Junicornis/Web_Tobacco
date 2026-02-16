const { chatModel } = require("../utils/langchainClient");
const graphQA = require("./graphQA");
const vectorStore = require("./vectorStore");
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");

function withTimeout(promise, timeoutMs, timeoutMessage) {
    const ms = Number(timeoutMs);
    if (!Number.isFinite(ms) || ms <= 0) return promise;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error(timeoutMessage || `操作超时（${ms}ms）`)), ms);
        }),
    ]);
}

class QARouterService {
    
    /**
     * 判断用户意图
     */
    async routeIntent(question) {
        const prompt = `
你是一个智能问答系统的路由助手。请分析用户的提问，判断应该使用哪种检索方式来回答。
可选方式：
1. "GRAPH": 适合询问实体关系、属性、层级结构等结构化问题（如“配电房包含哪些危险源？”“A和B有什么关系？”）。
2. "RAG": 适合询问定义、流程、操作指南、长文本描述等非结构化问题（如“灭火器的操作步骤是什么？”“什么是安全红线？”）。
3. "BOTH": 如果问题既涉及具体实体关系，又需要详细文本解释，或者你不确定，请选择两者。

请只输出 JSON 格式，格式如下：
{
    "intents": ["GRAPH", "RAG"] // 或 ["GRAPH"] 或 ["RAG"]
}
不要输出任何其他文字。

用户问题：${question}
`;
        
        try {
            const response = await chatModel.invoke([
                new SystemMessage("你是一个精准的意图分类器。"),
                new HumanMessage(prompt)
            ]);
            
            const content = response.content.trim().replace(/```json/g, '').replace(/```/g, '');
            const result = JSON.parse(content);
            return result.intents || ["BOTH"];
        } catch (error) {
            console.error("Router Error:", error);
            return ["BOTH"]; // 默认混合模式
        }
    }

    /**
     * 综合回答
     */
    async answer(question, history = []) {
        const intents = await this.routeIntent(question);
        const forceGraph = /隐患|危险源|风险|后果|控制措施|措施|部门|风险单元|作业活动/.test(question);
        if (forceGraph && !intents.includes("GRAPH") && !intents.includes("BOTH")) {
            intents.push("GRAPH");
        }
        console.log(`Question: "${question}", Intents: ${intents}`);

        let graphContext = "";
        let ragContext = "";
        let graphEvidence = null;
        let ragPairs = [];
        let graphError = null;
        let ragError = null;

        // 并行执行检索
        const tasks = [];

        if (intents.includes("GRAPH") || intents.includes("BOTH")) {
            tasks.push(
                graphQA
                    .ask(question, { includeEvidence: true })
                    .then((res) => {
                        const text = res && typeof res === "object" ? res.text : res;
                        const evidence = res && typeof res === "object" ? res.evidence : null;
                        if (text) graphContext = `图谱知识库检索结果：\n${text}\n`;
                        if (evidence) graphEvidence = evidence;
                    })
                    .catch((error) => {
                        graphError = error;
                        console.error("Graph 检索失败:", error);
                    })
            );
        }

        if (intents.includes("RAG") || intents.includes("BOTH")) {
            tasks.push(
                withTimeout(
                    vectorStore.similaritySearchWithScore(question, 3),
                    parseInt(process.env.RAG_SEARCH_TIMEOUT_MS || "30000", 10),
                    "RAG 检索超时"
                )
                    .then((pairs) => {
                        if (pairs && pairs.length > 0) {
                            ragPairs = pairs;
                            ragContext = `文档知识库检索结果：\n${pairs.map(([d]) => d.pageContent).join('\n---\n')}\n`;
                        }
                    })
                    .catch((error) => {
                        ragError = error;
                        console.error("RAG 检索失败:", error);
                    })
            );
        }

        await Promise.all(tasks);

        const hasGraph = !!graphContext;
        const hasRag = !!ragContext;

        // 如果都没有结果
        if (!hasGraph && !hasRag) {
            if (ragError && (intents.includes("RAG") || intents.includes("BOTH"))) {
                return {
                    answer: `文档检索失败：${ragError.message || String(ragError)}`,
                    source: "rag",
                    strategyTag: "rag",
                    evidence: null,
                };
            }
            if (graphError && (intents.includes("GRAPH") || intents.includes("BOTH"))) {
                return {
                    answer: `图谱检索失败：${graphError.message || String(graphError)}`,
                    source: "graph",
                    strategyTag: "neo4j",
                    evidence: null,
                };
            }
            return {
                answer: "抱歉，我在知识库中没有找到相关信息。",
                source: "none",
                strategyTag: null,
                evidence: null
            };
        }

        // 最终生成回答
        const finalPrompt = `
请根据以下检索到的上下文信息回答用户问题。
如果上下文不足以回答问题，请诚实说明。
请使用中文回答，条理清晰。

${graphContext}

${ragContext}

用户问题：${question}
`;

        const response = await withTimeout(
            chatModel.invoke([
                new SystemMessage("你是一个专业的安全培训助手。请结合提供的上下文信息，准确、全面地回答用户问题。"),
                ...history.map(msg => msg.role === 'user' ? new HumanMessage(msg.content) : new SystemMessage(msg.content)),
                new HumanMessage(finalPrompt)
            ]),
            parseInt(process.env.QA_ANSWER_TIMEOUT_MS || "90000", 10),
            "回答生成超时"
        );

        const strategyTag = hasGraph && hasRag ? "neo4j+rag" : hasGraph ? "neo4j" : "rag";

        const evidence = {
            strategyTag,
        };

        if (hasGraph && graphEvidence) {
            const cypherStatementsRaw = Array.isArray(graphEvidence.cypherStatements) ? graphEvidence.cypherStatements : [];
            const cypherStatements = cypherStatementsRaw.map((s) => {
                if (typeof s === "string") return { cypher: s, params: null };
                if (s && typeof s === "object") return { cypher: s.cypher || "", params: s.params || null };
                return { cypher: "", params: null };
            }).filter((s) => s.cypher);

            evidence.neo4j = {
                cypherStatements,
                graphData: graphEvidence.graphData ?? null
            };
        }

        if (hasRag && Array.isArray(ragPairs) && ragPairs.length > 0) {
            const matches = ragPairs.map(([doc, score], idx) => {
                const metadata = (doc && doc.metadata) || {};
                const fileName =
                    metadata.fileName ||
                    metadata.filename ||
                    metadata.sourceFile ||
                    metadata.source ||
                    metadata.file ||
                    metadata.path ||
                    "未知";
                const paragraphIndexRaw =
                    metadata.paragraphIndex ??
                    metadata.paragraph ??
                    metadata.chunkIndex ??
                    metadata.chunk ??
                    null;
                const paragraphIndex =
                    typeof paragraphIndexRaw === "number"
                        ? (metadata.chunkIndex !== undefined ? paragraphIndexRaw + 1 : paragraphIndexRaw)
                        : typeof paragraphIndexRaw === "string" && paragraphIndexRaw.trim()
                            ? Number(paragraphIndexRaw)
                            : idx + 1;
                const originalUrl = metadata.url || metadata.link || metadata.sourceUrl || metadata.href || null;

                return {
                    fileName,
                    paragraphIndex,
                    score,
                    originalUrl,
                    text: doc.pageContent,
                    keySentences: []
                };
            });

            try {
                const highlightPrompt = `
你将获得：用户问题、系统回答，以及若干条检索到的原始片段。
任务：为每条片段选出最多 3 句“直接支撑系统回答”的关键句。
要求：
1. 关键句必须原封不动出自该片段文本，不得改写、不得新增。
2. 若片段中没有能支撑回答的句子，返回空数组。
3. 只输出 JSON，不要输出任何其他文字。

输出格式：
[
  {"index": 0, "keySentences": ["...","..."]},
  {"index": 1, "keySentences": []}
]

用户问题：${question}
系统回答：${response.content}
片段列表：
${matches.map((m, i) => `【${i}】${m.text}`).join('\n\n')}
`;
                const highlightResp = await withTimeout(
                    chatModel.invoke([
                        new SystemMessage("你是一个严格的证据标注器。"),
                        new HumanMessage(highlightPrompt)
                    ]),
                    parseInt(process.env.QA_HIGHLIGHT_TIMEOUT_MS || "20000", 10),
                    "证据标注超时"
                );
                const content = String(highlightResp.content || "")
                    .trim()
                    .replace(/```json/g, "")
                    .replace(/```/g, "");
                const parsed = JSON.parse(content);
                if (Array.isArray(parsed)) {
                    for (const item of parsed) {
                        const index = item && typeof item.index === "number" ? item.index : null;
                        const keySentences = item && Array.isArray(item.keySentences) ? item.keySentences.filter(Boolean) : [];
                        if (index !== null && matches[index]) {
                            matches[index].keySentences = keySentences.slice(0, 3);
                        }
                    }
                }
            } catch (e) {
                for (const m of matches) {
                    const firstLine = String(m.text || "").split(/\n+/).find((l) => l.trim());
                    m.keySentences = firstLine ? [firstLine] : [];
                }
            }

            evidence.rag = { matches };
        }

        return {
            answer: response.content,
            source: intents.join('+'),
            strategyTag,
            evidence,
            debug: {
                graph: hasGraph,
                rag: hasRag
            }
        };
    }
}

module.exports = new QARouterService();
