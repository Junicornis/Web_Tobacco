# Tobacco Training System v2.0

安全培训系统 - Web管理端与Unity 3D场景交互版

## 📦 项目结构

```
Tobacco_train2/
├── web/
│   ├── client/       # React 前端
│   └── server/       # Node.js 后端
├── unity/            # Unity 3D 工程文件
└── docs/             # 设计文档
```

## 🚀 快速开始

### 1. 启动后端 (Server)
```bash
cd web/server
npm install
npm start
# 默认端口: 3000（可在 web/server/.env 里通过 PORT 修改）
```

### 2. 启动前端 (Client)
```bash
cd web/client
npm install
npm run dev
# 默认地址: http://localhost:5173
```

### 3. Unity 场景
请使用 Unity Hub 打开 `unity/` 目录进行编辑或打包。
打包后的 exe 文件路径需在 `web/server/.env` 中配置。

## 🧠 知识图谱（Neo4j/APOC）

知识图谱写入依赖 Neo4j。若要启用 APOC（推荐），需要在你实际运行的 Neo4j 实例中安装 APOC 插件，并在该实例的 `conf/neo4j.conf` 放行 `apoc.*` 后重启 Neo4j：

```
dbms.security.procedures.unrestricted=apoc.*
dbms.security.procedures.allowlist=apoc.*
```

后端提供了自检命令用于确认“当前连接的 Neo4j 实例”是否真正注册了 `apoc.*`：

```bash
cd web/server
npm run check:neo4j
```

## 🌿 分支管理策略

建议采用 Feature Branch 工作流：
- `main` / `master`: 稳定主干，仅用于发布
- `develop`: 开发主干，包含最新合并的功能
- `feature/task-monitor`: 任务监控模块开发（当前功能）
- `feature/unity-upgrade`: Unity 场景升级

**提交建议**:
建议创建一个新的分支 `feature/v2.0-init` 或 `develop` 进行本次提交，不要直接推送到 `main`，以便代码审查和回滚。
