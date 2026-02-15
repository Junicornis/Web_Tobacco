const User = require('../models/User');
const tokenHelper = require('../utils/tokenHelper');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// 模拟登录
exports.login = async (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!username) return res.status(400).json({ success: false, message: '用户名不能为空' });
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
    const requestedPath = resolvedPath;
    let finalPath = resolvedPath;

    const findExeFallback = (missingExePath) => {
        const exeName = path.basename(missingExePath).toLowerCase();
        const uploadsScenesDir = path.resolve(__dirname, '..', 'uploads', 'scenes');
        if (!fs.existsSync(uploadsScenesDir)) return null;

        const candidates = [];
        const walk = (dir) => {
            let items;
            try {
                items = fs.readdirSync(dir, { withFileTypes: true });
            } catch (_) {
                return;
            }
            for (const item of items) {
                const full = path.join(dir, item.name);
                if (item.isDirectory()) walk(full);
                else if (item.isFile() && path.extname(item.name).toLowerCase() === '.exe' && item.name.toLowerCase() === exeName) {
                    candidates.push(full);
                }
            }
        };
        walk(uploadsScenesDir);
        if (candidates.length === 0) return null;

        const withDataFolder = candidates.filter((p) => {
            const dir = path.dirname(p);
            const baseName = path.parse(p).name;
            const dataDir = path.join(dir, `${baseName}_Data`);
            try {
                return fs.existsSync(dataDir) && fs.statSync(dataDir).isDirectory();
            } catch (_) {
                return false;
            }
        });
        const pickFrom = withDataFolder.length > 0 ? withDataFolder : candidates;

        pickFrom.sort((a, b) => {
            try {
                return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
            } catch (_) {
                return 0;
            }
        });

        return pickFrom[0];
    };

    if (!fs.existsSync(finalPath)) {
        const fallbackFromUploads = findExeFallback(finalPath);
        if (fallbackFromUploads) finalPath = fallbackFromUploads;
        else if (process.env.UNITY_EXE_PATH) {
            const envPath = path.resolve((process.env.UNITY_EXE_PATH || '').replace(/^"(.*)"$/, '$1'));
            if (fs.existsSync(envPath)) finalPath = envPath;
        }
    }

    if (!fs.existsSync(finalPath)) {
        return res.status(400).json({
            success: false,
            message: `Unity exe not found: ${requestedPath}`,
            hint: '该任务记录的 unityPath 指向的 .exe 已不存在。请到管理端「场景导入」重新导入，或重新下发任务选择正确场景。',
        });
    }

    if (path.extname(finalPath).toLowerCase() !== '.exe') {
        return res.status(400).json({ success: false, message: `Unity path must be an .exe: ${finalPath}` });
    }

    if (requestedPath !== finalPath) {
        console.log(`Unity exe fallback: requested=${requestedPath} -> using=${finalPath}`);
    }
    console.log(`Launching Unity from: ${finalPath}`);
    try {
        const tokenFilePath = typeof tokenHelper.getTokenFilePath === 'function' ? tokenHelper.getTokenFilePath() : '';
        if (tokenFilePath && fs.existsSync(tokenFilePath)) {
            const tokenContent = fs.readFileSync(tokenFilePath, 'utf8');
            const exeDir = path.dirname(finalPath);
            const candidates = [
                path.resolve(exeDir, '../../temp/auth_token.json'),
                path.resolve('C:\\SafetyTraining\\temp\\auth_token.json')
            ];

            for (const destPath of candidates) {
                if (path.resolve(destPath) === path.resolve(tokenFilePath)) continue;
                try {
                    fs.mkdirSync(path.dirname(destPath), { recursive: true });
                    fs.writeFileSync(destPath, tokenContent, { encoding: 'utf8', flag: 'w' });
                } catch (_) { }
            }
        }
    } catch (_) { }
    let child;
    try {
        child = spawn(finalPath, [], {
            detached: true,
            stdio: 'ignore',
            cwd: path.dirname(finalPath),
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
        } catch (_) { }
        if (statusCode >= 400) return res.status(statusCode).json(payload);
        return res.json(payload);
    };

    child.once('error', (err) => {
        done({ success: false, message: `Failed to launch Unity: ${err.message}`, unityPath: finalPath }, 500);
    });

    child.once('spawn', () => {
        done({ success: true, message: 'Unity launch command executed', unityPath: finalPath });
    });

    setTimeout(() => {
        done({ success: true, message: 'Unity launch command executed', unityPath: finalPath });
    }, 800);
};
