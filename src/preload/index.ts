/**
 * 预加载脚本：通过 contextBridge 把受限的 IPC API 暴露给渲染进程。
 *
 * 渲染进程只能看到这里白名单的方法，碰不到 Node / Electron 内部 API——
 * API key、收费逻辑、Mod 通信全部留在主进程。
 */

import { contextBridge, ipcRenderer } from "electron";
import type { GiveVersion } from "../shared/logic/types";

const api = {
  /** 自然语言 → 命令（可带一次性 apiKey 覆盖 .env）。 */
  generate: (text: string, version: GiveVersion, apiKey?: string) =>
    ipcRenderer.invoke("ai:generate", { text, version, apiKey }),

  /** 把命令下发给 Mod。 */
  sendToMod: (cmds: string[], port?: number) =>
    ipcRenderer.invoke("mod:send", { cmds, port }),

  /** 放置命令方块。 */
  placeCommandBlock: (pos: [number, number, number], cmd: string, port?: number) =>
    ipcRenderer.invoke("mod:placeBlock", { pos, cmd, port }),

  /** 探测 Mod 是否在线。 */
  pingMod: (port?: number) => ipcRenderer.invoke("mod:ping", { port }),

  /** 激活码校验。 */
  activate: (licenseKey: string) => ipcRenderer.invoke("billing:activate", { licenseKey }),

  /** 读取账号/余额状态。 */
  billingState: () => ipcRenderer.invoke("billing:state"),
};

contextBridge.exposeInMainWorld("mcai", api);

export type McaiApi = typeof api;
