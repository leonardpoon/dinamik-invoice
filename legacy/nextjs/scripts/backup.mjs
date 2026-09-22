/**
 * Dumps the database to backups/dinamik_invoice-YYYYMMDD-HHMMSS.sql
 * Starts MySQL temporarily if it is not running.   Run with:  backup.cmd
 *
 * Restore with:  runtime\mysql\bin\mysql --defaults-file=runtime\my.ini -uroot dinamik_invoice < backups\<file>.sql
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { BACKUP_DIR, fail, log, mysqldump, ok, portInUse, readConfig, shutdownMysql, spawnMysqld, waitForMysql } from "./lib.mjs";

const cfg = readConfig();
if (!cfg) fail("Not installed yet – run install.cmd first.");

let started = null;
if (!(await portInUse(cfg.port))) {
  log("Starting MySQL for the backup…");
  started = spawnMysqld();
  await waitForMysql(cfg.port);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const d = new Date();
const pad = (n) => String(n).padStart(2, "0");
const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
const file = path.join(BACKUP_DIR, `${cfg.dbName}-${stamp}.sql`);
const r = spawnSync(
  mysqldump(),
  ["--host=127.0.0.1", `--port=${cfg.port}`, "-uroot", "--single-transaction", "--routines", "--add-drop-table", cfg.dbName],
  { encoding: "utf8", maxBuffer: 1024 * 1024 * 512 },
);
if (r.status !== 0) fail(`mysqldump failed: ${r.stderr}`);
fs.writeFileSync(file, r.stdout);
ok(`Backup written: ${path.relative(process.cwd(), file)} (${(r.stdout.length / 1024).toFixed(0)} KB)`);

if (started) {
  shutdownMysql(cfg.port);
}
