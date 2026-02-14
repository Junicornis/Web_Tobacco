const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    displayName: {
        type: String,
        required: true
    },
    dataType: {
        type: String,
        enum: ['string', 'number', 'date', 'enum', 'boolean'],
        default: 'string'
    },
    required: {
        type: Boolean,
        default: false
    },
    searchable: {
        type: Boolean,
        default: true
    },
    isIdentifier: {
        type: Boolean,
        default: false
    },
    enumValues: [{
        type: String
    }],
    description: {
        type: String,
        default: ''
    }
}, { _id: false });

const entityTypeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    displayName: {
        type: String,
        required: true
    },
    color: {
        type: String,
        default: '#1890ff'
    },
    icon: {
        type: String,
        default: 'node'
    },
    description: {
        type: String,
        default: ''
    },
    properties: [propertySchema]
}, { _id: false });

const relationTypeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    displayName: {
        type: String,
        required: true
    },
    sourceTypes: [{
        type: String
    }],
    targetTypes: [{
        type: String
    }],
    description: {
        type: String,
        default: ''
    },
    isDirected: {
        type: Boolean,
        default: true
    }
}, { _id: false });

const ontologyLibrarySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    version: {
        type: String,
        default: '1.0'
    },
    domain: {
        type: String,
        default: 'safety_training'
    },
    description: {
        type: String,
        default: ''
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isDefault: {
        type: Boolean,
        default: false
    },
    entityTypes: [entityTypeSchema],
    relationTypes: [relationTypeSchema],
    createdBy: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// 索引
ontologyLibrarySchema.index({ domain: 1, isActive: 1 });
ontologyLibrarySchema.index({ isDefault: 1 });

// 静态方法：获取默认本体
ontologyLibrarySchema.statics.getDefaultOntology = async function() {
    let ontology = await this.findOne({ isDefault: true, isActive: true });
    if (!ontology) {
        ontology = await this.findOne({ isActive: true }).sort({ createdAt: -1 });
    }
    return ontology;
};

// 实例方法：获取实体类型
ontologyLibrarySchema.methods.getEntityType = function(typeName) {
    return this.entityTypes.find(et => et.name === typeName);
};

// 实例方法：获取关系类型
ontologyLibrarySchema.methods.getRelationType = function(typeName) {
    return this.relationTypes.find(rt => rt.name === typeName);
};

module.exports = mongoose.model('OntologyLibrary', ontologyLibrarySchema);
