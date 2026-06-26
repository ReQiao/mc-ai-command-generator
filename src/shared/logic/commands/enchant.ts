/**
 * /enchant 指令构建器。
 *
 * 语法（1.20.5+ 全版本一致）：
 *   enchant <targets> <enchantment> [<level>]
 *
 * enchantment 为资源 id（如 minecraft:sharpness）。level 省略时默认 1。
 * 命令结构跨版本无差异（附魔自 1.13 起即为资源 id，1.20.5 数据驱动化不影响命令语法）。
 *
 * 约束：/enchant 会校验附魔与目标物品是否兼容、是否超过最高等级，
 * 这些是运行时语义（服务器裁决），不是语法问题——builder 只负责语法正确。
 */

import { namespaced } from "../snbt";

export interface EnchantForm {
  withSlash?: boolean;
  targets: string;
  enchantment: string;
  /** 附魔等级。省略时默认 1。 */
  level?: number;
}

export function buildEnchantCommand(form: EnchantForm): string {
  const ench = namespaced(form.enchantment);
  const parts = [`enchant ${form.targets} ${ench}`];
  if (form.level !== undefined) parts.push(String(form.level));
  const cmd = parts.join(" ");
  return form.withSlash ? `/${cmd}` : cmd;
}
