//! Tauri 应用入口（库）。
//!
//! 职责：注册托管状态（计费）与 IPC 命令（AI / Mod / 计费），由 webview 通过
//! `@tauri-apps/api` 的 invoke 调用。联网与收费逻辑全部在此后端，不下放到 webview，不进 Mod。

mod ai;
mod billing;
mod mod_bridge;

use billing::Billing;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 从项目根目录加载 .env（DASHSCOPE_API_KEY 等）；找不到则忽略。
    let _ = dotenvy::dotenv();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Billing::default())
        .invoke_handler(tauri::generate_handler![
            ai::ai_generate,
            billing::billing_state,
            billing::billing_activate,
            mod_bridge::mod_ping,
            mod_bridge::mod_send,
            mod_bridge::mod_place_block,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
