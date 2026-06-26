/**
 * Electron 主进程入口。
 *
 * 职责：
 *   - 创建窗口、加载渲染进程（开发用 Vite dev server，生产用打包后的 HTML）。
 *   - 注册 IPC：把渲染进程的请求路由到 ai-bridge / dispatch / mod-bridge / billing。
 *   - 所有联网与收费逻辑都在这里（主进程），不下放到渲染进程。
 *
 * 通信链路（PLAN 最大未知量）：渲染进程 → IPC → 主进程 → POST localhost:25580 → Mod。
 */

import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { generateIntents, AiBridgeError } from "./ai-bridge";
import { dispatchIntents } from "../shared/logic/dispatch";
import { pingMod, sendCommands, placeCommandBlock } from "./mod-bridge";
import { activate, getState } from "./billing/auth";
import { canConsume, consume } from "./billing/usage";
import type { GiveVersion } from "../shared/logic/types";

const isDev = !!process.env.ELECTRON_RENDERER_URL || !app.isPackaged;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 980,
    height: 720,
    title: "MC AI 指令生成器",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// ---------------------------------------------------------------------------
// IPC 处理器
// ---------------------------------------------------------------------------

/** 自然语言 → 意图 → 命令字符串。可选直接下发到 Mod。 */
ipcMain.handle(
  "ai:generate",
  async (
    _e,
    args: { text: string; version: GiveVersion; apiKey?: string },
  ) => {
    if (!canConsume()) {
      return { ok: false, error: "余额不足，请先激活/充值。" };
    }
    try {
      const ai = await generateIntents(args.text, args.version, { apiKey: args.apiKey });
      const results = dispatchIntents(ai.intents, args.version);
      consume({ prompt: args.text, tokens: ai.usage?.total });
      return {
        ok: true,
        explanation: ai.explanation,
        results, // [{ intent, command, error }]
        usage: ai.usage,
        balance: getState().balance,
      };
    } catch (err) {
      const msg = err instanceof AiBridgeError ? err.message : String(err);
      return { ok: false, error: msg };
    }
  },
);

/** 把若干命令下发给 Mod 执行。 */
ipcMain.handle("mod:send", async (_e, args: { cmds: string[]; port?: number }) => {
  return sendCommands(args.cmds, { port: args.port });
});

/** 放置命令方块。 */
ipcMain.handle(
  "mod:placeBlock",
  async (_e, args: { pos: [number, number, number]; cmd: string; port?: number }) => {
    return placeCommandBlock(args.pos, args.cmd, { port: args.port });
  },
);

/** 探测 Mod 是否在线。 */
ipcMain.handle("mod:ping", async (_e, args: { port?: number } = {}) => {
  return pingMod({ port: args.port });
});

/** 激活码校验。 */
ipcMain.handle("billing:activate", async (_e, args: { licenseKey: string }) => {
  try {
    const state = await activate(args.licenseKey);
    return { ok: true, state };
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err) };
  }
});

ipcMain.handle("billing:state", async () => getState());

// ---------------------------------------------------------------------------
// 生命周期
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  void isDev; // 预留：开发态额外日志
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
