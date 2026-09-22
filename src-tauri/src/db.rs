//! SQLite storage.
//!
//! One file, `dinamik-invoice.sqlite3`, in the app data directory. Everything
//! the office needs to back up is that single file — which is the main reason
//! the app moved off a server database.
//!
//! Every derived figure (containers, tonnage, charge, cost lines, profit) is
//! recomputed here from [`crate::calc`] before it is written, so a row can never
//! disagree with the spreadsheet's formulas even if the form sends stale values.

use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::calc::{
    self, CargoInput, CostBasis, CostCategory, CostContext, CostLine, compute_cargo, compute_costs,
};
use crate::error::{AppError, Result};
use crate::models::*;
use crate::words::amount_to_words;

pub struct Db {
    conn: Connection,
}

impl Db {
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        let db = Db { conn };
        db.migrate()?;
        db.seed()?;
        Ok(db)
    }

    #[cfg(test)]
    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        let db = Db { conn };
        db.migrate()?;
        db.seed()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<()> {
        self.conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS setting (
                id                          INTEGER PRIMARY KEY CHECK (id = 1),
                company_name                TEXT NOT NULL,
                address_line                TEXT NOT NULL,
                registration_no             TEXT NOT NULL,
                payment_line1               TEXT NOT NULL,
                payment_line2               TEXT NOT NULL,
                signatory_name              TEXT NOT NULL,
                signatory_title             TEXT NOT NULL,
                cover_letter_intro          TEXT NOT NULL,
                default_packing_desc        TEXT NOT NULL,
                default_product_desc        TEXT NOT NULL,
                default_boxes_per_container REAL NOT NULL,
                default_mt_per_container    REAL NOT NULL,
                default_charge_desc         TEXT NOT NULL,
                default_rate_per_mt         REAL NOT NULL,
                default_currency            TEXT NOT NULL,
                email                       TEXT NOT NULL DEFAULT '',
                cover_letter_customer_id    INTEGER,
                cover_letter_attn_name      TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS customer (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                name          TEXT NOT NULL,
                address_line1 TEXT NOT NULL DEFAULT '',
                address_line2 TEXT NOT NULL DEFAULT '',
                address_line3 TEXT NOT NULL DEFAULT '',
                address_line4 TEXT NOT NULL DEFAULT '',
                address_line5 TEXT NOT NULL DEFAULT '',
                attention     TEXT NOT NULL DEFAULT '',
                active        INTEGER NOT NULL DEFAULT 1
            );
            CREATE INDEX IF NOT EXISTS idx_customer_name ON customer(name);

            CREATE TABLE IF NOT EXISTS rate_default (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                category   TEXT NOT NULL,
                code       TEXT NOT NULL,
                label      TEXT NOT NULL DEFAULT '',
                basis      TEXT NOT NULL,
                rate       REAL NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 0,
                active     INTEGER NOT NULL DEFAULT 1,
                UNIQUE (category, code)
            );

            CREATE TABLE IF NOT EXISTS preset (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id         INTEGER REFERENCES customer(id) ON DELETE SET NULL,
                buyer_name          TEXT NOT NULL,
                destination         TEXT NOT NULL DEFAULT '',
                si_number           TEXT NOT NULL DEFAULT '',
                product_desc        TEXT NOT NULL DEFAULT '',
                packing_desc        TEXT NOT NULL DEFAULT '',
                currency            TEXT NOT NULL DEFAULT 'SGD',
                rate_per_mt         REAL NOT NULL DEFAULT 0,
                boxes_per_container REAL NOT NULL DEFAULT 16,
                mt_per_container    REAL NOT NULL DEFAULT 20.16,
                contract_no         TEXT NOT NULL DEFAULT '',
                UNIQUE (buyer_name, destination)
            );

            CREATE TABLE IF NOT EXISTS debit_note (
                id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                dn_number            TEXT NOT NULL UNIQUE,
                year_month           TEXT NOT NULL,
                running_no           INTEGER NOT NULL,
                dn_date              TEXT NOT NULL,
                status               TEXT NOT NULL DEFAULT 'issued',
                filed_at             TEXT,

                customer_id          INTEGER NOT NULL REFERENCES customer(id),
                buyer_name           TEXT NOT NULL DEFAULT '',
                customer_invoice_ref TEXT NOT NULL DEFAULT '',
                si_number            TEXT NOT NULL DEFAULT '',
                contract_no          TEXT NOT NULL DEFAULT '',

                boxes                REAL NOT NULL DEFAULT 0,
                packing_desc         TEXT NOT NULL DEFAULT '',
                boxes_per_container  REAL NOT NULL DEFAULT 16,
                mt_per_container     REAL NOT NULL DEFAULT 20.16,
                containers           REAL NOT NULL DEFAULT 0,
                tonnage              REAL NOT NULL DEFAULT 0,
                product_desc         TEXT NOT NULL DEFAULT '',

                feeder_vessel        TEXT NOT NULL DEFAULT '',
                feeder_voyage        TEXT NOT NULL DEFAULT '',
                feeder_arrival_date  TEXT NOT NULL DEFAULT '',
                bl_number            TEXT NOT NULL DEFAULT '',
                p_number             TEXT NOT NULL DEFAULT '',
                p_descriptor         TEXT NOT NULL DEFAULT '',

                ocean_vessel         TEXT NOT NULL DEFAULT '',
                ocean_voyage         TEXT NOT NULL DEFAULT '',
                destination          TEXT NOT NULL DEFAULT '',
                bl_date              TEXT NOT NULL DEFAULT '',

                charge_desc          TEXT NOT NULL DEFAULT 'Transhipment Charge',
                currency             TEXT NOT NULL DEFAULT 'SGD',
                rate_per_mt          REAL NOT NULL DEFAULT 0,
                charge_amount        REAL NOT NULL DEFAULT 0,
                total_amount         REAL NOT NULL DEFAULT 0,
                amount_in_words      TEXT NOT NULL DEFAULT '',

                cost_port            REAL NOT NULL DEFAULT 0,
                cost_transport       REAL NOT NULL DEFAULT 0,
                cost_misc            REAL NOT NULL DEFAULT 0,
                total_cost           REAL NOT NULL DEFAULT 0,
                profit               REAL NOT NULL DEFAULT 0,

                remarks              TEXT NOT NULL DEFAULT '',
                created_at           TEXT NOT NULL,
                updated_at           TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_dn_year_month  ON debit_note(year_month);
            CREATE INDEX IF NOT EXISTS idx_dn_date        ON debit_note(dn_date);
            CREATE INDEX IF NOT EXISTS idx_dn_customer    ON debit_note(customer_id);
            CREATE INDEX IF NOT EXISTS idx_dn_destination ON debit_note(destination);
            CREATE INDEX IF NOT EXISTS idx_dn_status      ON debit_note(status);

            CREATE TABLE IF NOT EXISTS debit_note_cost (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                debit_note_id INTEGER NOT NULL REFERENCES debit_note(id) ON DELETE CASCADE,
                category      TEXT NOT NULL,
                code          TEXT NOT NULL,
                label         TEXT NOT NULL DEFAULT '',
                basis         TEXT NOT NULL,
                rate          REAL NOT NULL DEFAULT 0,
                amount        REAL NOT NULL DEFAULT 0,
                sort_order    INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_cost_note ON debit_note_cost(debit_note_id);
            "#,
        )?;

        // `CREATE TABLE IF NOT EXISTS` above only helps a fresh database — an
        // existing one predating a field needs the column added by hand. SQLite
        // has no `ADD COLUMN IF NOT EXISTS`, so a "duplicate column" error is
        // the expected, ignorable outcome once a column is already there.
        for stmt in [
            "ALTER TABLE debit_note ADD COLUMN p_number TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE debit_note ADD COLUMN p_descriptor TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE setting ADD COLUMN email TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE setting ADD COLUMN cover_letter_customer_id INTEGER",
            "ALTER TABLE setting ADD COLUMN cover_letter_attn_name TEXT NOT NULL DEFAULT ''",
        ] {
            let _ = self.conn.execute(stmt, []);
        }
        Ok(())
    }

    fn seed(&self) -> Result<()> {
        let has_settings: i64 =
            self.conn.query_row("SELECT COUNT(*) FROM setting", [], |r| r.get(0))?;
        if has_settings == 0 {
            self.save_settings(&Settings::default())?;
        }

        let has_rates: i64 =
            self.conn.query_row("SELECT COUNT(*) FROM rate_default", [], |r| r.get(0))?;
        if has_rates == 0 {
            for l in calc::default_rate_card() {
                self.conn.execute(
                    "INSERT INTO rate_default (category, code, label, basis, rate, sort_order, active)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)",
                    params![
                        l.category.as_str(),
                        l.code,
                        l.label,
                        l.basis.as_str(),
                        l.rate,
                        l.sort_order
                    ],
                )?;
            }
        }

        let has_customers: i64 =
            self.conn.query_row("SELECT COUNT(*) FROM customer", [], |r| r.get(0))?;
        if has_customers == 0 {
            // The bill-to party on the sample debit note, so a fresh install has
            // something to select on the very first note.
            self.conn.execute(
                "INSERT INTO customer
                   (name, address_line1, address_line2, address_line3, address_line4, address_line5, attention)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    "Sabah Rubber Industry Board",
                    "Level 3, Wisma Pertanian Sabah",
                    "Jalan Tasik",
                    "Luyang (off Jalan Maktab Gaya)",
                    "Kota Kinabalu, Sabah",
                    "East Malaysia",
                    "Ms Chia Ching Lian",
                ],
            )?;
        }
        Ok(())
    }

    // ----- settings ---------------------------------------------------------

    pub fn settings(&self) -> Result<Settings> {
        let s = self
            .conn
            .query_row("SELECT * FROM setting WHERE id = 1", [], |r| {
                Ok(Settings {
                    company_name: r.get("company_name")?,
                    address_line: r.get("address_line")?,
                    registration_no: r.get("registration_no")?,
                    payment_line1: r.get("payment_line1")?,
                    payment_line2: r.get("payment_line2")?,
                    signatory_name: r.get("signatory_name")?,
                    signatory_title: r.get("signatory_title")?,
                    cover_letter_intro: r.get("cover_letter_intro")?,
                    default_packing_desc: r.get("default_packing_desc")?,
                    default_product_desc: r.get("default_product_desc")?,
                    default_boxes_per_container: r.get("default_boxes_per_container")?,
                    default_mt_per_container: r.get("default_mt_per_container")?,
                    default_charge_desc: r.get("default_charge_desc")?,
                    default_rate_per_mt: r.get("default_rate_per_mt")?,
                    default_currency: r.get("default_currency")?,
                    email: r.get("email")?,
                    cover_letter_customer_id: r.get("cover_letter_customer_id")?,
                    cover_letter_attn_name: r.get("cover_letter_attn_name")?,
                })
            })
            .optional()?;
        Ok(s.unwrap_or_default())
    }

    pub fn save_settings(&self, s: &Settings) -> Result<()> {
        self.conn.execute(
            "INSERT INTO setting (id, company_name, address_line, registration_no, payment_line1,
                 payment_line2, signatory_name, signatory_title, cover_letter_intro,
                 default_packing_desc, default_product_desc, default_boxes_per_container,
                 default_mt_per_container, default_charge_desc, default_rate_per_mt, default_currency,
                 email, cover_letter_customer_id, cover_letter_attn_name)
             VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
             ON CONFLICT(id) DO UPDATE SET
                 company_name = excluded.company_name,
                 address_line = excluded.address_line,
                 registration_no = excluded.registration_no,
                 payment_line1 = excluded.payment_line1,
                 payment_line2 = excluded.payment_line2,
                 signatory_name = excluded.signatory_name,
                 signatory_title = excluded.signatory_title,
                 cover_letter_intro = excluded.cover_letter_intro,
                 default_packing_desc = excluded.default_packing_desc,
                 default_product_desc = excluded.default_product_desc,
                 default_boxes_per_container = excluded.default_boxes_per_container,
                 default_mt_per_container = excluded.default_mt_per_container,
                 default_charge_desc = excluded.default_charge_desc,
                 default_rate_per_mt = excluded.default_rate_per_mt,
                 default_currency = excluded.default_currency,
                 email = excluded.email,
                 cover_letter_customer_id = excluded.cover_letter_customer_id,
                 cover_letter_attn_name = excluded.cover_letter_attn_name",
            params![
                s.company_name,
                s.address_line,
                s.registration_no,
                s.payment_line1,
                s.payment_line2,
                s.signatory_name,
                s.signatory_title,
                s.cover_letter_intro,
                s.default_packing_desc,
                s.default_product_desc,
                s.default_boxes_per_container,
                s.default_mt_per_container,
                s.default_charge_desc,
                s.default_rate_per_mt,
                s.default_currency,
                s.email,
                s.cover_letter_customer_id,
                s.cover_letter_attn_name,
            ],
        )?;
        Ok(())
    }

    // ----- customers --------------------------------------------------------

    pub fn customers(&self) -> Result<Vec<Customer>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, address_line1, address_line2, address_line3, address_line4,
                    address_line5, attention, active
             FROM customer ORDER BY active DESC, name",
        )?;
        let rows = stmt.query_map([], row_to_customer)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    pub fn customer(&self, id: i64) -> Result<Customer> {
        self.conn
            .query_row(
                "SELECT id, name, address_line1, address_line2, address_line3, address_line4,
                        address_line5, attention, active
                 FROM customer WHERE id = ?1",
                params![id],
                row_to_customer,
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound(format!("customer {id}")))
    }

    pub fn save_customer(&self, c: &Customer) -> Result<i64> {
        if c.name.trim().is_empty() {
            return Err(AppError::Validation("Customer name is required".into()));
        }
        if c.id > 0 {
            self.conn.execute(
                "UPDATE customer SET name = ?2, address_line1 = ?3, address_line2 = ?4,
                     address_line3 = ?5, address_line4 = ?6, address_line5 = ?7,
                     attention = ?8, active = ?9
                 WHERE id = ?1",
                params![
                    c.id,
                    c.name.trim(),
                    c.address_line1,
                    c.address_line2,
                    c.address_line3,
                    c.address_line4,
                    c.address_line5,
                    c.attention,
                    c.active
                ],
            )?;
            Ok(c.id)
        } else {
            self.conn.execute(
                "INSERT INTO customer (name, address_line1, address_line2, address_line3,
                     address_line4, address_line5, attention, active)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    c.name.trim(),
                    c.address_line1,
                    c.address_line2,
                    c.address_line3,
                    c.address_line4,
                    c.address_line5,
                    c.attention,
                    c.active
                ],
            )?;
            Ok(self.conn.last_insert_rowid())
        }
    }

    pub fn delete_customer(&self, id: i64) -> Result<()> {
        let used: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM debit_note WHERE customer_id = ?1",
            params![id],
            |r| r.get(0),
        )?;
        if used > 0 {
            // Debit notes must keep pointing at the party they were billed to,
            // so a customer with history is retired rather than removed.
            self.conn.execute("UPDATE customer SET active = 0 WHERE id = ?1", params![id])?;
        } else {
            self.conn.execute("DELETE FROM customer WHERE id = ?1", params![id])?;
        }
        Ok(())
    }

    // ----- rate card --------------------------------------------------------

    pub fn rate_card(&self) -> Result<Vec<RateDefault>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, category, code, label, basis, rate, sort_order, active
             FROM rate_default
             ORDER BY CASE category WHEN 'PORT' THEN 0 WHEN 'TRANSPORT' THEN 1 ELSE 2 END,
                      sort_order, code",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(RateDefault {
                id: r.get("id")?,
                category: CostCategory::parse(&r.get::<_, String>("category")?)
                    .unwrap_or(CostCategory::Misc),
                code: r.get("code")?,
                label: r.get("label")?,
                basis: CostBasis::parse(&r.get::<_, String>("basis")?).unwrap_or(CostBasis::Flat),
                rate: r.get("rate")?,
                sort_order: r.get("sort_order")?,
                active: r.get("active")?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Replaces the whole card in one transaction — the editor sends the full
    /// table back, so a partial apply would silently drop rows the user deleted.
    pub fn save_rate_card(&mut self, lines: &[RateDefault]) -> Result<()> {
        let tx = self.conn.transaction()?;
        tx.execute("DELETE FROM rate_default", [])?;
        for l in lines {
            if l.code.trim().is_empty() {
                continue;
            }
            tx.execute(
                "INSERT INTO rate_default (category, code, label, basis, rate, sort_order, active)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(category, code) DO UPDATE SET
                     label = excluded.label, basis = excluded.basis, rate = excluded.rate,
                     sort_order = excluded.sort_order, active = excluded.active",
                params![
                    l.category.as_str(),
                    l.code.trim(),
                    if l.label.trim().is_empty() { l.code.trim() } else { l.label.trim() },
                    l.basis.as_str(),
                    l.rate,
                    l.sort_order,
                    l.active
                ],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    fn active_rate_card_as_cost_lines(&self) -> Result<Vec<CostLine>> {
        Ok(self
            .rate_card()?
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
            .collect())
    }

    // ----- presets ----------------------------------------------------------

    pub fn presets(&self) -> Result<Vec<Preset>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, customer_id, buyer_name, destination, si_number, product_desc,
                    packing_desc, currency, rate_per_mt, boxes_per_container, mt_per_container,
                    contract_no
             FROM preset ORDER BY buyer_name, destination",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(Preset {
                id: r.get("id")?,
                customer_id: r.get("customer_id")?,
                buyer_name: r.get("buyer_name")?,
                destination: r.get("destination")?,
                si_number: r.get("si_number")?,
                product_desc: r.get("product_desc")?,
                packing_desc: r.get("packing_desc")?,
                currency: r.get("currency")?,
                rate_per_mt: r.get("rate_per_mt")?,
                boxes_per_container: r.get("boxes_per_container")?,
                mt_per_container: r.get("mt_per_container")?,
                contract_no: r.get("contract_no")?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    pub fn save_preset(&self, p: &Preset) -> Result<()> {
        if p.buyer_name.trim().is_empty() {
            return Ok(());
        }
        self.conn.execute(
            "INSERT INTO preset (customer_id, buyer_name, destination, si_number, product_desc,
                 packing_desc, currency, rate_per_mt, boxes_per_container, mt_per_container, contract_no)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(buyer_name, destination) DO UPDATE SET
                 customer_id = excluded.customer_id,
                 si_number = excluded.si_number,
                 product_desc = excluded.product_desc,
                 packing_desc = excluded.packing_desc,
                 currency = excluded.currency,
                 rate_per_mt = excluded.rate_per_mt,
                 boxes_per_container = excluded.boxes_per_container,
                 mt_per_container = excluded.mt_per_container,
                 contract_no = excluded.contract_no",
            params![
                p.customer_id,
                p.buyer_name.trim(),
                p.destination.trim(),
                p.si_number,
                p.product_desc,
                p.packing_desc,
                p.currency,
                p.rate_per_mt,
                p.boxes_per_container,
                p.mt_per_container,
                p.contract_no
            ],
        )?;
        Ok(())
    }

    pub fn delete_preset(&self, id: i64) -> Result<()> {
        self.conn.execute("DELETE FROM preset WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ----- debit notes ------------------------------------------------------

    /// Next free running number for a month, so the form can show the DN number
    /// it is about to take before the user commits.
    pub fn next_running_no(&self, year_month: &str) -> Result<i64> {
        let n: Option<i64> = self.conn.query_row(
            "SELECT MAX(running_no) FROM debit_note WHERE year_month = ?1",
            params![year_month],
            |r| r.get(0),
        )?;
        Ok(n.unwrap_or(0) + 1)
    }

    pub fn create_debit_note(&mut self, input: &DebitNoteInput) -> Result<i64> {
        validate(input)?;
        let costs = match &input.costs {
            Some(c) => c.clone(),
            None => self.active_rate_card_as_cost_lines()?,
        };

        let running_no;
        let dn_number;
        if input.dn_number.trim().is_empty() {
            running_no = self.next_running_no(&input.year_month)?;
            dn_number = format!("DN{}-{:02}", input.year_month, running_no);
        } else {
            dn_number = input.dn_number.trim().to_string();
            // Keep the running number in step with a manually typed DN so the
            // next auto-assigned one does not collide with it.
            running_no = dn_number
                .rsplit('-')
                .next()
                .and_then(|s| s.trim().parse::<i64>().ok())
                .unwrap_or_else(|| self.next_running_no(&input.year_month).unwrap_or(1));
        }

        if self.dn_number_exists(&dn_number, None)? {
            return Err(AppError::Validation(format!("Debit note {dn_number} already exists")));
        }

        let d = derive(input, &costs);
        let now = now_iso();

        let tx = self.conn.transaction()?;
        tx.execute(
            "INSERT INTO debit_note (
                dn_number, year_month, running_no, dn_date, status, filed_at,
                customer_id, buyer_name, customer_invoice_ref, si_number, contract_no,
                boxes, packing_desc, boxes_per_container, mt_per_container, containers, tonnage,
                product_desc, feeder_vessel, feeder_voyage, feeder_arrival_date, bl_number,
                p_number, p_descriptor,
                ocean_vessel, ocean_voyage, destination, bl_date,
                charge_desc, currency, rate_per_mt, charge_amount, total_amount, amount_in_words,
                cost_port, cost_transport, cost_misc, total_cost, profit,
                remarks, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'issued', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                     ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                     ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                dn_number,
                input.year_month,
                running_no,
                input.dn_date,
                input.customer_id,
                input.buyer_name.trim(),
                input.customer_invoice_ref,
                input.si_number,
                input.contract_no,
                input.boxes,
                input.packing_desc,
                input.boxes_per_container,
                input.mt_per_container,
                d.cargo.containers,
                d.cargo.tonnage,
                input.product_desc,
                input.feeder_vessel,
                input.feeder_voyage,
                input.feeder_arrival_date,
                input.bl_number,
                input.p_number,
                input.p_descriptor,
                input.ocean_vessel,
                input.ocean_voyage,
                input.destination,
                input.bl_date,
                effective_charge_desc(input),
                effective_currency(input),
                input.rate_per_mt,
                d.cargo.charge_amount,
                d.cargo.total_amount,
                d.amount_in_words,
                d.costs.port,
                d.costs.transport,
                d.costs.misc,
                d.costs.total_cost,
                d.costs.profit,
                input.remarks,
                now,
                now,
            ],
        )?;
        let id = tx.last_insert_rowid();
        insert_costs(&tx, id, &d.costs.lines)?;
        tx.commit()?;
        Ok(id)
    }

    pub fn update_debit_note(&mut self, id: i64, input: &DebitNoteInput) -> Result<()> {
        validate(input)?;
        let existing = self.debit_note(id)?;
        let costs = match &input.costs {
            Some(c) => c.clone(),
            None => existing.costs.clone(),
        };

        let dn_number = if input.dn_number.trim().is_empty() {
            existing.dn_number.clone()
        } else {
            input.dn_number.trim().to_string()
        };
        if self.dn_number_exists(&dn_number, Some(id))? {
            return Err(AppError::Validation(format!("Debit note {dn_number} already exists")));
        }
        let running_no = dn_number
            .rsplit('-')
            .next()
            .and_then(|s| s.trim().parse::<i64>().ok())
            .unwrap_or(existing.running_no);

        let d = derive(input, &costs);

        let tx = self.conn.transaction()?;
        tx.execute(
            "UPDATE debit_note SET
                dn_number = ?, year_month = ?, running_no = ?, dn_date = ?,
                customer_id = ?, buyer_name = ?, customer_invoice_ref = ?, si_number = ?,
                contract_no = ?, boxes = ?, packing_desc = ?, boxes_per_container = ?,
                mt_per_container = ?, containers = ?, tonnage = ?, product_desc = ?,
                feeder_vessel = ?, feeder_voyage = ?, feeder_arrival_date = ?,
                bl_number = ?, p_number = ?, p_descriptor = ?, ocean_vessel = ?, ocean_voyage = ?,
                destination = ?, bl_date = ?, charge_desc = ?, currency = ?,
                rate_per_mt = ?, charge_amount = ?, total_amount = ?, amount_in_words = ?,
                cost_port = ?, cost_transport = ?, cost_misc = ?, total_cost = ?,
                profit = ?, remarks = ?, updated_at = ?
             WHERE id = ?",
            params![
                dn_number,
                input.year_month,
                running_no,
                input.dn_date,
                input.customer_id,
                input.buyer_name.trim(),
                input.customer_invoice_ref,
                input.si_number,
                input.contract_no,
                input.boxes,
                input.packing_desc,
                input.boxes_per_container,
                input.mt_per_container,
                d.cargo.containers,
                d.cargo.tonnage,
                input.product_desc,
                input.feeder_vessel,
                input.feeder_voyage,
                input.feeder_arrival_date,
                input.bl_number,
                input.p_number,
                input.p_descriptor,
                input.ocean_vessel,
                input.ocean_voyage,
                input.destination,
                input.bl_date,
                effective_charge_desc(input),
                effective_currency(input),
                input.rate_per_mt,
                d.cargo.charge_amount,
                d.cargo.total_amount,
                d.amount_in_words,
                d.costs.port,
                d.costs.transport,
                d.costs.misc,
                d.costs.total_cost,
                d.costs.profit,
                input.remarks,
                now_iso(),
                id,
            ],
        )?;
        tx.execute("DELETE FROM debit_note_cost WHERE debit_note_id = ?1", params![id])?;
        insert_costs(&tx, id, &d.costs.lines)?;
        tx.commit()?;
        Ok(())
    }

    fn dn_number_exists(&self, dn_number: &str, except_id: Option<i64>) -> Result<bool> {
        let n: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM debit_note WHERE dn_number = ?1 AND id <> ?2",
            params![dn_number, except_id.unwrap_or(-1)],
            |r| r.get(0),
        )?;
        Ok(n > 0)
    }

    pub fn delete_debit_note(&self, id: i64) -> Result<()> {
        self.conn.execute("DELETE FROM debit_note WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn set_filed(&self, id: i64, filed: bool) -> Result<()> {
        self.conn.execute(
            "UPDATE debit_note SET status = ?2, filed_at = ?3, updated_at = ?4 WHERE id = ?1",
            params![
                id,
                if filed { "filed" } else { "issued" },
                if filed { Some(now_iso()) } else { None },
                now_iso()
            ],
        )?;
        Ok(())
    }

    pub fn debit_note(&self, id: i64) -> Result<DebitNote> {
        let mut note = self
            .conn
            .query_row("SELECT * FROM debit_note WHERE id = ?1", params![id], row_to_note)
            .optional()?
            .ok_or_else(|| AppError::NotFound(format!("debit note {id}")))?;
        note.customer = self.customer(note.customer_id)?;
        note.costs = self.costs_for(id)?;
        Ok(note)
    }

    fn costs_for(&self, note_id: i64) -> Result<Vec<CostLine>> {
        let mut stmt = self.conn.prepare(
            "SELECT category, code, label, basis, rate, amount, sort_order
             FROM debit_note_cost WHERE debit_note_id = ?1
             ORDER BY CASE category WHEN 'PORT' THEN 0 WHEN 'TRANSPORT' THEN 1 ELSE 2 END,
                      sort_order, code",
        )?;
        let rows = stmt.query_map(params![note_id], |r| {
            Ok(CostLine {
                category: CostCategory::parse(&r.get::<_, String>("category")?)
                    .unwrap_or(CostCategory::Misc),
                code: r.get("code")?,
                label: r.get("label")?,
                basis: CostBasis::parse(&r.get::<_, String>("basis")?).unwrap_or(CostBasis::Flat),
                rate: r.get("rate")?,
                amount: r.get("amount")?,
                sort_order: r.get("sort_order")?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Every note, newest first. The register is one small company's monthly
    /// paperwork, so the whole table is cheap to hand the UI in one go and the
    /// History tab can group and search it without another round trip.
    pub fn summaries(&self) -> Result<Vec<DebitNoteSummary>> {
        let mut stmt = self.conn.prepare(
            "SELECT n.id, n.dn_number, n.year_month, n.dn_date, n.status,
                    c.name AS customer_name, n.buyer_name, n.customer_invoice_ref, n.si_number,
                    n.contract_no, n.bl_number, n.p_number, n.feeder_vessel, n.ocean_vessel,
                    n.destination, n.product_desc,
                    n.boxes, n.containers, n.tonnage, n.currency, n.total_amount,
                    n.total_cost, n.profit
             FROM debit_note n
             JOIN customer c ON c.id = n.customer_id
             ORDER BY n.year_month DESC, n.running_no DESC, n.id DESC",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(DebitNoteSummary {
                id: r.get("id")?,
                dn_number: r.get("dn_number")?,
                year_month: r.get("year_month")?,
                dn_date: r.get("dn_date")?,
                status: NoteStatus::parse(&r.get::<_, String>("status")?),
                customer_name: r.get("customer_name")?,
                buyer_name: r.get("buyer_name")?,
                customer_invoice_ref: r.get("customer_invoice_ref")?,
                si_number: r.get("si_number")?,
                contract_no: r.get("contract_no")?,
                bl_number: r.get("bl_number")?,
                p_number: r.get("p_number")?,
                feeder_vessel: r.get("feeder_vessel")?,
                ocean_vessel: r.get("ocean_vessel")?,
                destination: r.get("destination")?,
                product_desc: r.get("product_desc")?,
                boxes: r.get("boxes")?,
                containers: r.get("containers")?,
                tonnage: r.get("tonnage")?,
                currency: r.get("currency")?,
                total_amount: r.get("total_amount")?,
                total_cost: r.get("total_cost")?,
                profit: r.get("profit")?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// DN numbers for a customer across the given months, for the cover letter's
    /// enclosed list. Always read from the database so the letter cannot drift
    /// from what was actually issued.
    pub fn dn_numbers_for(&self, customer_id: i64, months: &[String]) -> Result<Vec<String>> {
        if months.is_empty() {
            return Ok(Vec::new());
        }
        let placeholders = months.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT dn_number FROM debit_note
             WHERE customer_id = ? AND year_month IN ({placeholders})
             ORDER BY year_month, running_no"
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let mut args: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(customer_id)];
        for m in months {
            args.push(Box::new(m.clone()));
        }
        let refs: Vec<&dyn rusqlite::ToSql> = args.iter().map(|b| b.as_ref()).collect();
        let rows = stmt.query_map(refs.as_slice(), |r| r.get::<_, String>(0))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    pub fn notes_in_month(&self, year_month: &str) -> Result<Vec<DebitNoteSummary>> {
        Ok(self.summaries()?.into_iter().filter(|s| s.year_month == year_month).collect())
    }
}

// ---------------------------------------------------------------------------

struct Derived {
    cargo: calc::CargoComputed,
    costs: calc::CostSummary,
    amount_in_words: String,
}

/// Recompute everything the spreadsheet would. Called on every write.
fn derive(input: &DebitNoteInput, costs: &[CostLine]) -> Derived {
    let cargo = compute_cargo(CargoInput {
        boxes: input.boxes,
        boxes_per_container: input.boxes_per_container,
        mt_per_container: input.mt_per_container,
        rate_per_mt: input.rate_per_mt,
    });
    let ctx = CostContext {
        containers: cargo.containers,
        boxes: input.boxes,
        tonnage: cargo.tonnage,
    };
    Derived {
        costs: compute_costs(costs, ctx, cargo.total_amount),
        amount_in_words: amount_to_words(cargo.total_amount),
        cargo,
    }
}

fn validate(input: &DebitNoteInput) -> Result<()> {
    if input.year_month.len() != 6 || !input.year_month.chars().all(|c| c.is_ascii_digit()) {
        return Err(AppError::Validation("Month must be in YYYYMM form".into()));
    }
    if input.dn_date.trim().is_empty() {
        return Err(AppError::Validation("Date is required".into()));
    }
    if input.customer_id <= 0 {
        return Err(AppError::Validation("Select the customer to bill".into()));
    }
    if input.boxes <= 0.0 {
        return Err(AppError::Validation("Boxes must be greater than zero".into()));
    }
    if input.boxes_per_container <= 0.0 {
        return Err(AppError::Validation("Boxes per container must be greater than zero".into()));
    }
    if input.mt_per_container <= 0.0 {
        return Err(AppError::Validation("M/Tons per container must be greater than zero".into()));
    }
    if input.rate_per_mt <= 0.0 {
        return Err(AppError::Validation("Rate per M/Ton must be greater than zero".into()));
    }
    if input.si_number.trim().is_empty() && input.contract_no.trim().is_empty() {
        return Err(AppError::Validation("Fill in either SI No. or Contract No.".into()));
    }
    Ok(())
}

fn effective_charge_desc(input: &DebitNoteInput) -> String {
    if input.charge_desc.trim().is_empty() {
        "Transhipment Charge".to_string()
    } else {
        input.charge_desc.trim().to_string()
    }
}

fn effective_currency(input: &DebitNoteInput) -> String {
    if input.currency.trim().is_empty() {
        "SGD".to_string()
    } else {
        input.currency.trim().to_string()
    }
}

fn insert_costs(tx: &rusqlite::Transaction<'_>, note_id: i64, lines: &[CostLine]) -> Result<()> {
    for l in lines {
        tx.execute(
            "INSERT INTO debit_note_cost
                 (debit_note_id, category, code, label, basis, rate, amount, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                note_id,
                l.category.as_str(),
                l.code,
                if l.label.trim().is_empty() { &l.code } else { &l.label },
                l.basis.as_str(),
                l.rate,
                l.amount,
                l.sort_order
            ],
        )?;
    }
    Ok(())
}

fn row_to_customer(r: &Row<'_>) -> rusqlite::Result<Customer> {
    Ok(Customer {
        id: r.get("id")?,
        name: r.get("name")?,
        address_line1: r.get("address_line1")?,
        address_line2: r.get("address_line2")?,
        address_line3: r.get("address_line3")?,
        address_line4: r.get("address_line4")?,
        address_line5: r.get("address_line5")?,
        attention: r.get("attention")?,
        active: r.get("active")?,
    })
}

fn row_to_note(r: &Row<'_>) -> rusqlite::Result<DebitNote> {
    Ok(DebitNote {
        id: r.get("id")?,
        dn_number: r.get("dn_number")?,
        year_month: r.get("year_month")?,
        running_no: r.get("running_no")?,
        dn_date: r.get("dn_date")?,
        status: NoteStatus::parse(&r.get::<_, String>("status")?),
        filed_at: r.get("filed_at")?,
        customer_id: r.get("customer_id")?,
        customer: Customer {
            id: 0,
            name: String::new(),
            address_line1: String::new(),
            address_line2: String::new(),
            address_line3: String::new(),
            address_line4: String::new(),
            address_line5: String::new(),
            attention: String::new(),
            active: true,
        },
        buyer_name: r.get("buyer_name")?,
        customer_invoice_ref: r.get("customer_invoice_ref")?,
        si_number: r.get("si_number")?,
        contract_no: r.get("contract_no")?,
        boxes: r.get("boxes")?,
        packing_desc: r.get("packing_desc")?,
        boxes_per_container: r.get("boxes_per_container")?,
        mt_per_container: r.get("mt_per_container")?,
        containers: r.get("containers")?,
        tonnage: r.get("tonnage")?,
        product_desc: r.get("product_desc")?,
        feeder_vessel: r.get("feeder_vessel")?,
        feeder_voyage: r.get("feeder_voyage")?,
        feeder_arrival_date: r.get("feeder_arrival_date")?,
        bl_number: r.get("bl_number")?,
        p_number: r.get("p_number")?,
        p_descriptor: r.get("p_descriptor")?,
        ocean_vessel: r.get("ocean_vessel")?,
        ocean_voyage: r.get("ocean_voyage")?,
        destination: r.get("destination")?,
        bl_date: r.get("bl_date")?,
        charge_desc: r.get("charge_desc")?,
        currency: r.get("currency")?,
        rate_per_mt: r.get("rate_per_mt")?,
        charge_amount: r.get("charge_amount")?,
        total_amount: r.get("total_amount")?,
        amount_in_words: r.get("amount_in_words")?,
        costs: Vec::new(),
        cost_port: r.get("cost_port")?,
        cost_transport: r.get("cost_transport")?,
        cost_misc: r.get("cost_misc")?,
        total_cost: r.get("total_cost")?,
        profit: r.get("profit")?,
        remarks: r.get("remarks")?,
        created_at: r.get("created_at")?,
        updated_at: r.get("updated_at")?,
    })
}

fn now_iso() -> String {
    chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_input(customer_id: i64) -> DebitNoteInput {
        DebitNoteInput {
            dn_number: String::new(),
            year_month: "202609".into(),
            dn_date: "2026-09-25".into(),
            customer_id,
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
        }
    }

    #[test]
    fn seeds_settings_rate_card_and_a_customer() {
        let db = Db::open_in_memory().unwrap();
        assert_eq!(db.settings().unwrap().default_rate_per_mt, 54.0);
        assert_eq!(db.rate_card().unwrap().len(), 17);
        assert_eq!(db.customers().unwrap().len(), 1);
    }

    #[test]
    fn creating_a_note_derives_the_workbook_figures() {
        let mut db = Db::open_in_memory().unwrap();
        let cid = db.customers().unwrap()[0].id;
        let id = db.create_debit_note(&sample_input(cid)).unwrap();

        let n = db.debit_note(id).unwrap();
        assert_eq!(n.dn_number, "DN202609-01");
        assert_eq!(n.containers, 5.625);
        assert_eq!(n.tonnage, 113.4);
        assert_eq!(n.total_amount, 6123.6);
        assert_eq!(n.amount_in_words, "Six Thousand One Hundred Twenty Three and cents Sixty only");
        assert_eq!(n.costs.len(), 17);
        assert_eq!(n.profit, calc::round2(n.total_amount - n.total_cost));
        assert_eq!(n.customer.name, "Sabah Rubber Industry Board");
    }

    #[test]
    fn running_numbers_increment_within_a_month() {
        let mut db = Db::open_in_memory().unwrap();
        let cid = db.customers().unwrap()[0].id;
        db.create_debit_note(&sample_input(cid)).unwrap();
        let id2 = db.create_debit_note(&sample_input(cid)).unwrap();
        assert_eq!(db.debit_note(id2).unwrap().dn_number, "DN202609-02");
    }

    #[test]
    fn a_manual_dn_number_advances_the_running_counter() {
        let mut db = Db::open_in_memory().unwrap();
        let cid = db.customers().unwrap()[0].id;
        let mut manual = sample_input(cid);
        manual.dn_number = "DN202609-07".into();
        db.create_debit_note(&manual).unwrap();

        let next = db.create_debit_note(&sample_input(cid)).unwrap();
        assert_eq!(db.debit_note(next).unwrap().dn_number, "DN202609-08");
    }

    #[test]
    fn duplicate_dn_numbers_are_rejected() {
        let mut db = Db::open_in_memory().unwrap();
        let cid = db.customers().unwrap()[0].id;
        let mut a = sample_input(cid);
        a.dn_number = "DN202609-01".into();
        db.create_debit_note(&a).unwrap();
        assert!(db.create_debit_note(&a).is_err());
    }

    #[test]
    fn editing_recomputes_rather_than_trusting_the_client() {
        let mut db = Db::open_in_memory().unwrap();
        let cid = db.customers().unwrap()[0].id;
        let id = db.create_debit_note(&sample_input(cid)).unwrap();

        let mut edit = sample_input(cid);
        edit.dn_number = "DN202609-01".into();
        edit.boxes = 160.0; // 10 containers -> 201.6 MT -> 10,886.40
        db.update_debit_note(id, &edit).unwrap();

        let n = db.debit_note(id).unwrap();
        assert_eq!(n.containers, 10.0);
        assert_eq!(n.tonnage, 201.6);
        assert_eq!(n.total_amount, 10886.4);
        // Per-container cost lines moved with it.
        let hsc = n.costs.iter().find(|c| c.code == "HSC").unwrap();
        assert_eq!(hsc.amount, calc::round2(25.9 * 10.0));
    }

    #[test]
    fn filing_flips_status_and_stamps_a_time() {
        let mut db = Db::open_in_memory().unwrap();
        let cid = db.customers().unwrap()[0].id;
        let id = db.create_debit_note(&sample_input(cid)).unwrap();
        db.set_filed(id, true).unwrap();
        let n = db.debit_note(id).unwrap();
        assert_eq!(n.status, NoteStatus::Filed);
        assert!(n.filed_at.is_some());
        db.set_filed(id, false).unwrap();
        assert!(db.debit_note(id).unwrap().filed_at.is_none());
    }

    #[test]
    fn a_customer_with_history_is_retired_not_deleted() {
        let mut db = Db::open_in_memory().unwrap();
        let cid = db.customers().unwrap()[0].id;
        db.create_debit_note(&sample_input(cid)).unwrap();
        db.delete_customer(cid).unwrap();
        assert!(!db.customer(cid).unwrap().active);
    }

    #[test]
    fn cover_letter_numbers_come_from_the_register() {
        let mut db = Db::open_in_memory().unwrap();
        let cid = db.customers().unwrap()[0].id;
        db.create_debit_note(&sample_input(cid)).unwrap();
        db.create_debit_note(&sample_input(cid)).unwrap();
        let mut other = sample_input(cid);
        other.year_month = "202610".into();
        db.create_debit_note(&other).unwrap();

        let list = db.dn_numbers_for(cid, &["202609".to_string()]).unwrap();
        assert_eq!(list, vec!["DN202609-01", "DN202609-02"]);
        let both =
            db.dn_numbers_for(cid, &["202609".to_string(), "202610".to_string()]).unwrap();
        assert_eq!(both.len(), 3);
    }

    #[test]
    fn validation_rejects_empty_cargo() {
        let mut db = Db::open_in_memory().unwrap();
        let cid = db.customers().unwrap()[0].id;
        let mut bad = sample_input(cid);
        bad.boxes = 0.0;
        assert!(db.create_debit_note(&bad).is_err());
    }

    #[test]
    fn saving_the_rate_card_replaces_it_wholesale() {
        let mut db = Db::open_in_memory().unwrap();
        let mut card = db.rate_card().unwrap();
        card.truncate(3);
        card[0].rate = 99.0;
        db.save_rate_card(&card).unwrap();
        let after = db.rate_card().unwrap();
        assert_eq!(after.len(), 3);
        assert_eq!(after[0].rate, 99.0);
    }
}
