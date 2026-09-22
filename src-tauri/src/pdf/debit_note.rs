//! The debit note, laid out from the sample workbook.
//!
//! The spreadsheet holds two copies side by side — columns A-R are the customer
//! copy and T-AH the accounts copy — because it prints on one wide sheet. Here
//! they become two A4 pages of the same PDF: page 1 customer, page 2 accountant.
//! Both pages are identical down to the "E & O E" line; the accountant copy then
//! adds the `[ ACCOUNT'S COPY ]` marker and the costing block from rows 55-61.
//!
//! Row numbers from the workbook are quoted against each block, and the `Y_*`
//! constants are the workbook's own row tops (row height in points, converted
//! to mm, cumulative from the 0.75in top margin) so the vertical rhythm matches
//! the print exactly rather than being eyeballed.

use crate::calc::{CostCategory, CostLine};
use crate::models::{DebitNote, Settings};
use crate::pdf::writer::{self, Align, Font, Page, Pdf, BLACK, GREY};

/// Left margin, and the x of the "No. / Date" label column on the right.
const L: f64 = 18.0;
const R: f64 = writer::A4_W - 15.0;
const LABEL_X: f64 = 118.0;
const VALUE_X: f64 = 138.0;

const BODY: Font = Font::Tahoma;
const BODY_B: Font = Font::TahomaBold;
const FS: f64 = 10.0;

// Baselines, row N's from the workbook (`DNxxSep.JS10.BST.90USSAV01`): each is
// the *next* row's top edge less a small ascent allowance, so text sits low in
// its row the way Excel renders it.
const Y_TITLE: f64 = 24.4; // row 1, 16pt bold
const Y_ADDR: f64 = 29.5; // row 2, 9pt
const Y_REGNO: f64 = 34.0; // row 3, 9pt
const Y_HR: f64 = 37.5;

const Y_BILLTO_1: f64 = 52.7; // row 7  (name / "Debit Note" title)
const Y_BILLTO_2: f64 = 57.4; // row 8
const Y_BILLTO_3: f64 = 62.0; // row 9  ("No.  :")
const Y_BILLTO_4: f64 = 66.7; // row 10
const Y_BILLTO_5: f64 = 71.3; // row 11
const Y_BILLTO_6: f64 = 76.0; // row 12 ("Date  :")
const BILLTO_ROWS: [f64; 6] =
    [Y_BILLTO_1, Y_BILLTO_2, Y_BILLTO_3, Y_BILLTO_4, Y_BILLTO_5, Y_BILLTO_6];

const Y_INVOICE_REF: f64 = 94.0; // row 16
const Y_BUYER: f64 = 98.5; // row 17
const Y_CARGO: f64 = 103.0; // row 18
const Y_FEEDER: f64 = 107.5; // row 19
const Y_BL: f64 = 112.0; // row 20
const Y_SHIPPED: f64 = 116.5; // row 21
const Y_DEST: f64 = 121.0; // row 22
const Y_BLDATE: f64 = 125.5; // row 23

const Y_CHARGE_MIN: f64 = 138.4; // row 26, floor for a short cargo block
const Y_TOTAL: f64 = 160.6; // row 31, SUM(N26:N28)
const Y_TOTAL_RULE: f64 = 165.2; // row 32 bottom, the double underline
const Y_WORDS: f64 = 177.0; // row 35

const Y_PAY1: f64 = 195.2; // row 39
const Y_PAY2: f64 = 199.7; // row 40

const Y_SIG_FOR: f64 = 217.7; // row 44, "for DINAMIK SHIPPING PTE LTD"
const Y_SIG_LINE: f64 = 236.3; // row 48, the signature rule
const Y_EOE: f64 = 240.8; // row 49

const Y_ACCOUNTS_MARK: f64 = 250.6; // row 52, "[ ACCOUNT'S COPY ]"
const Y_COSTING_TOP: f64 = 256.7; // hairline above row 55
const Y_COSTING_FIRST: f64 = 263.0; // row 55
const COSTING_ROW_H: f64 = 4.13; // rows 55-61 are 11.7pt each

pub fn render(note: &DebitNote, settings: &Settings) -> Vec<u8> {
    let mut pdf = Pdf::new(format!("{} — Debit Note", note.dn_number));
    draw_copy(pdf.add_page(), note, settings, Copy::Customer);
    draw_copy(pdf.add_page(), note, settings, Copy::Accountant);
    pdf.to_bytes()
}

