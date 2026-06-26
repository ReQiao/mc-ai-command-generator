/**
 * /execute 指令构建器。
 *
 * 语法（1.20.5+ 全版本一致）：
 *   execute <subcommand>... run <command>
 *   execute <subcommand>...                  （以 if/unless 结尾，用于条件测试）
 *
 * 子命令自 1.13 重写后稳定，1.19.4 增补 on/summon/if biome/if dimension，
 * 1.20.5 增补 if items / store ... items —— 这些在 1.20.5+ 全部可用，无版本分支。
 *
 * 设计：execute 子命令组合性极强，builder 接收「已成形的子命令片段」数组（如
 * "as @a"、"at @s"、"if block ~ ~-1 ~ minecraft:stone"），按序拼接并附加 run。
 * 同时提供常用子命令的类型安全构造器（sub.*），降低 AI / 调用方拼错的概率。
 */

export interface ExecuteForm {
  withSlash?: boolean;
  /** 已成形的子命令片段，按顺序拼接。 */
  subcommands: string[];
  /**
   * 最终执行的命令（不带前导斜杠）。
   * 省略时表示这是一条纯条件测试（execute ... if ...），合法但需以 if/unless 结尾。
   */
  run?: string;
}

export function buildExecuteCommand(form: ExecuteForm): string {
  const subs = form.subcommands.map((s) => s.trim()).filter(Boolean);
  if (subs.length === 0) {
    throw new Error("execute 至少需要一个子命令。");
  }

  const parts = ["execute", ...subs];

  if (form.run !== undefined && form.run.trim() !== "") {
    parts.push("run", form.run.trim().replace(/^\//, ""));
  } else {
    // 无 run 时，最后一个子命令必须是条件（if/unless），否则服务器报错。
    const last = subs[subs.length - 1];
    if (!/^(if|unless)\b/.test(last)) {
      throw new Error("execute 无 run 时必须以 if/unless 子命令结尾。");
    }
  }

  const cmd = parts.join(" ");
  return form.withSlash ? `/${cmd}` : cmd;
}

// -----------------------------------------------------------------------
// 常用子命令构造器（可选使用，返回子命令片段字符串）
// -----------------------------------------------------------------------

export type Coords3 = [string, string, string];

export const sub = {
  as: (selector: string) => `as ${selector}`,
  at: (selector: string) => `at ${selector}`,
  positioned: (pos: Coords3) => `positioned ${pos.join(" ")}`,
  positionedAs: (selector: string) => `positioned as ${selector}`,
  rotated: (yaw: string, pitch: string) => `rotated ${yaw} ${pitch}`,
  rotatedAs: (selector: string) => `rotated as ${selector}`,
  facing: (pos: Coords3) => `facing ${pos.join(" ")}`,
  facingEntity: (selector: string, anchor: "eyes" | "feet" = "eyes") =>
    `facing entity ${selector} ${anchor}`,
  anchored: (anchor: "eyes" | "feet") => `anchored ${anchor}`,
  in: (dimension: string) => `in ${dimension}`,
  on: (relation: string) => `on ${relation}`,
  align: (axes: string) => `align ${axes}`,

  ifBlock: (pos: Coords3, block: string) => `if block ${pos.join(" ")} ${block}`,
  unlessBlock: (pos: Coords3, block: string) => `unless block ${pos.join(" ")} ${block}`,
  ifEntity: (selector: string) => `if entity ${selector}`,
  unlessEntity: (selector: string) => `unless entity ${selector}`,
  ifScoreMatches: (target: string, objective: string, range: string) =>
    `if score ${target} ${objective} matches ${range}`,
  ifPredicate: (predicate: string) => `if predicate ${predicate}`,

  storeResultScore: (target: string, objective: string) =>
    `store result score ${target} ${objective}`,
  storeSuccessScore: (target: string, objective: string) =>
    `store success score ${target} ${objective}`,
};
