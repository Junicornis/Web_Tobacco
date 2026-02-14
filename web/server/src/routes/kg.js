/**
 * 知识图谱路由
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const kgController = require('../controllers/kgController');

const router = express.Router();

// 文件上传配置
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../../uploads/temp'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
        files: 10
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.xlsx', '.xls', '.docx', '.doc', '.pdf', '.txt'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('不支持的文件格式'));
        }
    }
});

// 确保临时目录存在
const fs = require('fs');
const tempDir = path.join(__dirname, '../../uploads/temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

// ==================== 文件上传与构建任务 ====================

// 上传文件并启动抽取
router.post(
    '/upload-and-extract',
    (req, res, next) => {
        upload.array('files', 10)(req, res, (error) => {
            if (!error) return next();
            const statusCode = error instanceof multer.MulterError ? 400 : 400;
            res.status(statusCode).json({ success: false, message: error.message });
        });
    },
    kgController.uploadAndExtract
);

// 获取抽取结果
router.get('/extract-result/:taskId', kgController.getExtractResult);

// 用户确认并构建图谱
router.post('/confirm-and-build/:taskId', kgController.confirmAndBuild);

// 获取任务列表
router.get('/tasks', kgController.getTasks);

// 删除任务
router.delete('/tasks/:taskId', kgController.deleteTask);

// ==================== 本体管理 ====================

// 获取本体列表
router.get('/ontology', kgController.getOntologies);

// 获取本体详情
router.get('/ontology/:id', kgController.getOntologyById);

// 创建本体
router.post('/ontology', kgController.createOntology);

// 更新本体
router.put('/ontology/:id', kgController.updateOntology);

// 删除本体
router.delete('/ontology/:id', kgController.deleteOntology);

// ==================== 图谱查询 ====================

// 查询图谱
router.get('/graph', kgController.queryGraph);

// 搜索实体
router.get('/search', kgController.searchEntities);

// 获取实体关系网络
router.get('/network/:entityId', kgController.getEntityNetwork);

// 获取图谱统计
router.get('/stats', kgController.getGraphStats);

module.exports = router;
