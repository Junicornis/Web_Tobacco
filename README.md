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
# 默认端口: 3001
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

## 🌿 分支管理策略

建议采用 Feature Branch 工作流：
- `main` / `master`: 稳定主干，仅用于发布
- `develop`: 开发主干，包含最新合并的功能
- `feature/task-monitor`: 任务监控模块开发（当前功能）
- `feature/unity-upgrade`: Unity 场景升级

**提交建议**:
建议创建一个新的分支 `feature/v2.0-init` 或 `develop` 进行本次提交，不要直接推送到 `main`，以便代码审查和回滚。
