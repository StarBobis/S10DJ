//! Backend for the Set 10 mixing desk.
//!
//! The frontend keeps the mixing rules; Rust owns the things a browser cannot
//! do reliably: finding the extracted stems on disk, reading their durations
//! and persisting settings between runs.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            asset_root,
            scan_stems,
            load_settings,
            save_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running the mixing desk");
}
