const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// 任务管理
router.post('/create', adminController.createTask);
router.get('/tasks', adminController.getAllTasks);
router.put('/tasks/:id/revoke', adminController.revokeTask);
router.post('/tasks/:id/remind', adminController.remindTask);

// 用户端功能
router.get('/my-tasks', adminController.getMyTasks);
router.get('/my-notifications', adminController.getMyNotifications);
router.put('/notifications/:id/read', adminController.readNotification);
router.put('/notifications/read-all', adminController.readAllNotifications);

// 题库管理
router.get('/questions', adminController.getQuestions);
router.post('/questions', adminController.addQuestion);
router.delete('/questions/:id', adminController.deleteQuestion);

// 统计与记录
router.get('/statistics', adminController.getStatistics);
router.get('/users', adminController.getUsers);
router.get('/training-records', adminController.getAllTrainingRecords);

module.exports = router;
