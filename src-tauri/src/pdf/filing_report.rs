//! The monthly filing record.
//!
//! A plain black-on-white table — Debit No. | Date | P No. | B/L No. | Outward
//! Vessel | a blank tick-box — so the office can print a month's worth, run a
//! pen down the register while filing the paper copies, and file the sheet
//! itself alongside them. No money on it: filing is a paperwork-tracking task,
//! not an accounts one, so the total/cost/profit columns the earlier version
//! carried have no place here.

use crate::models::{DebitNoteSummary, Settings};
use crate::pdf::cover_letter::month_label;
use crate::pdf::debit_note::short_date;
use crate::pdf::writer::{self, Align, Font, Page, Pdf, BLACK, GREY};

const L: f64 = 14.0;
const R: f64 = writer::A4_W - 14.0;
const BODY: Font = Font::Tahoma;
const BOLD: Font = Font::TahomaBold;

struct Col {
    label: &'static str,
    x: f64,
    w: f64,
}

fn columns() -> Vec<Col> {
    let mut x = L;
    let mut col = |label, w| {
        let c = Col { label, x, w };
        x += w;
        c
    };
    vec![
        col("DEBIT NO.", 32.0),
        col("DATE", 26.0),
        col("P NO.", 24.0),
        col("B/L NO.", 40.0),
        col("OUTWARD VESSEL", 42.0),
        col("FILED", 18.0),
    ]
}

pub fn render(notes: &[DebitNoteSummary], year_month: &str, settings: &Settings, today: &str) -> Vec<u8> {
    let mut pdf = Pdf::new(format!("Filing record — {}", month_label(year_month)));
    let cols = columns();

    const TOP: f64 = 42.0;
    const ROW_H: f64 = 7.0;
    const BOTTOM: f64 = writer::A4_H - 20.0;
    let rows_per_page = ((BOTTOM - TOP) / ROW_H).floor().max(1.0) as usize;

    let pages: Vec<&[DebitNoteSummary]> = if notes.is_empty() {
        vec![&[]]
    } else {
        notes.chunks(rows_per_page).collect()
    };
    let page_count = pages.len();

    for (pi, chunk) in pages.iter().enumerate() {
        let p = pdf.add_page();
        header(p, settings, year_month, notes.len(), today, pi + 1, page_count);

        p.rect_filled(L, TOP - 5.0, R - L, 6.5, writer::Rgb(0.92, 0.92, 0.92));
        for c in &cols {
            p.text(c.x + 1.5, TOP - 0.6, c.label, BOLD, 7.0, BLACK);
        }
        p.hline(L, R, TOP + 1.5, 0.4, BLACK);

        let mut y = TOP + 6.5;
        for n in chunk.iter() {
            let p_no = &cols[2];
            let filed = &cols[5];
            p.text_clipped(cols[0].x + 1.5, y, &n.dn_number, Font::Courier, 8.0, BLACK, cols[0].w - 3.0);
            p.text(cols[1].x + 1.5, y, &short_date(&n.dn_date), BODY, 8.0, BLACK);
            p.text_clipped(p_no.x + 1.5, y, &n.p_number, BODY, 8.0, BLACK, p_no.w - 3.0);
            p.text_clipped(cols[3].x + 1.5, y, &n.bl_number, BODY, 8.0, BLACK, cols[3].w - 3.0);
            p.text_clipped(cols[4].x + 1.5, y, &n.ocean_vessel, BODY, 8.0, BLACK, cols[4].w - 3.0);
            // A blank box: filing is ticked off on paper, by hand, as the
            // notes physically go into the folder.
            p.rect_stroked(filed.x + filed.w / 2.0 - 2.2, y - 3.4, 4.4, 4.4, 0.3, BLACK);
            p.hline(L, R, y + 2.2, 0.15, writer::Rgb(0.82, 0.82, 0.82));
            y += ROW_H;
        }
    }

    pdf.to_bytes()
}

fn header(p: &mut Page, s: &Settings, year_month: &str, count: usize, today: &str, page: usize, pages: usize) {
    p.text(L, 18.0, &s.company_name, Font::TahomaBold, 12.0, BLACK);
    p.text(L, 24.5, "Filing Record", BOLD, 10.0, BLACK);
    p.text(L, 30.0, &month_label(year_month), BODY, 9.0, BLACK);

    p.text_aligned(R, 18.0, &format!("D{year_month}"), Font::CourierBold, 10.0, BLACK, Align::Right);
    p.text_aligned(
        R,
        24.5,
        &format!("Printed {}   \u{b7}   {} debit note{}", crate::pdf::debit_note::long_date(today), count, plural(count)),
        BODY,
        7.0,
        GREY,
        Align::Right,
    );
    if pages > 1 {
        p.text_aligned(R, 30.0, &format!("Page {page} of {pages}"), BODY, 7.0, GREY, Align::Right);
    }
    p.hline(L, R, 34.0, 0.5, BLACK);
}

fn plural(n: usize) -> &'static str {
    if n == 1 {
        ""
    } else {
        "s"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::NoteStatus;

    fn note(dn: &str) -> DebitNoteSummary {
        DebitNoteSummary {
            id: 1,
            dn_number: dn.into(),
            year_month: "202609".into(),
            dn_date: "2026-09-25".into(),
            status: NoteStatus::Issued,
            customer_name: "Sabah Rubber Industry Board".into(),
            buyer_name: "Bridgestone Singapore Pte Ltd".into(),
            customer_invoice_ref: String::new(),
            si_number: "179/26".into(),
            contract_no: "283230".into(),
            bl_number: "JJST2610W-BKI01".into(),
            p_number: "179/26".into(),
            feeder_vessel: "Jade Star".into(),
            ocean_vessel: "Zim Mount Vinson".into(),
            destination: "Savannah, USA".into(),
            product_desc: "SMR 20 Rubber".into(),
            shipment_type: crate::calc::ShipmentType::Container,
            boxes: 90.0,
            containers: 5.625,
            tonnage: 113.4,
            currency: "SGD".into(),
            total_amount: 6123.6,
            total_cost: 3793.97,
            profit: 2329.63,
        }
    }

    #[test]
    fn renders_with_rows() {
        let notes: Vec<_> = (1..=5).map(|i| note(&format!("DN202609-{i:02}"))).collect();
        let bytes = render(&notes, "202609", &Settings::default(), "2026-09-30");
        assert!(bytes.starts_with(b"%PDF-1.4"));
        assert!(bytes.len() > 1000);
    }

    #[test]
    fn renders_an_empty_month_as_one_page() {
        let bytes = render(&[], "202609", &Settings::default(), "2026-09-30");
        assert!(bytes.starts_with(b"%PDF-1.4"));
    }

    #[test]
    fn paginates_a_long_month() {
        let notes: Vec<_> = (1..=90).map(|i| note(&format!("DN202609-{i:02}"))).collect();
        let bytes = render(&notes, "202609", &Settings::default(), "2026-09-30");
        let page_objects = String::from_utf8_lossy(&bytes).matches("/Type /Page ").count();
        assert!(page_objects >= 2, "expected more than one page, got {page_objects}");
    }
}
