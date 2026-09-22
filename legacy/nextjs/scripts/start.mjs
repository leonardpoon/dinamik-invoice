/**
 * Starts the bundled MySQL (if needed) and the web app, then opens the browser.
 * Closing the window / Ctrl+C stops both.   Run with:  start.cmd
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CONFIG_FILE, ROOT, fail, findFreePort, log, ok, portInUse, readConfig, shutdownMysql, spawnMysqld, waitForMysql, isPortFree, mysqld } from "./lib.mjs";

const cfg = readConfig();
const external = process.env.MYSQL_MODE === "external" || (!cfg && fs.existsSync(path.join(ROOT, ".env")));
if (!cfg && !external) fail(`Not installed yet – run install.cmd first (missing ${path.relative(ROOT, CONFIG_FILE)})`);
if (!fs.existsSync(path.join(ROOT, ".next"))) fail("The app has not been built – run install.cmd first");

let appPort = Number(process.env.PORT) || cfg?.appPort || 3000;
let mysqlProc = null;
let ownsMysql = false;

if (!external) {
  if (!fs.existsSync(mysqld())) fail("Bundled MySQL is missing – run install.cmd");
  if (await portInUse(cfg.port)) {
    ok(`MySQL already running on port ${cfg.port}`);
  } else {
    log("Starting MySQL…");
    mysqlProc = spawnMysqld();
    ownsMysql = true;
    await waitForMysql(cfg.port);
    ok("MySQL is up");
  }
}

if (!(await isPortFree(appPort))) {
  // Something else owns the port (maybe an earlier copy of this app). Use the next free one.
  const wanted = appPort;
  appPort = await findFreePort(appPort + 1);
  log(`Port ${wanted} is in use – using port ${appPort} instead`);
}

log(`Starting Dinamik Invoice on http://localhost:${appPort} …`);
const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
const app = spawn(process.execPath, [nextBin, "start", "-p", String(appPort)], { cwd: ROOT, stdio: "inherit" });

// open the browser once the app answers
(async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${appPort}/`);
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (process.platform === "win32") spawnSync("cmd", ["/c", "start", "", `http://localhost:${appPort}`], { stdio: "ignore" });
  console.log(`\n  App is running.  Close this window (or press Ctrl+C) to stop.\n`);
})();

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  log("Stopping…");
  try {
    app.kill();
  } catch {}
  if (ownsMysql) {
    shutdownMysql(cfg.port);
    try {
      mysqlProc?.kill();
    } catch {}
  }
  setTimeout(() => process.exit(code), 500);
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
process.on("SIGHUP", () => stop(0));
app.on("exit", (code) => stop(code ?? 0));
