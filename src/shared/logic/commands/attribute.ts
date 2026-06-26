/**
 * /attribute 指令构建器。
 *
 * 这是 P2 里唯一需要真正版本分支的指令，存在两条相互独立的版本边界：
 *
 * 【边界 A：属性 id 前缀】（与实体 NBT 同一注册表，semantic-probe 1.20.6/1.21.5 实证）
 *   - 1.20.5 ~ 1.21.4：带类别前缀，如 minecraft:generic.max_health
 *   - 1.21.5+（含 26.x）：去前缀，如 minecraft:max_health
 *   复用 isModernNbtFamily 判定（与 nbt.ts 的属性序列化边界一致）。
 *
 * 【边界 B：modifier 子命令格式】（1.21 属性系统重写）
 *   - 1.20.5 / 1.20.6：modifier add <uuid> <name> <value> <operation>
 *       operation ∈ {add, multiply_base, multiply}
 *       remove / value get 用 <uuid>
 *   - 1.21+：modifier add <id> <value> <operation>           （无独立 name）
 *       operation ∈ {add_value, add_multiplied_base, add_multiplied_total}
 *       remove / value get 用 <id>（资源 id）
 *
 * 语法（其余子命令跨版本一致）：
 *   attribute <target> <attribute> get [<scale>]
 *   attribute <target> <attribute> base get [<scale>]
 *   attribute <target> <attribute> base set <value>
 *   attribute <target> <attribute> modifier add ...
 *   attribute <target> <attribute> modifier remove ...
 *   attribute <target> <attribute> modifier value get ... [<scale>]
 */

import { namespaced, fmtNumber } from "../snbt";
import type { GiveVersion } from "../types";
import { isModernNbtFamily } from "./nbt";

/** 归一化的运算类型（与版本无关），输出时按版本映射到具体关键字。 */
export type AttributeOperation = "add" | "multiply_base" | "multiply_total";

export type AttributeAction =
  | { kind: "get"; scale?: number }
  | { kind: "base_get"; scale?: number }
  | { kind: "base_set"; value: number }
  | {
      kind: "modifier_add";
      /** 1.21+ 为资源 id（如 "minecraft:my_buff"）；1.20.5/1.20.6 为 UUID 字符串。 */
      id: string;
      /** 仅 1.20.5/1.20.6 需要；1.21+ 忽略。 */
      name?: string;
      value: number;
      operation: AttributeOperation;
    }
  | { kind: "modifier_remove"; id: string }
  | { kind: "modifier_value_get"; id: string; scale?: number };

export interface AttributeForm {
  version: GiveVersion;
  withSlash?: boolean;
  target: string;
  /** 属性 id，输入可带或不带 generic. / minecraft: 前缀，builder 按版本归一化。 */
  attribute: string;
  action: AttributeAction;
}

/** 1.20.5/1.20.6 使用旧版 modifier 格式（UUID + name + 旧运算名）。 */
function isLegacyModifierFamily(version: GiveVersion): boolean {
  return version === "java_1_20_5";
}

/** 按版本归一化属性 id（边界 A）。 */
function normalizeAttributeId(raw: string, withGeneric: boolean): string {
  let name = raw.trim();
  if (name.startsWith("minecraft:")) name = name.slice("minecraft:".length);
  if (name.startsWith("generic.")) name = name.slice("generic.".length);
  return withGeneric ? `minecraft:generic.${name}` : `minecraft:${name}`;
}

/** 按版本映射运算关键字（边界 B）。 */
function operationKeyword(op: AttributeOperation, legacy: boolean): string {
  if (legacy) {
    switch (op) {
      case "add":
        return "add";
      case "multiply_base":
        return "multiply_base";
      case "multiply_total":
        return "multiply";
    }
  }
  switch (op) {
    case "add":
      return "add_value";
    case "multiply_base":
      return "add_multiplied_base";
    case "multiply_total":
      return "add_multiplied_total";
  }
}

export function buildAttributeCommand(form: AttributeForm): string {
  const legacy = isLegacyModifierFamily(form.version);
  const withGeneric = !isModernNbtFamily(form.version); // 1.20.5~1.21.4 带 generic.
  const attr = normalizeAttributeId(form.attribute, withGeneric);
  const head = `attribute ${form.target} ${attr}`;
  const a = form.action;

  let cmd: string;
  switch (a.kind) {
    case "get":
      cmd = `${head} get`;
      if (a.scale !== undefined) cmd += ` ${fmtNumber(a.scale)}`;
      break;
    case "base_get":
      cmd = `${head} base get`;
      if (a.scale !== undefined) cmd += ` ${fmtNumber(a.scale)}`;
      break;
    case "base_set":
      cmd = `${head} base set ${fmtNumber(a.value)}`;
      break;
    case "modifier_add": {
      const op = operationKeyword(a.operation, legacy);
      if (legacy) {
        // 旧格式：<uuid> <name> <value> <operation>
        const name = a.name ?? a.id;
        cmd = `${head} modifier add ${a.id} ${name} ${fmtNumber(a.value)} ${op}`;
      } else {
        // 新格式：<id> <value> <operation>
        cmd = `${head} modifier add ${namespaced(a.id)} ${fmtNumber(a.value)} ${op}`;
      }
      break;
    }
    case "modifier_remove":
      cmd = `${head} modifier remove ${legacy ? a.id : namespaced(a.id)}`;
      break;
    case "modifier_value_get":
      cmd = `${head} modifier value get ${legacy ? a.id : namespaced(a.id)}`;
      if (a.scale !== undefined) cmd += ` ${fmtNumber(a.scale)}`;
      break;
    default: {
      const _exhaustive: never = a;
      throw new Error(`未知 attribute 动作: ${JSON.stringify(_exhaustive)}`);
    }
  }

  return form.withSlash ? `/${cmd}` : cmd;
}
