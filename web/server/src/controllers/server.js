require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db'); // 引入新的 DB 模块

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const trainingRoutes = require('./routes/training');
const kgRoutes = require('./routes/kg');

const app = express();
const PORT = process.env.PORT || 3000;
const COMPAT_PORT = process.env.COMPAT_PORT ? Number(process.env.COMPAT_PORT) : 3000;
app.locals.unityLogs = [];

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use((req, res, next) => {
    const path = req.path || '';
    const ua = (req.headers['user-agent'] || '').toString();
    const isUnityUa = /unity/i.test(ua);
    const hasUnityHeader = Boolean(req.headers['x-unity-version'] || req.headers['x-unity-player'] || req.headers['x-unity']);

    const shouldLog =
        isUnityUa ||
        hasUnityHeader ||
        path === '/api/auth/verify' ||
        path.startsWith('/api/training/') ||
        path.startsWith('/api/kg') ||
        path.startsWith('/api/llm');

    if (!shouldLog) return next();

    const startedAt = Date.now();
    res.on('finish', () => {
        const ms = Date.now() - startedAt;
        const bodyKeys = req.body && typeof req.body === 'object' ? Object.keys(req.body) : [];
        const entry = {
            at: new Date().toISOString(),
            method: req.method,
            path,
            status: res.statusCode,
            ms,
            ip: req.ip,
            contentType: req.headers['content-type'] || '',
            origin: req.headers['origin'] || '',
            userAgent: req.headers['user-agent'] || '',
            bodyKeys
        };
        const logs = req.app?.locals?.unityLogs;
        if (Array.isArray(logs)) {
            logs.push(entry);
            if (logs.length > 200) logs.splice(0, logs.length - 200);
        }
        console.log(`[${entry.method}] ${entry.path} -> ${entry.status} (${entry.ms}ms) bodyKeys=${entry.bodyKeys.join(',')}`);
    });
    next();
});

// 数据库连接
connectDB();

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/kg', kgRoutes);

const primaryServer = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Temp Token Dir: ${process.env.TEMP_TOKEN_DIR || 'default'}`);
});

primaryServer.on('error', (err) => {
    console.error(`Primary server listen failed on ${PORT}: ${err.code || err.message}`);
});

if (Number(PORT) !== Number(COMPAT_PORT)) {
    const compatServer = app.listen(COMPAT_PORT, () => {
        console.log(`Compat server running on http://localhost:${COMPAT_PORT}`);
    });

    compatServer.on('error', (err) => {
        console.warn(`Compat server listen failed on ${COMPAT_PORT}: ${err.code || err.message}`);
    });
}
