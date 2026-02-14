require('dotenv').config();

const neo4j = require('neo4j-driver');

function isApocMissingError(error) {
    const message = error?.message || '';
    return /Unknown function\s+'apoc\./i.test(message) || /Unknown procedure\s+'apoc\./i.test(message);
}

async function main() {
    const uri = process.env.NEO4J_URI || 'neo4j://127.0.0.1:7687';
    const user = process.env.NEO4J_USER || 'neo4j';
    const password = process.env.NEO4J_PASSWORD;

    if (!password) {
        process.stderr.write('NEO4J_PASSWORD 未设置，无法进行自检。\n');
        process.exitCode = 2;
        return;
    }

    const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
    const session = driver.session();

    try {
        await session.run('RETURN 1 AS ok');
        const components = await session.run(
            'CALL dbms.components() YIELD name, versions, edition RETURN name, versions, edition'
        );
        const row = components.records[0];
        if (row) {
            const name = row.get('name');
            const versions = row.get('versions');
            const edition = row.get('edition');
            process.stdout.write(`Neo4j: ${name} ${Array.isArray(versions) ? versions.join(',') : versions} (${edition})\n`);
        }

        try {
            const apocVersion = await session.run('RETURN apoc.version() AS version');
            process.stdout.write(`APOC version(): ${apocVersion.records[0]?.get('version')}\n`);
        } catch (error) {
            if (isApocMissingError(error)) {
                process.stderr.write(
                    "APOC 已安装但当前连接的 Neo4j 未注册 apoc.*。\n常见原因：\n- 连接到了另一个 Neo4j 实例（URI/端口不同）\n- neo4j.conf 未放行 apoc.*（Neo4j 5+ 需要 allowlist/unrestricted）\n- 插件版本不匹配导致未加载（看 neo4j.log）\n"
                );
                throw error;
            }
            throw error;
        }

        const json = await session.run('RETURN apoc.convert.toJson({a: 1}) AS json');
        process.stdout.write(`apoc.convert.toJson OK: ${json.records[0]?.get('json')}\n`);
        process.stdout.write('APOC 自检通过。\n');
    } catch (error) {
        process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
        process.exitCode = 1;
    } finally {
        await session.close();
        await driver.close();
    }
}

main();
