const KEY = 'kg_request_timeout_ms';
const DEFAULT_MS = 180000;
const MIN_MS = 10000;
const MAX_MS = 600000;

export function normalizeKgRequestTimeoutMs(value) {
    const num = typeof value === 'string' && value.trim() ? Number(value) : Number(value);
    if (!Number.isFinite(num)) return DEFAULT_MS;
    return Math.min(MAX_MS, Math.max(MIN_MS, Math.round(num)));
}

export function getKgRequestTimeoutMs() {
    try {
        const raw = localStorage.getItem(KEY);
        return normalizeKgRequestTimeoutMs(raw ?? DEFAULT_MS);
    } catch (e) {
        return DEFAULT_MS;
    }
}

export function setKgRequestTimeoutMs(value) {
    const ms = normalizeKgRequestTimeoutMs(value);
    try {
        localStorage.setItem(KEY, String(ms));
    } catch (e) {}
    return ms;
}

