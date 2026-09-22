/** Shuts down the bundled MySQL server if it is running.  Run with:  stop.cmd */
import { fail, ok, portInUse, readConfig, shutdownMysql } from "./lib.mjs";

const cfg = readConfig();
if (!cfg) fail("Not installed yet – nothing to stop.");
if (!(await portInUse(cfg.port))) {
  ok("MySQL is not running.");
} else if (shutdownMysql(cfg.port)) {
  ok("MySQL stopped.");
} else {
  fail("Could not stop MySQL – close the start.cmd window instead.");
}
