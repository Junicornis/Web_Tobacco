
const glmClient = require('../src/utils/glmClient');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const testText = `[Sheet: Sheet1]
表头: 序号, 风险单元, 作业活动, 危险发生的触发因素和过程描述, 可能导致的后果, 风险等级评价, 风险等级, 现有控制措施, 涉及单位或部门
数据行数: 3

[行1] 序号: 1 | 风险单元: 办公场所 | 作业活动: 办公设备设施使用 | 危险发生的触发因素和过程描述: 使用办公电器设备，电源线破损裸露。 | 可能导致的后果: 触电 | 风险等级评价: 4 | 风险等级: 蓝 | 现有控制措施: 1.购买电气设施时应选择“CCC”认证标志的产品... | 涉及单位或部门: 各单位、各部门

[行2] 序号: 2 | 风险单元: 办公场所 | 作业活动: 办公设备设施使用 | 危险发生的触发因素和过程描述: 电气设备线路老化、外壳破损... | 可能导致的后果: 触电 | 风险等级评价: 6 | 风险等级: 蓝 | 涉及单位或部门: 各单位、各部门

[行3] 序号: 8 | 风险单元: 办公场所 | 作业活动: 办公设备设施使用 | 危险发生的触发因素和过程描述: 下班后未关闭电源，电器设施过热。 | 可能导致的后果: 火灾 | 风险等级评价: 3 | 风险等级: 蓝 | 现有控制措施: 1.下班前检查电源是否关闭... | 涉及单位或部门: 各单位、各部门
`;

async function runTest() {
    try {
        console.log('开始测试抽取...');
        // 注意：这需要有效的 GLM_API_KEY 环境变量
        if (!process.env.GLM_API_KEY) {
            console.log('警告: 未找到 GLM_API_KEY，仅打印构建的 Prompt');
            // 这里我们通过 hack 的方式访问私有方法 _buildExtractionSystemPrompt 来查看生成的 prompt
            // 但由于是私有方法通常无法直接访问，不过在 JS 中通常没有严格限制
            // 或者我们可以直接查看代码逻辑。
            // 既然无法实际调用 API，我们主要确认代码逻辑无误。
            console.log('请配置 .env 文件中的 GLM_API_KEY 以运行实际测试。');
            return;
        }

        const result = await glmClient.extractKnowledge(testText);
        console.log('抽取结果:');
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('测试失败:', error);
    }
}

runTest();
