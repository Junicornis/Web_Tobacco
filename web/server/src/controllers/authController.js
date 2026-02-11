const User = require('../models/User');
const tokenHelper = require('../utils/tokenHelper');
const { exec } = require('child_process');

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
        res.json({ success: true, user: { id: user._id, username: user.username, role: user.role } });
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

// 修改个人资料
exports.updateProfile = async (req, res) => {
    const { userId, password, department } = req.body;
    try {
        const updateData = {};
        if (password) updateData.password = password;
        if (department) updateData.department = department;
        
        await User.findByIdAndUpdate(userId, updateData);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 启动 Unity
exports.launchUnity = (req, res) => {
    const unityPath = req.body.unityPath || process.env.UNITY_EXE_PATH;
    if (!unityPath) {
        return res.status(500).json({ success: false, message: 'Unity path not configured' });
    }
    
    console.log(`Launching Unity from: ${unityPath}`);
    const child = exec(`"${unityPath}"`, { detached: true, stdio: 'ignore' });
    child.unref();

    res.json({ success: true, message: 'Unity launch command executed' });
};
