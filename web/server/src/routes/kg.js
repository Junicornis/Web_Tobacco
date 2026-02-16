/**
 * 知识图谱路由
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const kgController = require('../controllers/kgController');

const router = express.Router();

function normalizeUploadedFilename(input) {
    const name = String(input || '').trim();
    if (!name) return 'file';

    const hasCjk = /[\u4e00-\u9fff]/.test(name);
    const hasLatin1 = /[\u00C0-\u00FF]/.test(name);

    let normalized = name;
    if (!hasCjk && hasLatin1) {
        const decoded = Buffer.from(name, 'latin1').toString('utf8');
        if (/[\u4e00-\u9fff]/.test(decoded) && !decoded.includes('\uFFFD')) {
            normalized = decoded;
        }
    }

    normalized = normalized
        .replace(/[\u0000-\u001F\u007F]/g, '_')
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, ' ')
        .trim();

    return normalized || 'file';
}

// 文件上传配置
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../../uploads/temp'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + normalizeUploadedFilename(file.originalname));
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
        const ext = path.extname(normalizeUploadedFilename(file.originalname)).toLowerCase();
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

// 上传文件并解析（不启动抽取）
router.post(
    '/upload-and-parse',
    (req, res, next) => {
        upload.array('files', 10)(req, res, (error) => {
            if (!error) return next();
            const statusCode = error instanceof multer.MulterError ? 400 : 400;
            res.status(statusCode).json({ success: false, message: error.message });
        });
    },
    kgController.uploadAndParse
);

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

// 开始构建（从Mongo取原文，触发抽取与对齐）
router.post('/tasks/:taskId/start-build', kgController.startBuild);

// 获取抽取结果
router.get('/extract-result/:taskId', kgController.getExtractResult);

// 获取文件内容
router.get('/file/:fileId/content', kgController.getFileContent);

// 获取任务原文链接
router.get('/task/:taskId/original', kgController.getTaskOriginalUrl);

// 获取图谱/文件原文内容 (Markdown)
router.get('/:kgId/original', kgController.getKgOriginalContent);

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

// 智能问答
router.post('/chat', kgController.chat);

module.exports = router;
