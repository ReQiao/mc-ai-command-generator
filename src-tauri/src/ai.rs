//! AI bridge（Rust 后端）——调用 Qwen（DashScope 兼容 OpenAI 接口）。
//!
//! 关键设计：
//!   - 系统提示词由前端（webview）用 catalog 构造后传入，本模块只负责「注入 key + 联网」。
//!   - API key 留在后端进程：用户填写的 key > 环境变量 DASHSCOPE_API_KEY > 内置 key。
//!   - 返回 AI 的原始 JSON 文本（content），由前端解析为指令意图并确定性构建命令字符串。
//!   - AI 成功后扣 1 次余额。

use crate::billing::Billing;
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiUsage {
    pub prompt: u32,
    pub completion: u32,
    pub total: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiResponse {
    pub ok: bool,
    /// AI 返回的原始 JSON 文本（成功时）。
    pub content: Option<String>,
    /// 失败原因（失败时）。
    pub error: Option<String>,
    pub usage: Option<AiUsage>,
    /// 当前剩余余额（扣减后）。
    pub balance: i64,
}

impl AiResponse {
    fn err(msg: impl Into<String>, balance: i64) -> Self {
        AiResponse {
            ok: false,
            content: None,
            error: Some(msg.into()),
            usage: None,
            balance,
        }
    }
}

const DEFAULT_ENDPOINT: &str =
    "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const DEFAULT_MODEL: &str = "qwen-plus";

/// 内置 API key（变现用）。当前返回 None——内置 key 需用户重新签发后再以混淆形式嵌入。
fn builtin_key() -> Option<String> {
    None
}

/// 解析出可用的 API key：用户传入 > 环境变量 > 内置。
fn resolve_key(user_key: Option<String>) -> Option<String> {
    user_key
        .filter(|k| !k.trim().is_empty())
        .or_else(|| std::env::var("DASHSCOPE_API_KEY").ok())
        .filter(|k| !k.trim().is_empty())
        .or_else(builtin_key)
}

/// 自然语言 → AI 指令意图（原始 JSON 文本）。
#[tauri::command]
pub async fn ai_generate(
    system_prompt: String,
    user_text: String,
    api_key: Option<String>,
    billing: tauri::State<'_, Billing>,
) -> Result<AiResponse, ()> {
    // 1. 余额检查（不要把 MutexGuard 跨越 await 持有）
    let balance_before = billing.balance();
    if balance_before <= 0 {
        return Ok(AiResponse::err("余额不足，请先激活/充值。", balance_before));
    }

    // 2. 解析 key
    let key = match resolve_key(api_key) {
        Some(k) => k,
        None => {
            return Ok(AiResponse::err(
                "未配置 DASHSCOPE_API_KEY。请在设置中填入通义千问 API key 后重试。",
                balance_before,
            ))
        }
    };

    let endpoint =
        std::env::var("DASHSCOPE_ENDPOINT").unwrap_or_else(|_| DEFAULT_ENDPOINT.to_string());
    let model = std::env::var("DASHSCOPE_MODEL").unwrap_or_else(|_| DEFAULT_MODEL.to_string());

    let body = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": user_text },
        ],
        "response_format": { "type": "json_object" },
        "temperature": 0.2,
    });

    // 3. 联网
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
    {
        Ok(c) => c,
        Err(e) => return Ok(AiResponse::err(format!("创建 HTTP 客户端失败: {e}"), balance_before)),
    };

    let resp = client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {key}"))
        .json(&body)
        .send()
        .await;

    let resp = match resp {
        Ok(r) => r,
        Err(e) => {
            return Ok(AiResponse::err(
                format!("网络错误，无法连接 Qwen API: {e}"),
                balance_before,
            ))
        }
    };

    let status = resp.status();
    if !status.is_success() {
        let detail = resp.text().await.unwrap_or_default();
        let detail: String = detail.chars().take(300).collect();
        return Ok(AiResponse::err(
            format!("Qwen API 返回 {status}: {detail}"),
            balance_before,
        ));
    }

    let json: serde_json::Value = match resp.json().await {
        Ok(v) => v,
        Err(e) => return Ok(AiResponse::err(format!("解析 Qwen 响应失败: {e}"), balance_before)),
    };

    let content = json
        .pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let content = match content {
        Some(c) if !c.trim().is_empty() => c,
        _ => return Ok(AiResponse::err("Qwen API 响应为空。", balance_before)),
    };

    let usage = json.get("usage").map(|u| AiUsage {
        prompt: u.get("prompt_tokens").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
        completion: u
            .get("completion_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32,
        total: u.get("total_tokens").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
    });

    // 4. 成功——扣 1 次余额
    let balance = billing.consume();

    Ok(AiResponse {
        ok: true,
        content: Some(content),
        error: None,
        usage,
        balance,
    })
}
