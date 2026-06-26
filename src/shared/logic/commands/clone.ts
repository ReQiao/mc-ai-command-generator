/**
 * /clone 指令构建器。
 *
 * 语法（1.20.5+ 全版本一致，含 1.19.4+ 引入的跨维度形式）：
 *   clone [from <dim>] <begin> <end> [to <dim>] <dest> [replace|masked|filtered <filter>] [normal|force|move]
 *
 * 维度可选：仅在指定 fromDimension/toDimension 时输出 from/to 段。
 * 遮罩模式 filtered 需附带过滤方块；replace/masked 不带。
 * 命令结构跨版本无差异。
 *
 * 坐标支持绝对（0）、相对（~、~1）。注意：/clone 不支持本地坐标（^）。
 */

import { namespaced } from "../snbt";
import type { Coords, BlockFilter } from "./fill";

export type CloneMaskMode = "replace" | "masked" | "filtered";
export type CloneMode = "normal" | "force" | "move";

export interface CloneForm {
  withSlash?: boolean;
  /** 源维度，如 "minecraft:the_nether"。省略则用执行者所在维度。 */
  fromDimension?: string;
  begin: Coords;
  end: Coords;
  /** 目标维度。省略则与源维度一致。 */
  toDimension?: string;
  destination: Coords;
  maskMode?: CloneMaskMode;
  /** maskMode === "filtered" 时必填的过滤方块。 */
  filter?: BlockFilter;
  cloneMode?: CloneMode;
}

function blockSpec(filter: BlockFilter): string {
  const state = filter.blockstate ? `[${filter.blockstate}]` : "";
  return `${namespaced(filter.block)}${state}`;
}

export function buildCloneCommand(form: CloneForm): string {
  const parts: string[] = ["clone"];

  if (form.fromDimension) parts.push("from", namespaced(form.fromDimension));
  parts.push(form.begin.join(" "), form.end.join(" "));
  if (form.toDimension) parts.push("to", namespaced(form.toDimension));
  parts.push(form.destination.join(" "));

  // 遮罩模式：filtered 必须带过滤方块；force/move 等克隆模式可叠加。
  if (form.maskMode === "filtered") {
    if (!form.filter) throw new Error("clone filtered 模式需要提供 filter 过滤方块。");
    parts.push("filtered", blockSpec(form.filter));
  } else if (form.maskMode && form.maskMode !== "replace") {
    parts.push(form.maskMode);
  }

  if (form.cloneMode && form.cloneMode !== "normal") {
    // cloneMode 必须跟在 maskMode 之后；若未指定 maskMode 则补默认 replace。
    if (!form.maskMode) parts.push("replace");
    parts.push(form.cloneMode);
  }

  const cmd = parts.join(" ");
  return form.withSlash ? `/${cmd}` : cmd;
}
