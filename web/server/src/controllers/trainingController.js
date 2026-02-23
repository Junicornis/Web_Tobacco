const TrainingRecord = require('../models/TrainingRecord');
const tokenHelper = require('../utils/tokenHelper');
const { v4: uuidv4 } = require('uuid');

const trainingSessions = new Map();

const getBearerToken = (req) => {
    const authHeader = req.headers['authorization'];
    return authHeader && authHeader.split(' ')[1];
};

const verifyUserFromReq = async (req, res) => {
    const token = getBearerToken(req);
    const userData = await tokenHelper.verifyToken(token);
    if (!userData) {
        res.status(401).json({ success: false, message: 'Invalid Token' });
        return null;
    }
    return userData;
};

// 提交培训结果
exports.submitAnswer = async (req, res) => {
    try {
        const userData = await verifyUserFromReq(req, res);
        if (!userData) return;

        const { trainingId, questionId, answer, isCorrect, timestamp, taskId, taskName, score, duration } = req.body || {};

        if (trainingId && trainingSessions.has(trainingId)) {
            const session = trainingSessions.get(trainingId);
            if (session.userId === userData.userId) {
                session.answers.push({
                    questionId: typeof questionId === 'string' ? questionId : undefined,
                    answer,
                    isCorrect: Boolean(isCorrect),
                    timestamp: typeof timestamp === 'number' ? timestamp : Date.now()
                });
                session.lastAt = Date.now();
            }
            res.json({ success: true });
            return;
        }

        const record = new TrainingRecord({
            userId: userData.userId,
            taskId,
            taskName: taskName || '未命名任务',
            score: typeof score === 'number' ? score : (score ? Number(score) : 0),
            duration: typeof duration === 'number' ? duration : (duration ? Number(duration) : 0)
        });
        await record.save();

        console.log(`Received training record from ${userData.username}: Score ${record.score}`);
        res.json({ success: true, recordId: record._id.toString() });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.startTraining = async (req, res) => {
    try {
        const userData = await verifyUserFromReq(req, res);
        if (!userData) return;

        const { taskId, taskName } = req.body || {};
        const trainingId = uuidv4();
        trainingSessions.set(trainingId, {
            trainingId,
            userId: userData.userId,
            username: userData.username,
            taskId,
            taskName: taskName || '未命名任务',
            startedAt: Date.now(),
            lastAt: Date.now(),
            progress: null,
            answers: []
        });
        res.json({ success: true, trainingId });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.updateProgress = async (req, res) => {
    try {
        const userData = await verifyUserFromReq(req, res);
        if (!userData) return;

        const { trainingId, progress } = req.body || {};
        if (!trainingId || !trainingSessions.has(trainingId)) {
            res.json({ success: true });
            return;
        }

        const session = trainingSessions.get(trainingId);
        if (session.userId !== userData.userId) {
            res.status(403).json({ success: false, message: 'Forbidden' });
            return;
        }

        session.progress = progress;
        session.lastAt = Date.now();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.endTraining = async (req, res) => {
    try {
        const userData = await verifyUserFromReq(req, res);
        if (!userData) return;

        const { trainingId, duration, score, status, taskId, taskName } = req.body || {};
        const session = trainingId && trainingSessions.has(trainingId) ? trainingSessions.get(trainingId) : null;

        const derivedDuration = typeof duration === 'number'
            ? duration
            : (duration ? Number(duration) : (session ? Math.max(0, Math.round((Date.now() - session.startedAt) / 1000)) : 0));

        const derivedScore = typeof score === 'number'
            ? score
            : (score ? Number(score) : (session ? session.answers.reduce((acc, a) => acc + (a.isCorrect ? 1 : 0), 0) : 0));

        const record = new TrainingRecord({
            userId: userData.userId,
            taskId: taskId || (session ? session.taskId : undefined),
            taskName: taskName || (session ? session.taskName : '未命名任务'),
            score: derivedScore,
            duration: derivedDuration,
            status: status === 'failed' ? 'failed' : 'completed'
        });
        await record.save();

        if (session) trainingSessions.delete(trainingId);

        console.log(`Training ended for ${userData.username}: Score ${record.score}, Duration ${record.duration}s`);
        res.json({
            success: true,
            recordId: record._id.toString(),
            score: record.score,
            duration: record.duration,
            taskName: record.taskName
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.getHistory = async (req, res) => {
    const token = getBearerToken(req);
    const userData = token ? await tokenHelper.verifyToken(token) : null;
    const userId = req.query?.userId || userData?.userId;
    const taskId = req.query?.taskId;
    if (!userId) {
        res.status(400).json({ success: false, message: 'userId required' });
        return;
    }
    try {
        const filter = { userId };
        if (taskId) filter.taskId = taskId;
        const records = await TrainingRecord.find(filter).sort({ completedAt: -1 });
        res.json({ success: true, records });
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
