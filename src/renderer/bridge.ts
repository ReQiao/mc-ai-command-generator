/**
 * 前端桥接层：用 Tauri 的 invoke 调用 Rust 后端命令，替代旧 Electron 的 window.mcai。
 *
 * 关键链路（Electron→Tauri 迁移后）：
 *   webview（本文件）
 *     → buildSystemPrompt（本地用 catalog 构造提示词）
 *     → invoke("ai_generate")（Rust 注入 key + 联网，返回 AI 原始 JSON 文本）
 *     → parseAiContent（本地解析为指令意图）
 *     → dispatchIntents（本地确定性构建命令字符串）
 *
 * 命令字符串的生成全部在 webview 完成（纯 TS，无需 Rust 重写）；
 * 联网与计费在 Rust 后端，API key 不进 webview。
 */

import { invoke } from "@tauri-apps/api/core";
import type { GiveVersion } from "../shared/logic/types";
import { dispatchIntents, type DispatchResult } from "../shared/logic/dispatch";
import { buildSystemPrompt, parseAiContent } from "../shared/ai/prompt";

export interface BillingState {
  activated: boolean;
  licenseKey: string | null;
  balance: number;
}

export interface ModResponse {
  ok: boolean;
  message?: string;
  isOp?: boolean;
}

export interface SaveInfo {
  name: string;
  path: string;
}

export interface DeployResult {
  ok: boolean;
  message?: string;
  reloaded: boolean;
  clipboardFallback?: string;
}

interface AiResponse {
  ok: boolean;
  content?: string;
  error?: string;
  usage?: { prompt: number; completion: number; total: number };
  balance: number;
}

export type GenerateResult =
  | {
      ok: true;
      explanation: string;
      results: DispatchResult[];
      usage?: { prompt: number; completion: number; total: number };
      balance: number;
    }
  | { ok: false; error: string };

/** 自然语言 → 命令（可带一次性 apiKey 覆盖后端默认）。 */
async function generate(
  text: string,
  version: GiveVersion,
  apiKey?: string,
): Promise<GenerateResult> {
  const systemPrompt = buildSystemPrompt(version);
  const res = await invoke<AiResponse>("ai_generate", {
    systemPrompt,
    userText: text,
    apiKey,
  });
  if (!res.ok) {
    return { ok: false, error: res.error ?? "AI 调用失败" };
  }
  let parsed;
  try {
    parsed = parseAiContent(res.content ?? "");
  } catch (e) {
    return { ok: false, error: String(e instanceof Error ? e.message : e) };
  }
  const results = dispatchIntents(parsed.intents, version);
  return {
    ok: true,
    explanation: parsed.explanation,
    results,
    usage: res.usage,
    balance: res.balance,
  };
}

export const mcai = {
  generate,

  /** 把命令下发给 Mod。 */
  sendToMod: (cmds: string[], port?: number) =>
    invoke<ModResponse[]>("mod_send", { cmds, port }),

  /** 放置命令方块。 */
  placeCommandBlock: (pos: [number, number, number], cmd: string, port?: number) =>
    invoke<ModResponse>("mod_place_block", { pos, cmd, port }),

  /** 探测 Mod 是否在线。 */
  pingMod: (port?: number) => invoke<ModResponse>("mod_ping", { port }),

  /** 激活码校验。 */
  activate: (licenseKey: string) =>
    invoke<BillingState>("billing_activate", { licenseKey }),

  /** 读取账号/余额状态。 */
  billingState: () => invoke<BillingState>("billing_state"),

  /** 获取可用的 Minecraft 存档列表。 */
  listSaves: () => invoke<SaveInfo[]>("datapack_list_saves"),

  /** 部署 datapack 到指定存档。 */
  deployDatapack: (savePath: string, commands: string[], version: string) =>
    invoke<DeployResult>("datapack_deploy", { save_path: savePath, commands, version }),
};

export type McaiApi = typeof mcai;
