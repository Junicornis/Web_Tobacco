const mongoose = require('mongoose');

const fileUploadSchema = new mongoose.Schema({
    filename: {
        type: String,
        required: true
    },
    originalName: {
        type: String,
        required: true
    },
    fileType: {
        type: String,
        enum: ['excel', 'word', 'pdf', 'txt'],
        required: true
    },
    fileSize: {
        type: Number,
        required: true
    },
    filePath: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed', 'deprecated'],
        default: 'pending'
    },
    extractedText: {
        type: String,
        default: ''
    },
    extractedData: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    sheetCount: {
        type: Number,
        default: 0
    },
    pageCount: {
        type: Number,
        default: 0
    },
    uploadTime: {
        type: Date,
        default: Date.now
    },
    processedTime: {
        type: Date,
        default: null
    },
    errorMessage: {
        type: String,
        default: null
    },
    createdBy: {
        type: String,
        required: true
    },
    replacedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FileUpload',
        default: null
    }
}, {
    timestamps: true
});

// 索引
fileUploadSchema.index({ createdBy: 1, status: 1 });
fileUploadSchema.index({ uploadTime: -1 });

module.exports = mongoose.model('FileUpload', fileUploadSchema);
