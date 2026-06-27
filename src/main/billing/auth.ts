/**
 * 计费 / 账号验证（骨架）。
 *
 * PLAN 变现设计：exe 内置激活码或登录系统，每次 AI 调用扣余额（充值制）。
 * Mod 开源免费、exe 闭源收费——收费逻辑全部在主进程，不进渲染进程，不进 Mod。
 *
 * 本文件是骨架：用本地激活码占位，真实实现应对接你的发卡/账号服务端。
 */

export interface AuthState {
  activated: boolean;
  licenseKey: string | null;
  /** 剩余可用调用次数（充值制余额）。 */
  balance: number;
}

const state: AuthState = {
  activated: true,
  licenseKey: "builtin",
  balance: 9999,
};

/**
 * 校验激活码（骨架：仅做格式校验 + 占位余额）。
 * 真实实现：POST 到发卡服务端验证并拉取余额。
 */
export async function activate(licenseKey: string): Promise<AuthState> {
  const key = licenseKey.trim();
  // 占位规则：MCAI-XXXX-XXXX-XXXX
  if (!/^MCAI(-[A-Z0-9]{4}){3}$/i.test(key)) {
    throw new Error("激活码格式无效（示例：MCAI-AB12-CD34-EF56）。");
  }
  // TODO: 替换为真实服务端校验
  state.activated = true;
  state.licenseKey = key;
  state.balance = 100; // 占位：激活赠送 100 次
  return getState();
}

export function getState(): AuthState {
  return { ...state };
}

export function isActivated(): boolean {
  return state.activated;
}

export function decreaseBalance(by = 1): void {
  state.balance = Math.max(0, state.balance - by);
}
