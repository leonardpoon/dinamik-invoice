/**
 * Shared helpers for the install / start / stop / backup scripts.
 * Everything lives inside the project folder:
 *   runtime/mysql/   portable MySQL server (downloaded on first install)
 *   runtime/my.ini   MySQL config
 *   runtime/config.json  port + credentials chosen at install time
 *   data/mysql/      the database files  (back this folder up!)
 *   data/logs/       MySQL error log
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const RUNTIME = path.join(ROOT, "runtime");
export const MYSQL_DIR = path.join(RUNTIME, "mysql");
export const MYSQL_BIN = path.join(MYSQL_DIR, "bin");
export const MY_INI = path.join(RUNTIME, "my.ini");
export const CONFIG_FILE = path.join(RUNTIME, "config.json");
export const DATA_DIR = path.join(ROOT, "data", "mysql");
export const LOG_DIR = path.join(ROOT, "data", "logs");
export const BACKUP_DIR = path.join(ROOT, "backups");
export const ENV_FILE = path.join(ROOT, ".env");

export const MYSQL_VERSION = "8.0.44";
export const MYSQL_ZIP_URL = `https://dev.mysql.com/get/Downloads/MySQL-8.0/mysql-${MYSQL_VERSION}-winx64.zip`;

export const IS_WIN = process.platform === "win32";
export const exe = (name) => (IS_WIN ? `${name}.exe` : name);
export const mysqld = () => path.join(MYSQL_BIN, exe("mysqld"));
export const mysqlCli = () => path.join(MYSQL_BIN, exe("mysql"));
export const mysqladmin = () => path.join(MYSQL_BIN, exe("mysqladmin"));
export const mysqldump = () => path.join(MYSQL_BIN, exe("mysqldump"));

export function log(msg) {
  console.log(`\x1b[36m▸\x1b[0m ${msg}`);
}
export function ok(msg) {
  console.log(`\x1b[32m✔\x1b[0m ${msg}`);
}
export function fail(msg) {
  console.error(`\x1b[31m✖ ${msg}\x1b[0m`);
  process.exit(1);
}

export function readConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return null;
  return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
}

export function writeConfig(cfg) {
  fs.mkdirSync(RUNTIME, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + "\n");
}

/** Run a command to completion, inheriting stdio. Throws on non-zero exit. */
export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT, shell: IS_WIN && /\.cmd$|npm|npx/i.test(cmd), ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${path.basename(cmd)} ${args.join(" ")} exited with code ${r.status}`);
}

/** Run a command and capture stdout. */
export function capture(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", cwd: ROOT, ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${path.basename(cmd)} ${args.join(" ")} failed:\n${r.stderr || r.stdout}`);
  return r.stdout;
}

function canListen(port, host) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, host);
  });
}

/** True only when nothing listens on the port on any interface (IPv4 or IPv6). */
export async function isPortFree(port) {
  if (!(await canListen(port, "127.0.0.1"))) return false;
  if (!(await canListen(port, "0.0.0.0"))) return false;
  if (!(await canListen(port, "::"))) return false;
  return true;
}

export async function findFreePort(start) {
  for (let p = start; p < start + 50; p++) if (await isPortFree(p)) return p;
  throw new Error(`No free port found from ${start}`);
}

/** True when something answers on the port (used to detect a running MySQL). */
export function portInUse(port) {
  return isPortFree(port).then((free) => !free);
}

export async function waitForMysql(port, timeoutMs = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = spawnSync(mysqladmin(), ["--host=127.0.0.1", `--port=${port}`, "-uroot", "ping"], { encoding: "utf8" });
    if (r.status === 0 && /alive/i.test(r.stdout)) return;
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error(`MySQL did not start within ${timeoutMs / 1000}s (see ${path.join(LOG_DIR, "mysql-error.log")})`);
}

/** Start mysqld as a child process. Returns the ChildProcess. */
export function spawnMysqld() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const child = spawn(mysqld(), [`--defaults-file=${MY_INI}`], {
    cwd: MYSQL_DIR,
    stdio: "ignore",
    windowsHide: true,
  });
  return child;
}

export function shutdownMysql(port) {
  const r = spawnSync(mysqladmin(), ["--host=127.0.0.1", `--port=${port}`, "-uroot", "shutdown"], { encoding: "utf8" });
  return r.status === 0;
}

export function sql(port, statement, user = "root", password = "") {
  const args = ["--host=127.0.0.1", `--port=${port}`, `-u${user}`];
  if (password) args.push(`-p${password}`);
  args.push("-e", statement);
  return capture(mysqlCli(), args);
}

export function randomPassword(len = 20) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function toIniPath(p) {
  return p.replace(/\\/g, "/");
}

export function npmCmd() {
  return IS_WIN ? "npm.cmd" : "npm";
}
export function npxCmd() {
  return IS_WIN ? "npx.cmd" : "npx";
}

/** Download a URL to a file with a simple progress line. */
export async function download(url, dest) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const total = Number(res.headers.get("content-length") || 0);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = dest + ".part";
  const out = fs.createWriteStream(tmp);
  let done = 0;
  let lastPct = -1;
  for await (const chunk of res.body) {
    out.write(chunk);
    done += chunk.length;
    if (total) {
      const pct = Math.floor((done / total) * 100);
      if (pct !== lastPct && pct % 5 === 0) {
        process.stdout.write(`\r   downloading… ${pct}% (${(done / 1048576).toFixed(0)} / ${(total / 1048576).toFixed(0)} MB)`);
        lastPct = pct;
      }
    }
  }
  await new Promise((res2, rej) => out.end((e) => (e ? rej(e) : res2())));
  process.stdout.write("\n");
  fs.renameSync(tmp, dest);
}
