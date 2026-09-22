//! Dinamik Invoice — debit note generator for Dinamik Shipping Pte Ltd.
//!
//! Rust owns the data and every printed document; the webview is only the form.
//! That split is deliberate: the spreadsheet's formulas live in [`calc`] and are
//! re-applied on every write, so no figure the office prints can drift from the
//! workbook the app replaced.

pub mod calc;
pub mod commands;
pub mod db;
pub mod error;
pub mod models;
pub mod pdf;
pub mod words;

use std::sync::Mutex;

use tauri::Manager;

use commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // One file next to the app's other data. Backing the app up means
            // copying this one path, which is what the office was told to do.
            let dir = app.path().app_data_dir()?;
            let path = dir.join("dinamik-invoice.sqlite3");
            let db = db::Db::open(&path)?;
            app.manage(AppState { db: Mutex::new(db) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_settings,
            commands::list_customers,
            commands::save_customer,
            commands::delete_customer,
            commands::get_rate_card,
            commands::save_rate_card,
            commands::list_presets,
            commands::save_preset,
            commands::delete_preset,
            commands::list_notes,
            commands::get_note,
            commands::next_dn_number,
            commands::create_note,
            commands::update_note,
            commands::delete_note,
            commands::set_note_filed,
            commands::preview_figures,
            commands::note_pdf,
            commands::note_pdf_copy,
            commands::filing_report_pdf,
            commands::cover_letter_pdf,
            commands::save_pdf,
            commands::analytics,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Dinamik Invoice");
}
