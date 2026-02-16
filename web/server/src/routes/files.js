const express = require('express');
const fs = require('fs');
const path = require('path');

const FileUpload = require('../models/FileUpload');

const router = express.Router();

router.get('/preview/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const file = await FileUpload.findById(fileId);
        if (!file) {
            return res.status(404).json({ success: false, message: '文件不存在' });
        }

        const absPath = path.resolve(file.filePath);
        if (!fs.existsSync(absPath)) {
            return res.status(404).json({ success: false, message: '文件已丢失' });
        }

        const downloadName = file.originalName || file.filename || 'file';
        const fallbackName = downloadName.replace(/[^\x20-\x7E]+/g, '_');
        const encodedName = encodeURIComponent(downloadName);

        res.setHeader('Content-Disposition', `inline; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`);
        res.setHeader('Cache-Control', 'private, max-age=0');
        res.type(downloadName);

        return res.sendFile(absPath);
    } catch (error) {
        console.error('文件预览失败:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
