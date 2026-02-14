const TrainingTask = require('../models/TrainingTask');
const User = require('../models/User');
const TrainingRecord = require('../models/TrainingRecord');
const Question = require('../models/Question');
const Scene = require('../models/Scene');
const fs = require('fs');
const path = require('path');
const unzipper = require('unzipper');

// 创建新任务
exports.createTask = async (req, res) => {
    try {
        const { title, description, assignedUserIds, deadline, unityPath } = req.body;
        const newTask = new TrainingTask({
            title,
            description,
            assignedTo: assignedUserIds,
            deadline,
            unityPath
        });

        await newTask.save();

        res.json({ success: true, task: newTask });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 获取所有任务 (含完成情况统计)
exports.getAllTasks = async (req, res) => {
    try {
        const tasks = await TrainingTask.find()
            .sort({ createdAt: -1 })
            .populate('assignedTo', 'username department');

        const tasksWithStats = await Promise.all(tasks.map(async (task) => {
            const records = await TrainingRecord.find({ taskId: task._id });
            const completedUserIds = records.map(r => r.userId.toString());
            const assignedUsers = task.assignedTo || [];

            const userDetails = assignedUsers.map(user => {
                if (!user || !user._id) return null;
                const isCompleted = completedUserIds.includes(user._id.toString());
                const record = records.find(r => r.userId.toString() === user._id.toString());
                return {
                    _id: user._id,
                    username: user.username,
                    department: user.department,
                    isCompleted,
                    score: record ? record.score : null,
                    completedAt: record ? record.completedAt : null
                };
            }).filter(u => u !== null);

            return {
                ...task.toObject(),
                stats: {
                    total: assignedUsers.length,
                    completed: completedUserIds.length,
                    userDetails
                }
            };
        }));

        res.json({ success: true, tasks: tasksWithStats });
    } catch (err) {
        console.error('Error fetching tasks:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// 撤销任务
exports.revokeTask = async (req, res) => {
    try {
        const { reason } = req.body;
        const task = await TrainingTask.findByIdAndUpdate(
            req.params.id,
            {
                status: 'revoked',
                revokedAt: new Date(),
                revokedReason: reason
            },
            { new: true }
        );

        res.json({ success: true, task });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 获取我的任务
exports.getMyTasks = async (req, res) => {
    const { userId } = req.query;
    try {
        const tasks = await TrainingTask.find({ assignedTo: userId });
        res.json({ success: true, tasks });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 场景列表
exports.getScenes = async (req, res) => {
    try {
        const scenes = await Scene.find().sort({ createdAt: -1 });
        res.json({ success: true, scenes });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 导入场景
exports.addScene = async (req, res) => {
    try {
        const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
        const exePathRaw = typeof req.body?.exePath === 'string' ? req.body.exePath.trim() : '';
        if (!name) return res.status(400).json({ success: false, message: '场景名称不能为空' });
        if (!exePathRaw) return res.status(400).json({ success: false, message: 'exePath 不能为空' });

        const normalized = exePathRaw.replace(/^"(.*)"$/, '$1');
        const resolvedPath = path.resolve(normalized);

        if (path.extname(resolvedPath).toLowerCase() !== '.exe') {
            return res.status(400).json({ success: false, message: `路径必须是 .exe：${resolvedPath}` });
        }

        if (!fs.existsSync(resolvedPath)) {
            return res.status(400).json({ success: false, message: `文件不存在：${resolvedPath}` });
        }

        const scene = new Scene({ name, exePath: resolvedPath });
        await scene.save();
        res.json({ success: true, scene });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 通过上传导入场景
exports.addSceneUpload = async (req, res) => {
    try {
        const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
        if (!name) return res.status(400).json({ success: false, message: '场景名称不能为空' });
        const uploadedFile = req.file || req.files?.file?.[0] || req.files?.exe?.[0];
        if (!uploadedFile?.path) return res.status(400).json({ success: false, message: '未收到文件' });

        const ext = path.extname(uploadedFile.originalname || uploadedFile.path).toLowerCase();

        if (ext === '.exe') {
            const resolvedPath = path.resolve(uploadedFile.path);
            const scene = new Scene({ name, exePath: resolvedPath });
            await scene.save();
            res.json({ success: true, scene });
            return;
        }

        if (ext !== '.zip') {
            res.status(400).json({ success: false, message: '仅支持 .zip 或 .exe' });
            return;
        }

        const zipPath = path.resolve(uploadedFile.path);
        const extractDir = path.resolve(path.join(path.dirname(zipPath), `${path.parse(zipPath).name}_extracted`));
        fs.mkdirSync(extractDir, { recursive: true });

        const directory = await unzipper.Open.file(zipPath);

        for (const entry of directory.files) {
            if (entry.type !== 'File') continue;
            const normalized = path.normalize(entry.path).replace(/^([/\\])+/, '');
            if (!normalized || normalized.includes('..') || normalized.includes(':')) {
                continue;
            }
            const outPath = path.resolve(path.join(extractDir, normalized));
            if (!outPath.startsWith(extractDir + path.sep) && outPath !== extractDir) {
                continue;
            }
            fs.mkdirSync(path.dirname(outPath), { recursive: true });
            await new Promise((resolve, reject) => {
                entry.stream()
                    .pipe(fs.createWriteStream(outPath))
                    .on('finish', resolve)
                    .on('error', reject);
            });
        }

        try {
            fs.unlinkSync(zipPath);
        } catch (_) { }

        const exeCandidates = [];
        const walk = (dir) => {
            const items = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
                const full = path.join(dir, item.name);
                if (item.isDirectory()) walk(full);
                else if (item.isFile() && path.extname(item.name).toLowerCase() === '.exe') exeCandidates.push(full);
            }
        };
        walk(extractDir);

        if (exeCandidates.length === 0) {
            res.status(400).json({ success: false, message: '压缩包中未找到 .exe' });
            return;
        }

        const excludedExeNames = new Set([
            'unitycrashhandler.exe',
            'unitycrashhandler32.exe',
            'unitycrashhandler64.exe',
            'uninstall.exe'
        ]);

        const filteredCandidates = exeCandidates.filter((p) => {
            const base = path.basename(p).toLowerCase();
            if (excludedExeNames.has(base)) return false;
            if (base.includes('crashhandler')) return false;
            return true;
        });

        const candidates = filteredCandidates.length > 0 ? filteredCandidates : exeCandidates;

        const withDataFolder = candidates.filter((p) => {
            const dir = path.dirname(p);
            const baseName = path.parse(p).name;
            const dataDir = path.join(dir, `${baseName}_Data`);
            return fs.existsSync(dataDir) && fs.statSync(dataDir).isDirectory();
        });

        if (withDataFolder.length > 1) {
            res.status(400).json({
                success: false,
                message: '压缩包中存在多个可启动的 Unity 主程序（均包含 *_Data），请只保留一个主程序',
            });
            return;
        }

        if (withDataFolder.length === 0 && candidates.length > 1) {
            res.status(400).json({
                success: false,
                message: '压缩包中存在多个 .exe，无法自动判断主程序，请只保留一个主程序或确保主程序旁有 *_Data 文件夹',
            });
            return;
        }

        const chosen = (withDataFolder[0] || candidates[0]);
        const resolvedExePath = path.resolve(chosen);
        const scene = new Scene({ name, exePath: resolvedExePath });
        await scene.save();
        res.json({ success: true, scene });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 删除场景
exports.deleteScene = async (req, res) => {
    try {
        await Scene.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 获取题目
exports.getQuestions = async (req, res) => {
    try {
        const questions = await Question.find().sort({ createdAt: -1 });
        res.json({ success: true, questions });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 添加题目
exports.addQuestion = async (req, res) => {
    try {
        const question = new Question(req.body);
        await question.save();
        res.json({ success: true, question });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 删除题目
exports.deleteQuestion = async (req, res) => {
    try {
        await Question.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 获取用户列表
exports.getUsers = async (req, res) => {
    try {
        const users = await User.find({}, 'username department role createdAt').sort({ createdAt: -1 });
        res.json({ success: true, users });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 创建用户
exports.createUser = async (req, res) => {
    try {
        const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
        const department = typeof req.body?.department === 'string' ? req.body.department.trim() : '';
        const role = typeof req.body?.role === 'string' ? req.body.role.trim() : 'user';
        const passwordRaw = typeof req.body?.password === 'string' ? req.body.password : '';
        const password = (passwordRaw || '123456').trim();

        if (!username) return res.status(400).json({ success: false, message: '用户名不能为空' });
        if (!password) return res.status(400).json({ success: false, message: '密码不能为空' });
        if (!['admin', 'user'].includes(role)) return res.status(400).json({ success: false, message: '角色不合法' });

        const user = new User({ username, password, role, department });
        await user.save();
        res.json({
            success: true,
            user: { _id: user._id, username: user.username, department: user.department, role: user.role, createdAt: user.createdAt }
        });
    } catch (err) {
        if (err?.code === 11000) {
            return res.status(400).json({ success: false, message: '用户名已存在' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
};

// 更新用户
exports.updateUser = async (req, res) => {
    try {
        const updates = {};
        if (typeof req.body?.username === 'string') updates.username = req.body.username.trim();
        if (typeof req.body?.department === 'string') updates.department = req.body.department.trim();
        if (typeof req.body?.role === 'string') updates.role = req.body.role.trim();
        if (typeof req.body?.password === 'string' && req.body.password.trim()) updates.password = req.body.password.trim();

        if (updates.role && !['admin', 'user'].includes(updates.role)) {
            return res.status(400).json({ success: false, message: '角色不合法' });
        }
        if (updates.username !== undefined && !updates.username) {
            return res.status(400).json({ success: false, message: '用户名不能为空' });
        }

        const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
        if (!user) return res.status(404).json({ success: false, message: '用户不存在' });

        res.json({
            success: true,
            user: { _id: user._id, username: user.username, department: user.department, role: user.role, createdAt: user.createdAt }
        });
    } catch (err) {
        if (err?.code === 11000) {
            return res.status(400).json({ success: false, message: '用户名已存在' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
};

// 删除用户
exports.deleteUser = async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: '用户不存在' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
