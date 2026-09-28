//! Shapes crossing the Tauri IPC boundary.
//!
//! Field names are `camelCase` on the wire so the React side can use them as-is.
//! Dates are plain `YYYY-MM-DD` strings: the debit note only ever deals in whole
//! days and the `<input type="date">` controls in the form speak the same format.

use serde::{Deserialize, Serialize};

use crate::calc::{CostBasis, CostCategory, CostLine, ShipmentType};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub company_name: String,
    pub address_line: String,
    pub registration_no: String,
    pub payment_line1: String,
    pub payment_line2: String,
    pub signatory_name: String,
    pub signatory_title: String,
    pub cover_letter_intro: String,
    pub default_packing_desc: String,
    pub default_product_desc: String,
    pub default_boxes_per_container: f64,
    pub default_mt_per_container: f64,
    pub default_charge_desc: String,
    pub default_rate_per_mt: f64,
    pub default_currency: String,
    pub email: String,

    /// The cover letter's own two "sticky" fields — remembered across restarts
    /// because a cover letter is normally sent to the same person, month after
    /// month, and re-typing the addressee's name every time is the annoyance
    /// this is meant to remove.
    #[serde(default)]
    pub cover_letter_customer_id: Option<i64>,
    #[serde(default)]
    pub cover_letter_attn_name: String,
}

