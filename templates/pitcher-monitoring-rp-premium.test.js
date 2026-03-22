import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPitcherMonitoringRpPremiumReportHtml,
  PITCHER_MONITORING_RP_PREMIUM_TEMPLATE_VERSION,
} from "./pitcher-monitoring-rp-premium.js";

function buildPitcher(overrides = {}) {
  return {
    pitcher_name_last_first: "Doe, Jane",
    throw_side: "R",
    premium_typical: {
      pitchValue: "19",
      inningsValue: "1.0",
      restValue: "2.0",
      leverageValue: "High",
    },
    premium_load: {
      acuteValue: "12",
      chronicValue: "16",
      acrValue: "0.84",
      fiveDayValue: "2/5",
    },
    premium_daily: [
      { topText: "12 PIT | 1.0 IP", sessionLabel: "G", supportLabel: "Up 1x", bottomText: "G · Up 1x", tone: "heat-1", isToday: false, isPlanned: false, workloadValue: 4 },
      { topText: "18 PIT | 1.0 IP", sessionLabel: "GB", supportLabel: "W 7", bottomText: "GB · W 7", tone: "heat-2", isToday: false, isPlanned: false, workloadValue: 8 },
      { topText: "", sessionLabel: "", supportLabel: "", bottomText: "", tone: "empty", isToday: false, isPlanned: false, workloadValue: null },
      { topText: "9 PIT", sessionLabel: "CP", supportLabel: "", bottomText: "CP", tone: "neutral", isToday: false, isPlanned: false, workloadValue: null },
      { topText: "", sessionLabel: "", supportLabel: "", bottomText: "", tone: "empty", isToday: false, isPlanned: false, workloadValue: null },
      { topText: "16 PIT", sessionLabel: "CP", supportLabel: "", bottomText: "CP", tone: "neutral", isToday: true, isPlanned: false, workloadValue: null },
    ],
    flags: {
      high_workload_recent: true,
      high_stress: true,
      release_abnormal_recent: true,
      is_back_to_back: true,
      pitched_3_of_last_5: true,
    },
    sparkline: {
      dates: ["3/10", "3/11", "3/12", "3/13", "3/14", "3/15"],
      activityValues: [10, 0, 18, 0, 14, 9],
      acuteWorkload: [7, 8, 9, 9, 10, 11],
      chronicWorkload: [8, 8, 8.5, 8.75, 9, 9.1],
      acRatio: 1.21,
    },
    ...overrides,
  };
}

