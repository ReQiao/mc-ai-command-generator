/**
 * AI 提示词构建 + 响应解析（纯 TS，前端 webview 可用）。
 *
 * 设计：
 *   - 提示词包含从 catalog 动态生成的「附魔/药水效果完整参考表」，让 AI 产出精确的
 *     minecraft: id，避免幻觉。
 *   - AI 只产出结构化「指令意图」（CommandIntent[]），不拼写最终命令字符串——真正的
 *     语法由 shared/logic/dispatch.ts → commands/* 确定性生成。
 *   - 联网（注入 API key、POST DashScope）由 Rust 后端负责，key 不进 webview；本模块
 *     只负责「请求前构造提示词」与「响应后解析 JSON」。
 */

import type { CommandIntent } from "../logic/dispatch";
import type { GiveVersion } from "../logic/types";
import { ENCHANTS, EFFECTS } from "../data/catalog";

/** 从 catalog 动态生成附魔/药水效果参考表，注入系统提示。 */
function buildCatalogRef(): string {
  const enchantLines = (ENCHANTS as readonly (readonly [string, string, number, string])[])
    .map(([id, zh, maxLv]) => `  ${id}（${zh}，最高${toRoman(maxLv)}级）`)
    .join("\n");
  const effectIds = (EFFECTS as readonly (readonly [string, string, ...unknown[]])[])
    .map(([id, zh]) => `${id}(${zh})`)
    .join(" ");
  return `附魔完整列表（enchantments[].id 必须使用这里的 minecraft: id）：
${enchantLines}

药水效果完整列表（effect_give 的 effect 字段）：
${effectIds}`;
}

function toRoman(n: number): string {
  return ["", "I", "II", "III", "IV", "V"][n] ?? String(n);
}

/** 支持的指令清单——同时作为给 AI 的 schema 说明。 */
function buildSupportedCommands(): string {
  return `
你只能产出以下 command 类型的意图。target 选择器：@s=自己(默认) @a=所有玩家 @p=最近玩家 @r=随机玩家。

- give {
    target?: "@s",
    item: "minecraft:物品id（如 minecraft:bow / minecraft:diamond_sword）",
    count?: number,
    enchantments?: [ { id: "minecraft:附魔id（见下方列表）", level: 数字 } ],
    displayName?: [ [ { text: "名称", color?: "gold|red|..." } ] ],
    lore?: [ [ { text: "描述行" } ] ],
    unbreakable?: true
  }
  注意：原版弓无法射出 TNT，但可以附魔 power(力量)、punch(冲击)、flame(火焰)、infinity(无限)

- say         { message: string }
- effect_give { target: string, effect: "minecraft:效果id（见下方列表）", duration?: number|"infinite", amplifier?: number }
- effect_clear{ target: string, effect?: string }
- tp          { targets: string, x: string, y: string, z: string } 或 { targets: string, destination: string }
- setblock    { x: string, y: string, z: string, block: "minecraft:stone", blockstate?: "axis=x", mode?: "replace"|"keep"|"destroy" }
- summon      { entityType: "minecraft:pig|minecraft:zombie|...", x?, y?, z?, noAI?, silent?, customName? }
- fill        { from: [x,y,z], to: [x,y,z], block: "minecraft:stone", mode?: "replace"|"keep"|"destroy" }
- enchant     { targets: string, enchantment: "minecraft:sharpness", level?: number }
- execute     { subcommands: [...], run?: string }
- scoreboard  { action: { kind: "objectives_add"|"players_set"|..., ...字段 } }

坐标统一用字符串，支持绝对("0")、相对("~"/"~1")、本地("^"/"^1")。
一个需求可拆成多条意图。

${buildCatalogRef()}`;
}

/** 构造发给 AI 的系统提示词。 */
export function buildSystemPrompt(version: GiveVersion): string {
  return [
    "你是 Minecraft 指令生成助手。把用户的自然语言需求拆解成一组结构化指令意图。",
    `目标版本: ${version}。`,
    buildSupportedCommands(),
    "",
    "只输出 JSON 对象，形如：",
    '{ "intents": [ { "command": "give", "form": { "item": "minecraft:diamond_sword", "count": 1, "enchantments": [{"id":"minecraft:sharpness","level":5}] } } ], "explanation": "一句话中文说明" }',
    "不要输出任何 JSON 以外的内容，不要拼写最终命令字符串（命令由本地确定性构建器生成）。",
  ].join("\n");
}

export interface ParsedAi {
  intents: CommandIntent[];
  explanation: string;
}

/** 解析 AI 返回的 JSON 文本为指令意图。 */
export function parseAiContent(content: string): ParsedAi {
  let parsed: { intents?: CommandIntent[]; explanation?: string };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`无法解析 AI 返回的 JSON: ${content.slice(0, 200)}`);
  }
  if (!Array.isArray(parsed.intents)) {
    throw new Error("AI 返回缺少 intents 数组。");
  }
  return { intents: parsed.intents, explanation: parsed.explanation ?? "" };
}
