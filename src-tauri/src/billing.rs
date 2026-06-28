//! 计费 / 账号验证（骨架）。
//!
//! 变现设计：exe 内置激活码或登录系统，每次 AI 调用扣余额（充值制）。
//! Mod 开源免费、exe 闭源收费——收费逻辑全部在 Rust 后端，不进 webview，不进 Mod。
//!
//! 本文件是骨架：用本地激活码占位，真实实现应对接发卡/账号服务端。

use serde::Serialize;
use std::sync::Mutex;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthState {
    pub activated: bool,
    pub license_key: Option<String>,
    /// 剩余可用调用次数（充值制余额）。
    pub balance: i64,
}

impl Default for AuthState {
    fn default() -> Self {
        AuthState {
            activated: true,
            license_key: Some("builtin".to_string()),
            balance: 9999,
        }
    }
}

/// Tauri 托管的全局计费状态。
pub struct Billing(pub Mutex<AuthState>);

impl Default for Billing {
    fn default() -> Self {
        Billing(Mutex::new(AuthState::default()))
    }
}

impl Billing {
    /// 当前余额快照。
    pub fn balance(&self) -> i64 {
        self.0.lock().unwrap().balance
    }

    /// 扣减一次余额，返回扣减后的余额（最低 0）。
    pub fn consume(&self) -> i64 {
        let mut st = self.0.lock().unwrap();
        st.balance = (st.balance - 1).max(0);
        st.balance
    }
}

/// 读取账号/余额状态。
#[tauri::command]
pub fn billing_state(billing: tauri::State<'_, Billing>) -> AuthState {
    billing.0.lock().unwrap().clone()
}

/// 校验激活码（骨架：仅做格式校验 + 占位余额）。
/// 占位规则：MCAI-XXXX-XXXX-XXXX（X 为大写字母或数字）。
#[tauri::command]
pub fn billing_activate(
    license_key: String,
    billing: tauri::State<'_, Billing>,
) -> Result<AuthState, String> {
    let key = license_key.trim().to_string();
    if !is_valid_license(&key) {
        return Err("激活码格式无效（示例：MCAI-AB12-CD34-EF56）。".to_string());
    }
    let mut st = billing.0.lock().unwrap();
    st.activated = true;
    st.license_key = Some(key);
    st.balance = 100; // 占位：激活赠送 100 次
    Ok(st.clone())
}

/// 校验 MCAI-XXXX-XXXX-XXXX 格式（大小写不敏感）。
fn is_valid_license(key: &str) -> bool {
    let parts: Vec<&str> = key.split('-').collect();
    if parts.len() != 4 {
        return false;
    }
    if !parts[0].eq_ignore_ascii_case("MCAI") {
        return false;
    }
    parts[1..]
        .iter()
        .all(|seg| seg.len() == 4 && seg.chars().all(|c| c.is_ascii_alphanumeric()))
}
