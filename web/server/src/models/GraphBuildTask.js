const mongoose = require('mongoose');

const entityTypeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, default: '' },
    properties: [{
        name: { type: String, required: true },
        type: { type: String, enum: ['string', 'number', 'date', 'enum', 'boolean'], default: 'string' },
        required: { type: Boolean, default: false }
    }]
}, { _id: false });

const relationTypeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    sourceType: { type: String, required: true },
    targetType: { type: String, required: true },
    description: { type: String, default: '' }
}, { _id: false });

const alignmentSuggestionSchema = new mongoose.Schema({
    type: { type: String, enum: ['new', 'merge', 'candidate'], required: true },
    targetEntity: {
        id: String,
        name: String,
        similarity: Number
    },
    candidates: [{
        id: String,
        name: String,
        similarity: Number
    }]
}, { _id: false });

const draftEntitySchema = new mongoose.Schema({
    id: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, required: true },
    properties: { type: mongoose.Schema.Types.Mixed, default: {} },
    sourceFile: { type: mongoose.Schema.Types.ObjectId, ref: 'FileUpload' },
    sourceContext: { type: String, default: '' },
    confidence: { type: Number, default: 0 },
    alignmentSuggestion: alignmentSuggestionSchema
}, { _id: false });

const draftRelationSchema = new mongoose.Schema({
    id: { type: String, required: true },
    source: { type: String, required: true },
    target: { type: String, required: true },
    relationType: { type: String, required: true },
    properties: { type: mongoose.Schema.Types.Mixed, default: {} },
    confidence: { type: Number, default: 0 },
    sourceContext: { type: String, default: '' }
}, { _id: false });

const graphBuildTaskSchema = new mongoose.Schema({
    taskType: {
        type: String,
        enum: ['auto_extract', 'user_confirmed'],
        default: 'auto_extract'
    },
    status: {
        type: String,
        enum: ['pending', 'parsing', 'extracting', 'aligning', 'confirming', 'building', 'completed', 'failed'],
        default: 'pending'
    },
    progress: {
        type: Number,
        default: 0
    },
    stageMessage: {
        type: String,
        default: '等待处理'
    },
    files: [{
        fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'FileUpload' },
        filename: String
    }],
    ontologyMode: {
        type: String,
        enum: ['auto', 'existing'],
        default: 'auto'
    },
    ontologyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'OntologyLibrary',
        default: null
    },
    draftOntology: {
        entityTypes: [entityTypeSchema],
        relationTypes: [relationTypeSchema]
    },
    draftEntities: [draftEntitySchema],
    draftRelations: [draftRelationSchema],
    userModifications: {
        addedEntities: [draftEntitySchema],
        deletedEntityIds: [String],
        modifiedEntities: [{
            entityId: String,
            oldValue: mongoose.Schema.Types.Mixed,
            newValue: mongoose.Schema.Types.Mixed
        }],
        addedRelations: [draftRelationSchema],
        deletedRelationIds: [String],
        modifiedRelations: [{
            relationId: String,
            oldValue: mongoose.Schema.Types.Mixed,
            newValue: mongoose.Schema.Types.Mixed
        }]
    },
    buildStats: {
        entityCount: { type: Number, default: 0 },
        relationCount: { type: Number, default: 0 },
        mergedCount: { type: Number, default: 0 }
    },
    extractionDebug: {
        parseError: { type: String, default: null },
        rawPreview: { type: String, default: null },
        rawLength: { type: Number, default: null },
        chunkIndex: { type: Number, default: null },
        chunkCount: { type: Number, default: null }
    },
    extractionMeta: {
        model: { type: String, default: null },
        fileCount: { type: Number, default: null },
        inputChars: { type: Number, default: null },
        chunkCount: { type: Number, default: null },
        entityCount: { type: Number, default: null },
        relationCount: { type: Number, default: null },
        startedAt: { type: Date, default: null },
        finishedAt: { type: Date, default: null }
    },
    errorMessage: {
        type: String,
        default: null
    },
    createdBy: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    confirmedAt: {
        type: Date,
        default: null
    },
    completedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// 索引
graphBuildTaskSchema.index({ createdBy: 1, status: 1 });
graphBuildTaskSchema.index({ createdAt: -1 });

module.exports = mongoose.model('GraphBuildTask', graphBuildTaskSchema);
