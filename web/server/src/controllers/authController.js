const User = require('../models/User');
const tokenHelper = require('../utils/tokenHelper');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// 模拟登录
exports.login = async (req, res) => {
    const { username, password } = req.body;
    try {
        let user = await User.findOne({ username });
        if (!user) {
            // 简单的逻辑：如果是 admin 开头的用户名，自动设为管理员
            const role = username.startsWith('admin') ? 'admin' : 'user';
            user = new User({ username, password, role, department: 'Default' });
            await user.save();
        }
        res.json({ success: true, user: { id: user._id, username: user.username, role: user.role, department: user.department } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 生成 Unity 临时 Token
exports.generateToken = async (req, res) => {
    const { userId, username } = req.body;
    try {
        const token = await tokenHelper.generateAndWriteToken({ id: userId, username });
        res.json({ success: true, token });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Unity 验证 Token
exports.verifyToken = async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

    const userData = await tokenHelper.verifyToken(token);
    if (!userData) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }

    res.json({ success: true, user: userData });
};

// 启动 Unity
exports.launchUnity = (req, res) => {
    const bodyUnityPath = typeof req.body?.unityPath === 'string' ? req.body.unityPath.trim() : '';
    const unityPath = (bodyUnityPath || process.env.UNITY_EXE_PATH || '').trim();
    if (!unityPath) return res.status(400).json({ success: false, message: 'Unity path not configured' });

    const normalizedPath = unityPath.replace(/^"(.*)"$/, '$1');
    const resolvedPath = path.resolve(normalizedPath);

    if (!fs.existsSync(resolvedPath)) {
        return res.status(400).json({ success: false, message: `Unity exe not found: ${resolvedPath}` });
    }

    if (path.extname(resolvedPath).toLowerCase() !== '.exe') {
        return res.status(400).json({ success: false, message: `Unity path must be an .exe: ${resolvedPath}` });
    }

    console.log(`Launching Unity from: ${resolvedPath}`);
    let child;
    try {
        child = spawn(resolvedPath, [], {
            detached: true,
            stdio: 'ignore',
            cwd: path.dirname(resolvedPath),
            windowsHide: false
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }

    let settled = false;
    const done = (payload, statusCode = 200) => {
        if (settled) return;
        settled = true;
        try {
            child.unref();
        } catch (_) {}
        if (statusCode >= 400) return res.status(statusCode).json(payload);
        return res.json(payload);
    };

    child.once('error', (err) => {
        done({ success: false, message: `Failed to launch Unity: ${err.message}`, unityPath: resolvedPath }, 500);
    });

    child.once('spawn', () => {
        done({ success: true, message: 'Unity launch command executed', unityPath: resolvedPath });
    });

    setTimeout(() => {
        done({ success: true, message: 'Unity launch command executed', unityPath: resolvedPath });
    }, 800);
};
