//! The IPC surface the React app talks to.
//!
//! PDFs come back as base64 rather than as a file path: the UI turns them into
//! blob URLs and shows them in an `<iframe>`, so a note can be previewed without
//! anything touching the disk. Saving is a separate, explicit step.

use std::sync::Mutex;

use base64::Engine as _;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::calc::{
    self, CargoInput, CostContext, CostLine, CostSummary, ShipmentType, compute_cargo, compute_costs,
};
use crate::db::Db;
use crate::error::{AppError, Result};
use crate::models::*;
use crate::pdf::{cover_letter, debit_note, filing_report, report};
use crate::words::amount_to_words;

pub struct AppState {
    pub db: Mutex<Db>,
}

impl AppState {
    fn db(&self) -> std::sync::MutexGuard<'_, Db> {
        // A poisoned lock means an earlier command panicked mid-write. The
        // connection itself is still usable and SQLite rolled back any open
        // transaction, so recovering beats bringing the whole app down.
        self.db.lock().unwrap_or_else(|e| e.into_inner())
    }
}

fn b64(bytes: Vec<u8>) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

// ----- settings -------------------------------------------------------------

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<Settings> {
    state.db().settings()
}

#[tauri::command]
pub fn save_settings(state: State<'_, AppState>, settings: Settings) -> Result<Settings> {
    let db = state.db();
    db.save_settings(&settings)?;
    db.settings()
}

// ----- customers ------------------------------------------------------------

#[tauri::command]
pub fn list_customers(state: State<'_, AppState>) -> Result<Vec<Customer>> {
    state.db().customers()
}

#[tauri::command]
pub fn save_customer(state: State<'_, AppState>, customer: Customer) -> Result<i64> {
    state.db().save_customer(&customer)
}

#[tauri::command]
pub fn delete_customer(state: State<'_, AppState>, id: i64) -> Result<()> {
    state.db().delete_customer(id)
}

// ----- rate card ------------------------------------------------------------

#[tauri::command]
pub fn get_rate_card(state: State<'_, AppState>, shipment_type: ShipmentType) -> Result<Vec<RateDefault>> {
    state.db().rate_card(shipment_type)
}

#[tauri::command]
pub fn save_rate_card(
    state: State<'_, AppState>,
    shipment_type: ShipmentType,
    lines: Vec<RateDefault>,
) -> Result<Vec<RateDefault>> {
    let mut db = state.db();
    db.save_rate_card(shipment_type, &lines)?;
    db.rate_card(shipment_type)
}

// ----- presets --------------------------------------------------------------

#[tauri::command]
pub fn list_presets(state: State<'_, AppState>) -> Result<Vec<Preset>> {
    state.db().presets()
}

#[tauri::command]
pub fn save_preset(state: State<'_, AppState>, preset: Preset) -> Result<Vec<Preset>> {
    let db = state.db();
    db.save_preset(&preset)?;
    db.presets()
}

#[tauri::command]
pub fn delete_preset(state: State<'_, AppState>, id: i64) -> Result<Vec<Preset>> {
    let db = state.db();
    db.delete_preset(id)?;
    db.presets()
}

// ----- debit notes ----------------------------------------------------------

#[tauri::command]
pub fn list_notes(state: State<'_, AppState>) -> Result<Vec<DebitNoteSummary>> {
    state.db().summaries()
}

#[tauri::command]
pub fn get_note(state: State<'_, AppState>, id: i64) -> Result<DebitNote> {
    state.db().debit_note(id)
}

#[tauri::command]
pub fn next_dn_number(state: State<'_, AppState>, year_month: String) -> Result<String> {
    let n = state.db().next_running_no(&year_month)?;
    Ok(format!("DN{year_month}-{n:02}"))
}

/// Looked up as the feeder vessel/voyage fields are typed, not tied to a
/// preset — the same feeder call is often billed to more than one buyer.
#[tauri::command]
pub fn feeder_match(
    state: State<'_, AppState>,
    feeder_vessel: String,
    feeder_voyage: String,
    exclude_id: Option<i64>,
) -> Result<Option<FeederMatch>> {
    state.db().feeder_match(&feeder_vessel, &feeder_voyage, exclude_id)
}

