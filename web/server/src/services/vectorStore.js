const { Neo4jVectorStore } = require("@langchain/community/vectorstores/neo4j_vector");
const { embeddings } = require("../utils/langchainClient");

class VectorStoreService {
    constructor() {
        this.url = process.env.NEO4J_URI || "neo4j://127.0.0.1:7687";
        this.username = process.env.NEO4J_USER || "neo4j";
        this.password = process.env.NEO4J_PASSWORD;
        this.vectorIndexName = "training_docs_index";
        this.nodeLabel = "DocumentChunk";
        this.textNodeProperty = "text";
        this.embeddingNodeProperty = "embedding";
        this._storePromise = null;
        
        if (this.password) {
            this.config = {
                url: this.url,
                username: this.username,
                password: this.password,
            };
        }
    }

    /**
     * 获取 Vector Store 实例
     */
    async getStore() {
        if (!this.config) {
            throw new Error("Neo4j 配置缺失");
        }

        if (!this._storePromise) {
            this._storePromise = Neo4jVectorStore.fromExistingGraph(embeddings, {
                ...this.config,
                indexName: this.vectorIndexName,
                nodeLabel: this.nodeLabel,
                textNodeProperties: [this.textNodeProperty],
                embeddingNodeProperty: this.embeddingNodeProperty,
            }).catch((err) => {
                this._storePromise = null;
                throw err;
            });
        }

        return await this._storePromise;
    }

    /**
     * 确保索引存在
     */
    async ensureIndex() {
        await this.getStore();
        console.log(`向量索引 ${this.vectorIndexName} 已确认`);
    }

    /**
     * 添加文档
     * @param {Array<{pageContent: string, metadata: object}>} documents 
     */
    async addDocuments(documents) {
        const store = await this.getStore();
        await store.addDocuments(documents);
        console.log(`已添加 ${documents.length} 个文档片段到向量库`);
    }

    async deleteByFileIds(fileIds) {
        const ids = Array.isArray(fileIds) ? fileIds.filter(Boolean) : [];
        if (ids.length === 0) return;
        const store = await this.getStore();
        await store.query(
            `UNWIND $fileIds AS fileId
MATCH (d:${this.nodeLabel})
WHERE d.fileId = fileId
DETACH DELETE d`,
            { fileIds: ids }
        );
    }

    /**
     * 相似度搜索
     * @param {string} query 
     * @param {number} k 
     */
    async similaritySearch(query, k = 3) {
        const store = await this.getStore();
        const results = await store.similaritySearch(query, k);
        return results;
    }

    /**
     * 相似度搜索（带分数）
     * @param {string} query
     * @param {number} k
     */
    async similaritySearchWithScore(query, k = 3) {
        const store = await this.getStore();
        if (typeof store.similaritySearchWithScore === "function") {
            return await store.similaritySearchWithScore(query, k);
        }
        const docs = await store.similaritySearch(query, k);
        return docs.map((doc) => [doc, null]);
    }
}

module.exports = new VectorStoreService();
