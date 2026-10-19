//! Backend for the Set 10 mixing desk.
//!
//! The frontend keeps the mixing rules; Rust owns the things a browser cannot
//! do reliably: finding the extracted stems on disk, reading their durations
//! and persisting settings between runs.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize)]
pub struct StemScan {
    root: String,
    files: Vec<String>,
    durations: BTreeMap<String, f64>,
    missing: Vec<String>,
}

/// Folder that holds the converted stem files.
///
/// Order of resolution: repository checkout (development), bundled resources
/// (installed app), then the user data folder.
fn audio_root(app: &AppHandle) -> PathBuf {
    if cfg!(debug_assertions) {
        let mut dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        if dir.ends_with("src-tauri") {
            dir.pop();
        }
        let candidate = dir.join("assets").join("audio_ogg");
        if candidate.is_dir() {
            return candidate;
        }
    }
    if let Ok(resource) = app
        .path()
        .resolve("assets/audio_ogg", BaseDirectory::Resource)
    {
        if resource.is_dir() {
            return resource;
        }
    }
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("audio_ogg")
}

fn read_durations(directory: &Path) -> BTreeMap<String, f64> {
    let manifest = directory.join("durations.json");
    let Ok(raw) = fs::read_to_string(manifest) else {
        return BTreeMap::new();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

#[tauri::command]
fn asset_root(app: AppHandle) -> String {
    audio_root(&app).to_string_lossy().into_owned()
}

#[tauri::command]
fn scan_stems(app: AppHandle, required: Vec<String>) -> StemScan {
    let root = audio_root(&app);
    let durations = read_durations(&root);
    let mut files: Vec<String> = Vec::new();

    if let Ok(entries) = fs::read_dir(&root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) == Some("ogg") {
                if let Some(stem) = path.file_stem().and_then(|value| value.to_str()) {
                    files.push(stem.to_string());
                }
            }
        }
    }
    files.sort();

    let missing = required
        .into_iter()
        .filter(|name| !files.iter().any(|file| file == name))
        .collect();

    StemScan {
        root: root.to_string_lossy().into_owned(),
        files,
        durations,
        missing,
    }
}

fn settings_path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("settings.json")
}

/// Folder that holds the JSON rule and unit files.
fn data_root(app: &AppHandle) -> PathBuf {
    if cfg!(debug_assertions) {
        let mut dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        if dir.ends_with("src-tauri") {
            dir.pop();
        }
        let candidate = dir.join("data");
        if candidate.is_dir() {
            return candidate;
        }
    }
    if let Ok(resource) = app.path().resolve("data", BaseDirectory::Resource) {
        if resource.is_dir() {
            return resource;
        }
    }
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("data")
}

#[tauri::command]
fn load_data(app: AppHandle, name: String) -> Result<serde_json::Value, String> {
    if name.is_empty() || name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err("invalid data file name".to_string());
    }
    let path = data_root(&app).join(&name);
    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("cannot read {}: {error}", path.display()))?;
    serde_json::from_str(&raw).map_err(|error| format!("cannot parse {}: {error}", path.display()))
}

#[tauri::command]
fn load_settings(app: AppHandle) -> Option<serde_json::Value> {
    let raw = fs::read_to_string(settings_path(&app)).ok()?;
    serde_json::from_str(&raw).ok()
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: serde_json::Value) -> Result<(), String> {
    let path = settings_path(&app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let payload = serde_json::to_string_pretty(&settings).map_err(|error| error.to_string())?;
    fs::write(path, payload).map_err(|error| error.to_string())
}

#[tauri::command]
fn log_event(message: String) {
    println!("[desk] {message}");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // The asset protocol only serves paths inside its scope. The stem
            // folder depends on how the app was started (repository checkout,
            // bundled resources or user data), so allow whatever resolved.
            let root = audio_root(app.handle());
            let scope = app.asset_protocol_scope();
            if let Err(error) = scope.allow_directory(&root, true) {
                eprintln!("[desk] cannot expose {}: {error}", root.display());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            asset_root,
            scan_stems,
            load_data,
            load_settings,
            save_settings,
            log_event
        ])
        .run(tauri::generate_context!())
        .expect("error while running the mixing desk");
}