#[tauri::command]
pub fn create_note(state: State<'_, AppState>, input: DebitNoteInput) -> Result<DebitNote> {
    let mut db = state.db();
    let id = db.create_debit_note(&input)?;
    db.debit_note(id)
}

#[tauri::command]
pub fn update_note(state: State<'_, AppState>, id: i64, input: DebitNoteInput) -> Result<DebitNote> {
    let mut db = state.db();
    db.update_debit_note(id, &input)?;
    db.debit_note(id)
}

#[tauri::command]
pub fn delete_note(state: State<'_, AppState>, id: i64) -> Result<()> {
    state.db().delete_debit_note(id)
}

#[tauri::command]
pub fn set_note_filed(state: State<'_, AppState>, id: i64, filed: bool) -> Result<DebitNote> {
    let db = state.db();
    db.set_filed(id, filed)?;
    db.debit_note(id)
}

/// Live figures for the form, so the preview never has to re-implement the
/// spreadsheet in TypeScript — the same Rust code prices the draft and the row.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub containers: f64,
    pub tonnage: f64,
    pub charge_amount: f64,
    pub total_amount: f64,
    pub amount_in_words: String,
    pub costs: CostSummary,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewInput {
    pub boxes: f64,
    pub boxes_per_container: f64,
    pub mt_per_container: f64,
    pub rate_per_mt: f64,
    #[serde(default)]
    pub shipment_type: ShipmentType,
    #[serde(default)]
    pub costs: Option<Vec<CostLine>>,
}

#[tauri::command]
pub fn preview_figures(state: State<'_, AppState>, input: PreviewInput) -> Result<Preview> {
    let cargo = compute_cargo(CargoInput {
        boxes: input.boxes,
        boxes_per_container: input.boxes_per_container,
        mt_per_container: input.mt_per_container,
        rate_per_mt: input.rate_per_mt,
    });
    let lines = match input.costs {
        Some(c) => c,
        None => state
            .db()
            .rate_card(input.shipment_type)?
            .into_iter()
            .filter(|r| r.active)
            .map(|r| CostLine {
                category: r.category,
                code: r.code,
                label: r.label,
                basis: r.basis,
                rate: r.rate,
                amount: 0.0,
                sort_order: r.sort_order,
            })
            .collect(),
    };
    let ctx = CostContext {
        containers: cargo.containers,
        boxes: input.boxes,
        tonnage: cargo.tonnage,
    };
    Ok(Preview {
        containers: cargo.containers,
        tonnage: cargo.tonnage,
        charge_amount: cargo.charge_amount,
        total_amount: cargo.total_amount,
        amount_in_words: amount_to_words(cargo.total_amount),
        costs: compute_costs(&lines, ctx, cargo.total_amount),
    })
}

// ----- PDFs -----------------------------------------------------------------

/// Both copies in one file, which is what gets emailed and filed.
#[tauri::command]
pub fn note_pdf(state: State<'_, AppState>, id: i64) -> Result<String> {
    let db = state.db();
    let note = db.debit_note(id)?;
    Ok(b64(debit_note::render(&note, &db.settings()?)))
}

/// One copy at a time, for the two preview panes.
#[tauri::command]
pub fn note_pdf_copy(state: State<'_, AppState>, id: i64, copy: String) -> Result<String> {
    let db = state.db();
    let note = db.debit_note(id)?;
    let which = match copy.as_str() {
        "accountant" => debit_note::Copy::Accountant,
        _ => debit_note::Copy::Customer,
    };
    Ok(b64(debit_note::render_single(&note, &db.settings()?, which)))
}

#[tauri::command]
pub fn filing_report_pdf(state: State<'_, AppState>, year_month: String, note_ids: Vec<i64>) -> Result<String> {
    let db = state.db();
    let notes = db.notes_by_id(&note_ids)?;
    Ok(b64(filing_report::render(&notes, &year_month, &db.settings()?, &today())))
}