/// The customer copy on its own, for the side-by-side preview panel.
pub fn render_single(note: &DebitNote, settings: &Settings, copy: Copy) -> Vec<u8> {
    let mut pdf = Pdf::new(format!("{} — {}", note.dn_number, copy.title()));
    draw_copy(pdf.add_page(), note, settings, copy);
    pdf.to_bytes()
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Copy {
    Customer,
    Accountant,
}

impl Copy {
    pub fn title(self) -> &'static str {
        match self {
            Copy::Customer => "Customer Copy",
            Copy::Accountant => "Accountant Copy",
        }
    }
}

/// "Contract No." if that field is filled, otherwise "SI No." — the two are
/// the same reference under different names depending on the buyer, and the
/// form guarantees at least one is filled.
fn si_or_contract(note: &DebitNote) -> Option<(&'static str, &str)> {
    if !note.contract_no.trim().is_empty() {
        Some(("Contract No.", note.contract_no.trim()))
    } else if !note.si_number.trim().is_empty() {
        Some(("SI No.", note.si_number.trim()))
    } else {
        None
    }
}

fn draw_copy(p: &mut Page, note: &DebitNote, s: &Settings, copy: Copy) {
    // --- letterhead, rows 1-3 -------------------------------------------
    p.text_aligned(writer::A4_W / 2.0, Y_TITLE, &s.company_name, Font::TahomaBold, 16.0, BLACK, Align::Center);
    p.text_aligned(writer::A4_W / 2.0, Y_ADDR, &s.address_line, BODY, 9.0, BLACK, Align::Center);
    p.text_aligned(writer::A4_W / 2.0, Y_REGNO, &s.registration_no, BODY, 9.0, BLACK, Align::Center);
    p.hline(L, R, Y_HR, 0.5, BLACK);

    // --- bill-to block (rows 7-12) and the title / No. / Date (L7-N12) ---
    let mut lines: Vec<&str> = vec![note.customer.name.as_str()];
    lines.extend(note.customer.address_lines());
    for (i, row_y) in BILLTO_ROWS.iter().enumerate() {
        let Some(line) = lines.get(i) else { break };
        let font = if i == 0 { BODY_B } else { BODY };
        p.text(L, *row_y, line, font, FS, BLACK);
    }

    p.text(LABEL_X, Y_BILLTO_1, "Debit Note", Font::TahomaBold, 14.0, BLACK);
    p.text(LABEL_X, Y_BILLTO_3, "No.  :", BODY, FS, BLACK);
    p.text(VALUE_X, Y_BILLTO_3, &note.dn_number, BODY_B, FS, BLACK);
    p.text(LABEL_X, Y_BILLTO_6, "Date  :", BODY, FS, BLACK);
    p.text(VALUE_X, Y_BILLTO_6, &long_date(&note.dn_date), BODY, FS, BLACK);

    // --- reference lines (rows 16-17) ------------------------------------
    if !note.customer_invoice_ref.trim().is_empty() {
        p.text(L, Y_INVOICE_REF, note.customer_invoice_ref.trim(), BODY, FS, BLACK);
    }
    if !note.buyer_name.trim().is_empty() {
        p.text(L, Y_BUYER, note.buyer_name.trim(), BODY, FS, BLACK);
    }
    if let Some((label, value)) = si_or_contract(note) {
        p.text(LABEL_X, Y_BUYER, label, BODY, FS, BLACK);
        p.text(VALUE_X + 10.0, Y_BUYER, value, BODY, FS, BLACK);
    }

    // --- cargo line (row 18): "90  Metal Boxes (MB5)   113.40 M/Tons   SMR 20 Rubber"
    p.text(L, Y_CARGO, &fmt_qty(note.boxes), BODY, FS, BLACK);
    p.text(L + 14.0, Y_CARGO, &note.packing_desc, BODY, FS, BLACK);
    p.text_aligned(LABEL_X - 4.0, Y_CARGO, &fmt2(note.tonnage), BODY, FS, BLACK, Align::Right);
    p.text(LABEL_X, Y_CARGO, "M/Tons", BODY, FS, BLACK);
    p.text(VALUE_X + 10.0, Y_CARGO, &note.product_desc, BODY, FS, BLACK);

    // --- carriage (rows 19-23) -------------------------------------------
    let mut y = Y_FEEDER;
    if !note.feeder_vessel.trim().is_empty() {
        p.text(L, y, &format!("Ex {}", note.feeder_vessel.trim()), BODY, FS, BLACK);
        let mut tail = String::new();
        if !note.feeder_voyage.trim().is_empty() {
            tail.push_str(&format!("Voy {}", note.feeder_voyage.trim()));
        }
        if !note.feeder_arrival_date.trim().is_empty() {
            if !tail.is_empty() {
                tail.push_str("    ");
            }
            tail.push_str(&format!("Arrd  {}", long_date(&note.feeder_arrival_date)));
        }
        if !tail.is_empty() {
            p.text(L + 46.0, y, &tail, BODY, FS, BLACK);
        }
        y = Y_BL;
    }
    if !note.bl_number.trim().is_empty() {
        p.text(L, y, &format!("B/L No. {}", note.bl_number.trim()), BODY, FS, BLACK);
        // "(179/26   Tuaran)" — the P No. and its free-text descriptor.
        if !note.p_number.trim().is_empty() {
            let inner = if note.p_descriptor.trim().is_empty() {
                note.p_number.trim().to_string()
            } else {
                format!("{}   {}", note.p_number.trim(), note.p_descriptor.trim())
            };
            p.text(LABEL_X - 10.0, y, &format!("({inner})"), BODY, FS, BLACK);
        }
        y = Y_SHIPPED;
    }
    if !note.ocean_vessel.trim().is_empty() {
        let voy = if note.ocean_voyage.trim().is_empty() {
            String::new()
        } else {
            format!(" Voy {}", note.ocean_voyage.trim())
        };
        p.text(L, y, &format!("Shipped per {}{}", note.ocean_vessel.trim(), voy), BODY, FS, BLACK);
        y = Y_DEST;
    }
    if !note.destination.trim().is_empty() {
        p.text(L, y, &format!("To {}", note.destination.trim()), BODY, FS, BLACK);
        y = Y_BLDATE;
    }
    if !note.bl_date.trim().is_empty() {
        p.text(L, y, "B/L dated", BODY, FS, BLACK);
        p.text(L + 22.0, y, &long_date(&note.bl_date), BODY, FS, BLACK);
        y += 4.5;
    }

    // --- charge (row 26) and total (row 31) ------------------------------
    // The workbook anchors the charge low on the sheet so the totals always
    // land in the same place whatever the cargo block's height; a long
    // address pushes past the anchor rather than the other way round.
    let charge_y = y.max(Y_CHARGE_MIN);
    let sym = currency_symbol(&note.currency);
    p.text(L, charge_y, &note.charge_desc, BODY, FS, BLACK);
    p.text(LABEL_X - 28.0, charge_y, &format!("@ {sym}"), BODY, FS, BLACK);
    p.text_aligned(LABEL_X - 10.0, charge_y, &trim_zeros(note.rate_per_mt), BODY, FS, BLACK, Align::Right);
    p.text(LABEL_X - 7.0, charge_y, "per M/Ton", BODY, FS, BLACK);
    p.text(VALUE_X + 6.0, charge_y, sym, BODY, FS, BLACK);
    p.text_aligned(R, charge_y, &fmt2(note.charge_amount), BODY, FS, BLACK, Align::Right);

    // Row 31 — SUM(N26:N28), double-ruled the way the sheet closes a total.
    p.hline(VALUE_X + 4.0, R, Y_TOTAL - 4.6, 0.4, BLACK);
    p.text(VALUE_X + 6.0, Y_TOTAL, sym, BODY_B, FS, BLACK);
    p.text_aligned(R, Y_TOTAL, &fmt2(note.total_amount), BODY_B, FS, BLACK, Align::Right);
    p.line(VALUE_X + 4.0, Y_TOTAL_RULE, R, Y_TOTAL_RULE, 0.4, BLACK);
    p.line(VALUE_X + 4.0, Y_TOTAL_RULE + 1.0, R, Y_TOTAL_RULE + 1.0, 0.4, BLACK);

    // --- amount in words (row 35) ----------------------------------------
    p.text(L, Y_WORDS, &currency_words(&note.currency), BODY, FS, BLACK);
    let words_x = L + 34.0;
    for (i, line) in writer::wrap(&note.amount_in_words, BODY, FS, R - words_x).iter().enumerate() {
        p.text(words_x, Y_WORDS + i as f64 * 4.6, line, BODY, FS, BLACK);
    }

    // --- payment instructions (rows 39-40) -------------------------------
    p.text(L, Y_PAY1, &s.payment_line1, BODY, 8.0, BLACK);
    p.text(L, Y_PAY2, &s.payment_line2, BODY, 8.0, BLACK);

    // --- remarks, which the workbook leaves to a free row ----------------
    if !note.remarks.trim().is_empty() {
        let mut ry = Y_PAY2 + 11.0;
        for line in writer::wrap(note.remarks.trim(), BODY, 8.0, R - L) {
            p.text(L, ry, &line, BODY, 8.0, GREY);
            ry += 4.2;
        }
    }

    // --- signature block (rows 44-49) -------------------------------------
    // Fixed, not flowed: the signature always sits in the same place so a
    // stack of notes can be signed without hunting for the line. The
    // workbook itself never names a signatory here — that only appears on
    // the cover letter — so just "for <company>" and the rule.
    p.text(VALUE_X - 20.0, Y_SIG_FOR, &format!("for {}", s.company_name), BODY, 9.0, BLACK);
    p.hline(VALUE_X - 20.0, R, Y_SIG_LINE, 0.4, BLACK);
    p.text(L, Y_EOE, "E & O E", BODY_B, 9.0, BLACK);

    // --- accountant-only: row 52 marker, then rows 55-61 -----------------
    if copy == Copy::Accountant {
        p.text(L, Y_ACCOUNTS_MARK, "[ ACCOUNT'S COPY ]", BODY_B, 9.5, BLACK);
        draw_costing(p, note);
    }

    p.text_aligned(
        writer::A4_W / 2.0,
        writer::A4_H - 7.0,
        &format!("{}  \u{b7}  {}", note.dn_number, copy.title()),
        BODY,
        6.5,
        GREY,
        Align::Center,
    );
}

