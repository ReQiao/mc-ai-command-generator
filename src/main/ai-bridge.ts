/**
 * AI bridge — 调用 Qwen（DashScope 兼容 OpenAI 接口），把自然语言翻译成「指令意图」。
 *
 * 关键设计：
 *   - AI 只产出结构化意图（CommandIntent[]），不拼写精确语法。
 *   - 用 OpenAI 兼容的 chat/completions + JSON 输出（response_format: json_object）。
 *   - 真正的命令字符串由 dispatch.ts → commands/* 确定性生成，杜绝 AI 语法幻觉落地。
 *
 * 运行在 Electron 主进程（Node 环境）：API key 不暴露给渲染进程。
 *
 * ⚠️ 骨架阶段：网络调用已实现，但需要有效的 DASHSCOPE_API_KEY 才能真正联网。
 *   未配置 key 时 generateIntents 抛出明确错误，UI 可据此提示用户。
 */

import type { CommandIntent } from "../shared/logic/dispatch";
import type { GiveVersion } from "../shared/logic/types";

const DEFAULT_ENDPOINT =
  process.env.DASHSCOPE_ENDPOINT ??
  "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const DEFAULT_MODEL = process.env.DASHSCOPE_MODEL ?? "qwen-plus";

/** 支持的指令清单（P1）——同时作为给 AI 的 schema 说明。 */
const SUPPORTED_COMMANDS = `
你只能产出以下 command 类型的意图，每条 form 字段如下（缺省字段会用合理默认值补全）：

- give        { target?: "@a", item: "中文或英文物品名", count?: number, ...组件 }
- say         { message: string }
- effect_give { target: string, effect: "minecraft:speed", duration?: number|"infinite", amplifier?: number, hideParticles?: boolean }
- effect_clear{ target: string, effect?: string }
- tp          坐标式 { targets: string, x: string, y: string, z: string, yRot?, xRot? }
              或实体式 { targets: string, destination: string }
- setblock    { x: string, y: string, z: string, block: "minecraft:stone", blockstate?: "axis=x", mode?: "replace"|"keep"|"destroy" }
- summon      { entityType: "minecraft:pig", x?, y?, z?, noAI?, silent?, customName? }

坐标统一用字符串，支持绝对("0")、相对("~"/"~1")、本地("^"/"^1")。`;

function systemPrompt(version: GiveVersion): string {
  return [
    "你是 Minecraft 指令生成助手。把用户的自然语言需求拆解成一组结构化指令意图。",
    `目标版本: ${version}。`,
    SUPPORTED_COMMANDS,
    "",
    "只输出 JSON 对象，形如：",
    '{ "intents": [ { "command": "give", "form": { "item": "钻石剑", "count": 1 } } ], "explanation": "一句话中文说明" }',
    "不要输出任何 JSON 以外的内容，不要拼写最终命令字符串（命令由本地确定性构建器生成）。",
  ].join("\n");
}

export interface AiResult {
  intents: CommandIntent[];
  explanation: string;
  /** 计费用：本次消耗的 token 数（若 API 返回）。 */
  usage?: { prompt: number; completion: number; total: number };
}

export class AiBridgeError extends Error {}

/**
 * 调用 Qwen，把自然语言翻译为指令意图。
 * @throws AiBridgeError 当未配置 key 或 API 返回异常时
 */
export async function generateIntents(
  text: string,
  version: GiveVersion,
  opts: { apiKey?: string; model?: string; signal?: AbortSignal } = {},
): Promise<AiResult> {
  const apiKey = opts.apiKey ?? process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new AiBridgeError(
      "未配置 DASHSCOPE_API_KEY。请在 .env 或设置中填入通义千问 API key 后重试。",
    );
  }

  const body = {
    model: opts.model ?? DEFAULT_MODEL,
    messages: [
      { role: "system", content: systemPrompt(version) },
      { role: "user", content: text },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  };

  let resp: Response;
  try {
    resp = await fetch(DEFAULT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (err) {
    throw new AiBridgeError(`网络错误，无法连接 Qwen API: ${String(err)}`);
  }

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new AiBridgeError(`Qwen API 返回 ${resp.status}: ${detail.slice(0, 300)}`);
  }

  const json = (await resp.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new AiBridgeError("Qwen API 响应为空。");

  let parsed: { intents?: CommandIntent[]; explanation?: string };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AiBridgeError(`无法解析 Qwen 返回的 JSON: ${content.slice(0, 200)}`);
  }
  if (!Array.isArray(parsed.intents)) {
    throw new AiBridgeError("Qwen 返回缺少 intents 数组。");
  }

  return {
    intents: parsed.intents,
    explanation: parsed.explanation ?? "",
    usage: json.usage
      ? {
          prompt: json.usage.prompt_tokens ?? 0,
          completion: json.usage.completion_tokens ?? 0,
          total: json.usage.total_tokens ?? 0,
        }
      : undefined,
  };
}
