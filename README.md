# MC AI 指令生成器

AI 驱动的 Minecraft 通用指令生成器（Tauri 桌面端 + Fabric Mod）。用自然语言描述需求，AI 自动生成合法的 Minecraft 命令。

## 特性

- **自然语言输入** — 用中文描述你想要的物品、效果、实体等
- **AI 智能生成** — 基于 Qwen (DashScope) OpenAI-compatible API
- **多版本支持** — Java 1.20.5、1.21、1.21.5+、26.x 等所有现代版本
- **即时语法验证** — 通过确定性命令构建器保证语法正确
- **Mod 集成** — 直接下发命令到 Minecraft 游戏内
- **轻量跨平台** — Tauri 打包，体积小、内存占用低；Windows、macOS、Linux 均支持

## 架构

- **前端（webview，Vue 3 + TS）** — UI + 全部命令构建逻辑（`src/shared/logic` 纯函数，在 webview 内运行）
- **后端（Rust，`src-tauri`）** — 联网与计费：注入 API key、调用 Qwen、与 Mod 通信、余额管理。API key 不进 webview。

链路：`webview 构造提示词 → invoke("ai_generate")（Rust 联网）→ 解析意图 → dispatch 确定性生成命令字符串`。

## 快速开始

### 前提条件

- **Node.js** 18 LTS 或更高
- **Rust** 工具链（[rustup](https://rustup.rs/)）—— Tauri 后端需要
- **系统依赖**（仅 Linux）：`libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev librsvg2-dev`
- **JDK 21**（仅编译 Mod 时需要）

Windows / macOS 安装 Rust 后即可，无需额外系统库（macOS 需 Xcode Command Line Tools，Windows 需 WebView2，系统通常已自带）。

### 安装

```bash
git clone https://github.com/ReQiao/mc-ai-command-generator.git
cd mc-ai-command-generator
npm install
```

### 配置 API Key

两种方式任选其一：

1. **界面内填写**（推荐）— 在应用顶栏的 API Key 输入框直接填入 `sk-...`。
2. **`.env` 文件** — 复制并填写，后端启动时自动加载：

   ```bash
   cp .env.example .env
   # 编辑 .env：DASHSCOPE_API_KEY=sk-xxxxxxxx
   ```

可选变量（有默认值）：

- `DASHSCOPE_ENDPOINT` — API 端点（默认：DashScope OpenAI 兼容接口）
- `DASHSCOPE_MODEL` — 模型名称（默认：qwen-plus）

### 开发模式

启动 Tauri 开发模式（自动拉起 Vite + Rust，支持热更新）：

```bash
npm run tauri dev
```

> 首次启动会编译 Rust 依赖，耗时较长（数分钟）；之后增量编译很快。
> 只想预览 UI（不启动 Rust 后端）可用 `npm run dev` 跑纯前端。

### 构建发行包

```bash
npm run tauri build
```

产物在 `src-tauri/target/release/bundle/`（Windows 为 `.msi`/`.exe`，macOS 为 `.dmg`/`.app`，Linux 为 `.deb`/`.AppImage`）。

### 构建 Fabric Mod

```bash
npm run mod:build
```

### 测试

运行命令构建器单元测试：

```bash
npm test
```

## 项目结构

```
src/                       — 前端（webview，Vue 3）
├── renderer/
│   ├── index.html
│   ├── main.ts
│   ├── App.vue
│   ├── bridge.ts          — Tauri invoke 桥接（替代旧 Electron window.mcai）
│   └── style.css
└── shared/
    ├── ai/
    │   └── prompt.ts      — 系统提示词构造 + AI 响应解析（含 catalog 参考表）
    ├── data/
    │   └── catalog.ts     — 物品/方块/附魔/效果 中英对照目录
    └── logic/
        ├── dispatch.ts    — 意图分派器
        ├── types.ts       — 版本、类型定义
        └── commands/      — 各指令确定性构建器（give/fill/clone/enchant/...）

src-tauri/                 — 后端（Rust）
├── Cargo.toml
├── tauri.conf.json
├── capabilities/
└── src/
    ├── main.rs            — 入口
    ├── lib.rs            — 注册命令与托管状态
    ├── ai.rs             — Qwen API 集成（注入 key + 联网）
    ├── mod_bridge.rs     — Mod HTTP 通信
    └── billing.rs        — 余额 / 激活

mod/                       — Fabric Mod (Kotlin)
```

## 版本支持

- Java 1.20.5 / 1.20.6
- Java 1.21 / 1.21.1
- Java 1.21.2 / 1.21.3 / 1.21.4
- Java 1.21.5 / 1.21.6+ / 1.21.9+ / 1.21.11+
- Java 26.1 / 26.2+

## 工作流

1. **用户输入** — 在 UI 中用自然语言描述需求
2. **AI 翻译** — Qwen 模型将自然语言转换为 `CommandIntent[]` JSON
3. **语法生成** — `dispatch.ts` 路由意图到具体命令构建器
4. **验证输出** — 确定性构建器生成语法合法的 Minecraft 命令
5. **用户确认** — 复制单条命令或一键下发到游戏

这种设计将 AI 幻觉隔离在「意图」层，绝不会产生语法非法的命令。

## 技术栈

- **前端** — Vue 3 + TypeScript + Vite
- **桌面框架** — Tauri 2（Rust）
- **后端** — Rust（reqwest 联网，Tauri command IPC）
- **AI** — Qwen (DashScope) OpenAI-compatible API
- **Mod** — Fabric + Kotlin + HttpServer

## 许可证

MIT
