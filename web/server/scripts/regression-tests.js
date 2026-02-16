const assert = require('assert');

const glmClient = require('../src/utils/glmClient');
const GraphBuildTask = require('../src/models/GraphBuildTask');
const FileUpload = require('../src/models/FileUpload');
const extractionService = require('../src/services/extractionService');
const alignmentService = require('../src/services/alignmentService');
const kgController = require('../src/controllers/kgController');
const graphBuilder = require('../src/services/graphBuilder');
const vectorStore = require('../src/services/vectorStore');

async function runTest(name, fn) {
    try {
        await fn();
        process.stdout.write(`PASS ${name}\n`);
    } catch (error) {
        process.stderr.write(`FAIL ${name}\n`);
        process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
        process.exitCode = 1;
    }
}

async function testParseFailureUpdatesTask() {
    const calls = [];
    const originalFindByIdAndUpdate = GraphBuildTask.findByIdAndUpdate;
    const originalExtractKnowledge = glmClient.extractKnowledge;

    GraphBuildTask.findByIdAndUpdate = async (taskId, update) => {
        calls.push({ taskId, update });
        return null;
    };

    glmClient.extractKnowledge = async () => {
        const err = new Error('抽取结果解析失败: Unexpected token');
        err.details = {
            chunkIndex: 0,
            chunkCount: 1,
            rawPreview: 'not-json',
            rawLength: 8
        };
        throw err;
    };

    try {
        await extractionService.extractFromDocuments({
            files: [{ fileId: 'f1', filename: 'a.txt', parsedData: { text: 'hello' } }],
            taskId: 't1',
            ontologyMode: 'auto'
        });
        assert.fail('should throw');
    } catch (error) {
        assert.ok(error);
    } finally {
        GraphBuildTask.findByIdAndUpdate = originalFindByIdAndUpdate;
        glmClient.extractKnowledge = originalExtractKnowledge;
    }

    assert.ok(calls.length >= 2);
    const last = calls[calls.length - 1].update;
    assert.ok(last && last.$set);
    assert.strictEqual(last.$set.status, 'failed');
    assert.strictEqual(last.$set.stageMessage, '知识抽取失败');
    assert.ok(last.$set.extractionDebug);
    assert.strictEqual(last.$set.extractionDebug.chunkIndex, 0);
    assert.strictEqual(last.$set.extractionDebug.chunkCount, 1);
    assert.strictEqual(last.$set.extractionDebug.rawPreview, 'not-json');
    assert.strictEqual(last.$set.extractionDebug.rawLength, 8);
    assert.ok(last.$set['extractionMeta.finishedAt'] instanceof Date);
}

async function testEmptyEntitiesStopsPipeline() {
    const calls = [];
    const originalFindByIdAndUpdate = GraphBuildTask.findByIdAndUpdate;
    const originalExtractKnowledge = glmClient.extractKnowledge;

    GraphBuildTask.findByIdAndUpdate = async (taskId, update) => {
        calls.push({ taskId, update });
        return null;
    };

    glmClient.extractKnowledge = async () => ({
        entityTypes: [],
        entities: [],
        relationTypes: [],
        relations: [],
        meta: { chunkCount: 1 }
    });

    try {
        await extractionService.extractFromDocuments({
            files: [{ fileId: 'f1', filename: 'a.txt', parsedData: { text: 'hello' } }],
            taskId: 't2',
            ontologyMode: 'auto'
        });
        assert.fail('should throw');
    } catch (error) {
        assert.ok(error);
        assert.ok(String(error.message).includes('未提取到任何实体'));
    } finally {
        GraphBuildTask.findByIdAndUpdate = originalFindByIdAndUpdate;
        glmClient.extractKnowledge = originalExtractKnowledge;
    }

    const failureCall = calls.find(c => c.update && c.update.status === 'failed' && c.update.stageMessage);
    assert.ok(failureCall);
    assert.strictEqual(failureCall.update.stageMessage, '知识抽取未得到有效结果');
    assert.ok(String(failureCall.update.errorMessage).includes('未提取到任何实体'));
}

async function testGlmParseAllowsUnclosedCodeFence() {
    const input = '```json\n{\n  "entityTypes": [],\n  "entities": [],\n  "relationTypes": [],\n  "relations": []\n}\n';
    const parsed = glmClient._parseExtractionResult(input);
    assert.ok(parsed.ok, parsed.errorMessage);
    assert.deepStrictEqual(parsed.value.entityTypes, []);
    assert.deepStrictEqual(parsed.value.entities, []);
    assert.deepStrictEqual(parsed.value.relationTypes, []);
    assert.deepStrictEqual(parsed.value.relations, []);
}

