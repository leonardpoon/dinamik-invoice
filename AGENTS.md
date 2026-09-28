# Dinamik Invoice — working notes

A Tauri 2 desktop app. **Rust owns the data and every printed document; the
webview is only the form.**

## The rule that matters

The original Excel workbook (not in this repo — it holds real customer and
financial data, kept privately) is the source of truth for every number and
every printed layout. `src-tauri/src/calc.rs` is a transcription of its
formulas and quotes the cell references against each one; the PDF layout code
in `src-tauri/src/pdf/` quotes the row numbers. If you change either, check it
against the workbook and keep the references accurate.

Derived figures (containers, tonnage, charge, cost lines, profit, amount in
words) are recomputed in `db.rs` on every write. Never let the frontend send a
computed value and never persist one it sent.

## Layout

```
src/                 React 19 + Vite 6 + Tailwind 4 — form and views only
  api.ts             the single place that calls Rust (invoke)
  store.ts           loads the register once, re-reads after every mutation
  ui.tsx             shared primitives, formatting, icons
src-tauri/src/
  calc.rs            the workbook's formulas
  words.rs           amount in words
  db.rs              SQLite schema, queries, and the recompute-on-write rule
  commands.rs        the IPC surface
  pdf/writer.rs      a small PDF 1.4 writer (base-14 fonts, mm from top-left)
  pdf/debit_note.rs  2 pages: customer copy, then accountant copy + costing
  pdf/cover_letter.rs, pdf/filing_report.rs
legacy/nextjs/       the previous Next.js + Prisma + MySQL version
Sample UI/           the Figma Make export the look came from
```

## Commands

```bash
npm install
npm run app            # tauri dev
npm run app:build      # release .exe + NSIS installer
cd src-tauri && cargo test          # 35 tests; the workbook example is in there
cargo run --example sample_pdfs -- <dir>   # write the three PDFs to look at
```

Data lives in one file: `%APPDATA%\sg.dinamik.invoice\dinamik-invoice.sqlite3`.

## Scope

Debit notes only. No void/cancel status — a note is edited or deleted. Filing
(issued/filed) is a separate axis and is not a cancellation.
