const mongoose = require('mongoose');
require('dotenv').config();

// 引入所有模型
const User = require('./models/User');
const TrainingTask = require('./models/TrainingTask');
const Notification = require('./models/Notification');
const TrainingRecord = require('./models/TrainingRecord');
const Question = require('./models/Question');
const MistakeRecord = require('./models/MistakeRecord');
const TempToken = require('./models/TempToken');

const MONGODB_URI = process.env.MONGODB_URI;

// 模拟数据源
const usersData = [
    { username: 'admin', password: 'password', role: 'admin', department: '管理部' },
    { username: 'zhangsan', password: 'password', role: 'user', department: '生产部' },
    { username: 'lisi', password: 'password', role: 'user', department: '质检部' },
    { username: 'wangwu', password: 'password', role: 'user', department: '物流部' },
    { username: 'zhaoliu', password: 'password', role: 'user', department: '安保部' },
];

const questionsData = [
    { 
        title: '灭火器使用步骤中，第一步是什么？', 
        options: ['A. 拔掉保险销', 'B. 对准火源根部', 'C. 按压手柄', 'D. 检查压力表'], 
        correctAnswer: 'A', 
        category: '消防安全', 
        analysis: '使用灭火器口诀：一拔（保险销）、二握（喷管）、三压（手柄）、四喷（火源根部）。' 
    },
    { 
        title: '车间内发生电气火灾时，首先应该做什么？', 
        options: ['A. 用水灭火', 'B. 切断电源', 'C. 呼救', 'D. 逃跑'], 
        correctAnswer: 'B', 
        category: '用电安全', 
        analysis: '电气火灾必须先切断电源，防止触电和火势蔓延。严禁用水灭火。' 
    },
    { 
        title: '进入高噪音区域作业，必须佩戴什么？', 
        options: ['A. 安全帽', 'B. 护目镜', 'C. 耳塞或耳罩', 'D. 防尘口罩'], 
        correctAnswer: 'C', 
        category: '劳动防护', 
        analysis: '长期接触高噪音会导致听力损伤，必须佩戴护耳器。' 
    }
];

const tasksData = [
    {
        title: '2024第一季度全员消防演练',
        description: '请所有员工完成虚拟场景下的灭火器实操考核，要求满分通过。',
        deadline: new Date('2024-03-31'),
        unityPath: '', // 使用默认
        status: 'active'
    },
    {
        title: '新进员工车间安全规范培训',
        description: '熟悉车间行走路线、危险源标识及紧急疏散通道。',
        deadline: new Date('2024-04-15'),
        unityPath: 'D:/proj/Hu_tobacco/Tobacco_train2/unity/Build/WindowsRelease/Safety-Training.exe',
        status: 'active'
    }
];

const seedDB = async () => {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('🔗 MongoDB Connected');

        // 1. 清空旧数据 (慎用！仅用于开发环境)
        console.log('🧹 Clearing old data...');
        await User.deleteMany({});
        await TrainingTask.deleteMany({});
        await Notification.deleteMany({});
        await TrainingRecord.deleteMany({});
        await Question.deleteMany({});
        await MistakeRecord.deleteMany({});
        await TempToken.deleteMany({});

        // 2. 创建用户
        console.log('👥 Seeding Users...');
        const createdUsers = await User.insertMany(usersData);
        const userMap = {}; // username -> _id
        createdUsers.forEach(u => userMap[u.username] = u._id);

        // 3. 创建题库
        console.log('📚 Seeding Questions...');
        const createdQuestions = await Question.insertMany(questionsData);

        // 4. 创建任务 (分配给所有普通员工)
        console.log('📋 Seeding Tasks...');
        const staffIds = createdUsers.filter(u => u.role === 'user').map(u => u._id);
        const tasksWithAssignees = tasksData.map(t => ({
            ...t,
            assignedTo: staffIds,
            createdBy: userMap['admin']
        }));
        const createdTasks = await TrainingTask.insertMany(tasksWithAssignees);

        // 5. 创建通知 (给每个员工发通知)
        console.log('🔔 Seeding Notifications...');
        const notifications = [];
        createdTasks.forEach(task => {
            staffIds.forEach(uid => {
                notifications.push({
                    userId: uid,
                    title: `新任务: ${task.title}`,
                    content: `请于 ${task.deadline.toLocaleDateString()} 前完成。${task.description}`,
                    type: 'training_assigned',
                    relatedTaskId: task._id
                });
            });
        });
        // 再加几条已读/未读消息
        notifications.push({
            userId: userMap['zhangsan'],
            title: '系统维护通知',
            content: '系统将于本周六晚进行升级维护，请提前保存数据。',
            type: 'system',
            isRead: true
        });
        await Notification.insertMany(notifications);

        // 6. 创建培训记录 (模拟部分员工已完成)
        console.log('🏆 Seeding Training Records...');
        const records = [
            {
                userId: userMap['zhangsan'],
                taskId: createdTasks[0]._id,
                taskName: createdTasks[0].title,
                score: 100,
                duration: 120,
                completedAt: new Date(Date.now() - 86400000) // 昨天
            },
            {
                userId: userMap['lisi'],
                taskId: createdTasks[0]._id,
                taskName: createdTasks[0].title,
                score: 50, // 不及格
                duration: 90,
                completedAt: new Date(Date.now() - 43200000) // 今天
            },
            {
                userId: userMap['zhangsan'],
                taskId: createdTasks[1]._id,
                taskName: createdTasks[1].title,
                score: 95,
                duration: 300,
                completedAt: new Date()
            }
        ];
        await TrainingRecord.insertMany(records);

        // 7. 创建错题记录 (模拟 lisi 做错的题)
        console.log('❌ Seeding Mistake Records...');
        const mistakes = [
            {
                userId: userMap['lisi'],
                questionId: createdQuestions[1]._id,
                questionContent: createdQuestions[1].title,
                userAnswer: 'A. 用水灭火',
                correctAnswer: createdQuestions[1].correctAnswer
            }
        ];
        await MistakeRecord.insertMany(mistakes);

        console.log('✅ All data seeded successfully!');
        process.exit(0);

    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

seedDB();
