/**
 * /fill 指令构建器。
 *
 * 语法（1.20.5+ 全版本一致）：
 *   fill <from x y z> <to x y z> <block>[blockstate]{nbt} [destroy|hollow|keep|outline|replace]
 *   fill <from> <to> <block> replace <filterBlock>[filterState]
 *
 * 方块参数与 /setblock 同源：blockstate 用 [..]，方块实体 NBT 用 {..}，两者紧贴方块 id。
 * 命令结构跨版本无差异；唯一版本敏感点在方块/NBT 自身，由调用方按版本传入。
 *
 * 坐标支持绝对（0）、相对（~、~1）、本地（^、^1）。
 */

import { namespaced } from "../snbt";

export type FillMode = "replace" | "destroy" | "hollow" | "keep" | "outline";

export type Coords = [string, string, string];

export interface BlockFilter {
  block: string;
  blockstate?: string;
}

export interface FillForm {
  withSlash?: boolean;
  from: Coords;
  to: Coords;
  block: string;
  blockstate?: string;
  /** 已序列化的方块实体 NBT 片段，如 `{Command:"say hi"}`。 */
  nbt?: string;
  mode?: FillMode;
  /** mode 省略或为 "replace" 时，可指定只替换的目标方块。 */
  replaceFilter?: BlockFilter;
}

/** 把 block + blockstate + nbt 拼成紧贴的方块参数。 */
function blockSpec(block: string, blockstate?: string, nbt?: string): string {
  const state = blockstate ? `[${blockstate}]` : "";
  const tag = nbt ? nbt.trim() : "";
  return `${namespaced(block)}${state}${tag}`;
}

export function buildFillCommand(form: FillForm): string {
  const from = form.from.join(" ");
  const to = form.to.join(" ");
  const block = blockSpec(form.block, form.blockstate, form.nbt);

  let cmd = `fill ${from} ${to} ${block}`;

  if (form.replaceFilter) {
    // replace + 过滤方块（mode 必为 replace，显式写出）
    const filter = blockSpec(form.replaceFilter.block, form.replaceFilter.blockstate);
    cmd += ` replace ${filter}`;
  } else if (form.mode && form.mode !== "replace") {
    cmd += ` ${form.mode}`;
  }

  return form.withSlash ? `/${cmd}` : cmd;
}
