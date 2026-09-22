/**
 * First-time installer.  Run with:  install.cmd   (or: node scripts/setup.mjs)
 *
 *  1. Installs npm packages
 *  2. Downloads a portable MySQL server into runtime/mysql (once)
 *  3. Initialises the database files in data/mysql (once)
 *  4. Creates the database, user, tables and seed data
 *  5. Builds the web app
 *
 * Safe to run again: every step is skipped if it was already done.
 *
 * To use an existing MySQL server instead, put DATABASE_URL in .env and run
 * with MYSQL_MODE=external — steps 2 and 3 are skipped.
 */
import fs from "node:fs";
import path from "node:path";
import {
  BACKUP_DIR, CONFIG_FILE, DATA_DIR, ENV_FILE, LOG_DIR, MYSQL_BIN, MYSQL_DIR, MYSQL_VERSION, MYSQL_ZIP_URL, MY_INI, ROOT, RUNTIME,
  download, fail, findFreePort, log, mysqld, npmCmd, npxCmd, ok, portInUse, randomPassword, readConfig, run, shutdownMysql,
  spawnMysqld, sql, toIniPath, waitForMysql, writeConfig,
} from "./lib.mjs";

const external = process.env.MYSQL_MODE === "external";
const DB_NAME = "dinamik_invoice";
const DB_USER = "dinamik";

console.log("\n=== Dinamik Invoice – first-time setup ===\n");
if (process.platform !== "win32" && !external) fail("The bundled MySQL download is Windows-only. On other systems set MYSQL_MODE=external.");

// ---------------------------------------------------------------- 1. npm packages
if (!fs.existsSync(path.join(ROOT, "node_modules", "next"))) {
  log("Installing packages (this takes a minute)…");
  run(npmCmd(), ["install", "--no-audit", "--no-fund"]);
  ok("Packages installed");
} else {
  ok("Packages already installed");
}

let cfg = readConfig();
let mysqlProc = null;

