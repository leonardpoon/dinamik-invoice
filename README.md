# Dinamik Invoice

Debit note generator for Dinamik Shipping Pte Ltd. Replaces the Excel debit-note
workbook with a desktop app that stores every value in one file, produces the
two-page PDF (customer copy + accountant copy with the costing block), keeps the
monthly cover letter and filing register up to date, and shows where the tonnage
and the profit came from.

It is a single Windows program. No Node, no database server, nothing installed
system-wide.

## Installing

Run the installer (`Dinamik Invoice_0.2.0_x64-setup.exe`) and start the app from
the Start menu. That is the whole procedure.

Everything the office types lives in one file:

```
%APPDATA%\sg.dinamik.invoice\dinamik-invoice.sqlite3
```

**Back that file up.** Copying it somewhere safe once a month is enough; copying
it to another PC moves the entire register.

## Everyday use

| Tab                  | What it is for                                                                      |
| -------------------- | ------------------------------------------------------------------------------------ |
| **Analytics**        | Tonnage by month, buyer, first carrier and grade — no money on this tab              |
| **Create Debit Note**| The form. Presets on the left fill in a buyer and destination you have used before   |
| **Current**          | This month's notes, with both PDF copies previewed side by side                      |
| **History**          | Everything ever issued, grouped by year and month, searchable                        |
| **Filing**           | Pick a month and print the filing record — a blank box per note, ticked by hand      |
| **Cover Letter**     | Pick a customer and a month; the enclosed list is read from the register. The company/letterhead details live here too |

The **Settings** rail on the right holds the form defaults, the bill-to parties,
and the cost rate card.

### Creating a note

Fill in the form and press **Create Debit Note**. Leave the number on auto to
take the next one for the month (`DN202609-01`, `DN202609-02`, …), or untick it
to type your own.

You enter **boxes**; the app derives the rest exactly as the workbook does:

```
containers = boxes ÷ boxes-per-container        (90 ÷ 16 = 5.625)
tonnage    = containers × M/Tons-per-container  (5.625 × 20.16 = 113.40 MT)
charge     = tonnage × rate per M/Ton           (113.40 × 54 = S$6,123.60)
```

Containers, tonnage, the total and the amount in words all update as you type.

### The two copies

**Download PDF** gives you one file with both pages:

- **Page 1 — customer copy.** The debit note as the workbook prints it.
- **Page 2 — accountant copy.** The same note, plus the `[ ACCOUNT'S COPY ]`
  marker and the costing block: every cost line, the Port Charges / Transport /
  Misc subtotals, the total cost, and the **profit**.

Profit appears on page 2 only. It is never on the customer copy.

### Costing

Each note is priced from the rate card in **Settings → Rates**, copied onto the
note when it is created. A line is charged per container, per box, per M/Ton or
as a flat amount — matching how the workbook's costing block works:

| Line                                   | Basis         |
| -------------------------------------- | ------------- |
| HSC, SR, EC, DHC, CL, STK              | per container |
| AF, TR, STF, CMAS, IR                  | per container |
| RM                                     | per box       |
| FL                                     | per container |
| BL, PERMIT, SEAL, OTHERS               | flat          |

Changing a rate in Settings affects **new** notes only; notes already issued keep
the rates they were created with. To change one note without touching the card,
use **Edit rates** in the form's Costing section.

## Development

Tauri 2 (Rust) + React 19 + Vite 6 + Tailwind 4, with SQLite via `rusqlite`.

```bash
npm install
npm run app          # dev, with hot reload
npm run app:build    # release .exe + installer
```

```bash
cd src-tauri
cargo test                                 # 41 tests
cargo run --example sample_pdfs -- ./out   # write the three PDFs to look at
```

### How it fits together

Rust owns the data and every printed document. The webview is the form and
nothing else — it sends what the user typed and renders what comes back.

- `src-tauri/src/calc.rs` — the workbook's formulas, with the cell references
  quoted against each one. The sample note (90 boxes → 113.40 MT → S$6,123.60,
  and its costing block) is a test.
- `src-tauri/src/db.rs` — SQLite. Every derived figure is **recomputed here on
  every write**, so a stored row can never disagree with the workbook even if the
  form sends a stale value.
- `src-tauri/src/pdf/` — a small PDF writer, plus one module per document. Tahoma
  and Arial are embedded as TrueType subsets (`pdf/truetype.rs`) to match the
  workbook exactly; the debit note and cover letter are coordinate-for-coordinate
  transcriptions of the workbook's row heights and cite their row numbers.
- `src/api.ts` — the only place the frontend calls Rust. PDFs arrive as base64
  and become blob URLs, so a note previews without touching the disk.

### Reference material

- `Sample UI/` — the Figma Make export the interface was taken from.
- `legacy/nextjs/` — the previous Next.js + Prisma + MySQL version, kept for
  reference until the desktop app has been in use for a while.

The original Excel workbook this app replaces is not in the repo — it holds
real customer and financial data. `src-tauri/src/calc.rs` and `src-tauri/src/pdf/`
are the transcription of its formulas and layout, with the cell/row references
quoted in comments against each one.

### Notes

The theme loads Inter, Fraunces and JetBrains Mono from Google Fonts. On a PC
with no internet the app falls back to the system sans, serif and monospace —
everything still works, it just looks plainer. The PDFs are unaffected: they use
the standard PDF fonts and need no network at all.
