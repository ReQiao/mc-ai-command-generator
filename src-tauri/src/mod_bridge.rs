//! Mod bridge（Rust 后端）——把命令字符串 POST 到本机 Fabric Mod 的 HTTP 监听端口（默认 25580）。
//!
//! Mod 是纯接收端：收到 { cmd } 后用 ClientCommandManager 在游戏内执行；
//! 收到 { pos, cmd } 后放置带 Command NBT 的命令方块。

use serde::{Deserialize, Serialize};
use std::time::Duration;

const DEFAULT_HOST: &str = "127.0.0.1";
const DEFAULT_PORT: u16 = 25580;

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModResponse {
    pub ok: bool,
    /// Mod 端返回的原始消息（执行结果或错误）。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// 玩家是否拥有 OP 权限（非 OP 时 setblock command_block 会失败）。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_op: Option<bool>,
}

impl ModResponse {
    fn fail(msg: impl Into<String>) -> Self {
        ModResponse {
            ok: false,
            message: Some(msg.into()),
            is_op: None,
        }
    }
}

fn base_url(port: Option<u16>) -> String {
    format!("http://{DEFAULT_HOST}:{}", port.unwrap_or(DEFAULT_PORT))
}

fn client(timeout_ms: u64) -> Result<reqwest::Client, reqwest::Error> {
    reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .build()
}

/// 解析 Mod 响应：优先按 JSON 解析，失败则用原始文本兜底。
fn parse_body(http_ok: bool, text: String) -> ModResponse {
    match serde_json::from_str::<ModResponse>(&text) {
        Ok(mut data) => {
            data.ok = http_ok && data.ok;
            data
        }
        Err(_) => ModResponse {
            ok: http_ok,
            message: if text.is_empty() { None } else { Some(text) },
            is_op: None,
        },
    }
}

async fn post_json(path: &str, payload: serde_json::Value, port: Option<u16>) -> ModResponse {
    let c = match client(3000) {
        Ok(c) => c,
        Err(e) => return ModResponse::fail(format!("创建 HTTP 客户端失败: {e}")),
    };
    let url = format!("{}{}", base_url(port), path);
    match c.post(&url).json(&payload).send().await {
        Ok(resp) => {
            let ok = resp.status().is_success();
            let text = resp.text().await.unwrap_or_default();
            parse_body(ok, text)
        }
        Err(e) => {
            let msg = if e.is_timeout() {
                "连接 Mod 超时——请确认游戏已启动并安装了 mc-ai-bridge Mod。".to_string()
            } else {
                format!("无法连接 Mod ({}): {e}", base_url(port))
            };
            ModResponse::fail(msg)
        }
    }
}

/// 探测 Mod 是否在线（GET /health）。
#[tauri::command]
pub async fn mod_ping(port: Option<u16>) -> ModResponse {
    let c = match client(1500) {
        Ok(c) => c,
        Err(e) => return ModResponse::fail(format!("创建 HTTP 客户端失败: {e}")),
    };
    let url = format!("{}/health", base_url(port));
    match c.get(&url).send().await {
        Ok(resp) => {
            let ok = resp.status().is_success();
            let text = resp.text().await.unwrap_or_default();
            parse_body(ok, text)
        }
        Err(_) => ModResponse::fail("Mod 未在线"),
    }
}

/// 批量执行命令（顺序发送，遇错继续，返回每条结果）。
#[tauri::command]
pub async fn mod_send(cmds: Vec<String>, port: Option<u16>) -> Vec<ModResponse> {
    let mut out = Vec::with_capacity(cmds.len());
    for cmd in cmds {
        out.push(post_json("/command", serde_json::json!({ "cmd": cmd }), port).await);
    }
    out
}

/// 在指定坐标放置带命令的命令方块（POST /setblock { pos, cmd }）。
#[tauri::command]
pub async fn mod_place_block(pos: (i32, i32, i32), cmd: String, port: Option<u16>) -> ModResponse {
    let payload = serde_json::json!({ "pos": [pos.0, pos.1, pos.2], "cmd": cmd });
    post_json("/setblock", payload, port).await
}
