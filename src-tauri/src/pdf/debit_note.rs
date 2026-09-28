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

/// A tab-keypress-sized gap, used where a field needs to stand apart from the
/// text ahead of it on the same flowing line (wider than a plain word space,
/// short of jumping to a fixed column).
const TAB_GAP: f64 = 10.0;

const BODY: Font = Font::Tahoma;
const BODY_B: Font = Font::TahomaBold;
const FS: f64 = 10.0;

// Baselines, row N's from the workbook (`DNxxSep.JS10.BST.90USSAV01`): each is
// the *next* row's top edge less a small ascent allowance, so text sits low in
// its row the way Excel renders it.
const Y_TITLE: f64 = 24.4; // row 1, 16pt bold
const Y_ADDR: f64 = 29.5; // row 2, 9pt
const Y_REGNO: f64 = 34.0; // row 3, 9pt

// Reference HTML (`References for Claude/Debit Note Reference HTML.html`) draws
// no rule under the letterhead — the gap to the bill-to block is whitespace
// only — then a heavier rule after the bill-to block and a hairline again
// after the shipment/carriage block, right before the charge line.
const Y_DIVIDER_BILLTO: f64 = 82.0; // its ".divider-solid", between bill-to and "Your Invoice No."

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
const Y_BL: f64 = 112.0; // row 20 (rows 21-23, Shipped per/To/B/L dated, follow at the same step)
// Rows 19-23 are each this far apart; a line whose field is blank is
// skipped rather than left as an empty row, so the block below advances by
// this fixed step from wherever it currently is instead of jumping to the
// next row's own constant — otherwise a blank *middle* field (e.g. no ocean
// vessel, but a destination) leaves a double-height gap between the two
// lines either side of it.
const CARRIAGE_ROW_H: f64 = Y_BL - Y_FEEDER;

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

    // --- bill-to block (rows 7-12) and the title / No. / Date (L7-N12) ---
    let mut lines: Vec<&str> = vec![note.customer.name.as_str()];
    lines.extend(note.customer.address_lines());
    for (i, row_y) in BILLTO_ROWS.iter().enumerate() {
        let Some(line) = lines.get(i) else { break };
        let font = if i == 0 { BODY_B } else { BODY };
        p.text(L, *row_y, line, font, FS, BLACK);
    }

    p.text(LABEL_X, Y_BILLTO_1, "Debit Note", Font::TahomaBold, 12.0, BLACK);
    p.text(LABEL_X, Y_BILLTO_3, "No.  :", BODY, FS, BLACK);
    p.text(VALUE_X, Y_BILLTO_3, &note.dn_number, BODY_B, FS, BLACK);
    p.text(LABEL_X, Y_BILLTO_6, "Date  :", BODY, FS, BLACK);
    p.text(VALUE_X, Y_BILLTO_6, &long_date(&note.dn_date), BODY, FS, BLACK);

    p.hline(L, R, Y_DIVIDER_BILLTO, 0.6, BLACK);

    // --- reference lines (rows 16-17) ------------------------------------
    // "Your Invoice No." is a constant label — the reference HTML always
    // prints it, even blank; only the number after it is the note's field.
    p.text(
        L,
        Y_INVOICE_REF,
        &format!("Your Invoice No. {}", note.customer_invoice_ref.trim()),
        BODY,
        FS,
        BLACK,
    );
    // Flows as one line, not jumped to the workbook's fixed columns (which
    // left a large gap behind any shorter-than-expected buyer name) — but
    // with a tab-sized gap ahead of "Contract No.", not just a single space,
    // to set the reference number apart from the buyer's name.
    let buyer = note.buyer_name.trim();
    if !buyer.is_empty() {
        p.text(L, Y_BUYER, buyer, BODY, FS, BLACK);
    }
    if let Some((label, value)) = si_or_contract(note) {
        let ref_x = if buyer.is_empty() {
            L
        } else {
            L + writer::text_width(buyer, BODY, FS) + TAB_GAP
        };
        p.text(ref_x, Y_BUYER, &format!("{label} {value}"), BODY, FS, BLACK);
    }

    // --- cargo line (row 18): "90 Metal Boxes (MB5) 113.40 M/Tons SMR 20 Rubber"
    // Same reasoning: one flowing sentence, single-space joins.
    let cargo_line = format!(
        "{} {} {} M/Tons {}",
        fmt_qty(note.boxes),
        note.packing_desc.trim(),
        fmt2(note.tonnage),
        note.product_desc.trim(),
    );
    p.text(L, Y_CARGO, &cargo_line, BODY, FS, BLACK);

    // --- carriage (rows 19-23) -------------------------------------------
    let mut y = Y_FEEDER;
    if !note.feeder_vessel.trim().is_empty() {
        // "Ex Coral Star Voy 2609W Arrd 22 September 2026" — one flowing line.
        let mut feeder_line = vec![format!("Ex {}", note.feeder_vessel.trim())];
        if !note.feeder_voyage.trim().is_empty() {
            feeder_line.push(format!("Voy {}", note.feeder_voyage.trim()));
        }
        if !note.feeder_arrival_date.trim().is_empty() {
            feeder_line.push("Arrd".to_string());
            feeder_line.push(long_date(&note.feeder_arrival_date));
        }
        p.text(L, y, &feeder_line.join(" "), BODY, FS, BLACK);
        y += CARRIAGE_ROW_H;
    }
    if !note.bl_number.trim().is_empty() {
        p.text(L, y, &format!("B/L No. {}", note.bl_number.trim()), BODY, FS, BLACK);
        // "(205/26   Riverside Estate)" — the P No. and its free-text descriptor.
        if !note.p_number.trim().is_empty() {
            let inner = if note.p_descriptor.trim().is_empty() {
                note.p_number.trim().to_string()
            } else {
                format!("{}   {}", note.p_number.trim(), note.p_descriptor.trim())
            };
            p.text(LABEL_X - 10.0, y, &format!("({inner})"), BODY, FS, BLACK);
        }
        y += CARRIAGE_ROW_H;
    }
    if !note.ocean_vessel.trim().is_empty() {
        let voy = if note.ocean_voyage.trim().is_empty() {
            String::new()
        } else {
            format!(" Voy {}", note.ocean_voyage.trim())
        };
        p.text(L, y, &format!("Shipped per {}{}", note.ocean_vessel.trim(), voy), BODY, FS, BLACK);
        y += CARRIAGE_ROW_H;
    }
    if !note.destination.trim().is_empty() {
        p.text(L, y, &format!("To {}", note.destination.trim()), BODY, FS, BLACK);
        y += CARRIAGE_ROW_H;
    }
    if !note.bl_date.trim().is_empty() {
        p.text(L, y, &format!("B/L dated {}", long_date(&note.bl_date)), BODY, FS, BLACK);
        y += CARRIAGE_ROW_H;
    }

    // --- charge (row 26) and total (row 31) ------------------------------
    // The workbook anchors the charge low on the sheet so the totals always
    // land in the same place whatever the cargo block's height; a long
    // address pushes past the anchor rather than the other way round.
    let charge_y = y.max(Y_CHARGE_MIN);
    p.hline(L, R, charge_y - 4.5, 0.35, BLACK);
    let sym = currency_symbol(&note.currency);
    // "Transhipment Charge" on the left; "@ S$ 54 per M/Ton" centred in the
    // middle as its own aside; the amount right-aligned at R so it lines up
    // with the Total row below, same as that row's own S$ / amount pair.
    p.text(L, charge_y, note.charge_desc.trim(), BODY, FS, BLACK);
    p.text_aligned(
        (L + R) / 2.0,
        charge_y,
        &format!("@ {sym} {} per M/Ton", fmt2(note.rate_per_mt)),
        BODY,
        FS,
        BLACK,
        Align::Center,
    );
    // "S$" leads the amount as one right-aligned unit, not a separate symbol
    // sitting off to the left of a gap before the number.
    p.text_aligned(R, charge_y, &format!("{sym} {}", fmt2(note.charge_amount)), BODY, FS, BLACK, Align::Right);

    // Row 31 — SUM(N26:N28), double-ruled the way the sheet closes a total.
    // The rule above and the double underline below are sized to the total
    // text itself (+5mm), not stretched out to a fixed column.
    let total_str = format!("{sym} {}", fmt2(note.total_amount));
    let total_line_x = R - writer::text_width(&total_str, BODY_B, FS) - 5.0;
    p.hline(total_line_x, R, Y_TOTAL - 4.6, 0.4, BLACK);
    p.text_aligned(R, Y_TOTAL, &total_str, BODY_B, FS, BLACK, Align::Right);
    p.line(total_line_x, Y_TOTAL_RULE, R, Y_TOTAL_RULE, 0.4, BLACK);
    p.line(total_line_x, Y_TOTAL_RULE + 1.0, R, Y_TOTAL_RULE + 1.0, 0.4, BLACK);

    // --- amount in words (row 35) ----------------------------------------
    // "Singapore Dollars Six Thousand One Hundred..." flows as one sentence
    // and wraps as one paragraph, rather than the amount starting at a fixed
    // indent regardless of how wide the currency name is.
    let words_line =
        format!("{} {}", currency_words(&note.currency).trim_end(), note.amount_in_words.trim());
    for (i, line) in writer::wrap(&words_line, BODY, FS, R - L).iter().enumerate() {
        p.text(L, Y_WORDS + i as f64 * 4.6, line, BODY, FS, BLACK);
    }

    // --- payment instructions (rows 39-40) -------------------------------
    // The reference HTML doesn't give `.payment-terms` its own smaller class,
    // so it inherits the sheet's 10pt body size rather than a footnote size.
    p.text(L, Y_PAY1, &s.payment_line1, BODY, FS, BLACK);
    p.text(L, Y_PAY2, &s.payment_line2, BODY, FS, BLACK);

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
    p.text(VALUE_X - 20.0, Y_SIG_FOR, &format!("for {}", s.company_name), BODY, FS, BLACK);
    p.hline(VALUE_X - 20.0, R, Y_SIG_LINE, 0.4, BLACK);
    p.text(L, Y_EOE, "E & O E", BODY, FS, BLACK);

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
    fn box_counts_stay_whole() {
        assert_eq!(fmt_qty(90.0), "90");
        assert_eq!(fmt_qty(1500.0), "1,500");
        assert_eq!(fmt_qty(90.5), "90.50");
    }
}
