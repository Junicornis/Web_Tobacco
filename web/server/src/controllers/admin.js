const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const scenesUploadDir = path.join(__dirname, '..', 'uploads', 'scenes');
fs.mkdirSync(scenesUploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, scenesUploadDir),
    filename: (req, file, cb) => {
        const parsed = path.parse(file.originalname);
        const safeBase = (parsed.name || 'scene').replace(/[^\w\-]+/g, '_');
        cb(null, `${Date.now()}_${safeBase}${parsed.ext}`);
    }
});

const uploadBundle = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.exe' && ext !== '.zip') {
            return cb(new Error('仅支持 .exe 或 .zip 文件'));
        }
        cb(null, true);
    },
    limits: {
        fileSize: 1024 * 1024 * 1024
    }
});

const uploadBundleFields = (req, res, next) => {
    uploadBundle.fields([{ name: 'exe', maxCount: 1 }, { name: 'file', maxCount: 1 }])(req, res, (err) => {
        if (err) return res.status(400).json({ success: false, message: err.message });
        next();
    });
};

// 任务管理
router.post('/create', adminController.createTask);
router.get('/tasks', adminController.getAllTasks);
router.put('/tasks/:id/revoke', adminController.revokeTask);

// 用户端功能
router.get('/my-tasks', adminController.getMyTasks);

router.get('/unity-logs', (req, res) => {
    const logs = req.app?.locals?.unityLogs;
    res.json({ success: true, logs: Array.isArray(logs) ? logs : [] });
});

router.delete('/unity-logs', (req, res) => {
    if (req.app?.locals) req.app.locals.unityLogs = [];
    res.json({ success: true });
});

// 场景导入
router.get('/scenes', adminController.getScenes);
router.post('/scenes', adminController.addScene);
router.post('/scenes/upload', uploadBundleFields, adminController.addSceneUpload);
router.delete('/scenes/:id', adminController.deleteScene);

// 题库管理
router.get('/questions', adminController.getQuestions);
router.post('/questions', adminController.addQuestion);
router.delete('/questions/:id', adminController.deleteQuestion);

router.get('/users', adminController.getUsers);
router.post('/users', adminController.createUser);
router.put('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);

module.exports = router;