/// The notes a customer still has available to enclose — every note of theirs
/// that has never been attached to a cover letter, oldest first.
#[tauri::command]
pub fn cover_letter_eligible_notes(
    state: State<'_, AppState>,
    customer_id: i64,
) -> Result<Vec<DebitNoteSummary>> {
    state.db().cover_letter_eligible_notes(customer_id)
}

/// Renders a draft letter from whatever notes are checked so far, without
/// saving anything — safe to call on every keystroke the way the live preview
/// does, since nothing here marks a note as used.
#[tauri::command]
pub fn cover_letter_preview_pdf(
    state: State<'_, AppState>,
    customer_id: i64,
    note_ids: Vec<i64>,
    attn_name: String,
    letter_date: Option<String>,
) -> Result<String> {
    let db = state.db();
    let customer = db.customer(customer_id)?;
    let settings = db.settings()?;
    let numbers = db.dn_numbers_by_id(&note_ids)?;
    let date = letter_date.unwrap_or_else(today);
    Ok(b64(cover_letter::render(&cover_letter::CoverLetter {
        customer: &customer,
        settings: &settings,
        letter_date: &date,
        attn_name: &attn_name,
        dn_numbers: numbers,
    })))
}

/// Finalises a letter: records it and attaches the chosen notes so they can
/// never be picked for another letter, then returns the same PDF the draft
/// preview showed. This is the one call in the cover letter flow with a
/// side effect — everything else is a read.
#[tauri::command]
pub fn save_cover_letter(
    state: State<'_, AppState>,
    customer_id: i64,
    note_ids: Vec<i64>,
    attn_name: String,
    letter_date: Option<String>,
) -> Result<String> {
    let db = state.db();
    let customer = db.customer(customer_id)?;
    let mut settings = db.settings()?;

    // The customer and addressee name are "sticky" — remembered across
    // restarts, because a cover letter is normally sent to the same person
    // every month and re-typing it each time is exactly the annoyance this
    // removes.
    settings.cover_letter_customer_id = Some(customer_id);
    settings.cover_letter_attn_name = attn_name.clone();
    db.save_settings(&settings)?;

    let date = letter_date.unwrap_or_else(today);
    let numbers = db.dn_numbers_by_id(&note_ids)?;
    db.save_cover_letter(customer_id, &attn_name, &date, &note_ids)?;
    Ok(b64(cover_letter::render(&cover_letter::CoverLetter {
        customer: &customer,
        settings: &settings,
        letter_date: &date,
        attn_name: &attn_name,
        dn_numbers: numbers,
    })))
}

/// Every past cover letter, for the history browser.
#[tauri::command]
pub fn list_cover_letters(state: State<'_, AppState>) -> Result<Vec<CoverLetterSummary>> {
    state.db().list_cover_letters()
}

/// Re-renders a saved letter's exact PDF, straight off what was recorded when
/// it was generated.
#[tauri::command]
pub fn cover_letter_pdf_by_id(state: State<'_, AppState>, id: i64) -> Result<String> {
    let db = state.db();
    let (customer, attn_name, letter_date) = db.cover_letter(id)?;
    let settings = db.settings()?;
    let numbers = db.cover_letter_dn_numbers(id)?;
    Ok(b64(cover_letter::render(&cover_letter::CoverLetter {
        customer: &customer,
        settings: &settings,
        letter_date: &letter_date,
        attn_name: &attn_name,
        dn_numbers: numbers,
    })))
}

/// Deletes a saved letter and frees the notes it enclosed back into
/// `cover_letter_eligible_notes`.
#[tauri::command]
pub fn delete_cover_letter(state: State<'_, AppState>, id: i64) -> Result<()> {
    state.db().delete_cover_letter(id)
}

