const TrainingRecord = require('../models/TrainingRecord');
const MistakeRecord = require('../models/MistakeRecord');
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

// 上报错题
exports.submitMistake = async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const userData = await tokenHelper.verifyToken(token);
    if (!userData) return res.status(401).json({ success: false });

    try {
        const { questionContent, userAnswer, correctAnswer } = req.body;
        const mistake = new MistakeRecord({
            userId: userData.userId,
            questionContent,
            userAnswer,
            correctAnswer
        });
        await mistake.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};

// 获取我的错题
exports.getMyMistakes = async (req, res) => {
    const { userId } = req.query;
    try {
        const mistakes = await MistakeRecord.find({ userId }).sort({ createdAt: -1 });
        res.json({ success: true, mistakes });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 获取我的历史成绩
exports.getMyHistory = async (req, res) => {
    const { userId } = req.query;
    try {
        const records = await TrainingRecord.find({ userId }).sort({ completedAt: -1 });
        res.json({ success: true, records });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
