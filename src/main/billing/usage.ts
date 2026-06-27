/**
 * 调用计数 / 扣费（骨架）。
 *
 * 每次成功的 AI 调用扣 1 次余额（或按 token 计费）。
 * 真实实现应把扣费上报服务端做防作弊核对；本地仅做乐观扣减 + 缓存。
 */

import { getState, decreaseBalance } from "./auth";

export interface UsageRecord {
  at: number;
  prompt: string;
  tokens?: number;
}

const history: UsageRecord[] = [];

/** 调用前检查是否还有余额。 */
export function canConsume(): boolean {
  return getState().balance > 0;
}

/**
 * 记录一次调用并扣减余额。
 * @returns 扣减后的剩余余额
 */
export function consume(record: Omit<UsageRecord, "at">): number {
  const s = getState();
  if (s.balance <= 0) throw new Error("余额不足，请充值后再使用。");
  history.push({ ...record, at: Date.now() });
  decreaseBalance(1);
  return getState().balance;
}

export function getHistory(): UsageRecord[] {
  return [...history];
}