async function testAlignmentEmptyGuard() {
    const updates = [];
    const originalFindById = GraphBuildTask.findById;
    const originalFindByIdAndUpdate = GraphBuildTask.findByIdAndUpdate;

    GraphBuildTask.findById = async () => ({ draftEntities: [] });
    GraphBuildTask.findByIdAndUpdate = async (taskId, update) => {
        updates.push({ taskId, update });
        return null;
    };

    try {
        await alignmentService.alignEntities('t3');
        assert.fail('should throw');
    } catch (error) {
        assert.ok(error);
        assert.ok(String(error.message).includes('无法对齐'));
    } finally {
        GraphBuildTask.findById = originalFindById;
        GraphBuildTask.findByIdAndUpdate = originalFindByIdAndUpdate;
    }

    assert.ok(updates.length >= 1);
    const first = updates[0].update;
    assert.strictEqual(first.status, 'failed');
    assert.strictEqual(first.stageMessage, '未抽取到实体，无法对齐');
}

async function testConfirmAndBuildTriggersRagIndexing() {
    const originalFindById = GraphBuildTask.findById;
    const originalBuildGraph = graphBuilder.buildGraph;
    const originalFileFind = FileUpload.find;
    const originalDeleteByFileIds = vectorStore.deleteByFileIds;
    const originalAddDocuments = vectorStore.addDocuments;

    const captured = {
        deleteFileIds: null,
        documents: null,
        response: null,
        statusCode: null
    };

    process.env.RAG_CHUNK_SIZE = '10';
    process.env.RAG_CHUNK_OVERLAP = '0';

    const taskId = '507f1f77bcf86cd799439011';

    GraphBuildTask.findById = async () => ({
        _id: taskId,
        status: 'confirming',
        files: [{ fileId: 'f1', filename: 'a.txt' }]
    });

    graphBuilder.buildGraph = async () => ({ stats: { ok: true } });

    FileUpload.find = async () => ([
        { _id: 'f1', originalName: 'a.txt', extractedText: '12345678901234567890' }
    ]);

    vectorStore.deleteByFileIds = async (fileIds) => {
        captured.deleteFileIds = fileIds;
    };

    vectorStore.addDocuments = async (documents) => {
        captured.documents = documents;
    };

    const req = {
        params: { taskId },
        body: { modifications: {} }
    };

    const res = {
        status(code) {
            captured.statusCode = code;
            return this;
        },
        json(payload) {
            captured.response = payload;
            return payload;
        }
    };

    try {
        await kgController.confirmAndBuild(req, res);
    } finally {
        GraphBuildTask.findById = originalFindById;
        graphBuilder.buildGraph = originalBuildGraph;
        FileUpload.find = originalFileFind;
        vectorStore.deleteByFileIds = originalDeleteByFileIds;
        vectorStore.addDocuments = originalAddDocuments;
        delete process.env.RAG_CHUNK_SIZE;
        delete process.env.RAG_CHUNK_OVERLAP;
    }

    assert.strictEqual(captured.statusCode, null);
    assert.ok(captured.response);
    assert.strictEqual(captured.response.success, true);
    assert.ok(captured.response.rag);
    assert.strictEqual(captured.response.rag.indexed, true);
    assert.deepStrictEqual(captured.deleteFileIds, ['f1']);
    assert.ok(Array.isArray(captured.documents));
    assert.strictEqual(captured.documents.length, 2);
    assert.strictEqual(captured.documents[0].metadata.fileId, 'f1');
    assert.strictEqual(captured.documents[0].metadata.fileName, 'a.txt');
    assert.strictEqual(captured.documents[0].metadata.chunkIndex, 0);
    assert.strictEqual(captured.documents[1].metadata.chunkIndex, 1);
}

async function main() {
    await runTest('extraction parse failure updates task', testParseFailureUpdatesTask);
    await runTest('empty entities stops pipeline', testEmptyEntitiesStopsPipeline);
    await runTest('glm parse allows unclosed code fence', testGlmParseAllowsUnclosedCodeFence);
    await runTest('alignment empty guard', testAlignmentEmptyGuard);
    await runTest('confirm build triggers rag indexing', testConfirmAndBuildTriggersRagIndexing);
    if (process.exitCode) {
        process.exit(process.exitCode);
    }
}

main();
