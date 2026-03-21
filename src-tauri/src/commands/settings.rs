use std::process::Command;
use std::sync::Arc;
use semver::Version;
use tauri::State;

use crate::core::{central_repo, error::AppError, skill_store::SkillStore};

#[derive(serde::Serialize)]
pub struct AppUpdateInfo {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_url: String,
}

#[tauri::command]
pub async fn get_settings(key: String, store: State<'_, Arc<SkillStore>>) -> Result<Option<String>, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        store.get_setting(&key).map_err(AppError::db)
    })
    .await?
}

#[tauri::command]
pub async fn set_settings(
    key: String,
    value: String,
    store: State<'_, Arc<SkillStore>>,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        store.set_setting(&key, &value).map_err(AppError::db)
    })
    .await?
}

#[tauri::command]
pub fn get_central_repo_path() -> String {
    central_repo::base_dir().to_string_lossy().to_string()
}

#[tauri::command]
pub async fn open_central_repo_folder() -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(|| {
        let repo_path = central_repo::base_dir();

        #[cfg(target_os = "macos")]
        let mut cmd = Command::new("open");
        #[cfg(target_os = "windows")]
        let mut cmd = {
            let mut c = Command::new("explorer");
            use std::os::windows::process::CommandExt;
            c.creation_flags(0x08000000); // CREATE_NO_WINDOW
            c
        };
        #[cfg(target_os = "linux")]
        let mut cmd = Command::new("xdg-open");

        let status = cmd
            .arg(&repo_path)
            .status()
            .map_err(|e| AppError::io(format!("Failed to open folder: {e}")))?;

        // Windows explorer.exe returns exit code 1 even on success
        #[cfg(not(target_os = "windows"))]
        if !status.success() {
            return Err(AppError::io(format!("File manager exited with status: {status}")));
        }

        let _ = status;
        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn check_app_update(app: tauri::AppHandle) -> Result<AppUpdateInfo, AppError> {
    let current_version = app.config().version.clone().unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || {
        let client = reqwest::blocking::Client::builder()
            .user_agent("skills-manager")
            .build()
            .map_err(AppError::network)?;

        let resp: serde_json::Value = client
            .get("https://api.github.com/repos/xingkongliang/skills-manager/releases/latest")
            .send()
            .map_err(|e| AppError::network(format!("Network error: {e}")))?
            .json()
            .map_err(|e| AppError::network(format!("Failed to parse response: {e}")))?;

        let tag = resp["tag_name"]
            .as_str()
            .ok_or_else(|| AppError::network("No tag_name in response"))?;
        let latest_version = tag.strip_prefix('v').unwrap_or(tag).to_string();
        let release_url = resp["html_url"]
            .as_str()
            .unwrap_or("https://github.com/xingkongliang/skills-manager/releases")
            .to_string();

        let has_update = version_gt(&latest_version, &current_version);

        Ok(AppUpdateInfo {
            has_update,
            current_version,
            latest_version,
            release_url,
        })
    })
    .await?
}

#[tauri::command]
pub fn app_exit(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub async fn hide_to_tray(window: tauri::WebviewWindow) -> Result<(), AppError> {
    window.hide().map_err(|e| AppError::io(e.to_string()))
}

fn version_gt(a: &str, b: &str) -> bool {
    // Prefer strict SemVer comparison (supports pre-release/build metadata).
    if let (Ok(a_ver), Ok(b_ver)) = (Version::parse(a), Version::parse(b)) {
        return a_ver > b_ver;
    }

    // Fallback for non-SemVer tags.
    let parse = |s: &str| -> Vec<u64> { s.split('.').filter_map(|p| p.parse().ok()).collect() };
    parse(a) > parse(b)
}
