require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const neo4j = require("neo4j-driver");

function toNumber(v) {
  if (neo4j.isInt(v)) return v.toNumber();
  return v;
}

async function runQuery(session, cypher, params = {}) {
  const res = await session.run(cypher, params);
  return res.records.map((r) => {
    const obj = r.toObject();
    for (const k of Object.keys(obj)) obj[k] = toNumber(obj[k]);
    return obj;
  });
}

async function main() {
  const uri = process.env.NEO4J_URI || "neo4j://127.0.0.1:7687";
  const user = process.env.NEO4J_USER || "neo4j";
  const password = process.env.NEO4J_PASSWORD;

  if (!password) {
    throw new Error("NEO4J_PASSWORD 未配置，无法检查向量索引与文档片段。");
  }

  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  const session = driver.session();

  try {
    let versionInfo = null;
    try {
      const components = await runQuery(
        session,
        `
CALL dbms.components()
YIELD name, versions, edition
RETURN name, versions, edition
        `.trim()
      );
      versionInfo = components[0] || null;
    } catch {
      versionInfo = null;
    }

    const chunkStats = await runQuery(
      session,
      `
MATCH (d:DocumentChunk)
RETURN
  count(d) AS total,
  sum(CASE WHEN d.embedding IS NULL THEN 0 ELSE 1 END) AS withEmbedding,
  sum(CASE WHEN d.text IS NULL THEN 0 ELSE 1 END) AS withText,
  min(CASE WHEN d.embedding IS NULL THEN null ELSE size(d.embedding) END) AS minDim,
  max(CASE WHEN d.embedding IS NULL THEN null ELSE size(d.embedding) END) AS maxDim,
  avg(CASE WHEN d.embedding IS NULL THEN null ELSE size(d.embedding) END) AS avgDim
      `.trim()
    );

    const samples = await runQuery(
      session,
      `
MATCH (d:DocumentChunk)
RETURN
  coalesce(d.fileName, d.filename, d.sourceFile, d.source, d.file, d.path, '未知') AS fileName,
  coalesce(d.paragraphIndex, d.paragraph, d.chunkIndex, d.chunk, null) AS paragraphIndex,
  CASE WHEN d.text IS NULL THEN 0 ELSE size(toString(d.text)) END AS textLen,
  CASE WHEN d.embedding IS NULL THEN null ELSE size(d.embedding) END AS dim,
  keys(d) AS keys
LIMIT 5
      `.trim()
    );

    let indexInfo = null;
    const indexErrors = [];
    const attempts = [
      {
        name: "SHOW INDEXES (with provider)",
        cypher: `
SHOW INDEXES
YIELD name, type, entityType, labelsOrTypes, properties, state, provider
WHERE name = $name
RETURN name, type, entityType, labelsOrTypes, properties, state, provider
        `.trim()
      },
      {
        name: "SHOW INDEXES (no provider)",
        cypher: `
SHOW INDEXES
YIELD name, type, entityType, labelsOrTypes, properties, state
WHERE name = $name
RETURN name, type, entityType, labelsOrTypes, properties, state
        `.trim()
      },
      {
        name: "CALL db.indexes()",
        cypher: `
CALL db.indexes()
YIELD name, type, entityType, labelsOrTypes, properties, state, provider
WHERE name = $name
RETURN name, type, entityType, labelsOrTypes, properties, state, provider
        `.trim()
      },
      {
        name: "CALL db.indexes (no provider)",
        cypher: `
CALL db.indexes()
YIELD name, type, entityType, labelsOrTypes, properties, state
WHERE name = $name
RETURN name, type, entityType, labelsOrTypes, properties, state
        `.trim()
      }
    ];

    for (const a of attempts) {
      try {
        indexInfo = await runQuery(session, a.cypher, { name: "training_docs_index" });
        break;
      } catch (e) {
        indexErrors.push({
          attempt: a.name,
          code: e.code || null,
          message: e.message || String(e)
        });
      }
    }

    console.log("=== Neo4j 版本信息 ===");
    console.log(JSON.stringify(versionInfo || {}, null, 2));
    console.log("");
    console.log("=== DocumentChunk 统计 ===");
    console.log(JSON.stringify(chunkStats[0] || {}, null, 2));
    console.log("");
    console.log("=== DocumentChunk 样例(最多5条) ===");
    console.log(JSON.stringify(samples, null, 2));
    console.log("");
    console.log("=== 向量索引 training_docs_index ===");
    console.log(JSON.stringify(indexInfo || [], null, 2));
    if (!indexInfo) {
      console.log("");
      console.log("=== 向量索引查询失败明细 ===");
      console.log(JSON.stringify(indexErrors, null, 2));
    }
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
