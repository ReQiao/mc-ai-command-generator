//! Datapack 部署模块：扫描 .minecraft/saves，打包命令为 datapack，部署到存档。

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Clone, Serialize, Deserialize)]
pub struct SaveInfo {
    pub name: String,
    pub path: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployResult {
    pub ok: bool,
    pub message: Option<String>,
    /// 是否通过 Mod 自动 reload（若 Mod 离线则为 false）
    pub reloaded: bool,
    /// Mod 离线时的 fallback 文本（用户需手动复制到游戏）
    pub clipboard_fallback: Option<String>,
}

impl DeployResult {
    fn ok() -> Self {
        DeployResult {
            ok: true,
            message: None,
            reloaded: false,
            clipboard_fallback: None,
        }
    }

    fn err(msg: impl Into<String>) -> Self {
        DeployResult {
            ok: false,
            message: Some(msg.into()),
            reloaded: false,
            clipboard_fallback: None,
        }
    }
}

/// 获取 .minecraft 目录
fn minecraft_dir() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        // Windows: %APPDATA%\.minecraft
        return dirs::config_dir()
            .map(|d| d.join(".minecraft"))
            .ok_or_else(|| "无法定位 %APPDATA% 目录".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        // macOS: ~/Library/Application Support/minecraft
        return dirs::home_dir()
            .map(|d| d.join("Library/Application Support/minecraft"))
            .ok_or_else(|| "无法定位用户主目录".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        // Linux: ~/.minecraft
        return dirs::home_dir()
            .map(|d| d.join(".minecraft"))
            .ok_or_else(|| "无法定位用户主目录".to_string());
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Err("不支持的操作系统".to_string())
    }
}

/// 扫描 .minecraft/saves，返回所有存档列表。
#[tauri::command]
pub async fn datapack_list_saves() -> Result<Vec<SaveInfo>, String> {
    let mc_dir = minecraft_dir()?;
    let saves_dir = mc_dir.join("saves");

    if !saves_dir.exists() {
        return Ok(Vec::new());
    }

    let mut saves = Vec::new();
    match tokio::fs::read_dir(&saves_dir).await {
        Ok(mut entries) => {
            while let Ok(Some(entry)) = entries.next_entry().await {
                if let Ok(metadata) = entry.metadata().await {
                    if metadata.is_dir() {
                        if let Some(name) = entry.file_name().to_str() {
                            if let Some(path) = entry.path().to_str() {
                                saves.push(SaveInfo {
                                    name: name.to_string(),
                                    path: path.to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }
        Err(e) => return Err(format!("读取 saves 目录失败: {e}")),
    }

    saves.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(saves)
}

/// 根据版本选择合适的 pack_format
fn pack_format_for_version(version: &str) -> i32 {
    match version {
        v if v.starts_with("1.20.5") || v.starts_with("1.20.6") => 41,
        v if v.starts_with("1.21.0") || v.starts_with("1.21.1") => 48,
        v if v.starts_with("1.21.2") || v.starts_with("1.21.3") => 57,
        v if v.starts_with("1.21.4") => 61,
        _ => 71, // 1.21.5+ 及更新版本
    }
}

#[derive(serde::Deserialize)]
pub struct DeployArgs {
    pub save_path: String,
    pub commands: Vec<String>,
    pub version: String,
}

/// 部署 datapack 到指定存档
#[tauri::command]
pub async fn datapack_deploy(args: DeployArgs) -> DeployResult {
    let save_path = PathBuf::from(&args.save_path);
    let datapacks_dir = save_path.join("datapacks");
    let mcai_dir = datapacks_dir.join("mcai_commands");
    let data_dir = mcai_dir.join("data/mcai/function");

    // 创建文件夹结构
    if let Err(e) = tokio::fs::create_dir_all(&data_dir).await {
        return DeployResult::err(format!("创建 datapack 目录失败: {e}"));
    }

    // 写入 pack.mcmeta
    let pack_format = pack_format_for_version(&args.version);
    let pack_meta = serde_json::json!({
        "pack": {
            "pack_format": pack_format,
            "description": "MC AI 指令生成器"
        }
    });
    let mcmeta_path = mcai_dir.join("pack.mcmeta");
    if let Err(e) = tokio::fs::write(&mcmeta_path, pack_meta.to_string()).await {
        return DeployResult::err(format!("写入 pack.mcmeta 失败: {e}"));
    }

    // 写入 run.mcfunction（命令去掉前导 /）
    let mcfunction_content = args
        .commands
        .iter()
        .map(|cmd| cmd.strip_prefix('/').unwrap_or(cmd).to_string())
        .collect::<Vec<_>>()
        .join("\n");

    let run_path = data_dir.join("run.mcfunction");
    if let Err(e) = tokio::fs::write(&run_path, mcfunction_content).await {
        return DeployResult::err(format!("写入 run.mcfunction 失败: {e}"));
    }

    // Mod 离线时的 fallback：用户手动复制到游戏聊天栏输入即可加载并运行
    let reload_fallback = "/reload\n/function mcai:run".to_string();

    // 部署成功。reload 由前端决定：若 Mod 在线则调用 mod_send 自动 reload，
    // 否则把 fallback 文本复制到剪贴板提示用户手动输入。
    let mut result = DeployResult::ok();
    result.clipboard_fallback = Some(reload_fallback);

    result
}
