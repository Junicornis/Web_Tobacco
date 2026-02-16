require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const neo4j = require("neo4j-driver");

async function main() {
  const uri = process.env.NEO4J_URI || "neo4j://127.0.0.1:7687";
  const user = process.env.NEO4J_USER || "neo4j";
  const password = process.env.NEO4J_PASSWORD;
  if (!password) throw new Error("NEO4J_PASSWORD 未配置");

  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  const session = driver.session();
  try {
    const nodes = await session.run(
      "MATCH (n) WHERE (n.name CONTAINS $q) OR (n.名称 CONTAINS $q) RETURN labels(n) AS labels, properties(n) AS props LIMIT 5",
      { q: "后勤部" }
    );
    console.log("Sample nodes:");
    nodes.records.forEach((r) => {
      console.log({
        labels: r.get("labels"),
        props: r.get("props"),
      });
    });

    const rels = await session.run(
      "MATCH ()-[r]->() RETURN type(r) AS t, count(*) AS c ORDER BY c DESC LIMIT 15"
    );
    console.log("Top relationship types:");
    rels.records.forEach((r) => {
      const c = r.get("c");
      console.log({ type: r.get("t"), count: neo4j.integer.isInteger(c) ? c.toNumber() : c });
    });

    const labels = await session.run(
      "CALL db.labels() YIELD label RETURN label ORDER BY label LIMIT 30"
    );
    console.log("Labels:");
    console.log(labels.records.map((r) => r.get("label")));
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