/// Rows 55-61 of the accounts copy: three columns of cost codes and a summary
/// column carrying the category subtotals, the total and the profit.
fn draw_costing(p: &mut Page, note: &DebitNote) {
    p.hline(L, R, Y_COSTING_TOP, 0.3, GREY);
    p.text(L, Y_COSTING_TOP + 4.0, "INTERNAL - COSTING", BODY_B, 6.5, GREY);

    let row_h = COSTING_ROW_H;
    let col_w = 34.0;

    for (i, cat) in CostCategory::ALL.iter().enumerate() {
        let x = L + i as f64 * col_w;
        let mut y = Y_COSTING_FIRST;
        for line in note.costs.iter().filter(|c| c.category == *cat) {
            p.text_clipped(x, y, &code_of(line), Font::Courier, 6.5, BLACK, 15.0);
            p.text_aligned(
                x + col_w - 6.0,
                y,
                &fmt2(line.amount),
                Font::Courier,
                6.5,
                BLACK,
                Align::Right,
            );
            y += row_h;
            if y > writer::A4_H - 12.0 {
                break;
            }
        }
    }

    // AC55:AE58 — the summary column.
    let sx = L + col_w * 3.0 + 4.0;
    let mut y = Y_COSTING_FIRST;
    let rows: [(&str, f64); 4] = [
        (CostCategory::Port.label(), note.cost_port),
        (CostCategory::Transport.label(), note.cost_transport),
        (CostCategory::Misc.label(), note.cost_misc),
        ("Total", note.total_cost),
    ];
    for (i, (label, amount)) in rows.iter().enumerate() {
        let is_total = i == 3;
        if is_total {
            p.hline(sx, R, y - 2.9, 0.3, GREY);
        }
        p.text(sx, y, label, if is_total { BODY_B } else { BODY }, 7.0, BLACK);
        p.text_aligned(
            R,
            y,
            &fmt2(*amount),
            if is_total { Font::CourierBold } else { Font::Courier },
            7.0,
            BLACK,
            Align::Right,
        );
        y += 4.4;
    }

    // AE61 — profit. The one figure the customer copy must never carry.
    y += 2.4;
    p.hline(sx, R, y - 3.2, 0.4, BLACK);
    p.text(sx, y, "Profit", BODY_B, 7.5, BLACK);
    p.text_aligned(R, y, &fmt2(note.profit), Font::CourierBold, 7.5, BLACK, Align::Right);
}