test("rp premium template renders a full-signal RP board with stacked metrics and Palace-style recent usage", () => {
  const html = buildPitcherMonitoringRpPremiumReportHtml({
    gameDate: "2026-03-15",
    generatedAt: "2026-03-21T16:10:00.000Z",
    positionFilter: "RP",
    workloadViewLabel: "WL · All",
    dateColumns: [
      { date: "2026-03-10", displayDate: "3/10", dayOfWeek: "Tue", isToday: false, isPlanned: false, opponent: { teamName: "ATL", homeAway: "away", logoUrl: "https://www.mlbstatic.com/team-logos/144.svg" } },
      { date: "2026-03-11", displayDate: "3/11", dayOfWeek: "Wed", isToday: false, isPlanned: false },
      { date: "2026-03-12", displayDate: "3/12", dayOfWeek: "Thu", isToday: false, isPlanned: false },
      { date: "2026-03-13", displayDate: "3/13", dayOfWeek: "Fri", isToday: false, isPlanned: false },
      { date: "2026-03-14", displayDate: "3/14", dayOfWeek: "Sat", isToday: false, isPlanned: false },
      { date: "2026-03-15", displayDate: "3/15", dayOfWeek: "Sun", isToday: true, isPlanned: false, opponent: { teamName: "PHI", homeAway: "home", logoUrl: "https://www.mlbstatic.com/team-logos/143.svg" } },
    ],
    pitchers: [buildPitcher()],
    recentRpUsage: {
      games: [
        { game_key: "3/09 Mon", entries: [{ name_show: "Oldest", is_starter_row: true }] },
        {
          game_key: "3/10 Tue",
          entries: [
            { name_show: "Starter", is_starter_row: true, row_number: 1 },
            {
              display_name: "Lefty, Lou",
              pitcher_hand: "L",
              leverage_value: 2.4,
              score_state_text: "B7, Winning 4 - 2",
              base_state_text: "1 Out, _ 2 _",
              row_number: 2,
            },
          ],
        },
        {
          game_key: "3/11 Wed",
          entries: [
            { name_show: "Starter", is_starter_row: true, row_number: 1 },
            {
              display_name: "Righty, Ray",
              pitcher_hand: "R",
              leverage_group: "Medium",
              role_to_show: "HLD",
              pitches_and_innings: "19 Pit, 1.0 IP",
              row_number: 2,
            },
          ],
        },
        { game_key: "3/12 Thu", entries: [{ name_show: "Starter", is_starter_row: true, row_number: 1 }] },
        { game_key: "3/13 Fri", entries: [{ name_show: "Starter", is_starter_row: true, row_number: 1 }] },
        { game_key: "3/14 Sat", entries: [{ name_show: "Starter", is_starter_row: true, row_number: 1 }] },
        { game_key: "3/15 Sun", entries: [{ name_show: "Starter", is_starter_row: true, row_number: 1 }] },
        { game_key: "3/16 Mon", entries: [{ name_show: "Starter", is_starter_row: true, row_number: 1 }] },
      ],
    },
  });

  assert.match(html, new RegExp(`pitcher-monitoring-template:${PITCHER_MONITORING_RP_PREMIUM_TEMPLATE_VERSION}`));
  assert.match(html, /class="rp-premium-header"/);
  assert.match(html, /Relief Pitcher/);
  assert.match(html, /class="rp-premium-board"/);
  assert.match(html, /Pitcher<\/th>/);
  assert.match(html, /Typical<\/th>/);
  assert.match(html, /Load<\/th>/);
  assert.match(html, /Flags<\/th>/);
  assert.match(html, /Trend<\/th>/);
  assert.match(html, /Recent<\/th>/);
  assert.doesNotMatch(html, />Planned<\/th>/);
  assert.match(html, /class="rp-premium-date-head is-today"/);
  assert.match(html, /class="rp-premium-metric-stack rp-premium-metric-stack-typical"/);
  assert.match(html, /class="rp-premium-metric-line is-primary is-paired"/);
  assert.match(html, /class="rp-premium-metric-token"/);
  assert.match(html, /<span class="rp-premium-metric-label">P<\/span>\s*<span class="rp-premium-metric-value">19<\/span>/);
  assert.match(html, /<span class="rp-premium-metric-label">IP<\/span>\s*<span class="rp-premium-metric-value">1\.0<\/span>/);
  assert.match(html, /class="rp-premium-metric-line is-tertiary"/);
  assert.match(html, /<span class="rp-premium-metric-label">R<\/span>\s*<span class="rp-premium-metric-value">2\.0<\/span>/);
  assert.match(html, /<span class="rp-premium-metric-label">Lev<\/span>\s*<span class="rp-premium-metric-value">High<\/span>/);
  assert.match(html, /class="rp-premium-metric-stack rp-premium-metric-stack-load"/);
  assert.match(html, /class="rp-premium-metric-line is-primary is-acr"/);
  assert.match(html, /<span class="rp-premium-metric-label">ACR<\/span>\s*<span class="rp-premium-metric-value">0\.84<\/span>/);
  assert.match(html, /<span class="rp-premium-metric-label">7d<\/span>\s*<span class="rp-premium-metric-value">12<\/span>/);
  assert.match(html, /<span class="rp-premium-metric-label">28d<\/span>\s*<span class="rp-premium-metric-value">16<\/span>/);
  assert.match(html, /<span class="rp-premium-metric-label">5d<\/span>\s*<span class="rp-premium-metric-value">2\/5<\/span>/);
  assert.doesNotMatch(html, /G 10/);
  assert.match(html, /class="rp-premium-day-cell tone-heat-2"/);
  assert.match(html, /G · Up 1x/);
  assert.match(html, /GB · W 7/);
  assert.match(html, /CP/);
  assert.match(html, /HWL/);
  assert.match(html, /HS/);
  assert.match(html, /VELO/);
  assert.match(html, /B2B/);
  assert.match(html, /class="rp-premium-flag-chip is-high"/);
  assert.match(html, /class="rp-premium-flag-chip is-overflow"|class="rp-premium-flag-chip is-low"|class="rp-premium-flag-chip is-neutral"/);
  assert.match(html, /<svg width="96" height="30"/);
  assert.doesNotMatch(html, /rp-premium-sparkline-area/);
  assert.match(html, /rp-premium-sparkline-line-chronic/);
  assert.match(html, /rp-premium-sparkline-line-acute/);
  assert.match(html, /rp-premium-sparkline-endpoint/);
  assert.doesNotMatch(html, /rp-premium-sparkline-endpoint-ring/);
  assert.doesNotMatch(html, /rp-premium-sparkline-bar/);
  assert.doesNotMatch(html, /rp-premium-sparkline-divergence/);
  assert.match(html, /rp-premium-date-logo-badge/);
  assert.match(html, /rp-premium-date-opp-logo/);
  assert.match(html, /rp-premium-date-matchup-prefix/);
  assert.match(html, /rp-premium-flag-grid/);
  assert.match(html, /border-left: 1\.5px solid #B7C2D0 !important;/);
  assert.match(html, /border-left: 1px solid #B7C2D0 !important;/);
  assert.doesNotMatch(html, /border-left: 1px solid #000 !important;/);
  assert.match(html, /Last 7 Games - Reliever Entrances by Leverage/);
  assert.match(html, /class="rp-premium-recent-row is-starter"/);
  assert.match(html, /recent-name-left/);
  assert.match(html, /recent-context-high/);
  assert.match(html, /recent-context-medium/);
  assert.match(html, /#1F3A5F/);
  assert.match(html, /#274B75/);
  assert.match(html, /#2F5F94/);
  assert.match(html, /#E06A2C/);
  assert.match(html, /#D9D9D9/);
  assert.match(html, /#F5F6F7/);
  assert.match(html, /#F8FAFC/);
  assert.match(html, /#FDECEA/);
  assert.match(html, /#FFF4E5/);
  assert.match(html, /#EEF4FF/);
  assert.match(html, /#F3F4F6/);
  assert.match(html, /B7, Winning 4 - 2/);
  assert.match(html, /1 Out, _ 2 _/);
  assert.match(html, /HLD/);
  assert.match(html, /19 Pit, 1\.0 IP/);
  assert.match(html, /3\/15 Sun/);
  assert.match(html, /3\/10 Tue/);
  assert.match(html, /3\/16 Mon/);
  assert.doesNotMatch(html, /3\/09 Mon/);
});