impl Default for Settings {
    fn default() -> Self {
        // Straight off the letterhead and footer of the sample workbook.
        Settings {
            company_name: "DINAMIK SHIPPING PTE LTD".into(),
            address_line: "138 Cecil Street #09-03, Cecil Court, Singapore 069538   Tel: (65) 6222 2811  Fax: (65) 6222 2155".into(),
            registration_no: "Company Registration No. 200403109N".into(),
            payment_line1: "Payment to be made to DINAMIK SHIPPING PTE LTD by Telegraphic Transfer to our account".into(),
            payment_line2: "No. 651-869620-001 with OCBC Bank (Singapore), MBFC Branch, Swift Code: OCBCSGSG".into(),
            signatory_name: "Deanna Lim".into(),
            signatory_title: "General Manager".into(),
            cover_letter_intro: "We enclose the following Debit notes and will appreciate your early settlement.".into(),
            default_packing_desc: "Metal  Boxes (MB5)".into(),
            default_product_desc: "SMR 20 Rubber".into(),
            default_boxes_per_container: 16.0,
            default_mt_per_container: 20.16,
            default_charge_desc: "Transhipment Charge".into(),
            default_rate_per_mt: 54.0,
            default_currency: "SGD".into(),
            email: "dship@singnet.com.sg".into(),
            cover_letter_customer_id: None,
            cover_letter_attn_name: "Ms Chia Ching Lian".into(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Customer {
    #[serde(default)]
    pub id: i64,
    pub name: String,
    #[serde(default)]
    pub address_line1: String,
    #[serde(default)]
    pub address_line2: String,
    #[serde(default)]
    pub address_line3: String,
    #[serde(default)]
    pub address_line4: String,
    #[serde(default)]
    pub address_line5: String,
    #[serde(default)]
    pub attention: String,
    #[serde(default = "yes")]
    pub active: bool,
}

fn yes() -> bool {
    true
}

impl Customer {
    pub fn address_lines(&self) -> Vec<&str> {
        [
            self.address_line1.as_str(),
            self.address_line2.as_str(),
            self.address_line3.as_str(),
            self.address_line4.as_str(),
            self.address_line5.as_str(),
        ]
        .into_iter()
        .filter(|l| !l.trim().is_empty())
        .collect()
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RateDefault {
    #[serde(default)]
    pub id: i64,
    #[serde(default)]
    pub shipment_type: ShipmentType,
    pub category: CostCategory,
    pub code: String,
    #[serde(default)]
    pub label: String,
    pub basis: CostBasis,
    pub rate: f64,
    #[serde(default)]
    pub sort_order: i64,
    #[serde(default = "yes")]
    pub active: bool,
}

/// A buyer + destination pairing the form offers as a one-click preset. The
/// Sample UI kept these in `localStorage`; here they are rows so every machine
/// that opens the file sees the same list.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preset {
    #[serde(default)]
    pub id: i64,
    pub customer_id: Option<i64>,
    pub buyer_name: String,
    #[serde(default)]
    pub destination: String,
    #[serde(default)]
    pub si_number: String,
    #[serde(default)]
    pub product_desc: String,
    #[serde(default)]
    pub packing_desc: String,
    #[serde(default)]
    pub currency: String,
    #[serde(default)]
    pub rate_per_mt: f64,
    #[serde(default)]
    pub boxes_per_container: f64,
    #[serde(default)]
    pub mt_per_container: f64,
    #[serde(default)]
    pub contract_no: String,
    /// Copied onto a new note the same way product/packing already are — a
    /// buyer+destination lane usually ships the same box count month to
    /// month, so it's worth a head start even though it's flagged for review.
    #[serde(default)]
    pub boxes: f64,
    #[serde(default)]
    pub ocean_vessel: String,
    #[serde(default)]
    pub ocean_voyage: String,
}

/// A prior note's feeder call, offered back when a new note names the same
/// vessel and voyage — the arrival date and the vessel/voyage half of the B/L
/// number are shared by every buyer on that call, so retyping them is pure
/// friction. See [`crate::db::Db::feeder_match`].
/// One month's worth of a figure set — tonnage always, money only when the
/// caller scoped it to a single currency. See [`crate::commands::analytics`]
/// and [`crate::commands::director_analytics`].
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthStat {
    pub year_month: String,
    pub label: String,
    pub count: usize,
    pub tonnage: f64,
    pub revenue: f64,
    pub cost: f64,
    pub profit: f64,
}

/// The same figures, grouped by a name (buyer, vessel, destination, product)
/// instead of a month.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NameStat {
    pub name: String,
    pub count: usize,
    pub tonnage: f64,
    pub revenue: f64,
    pub profit: f64,
}

/// The Overview tab's data — tonnage and counts only, no money. See
/// [`crate::commands::analytics`].
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Analytics {
    pub total_notes: usize,
    pub total_tonnage: f64,
    pub total_revenue: f64,
    pub total_cost: f64,
    pub total_profit: f64,
    pub months: Vec<MonthStat>,
    pub buyers: Vec<NameStat>,
    pub vessels: Vec<NameStat>,
    pub destinations: Vec<NameStat>,
    pub products: Vec<NameStat>,
}

/// One currency's worth of the director's money figures. Grouped rather than
/// blended with any other currency the register happens to hold — a SGD +
/// USD total would just be a wrong number, not a rough one.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrencyAnalytics {
    pub currency: String,
    pub total_notes: usize,
    pub total_tonnage: f64,
    pub total_revenue: f64,
    pub total_cost: f64,
    pub total_profit: f64,
    pub months: Vec<MonthStat>,
    pub buyers: Vec<NameStat>,
}

/// The director Analytics tab's data. See
/// [`crate::commands::director_analytics`].
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectorAnalytics {
    pub currencies: Vec<CurrencyAnalytics>,
}

/// A saved cover letter, with the DN numbers it enclosed — what the history
/// browser lists and searches. See [`crate::db::Db::list_cover_letters`].
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverLetterSummary {
    pub id: i64,
    pub customer_id: i64,
    pub customer_name: String,
    pub attn_name: String,
    pub letter_date: String,
    pub created_at: String,
    pub dn_numbers: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeederMatch {
    pub feeder_arrival_date: String,
    /// The B/L number's vessel/voyage half, e.g. `"JJST2610W"` from
    /// `"JJST2610W-BKI01"` — the part after the dash is a per-buyer
    /// consignment reference and is never carried over.
    pub bl_prefix: String,
}

/// A prior note's outward call, offered back when the outward vessel + voyage
/// match — the same sailing carries every buyer on it to the same place, so
/// the B/L date and destination are shared the same way the feeder's arrival
/// date and B/L prefix are. See [`crate::db::Db::outward_match`].
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutwardMatch {
    pub bl_date: String,
    pub destination: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NoteStatus {
    Issued,
    Filed,
}

impl NoteStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            NoteStatus::Issued => "issued",
            NoteStatus::Filed => "filed",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s {
            "filed" => NoteStatus::Filed,
            _ => NoteStatus::Issued,
        }
    }
}

/// Everything the user types. The derived figures are computed server-side and
/// come back on [`DebitNote`], so the form can never persist a stale total.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebitNoteInput {
    /// Blank on create means "assign the next running number for the month".
    #[serde(default)]
    pub dn_number: String,
    pub year_month: String,
    pub dn_date: String,

    pub customer_id: i64,
    #[serde(default)]
    pub buyer_name: String,
    #[serde(default)]
    pub customer_invoice_ref: String,
    #[serde(default)]
    pub si_number: String,
    #[serde(default)]
    pub contract_no: String,

    pub boxes: f64,
    #[serde(default)]
    pub packing_desc: String,
    pub boxes_per_container: f64,
    pub mt_per_container: f64,
    #[serde(default)]
    pub product_desc: String,
    /// Picks which of the two rate cards seeds this note's accountant-only
    /// cost lines — the customer-facing charge is identical either way.
    #[serde(default)]
    pub shipment_type: ShipmentType,

    #[serde(default)]
    pub feeder_vessel: String,
    #[serde(default)]
    pub feeder_voyage: String,
    #[serde(default)]
    pub feeder_arrival_date: String,
    #[serde(default)]
    pub bl_number: String,
    /// e.g. `153/26`, the P No. beside "Your Invoice No.".
    #[serde(default)]
    pub p_number: String,
    /// The free-text box beside the P No. (e.g. `Tuaran`) — an origin/estate
    /// name that varies per note and has no fixed vocabulary.
    #[serde(default)]
    pub p_descriptor: String,

    #[serde(default)]
    pub ocean_vessel: String,
    #[serde(default)]
    pub ocean_voyage: String,
    #[serde(default)]
    pub destination: String,
    #[serde(default)]
    pub bl_date: String,

    #[serde(default)]
    pub charge_desc: String,
    #[serde(default)]
    pub currency: String,
    pub rate_per_mt: f64,

    /// Omitted on create, in which case the current rate card is copied in.
    #[serde(default)]
    pub costs: Option<Vec<CostLine>>,

    #[serde(default)]
    pub remarks: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebitNote {
    pub id: i64,
    pub dn_number: String,
    pub year_month: String,
    pub running_no: i64,
    pub dn_date: String,
    pub status: NoteStatus,
    pub filed_at: Option<String>,

    pub customer_id: i64,
    pub customer: Customer,
    pub buyer_name: String,
    pub customer_invoice_ref: String,
    pub si_number: String,
    pub contract_no: String,

    pub boxes: f64,
    pub packing_desc: String,
    pub boxes_per_container: f64,
    pub mt_per_container: f64,
    pub containers: f64,
    pub tonnage: f64,
    pub product_desc: String,
    pub shipment_type: ShipmentType,

    pub feeder_vessel: String,
    pub feeder_voyage: String,
    pub feeder_arrival_date: String,
    pub bl_number: String,
    pub p_number: String,
    pub p_descriptor: String,

    pub ocean_vessel: String,
    pub ocean_voyage: String,
    pub destination: String,
    pub bl_date: String,

    pub charge_desc: String,
    pub currency: String,
    pub rate_per_mt: f64,
    pub charge_amount: f64,
    pub total_amount: f64,
    pub amount_in_words: String,

    pub costs: Vec<CostLine>,
    pub cost_port: f64,
    pub cost_transport: f64,
    pub cost_misc: f64,
    pub total_cost: f64,
    pub profit: f64,

    pub remarks: String,
    pub created_at: String,
    pub updated_at: String,
}

/// The one-line-per-note shape the Current / History / Analytics lists render.
/// Kept separate from [`DebitNote`] so a thousand-row history does not ship a
/// thousand cost-line arrays across the IPC boundary.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebitNoteSummary {
    pub id: i64,
    pub dn_number: String,
    pub year_month: String,
    pub dn_date: String,
    pub status: NoteStatus,
    pub customer_name: String,
    pub buyer_name: String,
    pub customer_invoice_ref: String,
    pub si_number: String,
    pub contract_no: String,
    pub bl_number: String,
    pub p_number: String,
    pub feeder_vessel: String,
    pub ocean_vessel: String,
    pub destination: String,
    pub product_desc: String,
    pub shipment_type: ShipmentType,
    pub boxes: f64,
    pub containers: f64,
    pub tonnage: f64,
    pub currency: String,
    pub total_amount: f64,
    pub total_cost: f64,
    pub profit: f64,
}