if (!external) {
  // -------------------------------------------------------------- 2. portable MySQL
  if (!fs.existsSync(mysqld())) {
    log(`Downloading MySQL ${MYSQL_VERSION} (about 230 MB)…`);
    const zip = path.join(RUNTIME, "mysql.zip");
    if (!fs.existsSync(zip)) await download(MYSQL_ZIP_URL, zip);
    log("Extracting…");
    const tmp = path.join(RUNTIME, "mysql-tmp");
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    // Use the Windows built-in bsdtar explicitly (Git Bash's tar treats "C:" as a hostname).
    const winTar = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
    run(fs.existsSync(winTar) ? winTar : "tar", ["-xf", zip, "-C", tmp]);
    const inner = fs.readdirSync(tmp).find((d) => d.startsWith("mysql-"));
    if (!inner) fail("Unexpected MySQL archive layout");
    fs.renameSync(path.join(tmp, inner), MYSQL_DIR);
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(zip, { force: true });
    ok(`MySQL ${MYSQL_VERSION} ready in runtime\\mysql`);
  } else {
    ok("MySQL server already present");
  }

  // -------------------------------------------------------------- 3. data directory + config
  if (!cfg) {
    const port = await findFreePort(3310);
    cfg = { port, dbName: DB_NAME, dbUser: DB_USER, dbPassword: randomPassword(), appPort: 3000, createdAt: new Date().toISOString() };
    writeConfig(cfg);
    ok(`Chose MySQL port ${port}`);
  }
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const ini = [
    "[mysqld]",
    `basedir=${toIniPath(MYSQL_DIR)}`,
    `datadir=${toIniPath(DATA_DIR)}`,
    `port=${cfg.port}`,
    "bind-address=127.0.0.1",
    "mysqlx=OFF",
    `log-error=${toIniPath(path.join(LOG_DIR, "mysql-error.log"))}`,
    "innodb_buffer_pool_size=128M",
    "max_connections=50",
    "character-set-server=utf8mb4",
    "collation-server=utf8mb4_unicode_ci",
    "",
    "[client]",
    `port=${cfg.port}`,
    "host=127.0.0.1",
    "",
  ].join("\n");
  fs.writeFileSync(MY_INI, ini);

  if (!fs.existsSync(path.join(DATA_DIR, "mysql"))) {
    log("Initialising database files…");
    fs.mkdirSync(path.dirname(DATA_DIR), { recursive: true });
    run(mysqld(), [`--defaults-file=${MY_INI}`, "--initialize-insecure"], { cwd: MYSQL_DIR });
    ok("Database files created in data\\mysql");
  } else {
    ok("Database files already exist");
  }

  // -------------------------------------------------------------- 4. start server, create db + user
  if (await portInUse(cfg.port)) {
    ok(`MySQL already running on port ${cfg.port}`);
  } else {
    log("Starting MySQL…");
    mysqlProc = spawnMysqld();
    await waitForMysql(cfg.port);
    ok("MySQL is up");
  }
  sql(
    cfg.port,
    `CREATE DATABASE IF NOT EXISTS \`${cfg.dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
     CREATE USER IF NOT EXISTS '${cfg.dbUser}'@'localhost' IDENTIFIED BY '${cfg.dbPassword}';
     CREATE USER IF NOT EXISTS '${cfg.dbUser}'@'127.0.0.1' IDENTIFIED BY '${cfg.dbPassword}';
     ALTER USER '${cfg.dbUser}'@'localhost' IDENTIFIED BY '${cfg.dbPassword}';
     ALTER USER '${cfg.dbUser}'@'127.0.0.1' IDENTIFIED BY '${cfg.dbPassword}';
     GRANT ALL PRIVILEGES ON \`${cfg.dbName}\`.* TO '${cfg.dbUser}'@'localhost';
     GRANT ALL PRIVILEGES ON \`${cfg.dbName}\`.* TO '${cfg.dbUser}'@'127.0.0.1';
     FLUSH PRIVILEGES;`,
  );
  ok(`Database "${cfg.dbName}" and user "${cfg.dbUser}" ready`);

  const url = `mysql://${cfg.dbUser}:${encodeURIComponent(cfg.dbPassword)}@127.0.0.1:${cfg.port}/${cfg.dbName}`;
  fs.writeFileSync(ENV_FILE, `# Generated by install.cmd – points at the bundled MySQL in runtime/mysql\nDATABASE_URL="${url}"\nPORT=${cfg.appPort}\n`);
  ok("Wrote .env");
} else {
  if (!fs.existsSync(ENV_FILE) || !/DATABASE_URL=/.test(fs.readFileSync(ENV_FILE, "utf8"))) fail("MYSQL_MODE=external requires DATABASE_URL in .env");
  ok("Using external MySQL from .env");
}

// ---------------------------------------------------------------- 5. tables + seed
log("Creating tables…");
run(npxCmd(), ["prisma", "generate"]);
run(npxCmd(), ["prisma", "migrate", "deploy"]);
ok("Tables are up to date");
log("Loading default settings, rate card and sample customer…");
run("node", [path.join(ROOT, "prisma", "seed.ts")]);
ok("Seed data loaded");

// ---------------------------------------------------------------- 6. build
log("Building the web app (a few minutes the first time)…");
run(npxCmd(), ["next", "build"]);
ok("Build complete");

if (mysqlProc) {
  shutdownMysql(cfg.port);
}

console.log(`
=== Setup finished ===

  Start the app:   double-click  start.cmd   (opens http://localhost:${cfg?.appPort ?? 3000})
  Stop it:         close the window, or double-click  stop.cmd
  Backup:          double-click  backup.cmd  (writes a .sql file into backups\\)

  Database files:  data\\mysql          <- include this folder in your backups
  Settings:        ${path.relative(ROOT, CONFIG_FILE)}
`);
