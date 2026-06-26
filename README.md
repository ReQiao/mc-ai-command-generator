# MC AI 指令生成器

AI 驱动的 Minecraft 通用指令生成器（Electron exe + Fabric Mod）。用自然语言描述需求，AI 自动生成合法的 Minecraft 命令。

## 特性

- **自然语言输入** — 用中文描述你想要的物品、效果、实体等
- **AI 智能生成** — 基于 Qwen (DashScope) OpenAI-compatible API
- **多版本支持** — Java 1.20.5、1.21、1.21.5+ 等所有现代版本
- **即时语法验证** — 通过确定性命令构建器保证语法正确
- **Mod 集成** — 直接下发命令到 Minecraft 游戏内
- **跨平台** — Windows、macOS 均支持

## 快速开始

### 前提条件

- **Node.js** 18 LTS 或更高
- **Git**
- **JDK 21**（仅编译 Mod 时需要）

### 安装

```bash
git clone https://github.com/ReQiao/mc-ai-command-generator.git
cd mc-ai-command-generator
npm install
```

### 配置

复制环境变量文件并填写 API Key：

```bash
cp .env.example .env
```

编辑 `.env`，填写：

```
DASHSCOPE_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
```

其他变量为可选，有默认值：

- `DASHSCOPE_ENDPOINT` — API 端点（默认：https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions）
- `DASHSCOPE_MODEL` — 模型名称（默认：qwen-plus）
- `MOD_BRIDGE_PORT` — Mod 通信端口（默认：25580）

### 开发模式

启动 Electron 开发服务器（支持热更新）：

```bash
npm run dev
```

### 构建

类型检查 + 打包：

```bash
npm run build
```

构建 Windows 安装包：

```bash
npm run dist:win
```

构建 Fabric Mod：

```bash
npm run mod:build
```

### 测试

运行单元测试（给命令生成器）：

```bash
npm test
```

## 项目结构

```
src/
├── main/              — Electron 主进程
│   ├── index.ts       — 入口点
│   ├── ai-bridge.ts   — Qwen API 集成
│   └── mod-bridge.ts  — Mod HTTP 通信
├── preload/           — IPC 预加载脚本
├── renderer/          — Vue 3 UI
│   ├── App.vue
│   ├── main.ts
│   └── style.css
└── shared/
    └── logic/
        ├── builder.ts — 导出聚合层
        ├── types.ts   — 版本、类型定义
        ├── dispatch.ts — 意图分派器
        ├── commands/   — 指令构建器
        │   ├── give.ts
        │   ├── fill.ts
        │   ├── clone.ts
        │   ├── enchant.ts
        │   ├── execute.ts
        │   ├── scoreboard.ts
        │   ├── attribute.ts
        │   └── ...
        └── tests/

mod/                  — Fabric Mod (Kotlin)
├── build.gradle.kts
└── src/main/kotlin/...
```

## 版本支持

支持以下 Minecraft Java 版本：

- Java 1.20.5 / 1.20.6
- Java 1.21 / 1.21.1
- Java 1.21.2 / 1.21.3 / 1.21.4
- Java 1.21.5+（含 1.21.11、26.x 等）

## 工作流

1. **用户输入** — 在 UI 中用自然语言描述需求
2. **AI 翻译** — Qwen 模型将自然语言转换为 `CommandIntent[]` JSON
3. **语法生成** — dispatch.ts 路由意图到具体命令构建器
4. **验证输出** — 确定性构建器生成语法合法的 Minecraft 命令
5. **用户确认** — 复制单条命令或一键下发到游戏

这种设计将 AI 幻觉隔离在「意图」层，绝不会产生语法非法的命令。

## 技术栈

- **前端** — Vue 3 + TypeScript + Electron
- **构建** — electron-vite + electron-builder
- **后端** — Node.js + Electron IPC
- **AI** — Qwen (DashScope) OpenAI-compatible API
- **Mod** — Fabric + Kotlin + HttpServer

## 许可证

MIT