/// `HSC`, or `RM @1.50/box` when the line's rate is worth spelling out.
fn code_of(line: &CostLine) -> String {
    if line.label.trim().is_empty() {
        line.code.clone()
    } else {
        line.label.trim().to_string()
    }
}

// --- formatting -------------------------------------------------------------

pub fn fmt2(n: f64) -> String {
    let s = format!("{:.2}", n.abs());
    let (int, dec) = s.split_once('.').unwrap_or((s.as_str(), "00"));
    let grouped = group_thousands(int);
    if n < 0.0 {
        format!("-{grouped}.{dec}")
    } else {
        format!("{grouped}.{dec}")
    }
}

/// Box counts are whole numbers in practice but the field accepts decimals.
fn fmt_qty(n: f64) -> String {
    if (n.fract()).abs() < 1e-9 {
        group_thousands(&format!("{:.0}", n))
    } else {
        fmt2(n)
    }
}

pub fn trim_zeros(n: f64) -> String {
    let s = format!("{:.4}", n);
    let s = s.trim_end_matches('0').trim_end_matches('.');
    if s.is_empty() { "0".to_string() } else { s.to_string() }
}

fn group_thousands(digits: &str) -> String {
    let bytes: Vec<char> = digits.chars().collect();
    let mut out = String::with_capacity(digits.len() + digits.len() / 3);
    for (i, c) in bytes.iter().enumerate() {
        if i > 0 && (bytes.len() - i) % 3 == 0 {
            out.push(',');
        }
        out.push(*c);
    }
    out
}

