import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPitcherMonitoringFileName,
  getPitcherMonitoringExportMeta,
} from "./pitcher-monitoring-export.js";

test("maps position filters to monitoring export titles and filenames", () => {
  assert.deepEqual(getPitcherMonitoringExportMeta("TEAM"), {
    title: "Pitcher Monitoring",
    slug: "pitcher_monitoring",
  });
  assert.deepEqual(getPitcherMonitoringExportMeta("SP"), {
    title: "Starting Pitcher",
    slug: "starting_pitcher",
  });
  assert.deepEqual(getPitcherMonitoringExportMeta("RP"), {
    title: "Relief Pitcher",
    slug: "relief_pitcher",
  });

  assert.equal(buildPitcherMonitoringFileName("TEAM", "2026-03-15"), "pitcher_monitoring_2026-03-15.pdf");
  assert.equal(buildPitcherMonitoringFileName("SP", "2026-03-15"), "starting_pitcher_2026-03-15.pdf");
  assert.equal(buildPitcherMonitoringFileName("RP", "2026-03-15"), "relief_pitcher_2026-03-15.pdf");
  assert.equal(
    buildPitcherMonitoringFileName("RP", "2026-03-15", "rp_premium"),
    "relief_pitcher_rp_premium_2026-03-15.pdf",
  );
  assert.equal(
    buildPitcherMonitoringFileName("TEAM", "2026-03-15", "bullpen_alt"),
    "pitcher_monitoring_bullpen_alt_2026-03-15.pdf",
  );
  assert.equal(
    buildPitcherMonitoringFileName("TEAM", "2026-03-15", "bullpen_classic"),
    "pitcher_monitoring_bullpen_classic_2026-03-15.pdf",
  );
});
