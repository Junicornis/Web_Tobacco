const { ChatOpenAI, OpenAIEmbeddings } = require("@langchain/openai");
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const embeddingProvider = require("./embeddingProvider");

// GLM-4 配置
const GLM_API_KEY = process.env.GLM_API_KEY;
const GLM_BASE_URL = "https://open.bigmodel.cn/api/paas/v4/";

if (!GLM_API_KEY) {
    console.warn("警告: GLM_API_KEY 未设置，LangChain 功能将不可用");
}

// 初始化 ChatModel (用于对话生成)
const chatModel = new ChatOpenAI({
    modelName: "glm-4.7",
    apiKey: GLM_API_KEY, // 显式传递 API Key
    configuration: {
        baseURL: GLM_BASE_URL,
    },
    temperature: 0.1, // 降低随机性，提高准确性
});

// 初始化 Embeddings (用于向量化)
class ProviderEmbeddings {
    async embedDocuments(texts) {
        const input = Array.isArray(texts) ? texts : [texts];
        const vectors = await embeddingProvider.getEmbedding(input);
        return vectors;
    }

    async embedQuery(text) {
        const vector = await embeddingProvider.getEmbedding(text);
        return vector;
    }
}

const embeddings =
    (process.env.EMBEDDING_PROVIDER || "ollama").toLowerCase() === "ollama"
        ? new ProviderEmbeddings()
        : new OpenAIEmbeddings({
              modelName: "embedding-3",
              apiKey: GLM_API_KEY,
              configuration: {
                  baseURL: GLM_BASE_URL,
              },
          });

module.exports = {
    chatModel,
    embeddings
};
