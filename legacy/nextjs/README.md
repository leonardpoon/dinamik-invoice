# Dinamik Invoice

Debit note generator for Dinamik Shipping Pte Ltd. Replaces the Excel debit-note workbook with a web form that
stores every value in MySQL, produces a two-page PDF (customer copy + accounts copy with costing), keeps the
monthly cover letter up to date, and offers a simple analytics dashboard.

## Installing on a PC (no prerequisites)

1. Copy this folder anywhere on the PC (for example `C:\DinamikInvoice`).
2. Double-click **`install.cmd`** and wait. It will:
   - use the PC's Node.js if present, otherwise download a portable copy into `runtime\node`
   - install the app's packages
   - download a portable MySQL 8 server into `runtime\mysql` (about 230 MB, one time)
   - create the database files in `data\mysql`, the tables, and the default settings / rate card / sample customer
   - build the app
3. Double-click **`start.cmd`**. It starts MySQL and the app and opens `http://localhost:3000` in the browser.
   Keep that window open while people use the app. Closing it stops the app and the database.

Nothing is installed system-wide and no admin rights are needed. Everything lives inside this folder.
Running `install.cmd` again is safe: it skips whatever is already done and only applies new database
migrations, so it doubles as the **update** step after you copy in a new version of the app.

| Double-click     | What it does                                                        |
| ---------------- | ------------------------------------------------------------------- |
| `install.cmd`    | First-time setup, or update after copying in new app files          |
| `start.cmd`      | Start database + app, open the browser                              |
| `stop.cmd`       | Stop the database if it was left running                            |
| `backup.cmd`     | Write a full SQL dump into `backups\`                               |

**Back up the `data\mysql` folder** (or the `.sql` files from `backup.cmd`) regularly. That is where every
debit note lives. Restore a dump with:

```
runtime\mysql\bin\mysql --defaults-file=runtime\my.ini -uroot dinamik_invoice < backups\<file>.sql
```

`runtime\config.json` records the MySQL port (chosen automatically, starting at 3310) and the app user's
password. `.env` is generated from it. The bundled MySQL only listens on 127.0.0.1.

### Using another MySQL server instead

Put `DATABASE_URL="mysql://user:password@host:3306/dinamik_invoice"` in `.env`, then run
`set MYSQL_MODE=external && node scripts\setup.mjs` once, and start with `set MYSQL_MODE=external && node scripts\start.mjs`.
A `docker-compose.yml` is also included for developers who prefer MySQL in Docker (`npm run db:up`).

## Everyday use

1. **Settings** – letterhead, bank lines, cover-letter signatory, form defaults and the cost rate card.
2. **Customers** – bill-to parties (address printed on the debit note, attention line used on the cover letter).
3. **Debit Notes → New** – fill in the fields; tonnage, charge, cost lines, profit and amount-in-words are computed live.
   Leave the DN number blank to auto-assign `DN<YYYYMM>-<NN>` for the month, or type your own.
4. **Download PDF** – page 1 is the customer copy, page 2 the accounts copy with the costing block.
5. **Cover Letter** – pick customer and months; the enclosed list is always built from the database.
6. **Dashboard** – tonnage, revenue, profit, destinations, buyers and vessels per month.

## Development

- Next.js 16 (App Router, Server Actions) + TypeScript + Tailwind CSS 4
- Prisma 6 + MySQL 8, `@react-pdf/renderer` for PDFs, Recharts for the dashboard

```bash
npm install
npm run db:up          # MySQL in Docker on port 3307  (or run install.cmd for the bundled server)
npm run db:migrate     # prisma migrate dev – creates a migration after schema changes
npm run db:seed
npm run dev            # http://localhost:3000
```

When you change `prisma/schema.prisma`, run `npm run db:migrate` to create a migration file. `install.cmd`
applies pending migrations on the office PC with `prisma migrate deploy`.

## Data model (MySQL)

| Table              | Purpose                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| `Setting`          | Single row: company details, bank lines, defaults                       |
| `Customer`         | Bill-to parties                                                         |
| `Buyer`            | Consignees (auto-created from the form)                                 |
| `CostRateDefault`  | Editable rate card (category, code, basis, rate)                        |
| `DebitNote`        | One row per debit note with all printed values and computed totals      |
| `DebitNoteCost`    | Cost lines copied from the rate card and editable per note              |

`DebitNote` is indexed on `yearMonth`, `dnDate`, `customerId`, `buyerId` and `destination` for ad-hoc analytics.