/// `2026-09-25` -> `25 September 2026`, the form used on the workbook's date row.
pub fn long_date(iso: &str) -> String {
    const MONTHS: [&str; 12] = [
        "January", "February", "March", "April", "May", "June", "July", "August", "September",
        "October", "November", "December",
    ];
    let parts: Vec<&str> = iso.trim().split('-').collect();
    if parts.len() != 3 {
        return iso.trim().to_string();
    }
    let (y, m, d) = (parts[0], parts[1].parse::<usize>().unwrap_or(0), parts[2]);
    if !(1..=12).contains(&m) {
        return iso.trim().to_string();
    }
    format!("{} {} {}", d.trim_start_matches('0'), MONTHS[m - 1], y)
}

/// `2026-09-25` -> `25 Sep 2026`, for table cells where the long form will not fit.
pub fn short_date(iso: &str) -> String {
    let long = long_date(iso);
    let mut parts = long.splitn(3, ' ');
    match (parts.next(), parts.next(), parts.next()) {
        (Some(d), Some(m), Some(y)) if m.len() > 3 => format!("{d} {} {y}", &m[..3]),
        _ => long,
    }
}

/// `S$` for Singapore dollars, matching cells I26/M26; other currencies fall
/// back to their ISO code so nothing is silently mislabelled.
pub fn currency_symbol(code: &str) -> &'static str {
    match code.trim().to_ascii_uppercase().as_str() {
        "SGD" => "S$",
        "USD" => "US$",
        "MYR" => "RM",
        "EUR" => "EUR",
        "GBP" => "GBP",
        "JPY" => "JPY",
        "CNY" => "CNY",
        _ => "",
    }
}

pub fn currency_words(code: &str) -> String {
    match code.trim().to_ascii_uppercase().as_str() {
        "SGD" => "Singapore Dollars".into(),
        "USD" => "US Dollars".into(),
        "MYR" => "Malaysian Ringgit".into(),
        "EUR" => "Euros".into(),
        "GBP" => "Pounds Sterling".into(),
        other => format!("{other} "),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn money_is_grouped_to_two_places() {
        assert_eq!(fmt2(6123.6), "6,123.60");
        assert_eq!(fmt2(0.0), "0.00");
        assert_eq!(fmt2(1234567.891), "1,234,567.89");
        assert_eq!(fmt2(-45.5), "-45.50");
    }

    #[test]
    fn dates_read_the_way_the_workbook_prints_them() {
        assert_eq!(long_date("2026-09-25"), "25 September 2026");
        assert_eq!(long_date("2026-09-05"), "5 September 2026");
        assert_eq!(long_date(""), "");
        assert_eq!(long_date("not a date"), "not a date");
    }

    #[test]
    fn short_dates_fit_a_table_cell() {
        assert_eq!(short_date("2026-09-25"), "25 Sep 2026");
        assert_eq!(short_date("2026-05-01"), "1 May 2026");
        assert_eq!(short_date(""), "");
    }

    #[test]
    fn rates_drop_trailing_zeros() {
        assert_eq!(trim_zeros(54.0), "54");
        assert_eq!(trim_zeros(25.9), "25.9");
        assert_eq!(trim_zeros(63.25), "63.25");
    }

    #[test]
    fn box_counts_stay_whole() {
        assert_eq!(fmt_qty(90.0), "90");
        assert_eq!(fmt_qty(1500.0), "1,500");
        assert_eq!(fmt_qty(90.5), "90.50");
    }
}
