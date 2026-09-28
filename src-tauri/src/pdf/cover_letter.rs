//! The monthly cover letter, from the workbook's second sheet (`Sep2025 (2)`).
//!
//! One customer, one month: the workbook's own copy — "we enclose the
//! following Debit notes" — only ever makes sense for a single settlement
//! cycle, so unlike the debit note this covers exactly the notes issued in
//! one `year_month`, listed in one column the way the sheet lists a month's
//! worth down column A.
//!
//! `Y_*` constants are the workbook's own row tops (row height in points,
//! converted to mm from the 0.748in top margin), the same way `debit_note.rs`
//! derives its layout, so the print matches rather than being eyeballed.

use crate::models::{Customer, Settings};
use crate::pdf::debit_note::long_date;
use crate::pdf::writer::{self, Font, Pdf, BLACK};

const L: f64 = 22.0;
const R: f64 = writer::A4_W - 22.0;
const BODY: Font = Font::Arial;
const BODY_B: Font = Font::ArialBold;
const FS: f64 = 10.0;

const Y_COMPANY_NAME: f64 = 24.0; // 12pt bold, where the banner sat
const Y_COMPANY_ADDR: f64 = 28.7; // 8.5pt
const Y_COMPANY_CONTACT: f64 = 33.0; // 8.5pt — tel / fax / email

const Y_DATE: f64 = 41.3; // row 5, "Date:"

const Y_ADDR_1: f64 = 50.6; // row 7  (addressee name)
const Y_ADDR_2: f64 = 55.3; // row 8
const Y_ADDR_3: f64 = 59.9; // row 9
const Y_ADDR_4: f64 = 64.6; // row 10
const Y_ADDR_5: f64 = 69.2; // row 11
const Y_ADDR_6: f64 = 73.9; // row 12
const ADDR_ROWS: [f64; 6] = [Y_ADDR_1, Y_ADDR_2, Y_ADDR_3, Y_ADDR_4, Y_ADDR_5, Y_ADDR_6];

const Y_ATTN: f64 = 83.2; // row 14
const Y_INTRO: f64 = 92.5; // row 16

const Y_LIST_TOP: f64 = 107.3; // row 18, first DN number
const LIST_ROW_H: f64 = 6.35; // rows 18-39 are 18pt each
const Y_LIST_BOTTOM: f64 = 240.0; // clears row 41 ("Yours Faithfully,")

const Y_SIGNOFF_1: f64 = 250.0; // row 41, "Yours Faithfully,"
const Y_SIGNOFF_2: f64 = 254.6; // row 42, company name (bold)
const Y_SIGNATORY_NAME: f64 = 282.4; // row 48
const Y_SIGNATORY_TITLE: f64 = 286.9; // row 49

pub struct CoverLetter<'a> {
    pub customer: &'a Customer,
    pub settings: &'a Settings,
    /// `YYYY-MM-DD`; the letter's own date, not a note's.
    pub letter_date: &'a str,
    /// The addressee's contact name — its own field because a cover letter's
    /// contact often isn't the customer record's default `attention`.
    pub attn_name: &'a str,
    /// Already resolved to the exact notes enclosed, across whatever month
    /// range the caller asked for — `render` groups them into one column per
    /// month by reading the month back out of each `DN<YYYYMM>-<NN>`.
    pub dn_numbers: Vec<String>,
}

pub fn render(letter: &CoverLetter<'_>) -> Vec<u8> {
    let mut pdf = Pdf::new(format!("Cover letter — {}", letter.customer.name));
    let s = letter.settings;
    let p = pdf.add_page();

    // Company letterhead, left-aligned where the workbook's banner image sat.
    p.text(L, Y_COMPANY_NAME, &s.company_name, BODY_B, 12.0, BLACK);
    p.text(L, Y_COMPANY_ADDR, &s.address_line, BODY, 8.5, BLACK);
    if !s.email.trim().is_empty() {
        p.text(L, Y_COMPANY_CONTACT, &format!("{}   Email: {}", s.registration_no, s.email.trim()), BODY, 8.5, BLACK);
    } else {
        p.text(L, Y_COMPANY_CONTACT, &s.registration_no, BODY, 8.5, BLACK);
    }
    p.hline(L, R, Y_COMPANY_CONTACT + 3.0, 0.4, BLACK);

    // A5 — "Date:"
    p.text(L, Y_DATE, "Date: ", BODY, FS, BLACK);
    p.text(L + 14.0, Y_DATE, &long_date(letter.letter_date), BODY, FS, BLACK);

    // A7-A12 — addressee, upper-cased on the sheet.
    let mut lines: Vec<String> = vec![letter.customer.name.to_uppercase()];
    lines.extend(letter.customer.address_lines().into_iter().map(str::to_uppercase));
    for (i, row_y) in ADDR_ROWS.iter().enumerate() {
        let Some(line) = lines.get(i) else { break };
        let font = if i == 0 { BODY_B } else { BODY };
        p.text(L, *row_y, line, font, FS, BLACK);
    }

    // A14 — "Attn:"
    if !letter.attn_name.trim().is_empty() {
        p.text(L, Y_ATTN, &format!("Attn: {}", letter.attn_name.trim()), BODY, FS, BLACK);
    }

    // A16 — the standing sentence.
    for (i, line) in writer::wrap(&s.cover_letter_intro, BODY, FS, R - L).iter().enumerate() {
        p.text(L, Y_INTRO + i as f64 * 5.2, line, BODY, FS, BLACK);
    }

    // A18.. — one column per month, wrapping to a further column if a single
    // month's notes run past the bottom of the block. The month itself isn't
    // a separate field on `dn_numbers` — it's read back out of each
    // `DN<YYYYMM>-<NN>`, so a multi-month enclosure never needs a second list
    // to stay in sync with the first.
    let max_rows = ((Y_LIST_BOTTOM - Y_LIST_TOP) / LIST_ROW_H).floor().max(1.0) as usize;
    let col_w = 32.0;
    if letter.dn_numbers.is_empty() {
        p.text(L, Y_LIST_TOP, "(no debit notes for this period)", Font::HelveticaOblique, 9.0, BLACK);
    } else {
        let mut columns: Vec<Vec<&str>> = Vec::new();
        let mut current_month = "";
        for n in &letter.dn_numbers {
            let month = dn_month(n);
            let starts_new_column = columns.is_empty()
                || month != current_month
                || columns.last().is_some_and(|c| c.len() >= max_rows);
            if starts_new_column {
                columns.push(Vec::new());
                current_month = month;
            }
            columns.last_mut().unwrap().push(n.as_str());
        }
        for (col, numbers) in columns.iter().enumerate() {
            for (row, n) in numbers.iter().enumerate() {
                p.text(L + col as f64 * col_w, Y_LIST_TOP + row as f64 * LIST_ROW_H, n, Font::Courier, 9.5, BLACK);
            }
        }
    }

    // A41-A49 — sign-off. The workbook names a signatory here (unlike the
    // debit note, which never does).
    p.text(L, Y_SIGNOFF_1, "Yours Faithfully,", BODY, FS, BLACK);
    p.text(L, Y_SIGNOFF_2, &s.company_name, BODY_B, FS, BLACK);
    p.text(L, Y_SIGNATORY_NAME, &s.signatory_name, BODY, FS, BLACK);
    p.text(L, Y_SIGNATORY_TITLE, &s.signatory_title, BODY, FS, BLACK);

    pdf.to_bytes()
}

