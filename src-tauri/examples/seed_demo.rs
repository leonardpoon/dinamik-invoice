//! Fills a database with a few months of realistic notes so the screens can be
//! looked at with data in them:  cargo run --example seed_demo -- <db path>
use dinamik_invoice_lib::{db::Db, models::*};

fn main() {
    let path = std::env::args().nth(1).expect("usage: seed_demo <db path>");
    let mut db = Db::open(std::path::Path::new(&path)).unwrap();
    let cid = db.customers().unwrap()[0].id;

    /// month, date, boxes, rate, buyer, destination, feeder, ocean vessel
    type Row = (&'static str, &'static str, u32, f64, &'static str, &'static str, &'static str, &'static str);
    let rows: [Row; 9] = [
        ("202607", "2026-07-14", 90, 54.0, "Bridgestone Singapore Pte Ltd", "Savannah, USA", "Jade Star", "Zim Mount Vinson"),
        ("202607", "2026-07-22", 64, 54.0, "Goodyear Orient Company", "Rotterdam, Netherlands", "Kota Ratu", "MSC Diana"),
        ("202608", "2026-08-09", 112, 54.0, "Bridgestone Singapore Pte Ltd", "Savannah, USA", "Jade Star", "Zim Mount Vinson"),
        ("202608", "2026-08-19", 48, 56.5, "Michelin Asia (Singapore)", "Le Havre, France", "Sinar Bintan", "CMA CGM Lyra"),
        ("202608", "2026-08-27", 80, 54.0, "Goodyear Orient Company", "Rotterdam, Netherlands", "Kota Ratu", "MSC Diana"),
        ("202609", "2026-09-04", 90, 54.0, "Bridgestone Singapore Pte Ltd", "Savannah, USA", "Jade Star", "Zim Mount Vinson"),
        ("202609", "2026-09-11", 128, 54.0, "Michelin Asia (Singapore)", "Le Havre, France", "Sinar Bintan", "CMA CGM Lyra"),
        ("202609", "2026-09-18", 72, 55.0, "Goodyear Orient Company", "Rotterdam, Netherlands", "Kota Ratu", "MSC Diana"),
        ("202609", "2026-09-25", 90, 54.0, "Bridgestone Singapore Pte Ltd", "Savannah, USA", "Jade Star", "Zim Mount Vinson"),
    ];

    for (i, (ym, date, boxes, rate, buyer, dest, feeder, ocean)) in rows.iter().enumerate() {
        let input = DebitNoteInput {
            dn_number: String::new(),
            year_month: (*ym).into(),
            dn_date: (*date).into(),
            customer_id: cid,
            buyer_name: (*buyer).into(),
            customer_invoice_ref: format!("Your Invoice No. 132{:02}", i + 1),
            si_number: format!("{}/26", 170 + i),
            contract_no: format!("28{}30", 3200 + i as u32),
            boxes: *boxes as f64,
            packing_desc: "Metal  Boxes (MB5)".into(),
            boxes_per_container: 16.0,
            mt_per_container: 20.16,
            product_desc: "SMR 20 Rubber".into(),
            feeder_vessel: (*feeder).into(),
            feeder_voyage: format!("26{:02}W", 10 + i),
            feeder_arrival_date: (*date).into(),
            bl_number: format!("JJST26{:02}W-BKI{:02}", 10 + i, i + 1),
            p_number: format!("{}/26", 170 + i),
            p_descriptor: "Tuaran".into(),
            ocean_vessel: (*ocean).into(),
            ocean_voyage: format!("{}E", 10 + i),
            destination: (*dest).into(),
            bl_date: (*date).into(),
            charge_desc: "Transhipment Charge".into(),
            currency: "SGD".into(),
            rate_per_mt: *rate,
            costs: None,
            remarks: String::new(),
        };
        let id = db.create_debit_note(&input).unwrap();
        db.save_preset(&Preset {
            id: 0,
            customer_id: Some(cid),
            buyer_name: (*buyer).into(),
            destination: (*dest).into(),
            si_number: String::new(),
            product_desc: "SMR 20 Rubber".into(),
            packing_desc: "Metal  Boxes (MB5)".into(),
            currency: "SGD".into(),
            rate_per_mt: *rate,
            boxes_per_container: 16.0,
            mt_per_container: 20.16,
            contract_no: String::new(),
        })
        .unwrap();
        if i < 5 {
            db.set_filed(id, true).unwrap();
        }
    }
    println!("seeded {} notes", db.summaries().unwrap().len());
}