/// Write a PDF the UI already holds to a path the user chose in a save dialog.
#[tauri::command]
pub fn save_pdf(path: String, data_base64: String) -> Result<String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64.as_bytes())
        .map_err(|e| AppError::Other(format!("Could not decode the PDF: {e}")))?;
    std::fs::write(&path, bytes)?;
    Ok(path)
}

// ----- analytics ------------------------------------------------------------

/// Rolled up in Rust rather than in the browser so the Overview tab stays a
/// pure renderer and the numbers agree with the filing report's totals.
#[tauri::command]
pub fn analytics(state: State<'_, AppState>, year_month: Option<String>) -> Result<Analytics> {
    let all = state.db().summaries()?;
    let scoped: Vec<&DebitNoteSummary> = match year_month.as_deref() {
        Some(ym) if !ym.is_empty() && ym != "all" => {
            all.iter().filter(|n| n.year_month == ym).collect()
        }
        _ => all.iter().collect(),
    };

    let months = {
        let mut keys: Vec<String> =
            all.iter().map(|n| n.year_month.clone()).collect::<std::collections::BTreeSet<_>>().into_iter().collect();
        keys.reverse();
        keys.into_iter()
            .map(|ym| {
                let slice: Vec<&DebitNoteSummary> =
                    all.iter().filter(|n| n.year_month == ym).collect();
                MonthStat {
                    label: cover_letter::month_label(&ym),
                    year_month: ym,
                    count: slice.len(),
                    tonnage: calc::round3(slice.iter().map(|n| n.tonnage).sum()),
                    revenue: calc::round2(slice.iter().map(|n| n.total_amount).sum()),
                    cost: calc::round2(slice.iter().map(|n| n.total_cost).sum()),
                    profit: calc::round2(slice.iter().map(|n| n.profit).sum()),
                }
            })
            .collect()
    };

    let by = |key: fn(&DebitNoteSummary) -> String| -> Vec<NameStat> {
        let mut map: std::collections::HashMap<String, NameStat> = std::collections::HashMap::new();
        for n in &scoped {
            let name = key(n);
            let name = if name.trim().is_empty() { "—".to_string() } else { name };
            let e = map.entry(name.clone()).or_insert(NameStat {
                name,
                count: 0,
                tonnage: 0.0,
                revenue: 0.0,
                profit: 0.0,
            });
            e.count += 1;
            e.tonnage += n.tonnage;
            e.revenue += n.total_amount;
            e.profit += n.profit;
        }
        let mut v: Vec<NameStat> = map.into_values().collect();
        for s in &mut v {
            s.tonnage = calc::round3(s.tonnage);
            s.revenue = calc::round2(s.revenue);
            s.profit = calc::round2(s.profit);
        }
        v.sort_by(|a, b| b.tonnage.partial_cmp(&a.tonnage).unwrap_or(std::cmp::Ordering::Equal));
        v
    };

    Ok(Analytics {
        total_notes: scoped.len(),
        total_tonnage: calc::round3(scoped.iter().map(|n| n.tonnage).sum()),
        total_revenue: calc::round2(scoped.iter().map(|n| n.total_amount).sum()),
        total_cost: calc::round2(scoped.iter().map(|n| n.total_cost).sum()),
        total_profit: calc::round2(scoped.iter().map(|n| n.profit).sum()),
        months,
        buyers: by(|n| n.buyer_name.clone()),
        vessels: by(|n| n.feeder_vessel.clone()),
        destinations: by(|n| n.destination.clone()),
        products: by(|n| n.product_desc.clone()),
    })
}

