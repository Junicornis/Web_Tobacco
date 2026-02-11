const TrainingTask = require('../models/TrainingTask');
const Notification = require('../models/Notification');
const User = require('../models/User');
const TrainingRecord = require('../models/TrainingRecord');
const Question = require('../models/Question');

// 创建新任务
exports.createTask = async (req, res) => {
  try {
    const { title, description, assignedUserIds, deadline, notifyUsers, unityPath } = req.body;
    const newTask = new TrainingTask({
      title,
      description,
      assignedTo: assignedUserIds,
      deadline,
      unityPath
    });
    
    await newTask.save();

    if (notifyUsers && assignedUserIds && assignedUserIds.length > 0) {
      const notifications = assignedUserIds.map(userId => ({
        userId,
        title: `新培训任务: ${title}`,
        content: `您有新的培训任务。简介: ${description}。截止时间: ${deadline}`,
        type: 'training_assigned',
        relatedTaskId: newTask._id
      }));
      await Notification.insertMany(notifications);
    }

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
        
        if (task && task.assignedTo.length > 0) {
            const notifications = task.assignedTo.map(userId => ({
                userId,
                title: `任务撤销通知: ${task.title}`,
                content: `该任务已被管理员撤销。原因: ${reason}`,
                type: 'system',
                relatedTaskId: task._id
            }));
            await Notification.insertMany(notifications);
        }

        res.json({ success: true, task });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 发送提醒
exports.remindTask = async (req, res) => {
    try {
        const { message: msgContent, userIds } = req.body;
        const task = await TrainingTask.findById(req.params.id);
        
        if (!task) return res.status(404).json({ message: 'Task not found' });

        const targetUsers = userIds && userIds.length > 0 ? userIds : task.assignedTo;
        
        const notifications = targetUsers.map(userId => ({
            userId,
            title: `任务提醒: ${task.title}`,
            content: msgContent || `请尽快完成培训任务。截止时间: ${new Date(task.deadline).toLocaleDateString()}`,
            type: 'system',
            relatedTaskId: task._id
        }));
        
        await Notification.insertMany(notifications);
        res.json({ success: true });
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

// 获取我的通知
exports.getMyNotifications = async (req, res) => {
    const { userId } = req.query;
    try {
        const notifications = await Notification.find({ userId }).sort({ createdAt: -1 });
        const unreadCount = await Notification.countDocuments({ userId, isRead: false });
        res.json({ success: true, notifications, unreadCount });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 标记单条已读
exports.readNotification = async (req, res) => {
    try {
        await Notification.findByIdAndUpdate(req.params.id, { isRead: true });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 一键已读
exports.readAllNotifications = async (req, res) => {
    const { userId } = req.body;
    try {
        await Notification.updateMany({ userId, isRead: false }, { isRead: true });
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

// 获取统计数据
exports.getStatistics = async (req, res) => {
    try {
        const totalTrainings = await TrainingRecord.countDocuments();
        const avgScoreResult = await TrainingRecord.aggregate([
            { $group: { _id: null, avg: { $avg: '$score' } } }
        ]);
        const avgScore = avgScoreResult.length > 0 ? Math.round(avgScoreResult[0].avg) : 0;
        const passCount = await TrainingRecord.countDocuments({ score: { $gte: 60 } });
        const passRate = totalTrainings > 0 ? Math.round((passCount / totalTrainings) * 100) : 0;

        const departmentStats = await TrainingRecord.aggregate([
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'userInfo'
                }
            },
            { $unwind: '$userInfo' },
            {
                $group: {
                    _id: '$userInfo.department',
                    count: { $sum: 1 },
                    avgScore: { $avg: '$score' }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]);

        res.json({ 
            success: true, 
            stats: { totalTrainings, avgScore, passRate, departmentStats } 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 获取用户列表
exports.getUsers = async (req, res) => {
    try {
        const users = await User.find({ role: 'user' }, 'username department role');
        res.json({ success: true, users });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 获取所有培训记录
exports.getAllTrainingRecords = async (req, res) => {
    try {
        const records = await TrainingRecord.find()
            .populate('userId', 'username department')
            .sort({ completedAt: -1 });
        res.json({ success: true, records });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
