const glmClient = require('./glmClient');

function normalizeBaseUrl(url) {
    if (!url) return '';
    return url.endsWith('/') ? url.slice(0, -1) : url;
}

async function fetchWithTimeout(url, options = {}, timeoutMs) {
    const ms = Number(timeoutMs);
    if (!Number.isFinite(ms) || ms <= 0) {
        return fetch(url, options);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function getEmbeddingWithOllama(text) {
    const baseUrl = normalizeBaseUrl(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434');
    const model = process.env.OLLAMA_EMBED_MODEL || 'bge-m3:latest';
    const timeoutMs = parseInt(process.env.OLLAMA_EMBED_TIMEOUT_MS || '20000', 10);

    const input = Array.isArray(text) ? text : [text];

    let response;
    try {
        response = await fetchWithTimeout(
            `${baseUrl}/api/embed`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    input
                })
            },
            timeoutMs
        );
    } catch (e) {
        if (e && e.name === 'AbortError') {
            throw new Error(`Ollama Embedding 超时（${timeoutMs}ms），请检查 Ollama 是否可用：${baseUrl}`);
        }
        throw e;
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Ollama Embedding 错误: ${errorData.error || errorData.message || response.statusText}`);
    }

    const data = await response.json();
    const embeddings = data?.embeddings;

    if (!Array.isArray(embeddings)) {
        throw new Error('Ollama Embedding 响应格式异常: 缺少 embeddings');
    }

    if (Array.isArray(text)) return embeddings;
    return embeddings[0];
}

async function getEmbedding(text) {
    const provider = (process.env.EMBEDDING_PROVIDER || 'ollama').toLowerCase();

    if (provider === 'ollama') {
        return getEmbeddingWithOllama(text);
    }

    return glmClient.getEmbedding(text);
}

module.exports = {
    getEmbedding
};
