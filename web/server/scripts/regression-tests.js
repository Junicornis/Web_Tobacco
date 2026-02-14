const assert = require('assert');

const glmClient = require('../src/utils/glmClient');
const GraphBuildTask = require('../src/models/GraphBuildTask');
const extractionService = require('../src/services/extractionService');
const alignmentService = require('../src/services/alignmentService');

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

async function main() {
    await runTest('extraction parse failure updates task', testParseFailureUpdatesTask);
    await runTest('empty entities stops pipeline', testEmptyEntitiesStopsPipeline);
    await runTest('alignment empty guard', testAlignmentEmptyGuard);
    if (process.exitCode) {
        process.exit(process.exitCode);
    }
}

main();

