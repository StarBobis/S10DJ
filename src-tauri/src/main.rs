// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    set10_mixing_desk_lib::run()
}
