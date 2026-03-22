import test from "node:test";
import assert from "node:assert/strict";

import { buildTeamUsageReportHtml } from "./team-usage.js";

test("team usage report renders generated timestamps in Eastern Time with ET label", () => {
  const html = buildTeamUsageReportHtml({
    selectedYear: 2026,
    generatedAt: "2026-03-16T01:05:00.000Z",
    selectedTeams: [],
    chartData: [],
    leagueMedianData: [],
    seasonPatternsData: [],
    trailing28PatternsData: [],
  });

  assert.match(html, /Generated Mar 15, 2026, 9:05 PM ET/);
  assert.match(html, /class="report-title">Team Pitcher Usage Patterns<\/div>/);
  assert.match(html, /2026 Season · 1 = Highest/);
  assert.doesNotMatch(html, /<div class="section-title">Team Pitcher Usage Patterns – 2026/);
  assert.equal((html.match(/class="report-title">Team Pitcher Usage Patterns<\/div>/g) || []).length, 3);
});