/// Revenue, cost and profit for the director's Analytics tab — split by
/// currency for the same reason `analytics` above never surfaces a blended
/// money total. In practice the register is almost always a single currency,
/// so this is invisible until it isn't.
#[tauri::command]
pub fn director_analytics(state: State<'_, AppState>) -> Result<DirectorAnalytics> {
    let all = state.db().summaries()?;

    let mut by_currency: std::collections::BTreeMap<String, Vec<&DebitNoteSummary>> = Default::default();
    for n in &all {
        by_currency.entry(n.currency.clone()).or_default().push(n);
    }

    let mut currencies: Vec<CurrencyAnalytics> = by_currency
        .into_iter()
        .map(|(currency, notes)| {
            let mut keys: Vec<String> = notes
                .iter()
                .map(|n| n.year_month.clone())
                .collect::<std::collections::BTreeSet<_>>()
                .into_iter()
                .collect();
            keys.reverse();
            let months = keys
                .into_iter()
                .map(|ym| {
                    let slice: Vec<&&DebitNoteSummary> =
                        notes.iter().filter(|n| n.year_month == ym).collect();
                    MonthStat {
                        label: cover_letter::month_label(&ym),
                        year_month: ym,
                        count: slice.len(),
                        tonnage: calc::round3(slice.iter().map(|n| n.tonnage).sum()),
                        revenue: calc::round2(slice.iter().map(|n| n.total_amount).sum()),
                        cost: calc::round2(slice.iter().map(|n| n.total_cost).sum()),
                        profit: calc::round2(slice.iter().map(|n| n.profit).sum()),
                    }
                })
                .collect();

            let mut buyer_map: std::collections::HashMap<String, NameStat> = Default::default();
            for n in &notes {
                let name = if n.buyer_name.trim().is_empty() {
                    "—".to_string()
                } else {
                    n.buyer_name.clone()
                };
                let e = buyer_map.entry(name.clone()).or_insert(NameStat {
                    name,
                    count: 0,
                    tonnage: 0.0,
                    revenue: 0.0,
                    profit: 0.0,
                });
                e.count += 1;
                e.tonnage += n.tonnage;
                e.revenue += n.total_amount;
                e.profit += n.profit;
            }
            let mut buyers: Vec<NameStat> = buyer_map.into_values().collect();
            for b in &mut buyers {
                b.tonnage = calc::round3(b.tonnage);
                b.revenue = calc::round2(b.revenue);
                b.profit = calc::round2(b.profit);
            }
            buyers.sort_by(|a, b| b.revenue.partial_cmp(&a.revenue).unwrap_or(std::cmp::Ordering::Equal));

            CurrencyAnalytics {
                total_notes: notes.len(),
                total_tonnage: calc::round3(notes.iter().map(|n| n.tonnage).sum()),
                total_revenue: calc::round2(notes.iter().map(|n| n.total_amount).sum()),
                total_cost: calc::round2(notes.iter().map(|n| n.total_cost).sum()),
                total_profit: calc::round2(notes.iter().map(|n| n.profit).sum()),
                months,
                buyers,
                currency,
            }
        })
        .collect();
    currencies.sort_by(|a, b| b.total_revenue.partial_cmp(&a.total_revenue).unwrap_or(std::cmp::Ordering::Equal));

    Ok(DirectorAnalytics { currencies })
}

/// A black-and-white, one-page A4 printout of the Overview tab, for whatever
/// scope (all time or one month) the screen currently has selected.
#[tauri::command]
pub fn overview_report_pdf(state: State<'_, AppState>, year_month: Option<String>) -> Result<String> {
    let data = analytics(state.clone(), year_month.clone())?;
    let settings = state.db().settings()?;
    let scope_label = match year_month.as_deref() {
        Some(ym) if !ym.is_empty() && ym != "all" => cover_letter::month_label(ym),
        _ => "All time".to_string(),
    };
    Ok(b64(report::render_overview(&data, &settings, &scope_label, &today())))
}

/// The same, for the director's Analytics tab — one currency at a time, same
/// as the screen.
#[tauri::command]
pub fn director_report_pdf(state: State<'_, AppState>, currency: String) -> Result<String> {
    let data = director_analytics(state.clone())?;
    let settings = state.db().settings()?;
    let scoped = data
        .currencies
        .into_iter()
        .find(|c| c.currency == currency)
        .ok_or_else(|| AppError::NotFound(format!("no figures for {currency}")))?;
    Ok(b64(report::render_director(&scoped, &settings, &today())))
}
