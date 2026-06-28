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

/**
 * 游戏机制推理指南——这是 AI 的核心价值所在。
 *
 * 不要把用户需求当作「查表翻译」。许多需求在原版里没有「单个物品/单条命令」的直接对应，
 * 但完全可以用游戏机制组合实现（execute 链 + summon/kill + 命令方块）。
 * 你的任务是先「推理」如何用原版机制达成目标，再落成具体意图。
 */
function buildMechanicsGuide(): string {
  return `
【核心原则：先推理游戏机制，再生成命令】
你是精通 Minecraft 机制的专家，不是查表器。面对一个需求，按以下顺序思考：
1. 用户真正想要的「游戏内效果」是什么？（不是字面物品，是体验）
2. 原版里有没有现成物品/命令直接实现？有就直接 give/summon。
3. 没有现成的，能否用 execute + summon/kill/setblock/data 等组合实现？通常都可以。
4. 需要持续生效的（如侦测+触发），用 execute 链，并在 explanation 里提示放入循环命令方块。
绝不要因为「没有现成物品」就放弃或只给个兜底物品——优先用机制组合真正实现效果。

【经典组合技参考】
- "TNT 弓 / 爆炸箭"：原版弓不能射 TNT，但可侦测落地的箭并在原地生成 TNT：
  give 一把弓（可附 power 力量附魔）
  + execute at @e[type=arrow,nbt={inGround:1b}] run summon tnt ~ ~ ~
  + kill @e[type=arrow,nbt={inGround:1b}]
  后两条放入「循环命令方块」（始终激活），任意箭落地即变 TNT。

- "闪电剑 / 雷击武器"：侦测玩家攻击的实体并在其位置引雷（或用 channeling 三叉戟 + 雷暴）。
  组合：execute as @e[...] at @s run summon lightning_bolt ~ ~ ~（放循环命令方块）。

- "跳跃药水 / 高跳"：give 不存在「高跳鞋」，用 effect_give jump_boost 高等级，或属性 attribute。

- "无限燃烧的箭 / 火焰陷阱"：execute + setblock fire，或 summon 时附带相应效果。

- "一刀秒杀"：give 剑 + sharpness 高等级，或用 attribute 改攻击力，或 execute ... run kill。

要点：execute 的 run 字段可以写任意原版命令字符串（summon/kill/setblock/data/tp 等），
这是组合机制的关键。需要"实时侦测某条件→执行"时就用 execute 链 + 命令方块。`;
}

/** 构造发给 AI 的系统提示词。 */
export function buildSystemPrompt(version: GiveVersion): string {
  return [
    "你是精通 Minecraft 游戏机制的指令专家。理解用户想要的游戏内效果，",
    "推理出用原版机制实现它的方案，再拆解成一组结构化指令意图。",
    `目标版本: ${version}。`,
    buildMechanicsGuide(),
    buildSupportedCommands(),
    "",
    "只输出 JSON 对象，形如：",
    '{ "intents": [ { "command": "give", "form": { "item": "minecraft:diamond_sword", "count": 1, "enchantments": [{"id":"minecraft:sharpness","level":5}] } } ], "explanation": "一句话中文说明（若需放命令方块或有使用前提，在此说明）" }',
    "不要输出任何 JSON 以外的内容，不要拼写最终命令字符串（命令由本地确定性构建器生成）。",
    "explanation 要说清这套命令如何达成效果、是否需要放入命令方块、有何使用前提。",
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
