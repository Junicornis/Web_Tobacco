const TrainingRecord = require('../models/TrainingRecord');
const tokenHelper = require('../utils/tokenHelper');

// 提交培训结果
exports.submitAnswer = async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    const userData = await tokenHelper.verifyToken(token);
    if (!userData) {
        return res.status(401).json({ success: false, message: 'Invalid Token' });
    }

    const { taskId, taskName, score, duration } = req.body;

    try {
        const record = new TrainingRecord({
            userId: userData.userId,
            taskId,
            taskName: taskName || '未命名任务',
            score: score || 0,
            duration: duration || 0
        });
        await record.save();

        console.log(`Received training record from ${userData.username}: Score ${score}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 获取我的历史成绩
exports.getMyHistory = async (req, res) => {
    const { userId, taskId } = req.query;
    try {
        const filter = { userId };
        if (taskId) filter.taskId = taskId;
        const records = await TrainingRecord.find(filter).sort({ completedAt: -1 });
        res.json({ success: true, records });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
