//! Writes the three documents from the sample workbook's data into a directory,
//! so the layout can be eyeballed without launching the app:
//!   cargo run --example sample_pdfs -- <out-dir>
use dinamik_invoice_lib::{db::Db, models::*, pdf};

fn main() {
    let out = std::env::args().nth(1).unwrap_or_else(|| ".".into());
    std::fs::create_dir_all(&out).unwrap();

    let tmp = std::path::PathBuf::from(&out).join("sample.sqlite3");
    let _ = std::fs::remove_file(&tmp);
    let mut db = Db::open(&tmp).unwrap();
    let cid = db.customers().unwrap()[0].id;

    let input = DebitNoteInput {
        dn_number: String::new(),
        year_month: "202609".into(),
        dn_date: "2026-09-25".into(),
        customer_id: cid,
        buyer_name: "Bridgestone Singapore Pte Ltd".into(),
        customer_invoice_ref: "Your Invoice No. 13200".into(),
        si_number: "179/26".into(),
        contract_no: "283230".into(),
        boxes: 90.0,
        packing_desc: "Metal  Boxes (MB5)".into(),
        boxes_per_container: 16.0,
        mt_per_container: 20.16,
        product_desc: "SMR 20 Rubber".into(),
        feeder_vessel: "Jade Star".into(),
        feeder_voyage: "2610W".into(),
        feeder_arrival_date: "2026-09-22".into(),
        bl_number: "JJST2610W-BKI01".into(),
        p_number: "179/26".into(),
        p_descriptor: "Tuaran".into(),
        ocean_vessel: "Zim Mount Vinson".into(),
        ocean_voyage: "12E".into(),
        destination: "Savannah, USA".into(),
        bl_date: "2026-09-29".into(),
        charge_desc: "Transhipment Charge".into(),
        currency: "SGD".into(),
        rate_per_mt: 54.0,
        costs: None,
        remarks: String::new(),
    };
    let id = db.create_debit_note(&input).unwrap();
    for _ in 0..7 {
        db.create_debit_note(&input).unwrap();
    }
    db.set_filed(id, true).unwrap();

    let settings = db.settings().unwrap();
    let note = db.debit_note(id).unwrap();

    std::fs::write(format!("{out}/debit-note.pdf"), pdf::debit_note::render(&note, &settings)).unwrap();
    std::fs::write(
        format!("{out}/filing-report.pdf"),
        pdf::filing_report::render(&db.notes_in_month("202609").unwrap(), "202609", &settings, "2026-09-30"),
    )
    .unwrap();
    std::fs::write(
        format!("{out}/cover-letter.pdf"),
        pdf::cover_letter::render(&pdf::cover_letter::CoverLetter {
            customer: &db.customer(cid).unwrap(),
            settings: &settings,
            letter_date: "2026-09-30",
            attn_name: "Ms Chia Ching Lian",
            year_month: "202609",
            dn_numbers: db.dn_numbers_for(cid, &["202609".to_string()]).unwrap(),
        }),
    )
    .unwrap();

    println!("wrote debit-note.pdf, filing-report.pdf, cover-letter.pdf to {out}");
    println!("note: {} {} MT  total {}", note.dn_number, note.tonnage, note.total_amount);
}
