/**
 * Mod bridge — 把命令字符串 POST 到本机 Fabric Mod 的 HTTP 监听端口（默认 25580）。
 *
 * Mod 是纯接收端：收到 { cmd } 后用 ClientCommandManager 在游戏内执行；
 * 收到 { pos, cmd } 后放置带 Command NBT 的命令方块。
 *
 * 运行在 Electron 主进程。端口可配置（PLAN 风险项：localhost 端口冲突）。
 */

const DEFAULT_PORT = Number(process.env.MOD_BRIDGE_PORT ?? 25580);
const DEFAULT_HOST = "127.0.0.1";

export interface ModBridgeOptions {
  host?: string;
  port?: number;
  timeoutMs?: number;
}

export interface ModResponse {
  ok: boolean;
  /** Mod 端返回的原始消息（如执行结果或错误）。 */
  message?: string;
  /** 玩家是否拥有 OP 权限（permissionLevel >= 2）；非 OP 时 setblock command_block 会失败。 */
  isOp?: boolean;
}

function baseUrl(opts: ModBridgeOptions): string {
  return `http://${opts.host ?? DEFAULT_HOST}:${opts.port ?? DEFAULT_PORT}`;
}

async function postJson(
  path: string,
  payload: unknown,
  opts: ModBridgeOptions,
): Promise<ModResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 3000);
  try {
    const resp = await fetch(`${baseUrl(opts)}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await resp.text();
    let data: ModResponse;
    try {
      data = JSON.parse(text);
    } catch {
      data = { ok: resp.ok, message: text };
    }
    return { ok: resp.ok && data.ok !== false, ...data };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error && err.name === "AbortError"
          ? "连接 Mod 超时——请确认游戏已启动并安装了 mc-ai-bridge Mod。"
          : `无法连接 Mod (${baseUrl(opts)}): ${String(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** 探测 Mod 是否在线（GET /health）。 */
export async function pingMod(opts: ModBridgeOptions = {}): Promise<ModResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 1500);
  try {
    const resp = await fetch(`${baseUrl(opts)}/health`, { signal: controller.signal });
    const data = (await resp.json().catch(() => ({}))) as ModResponse;
    return { ok: resp.ok, ...data };
  } catch {
    return { ok: false, message: "Mod 未在线" };
  } finally {
    clearTimeout(timer);
  }
}

/** 直接执行一条命令：POST /command { cmd }。 */
export function sendCommand(cmd: string, opts: ModBridgeOptions = {}): Promise<ModResponse> {
  return postJson("/command", { cmd }, opts);
}

/** 批量执行命令（顺序发送，遇错继续，返回每条结果）。 */
export async function sendCommands(
  cmds: string[],
  opts: ModBridgeOptions = {},
): Promise<ModResponse[]> {
  const out: ModResponse[] = [];
  for (const cmd of cmds) {
    out.push(await sendCommand(cmd, opts));
  }
  return out;
}

/** 在指定坐标放置带命令的命令方块：POST /setblock { pos, cmd }。 */
export function placeCommandBlock(
  pos: [number, number, number],
  cmd: string,
  opts: ModBridgeOptions = {},
): Promise<ModResponse> {
  return postJson("/setblock", { pos, cmd }, opts);
}