/// `"DN202508-11"` -> `"202508"` — the month a DN number was issued in, read
/// straight out of the number rather than carried alongside it.
fn dn_month(dn: &str) -> &str {
    dn.get(2..8).unwrap_or("")
}

/// `202609` -> `September 2026`, for the column headings.
pub fn month_label(year_month: &str) -> String {
    const MONTHS: [&str; 12] = [
        "January", "February", "March", "April", "May", "June", "July", "August", "September",
        "October", "November", "December",
    ];
    if year_month.len() != 6 {
        return year_month.to_string();
    }
    let (y, m) = year_month.split_at(4);
    match m.parse::<usize>() {
        Ok(m) if (1..=12).contains(&m) => format!("{} {}", MONTHS[m - 1], y),
        _ => year_month.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn month_labels_read_as_prose() {
        assert_eq!(month_label("202609"), "September 2026");
        assert_eq!(month_label("202501"), "January 2025");
        assert_eq!(month_label("bad"), "bad");
        assert_eq!(month_label("202613"), "202613");
    }

    #[test]
    fn renders_a_pdf_even_with_no_notes() {
        let customer = Customer {
            id: 1,
            name: "Nusantara Rubber Board".into(),
            address_line1: "Level 3".into(),
            address_line2: String::new(),
            address_line3: String::new(),
            address_line4: String::new(),
            address_line5: String::new(),
            attention: "Ms Tan Wei Ling".into(),
            active: true,
        };
        let settings = Settings::default();
        let bytes = render(&CoverLetter {
            customer: &customer,
            settings: &settings,
            letter_date: "2026-09-30",
            attn_name: "Ms Tan Wei Ling",
            dn_numbers: vec![],
        });
        assert!(bytes.starts_with(b"%PDF-1.4"));
    }

    #[test]
    fn renders_a_pdf_with_notes() {
        let customer = Customer {
            id: 1,
            name: "Nusantara Rubber Board".into(),
            address_line1: String::new(),
            address_line2: String::new(),
            address_line3: String::new(),
            address_line4: String::new(),
            address_line5: String::new(),
            attention: String::new(),
            active: true,
        };
        let settings = Settings::default();
        let numbers: Vec<String> = (1..=13).map(|i| format!("DN202609-{i:02}")).collect();
        let bytes = render(&CoverLetter {
            customer: &customer,
            settings: &settings,
            letter_date: "2026-09-30",
            attn_name: "Ms Tan Wei Ling",
            dn_numbers: numbers,
        });
        assert!(bytes.starts_with(b"%PDF-1.4"));
    }

    #[test]
    fn dn_month_reads_the_month_out_of_the_number() {
        assert_eq!(dn_month("DN202508-11"), "202508");
        assert_eq!(dn_month("DN202609-01"), "202609");
        assert_eq!(dn_month(""), "");
    }

    #[test]
    fn a_multi_month_enclosure_still_renders() {
        let customer = Customer {
            id: 1,
            name: "Nusantara Rubber Board".into(),
            address_line1: String::new(),
            address_line2: String::new(),
            address_line3: String::new(),
            address_line4: String::new(),
            address_line5: String::new(),
            attention: String::new(),
            active: true,
        };
        let settings = Settings::default();
        let mut numbers: Vec<String> = (11..=16).map(|i| format!("DN202508-{i:02}")).collect();
        numbers.extend((1..=13).map(|i| format!("DN202609-{i:02}")));
        let bytes = render(&CoverLetter {
            customer: &customer,
            settings: &settings,
            letter_date: "2026-09-30",
            attn_name: "Ms Tan Wei Ling",
            dn_numbers: numbers,
        });
        assert!(bytes.starts_with(b"%PDF-1.4"));
    }
}
