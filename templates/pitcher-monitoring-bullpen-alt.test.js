import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPitcherMonitoringBullpenAltReportHtml,
  PITCHER_MONITORING_BULLPEN_ALT_TEMPLATE_VERSION,
} from "./pitcher-monitoring-bullpen-alt.js";
import {
  buildPitcherMonitoringBullpenClassicReportHtml,
  PITCHER_MONITORING_BULLPEN_CLASSIC_TEMPLATE_VERSION,
} from "./pitcher-monitoring-bullpen-classic.js";
import { buildPitcherMonitoringReportHtml } from "./pitcher-monitoring.js";

function buildPitcher(overrides = {}) {
  return {
    pitcher_name_last_first: "Doe, Jane",
    position: "RP",
    days_of_rest: 2,
    workload_summary: {
      acute: 12.3,
      chronic: 10.4,
      acr: 1.1827,
      pitched_days_last_5: 2,
    },
    combined_ewma_7d_total_wl: 12.3,
    combined_ewma_28d_total_wl: 10.4,
    flags: {},
    daily: [],
    sparkline: [{ ewma_7d: 12.3, ewma_28d: 10.4 }],
    pdf_typical_usage: {
      pitches_label: "18.6",
      innings_label: "1.1",
      rest_label: "4.0",
      avg_max_leverage: 2.2,
      leverage_label: "2.20",
    },
    ...overrides,
  };
}

test("classic monitoring template remains the default pill-based layout", () => {
  const html = buildPitcherMonitoringReportHtml({
    gameDate: "2026-03-15",
    dateColumns: [
      { date: "2026-03-15", displayDate: "3/15", dayOfWeek: "Sun" },
    ],
    pitchers: [
      buildPitcher({
        daily: [{ game: { pitches: 22, outs: 3 } }],
      }),
    ],
  });

  assert.match(html, /pitcher-monitoring-template:2026-03-20-activity-text-centered/);
  assert.match(html, /activity-game">\s*<span class="pill-text">\s*<span class="pill-prefix">G<\/span>\s*<span class="pill-detail">1\.0 IP 22 P<\/span>/);
  assert.doesNotMatch(html, /day-block-text-top/);
});

test("bullpen alt template renders solid day blocks and right rail markup", () => {
  const html = buildPitcherMonitoringBullpenAltReportHtml({
    gameDate: "2026-03-15",
    dateColumns: [
      { date: "2026-03-14", displayDate: "3/14", dayOfWeek: "Sat" },
      { date: "2026-03-15", displayDate: "3/15", dayOfWeek: "Sun" },
      { date: "2026-03-16", displayDate: "3/16", dayOfWeek: "Mon" },
    ],
    pitchers: [
      buildPitcher({
        flags: {
          release_abnormal_recent: true,
          high_stress: true,
        },
        daily: [
          { game: { pitches: 12, outs: 3, wl: 4 }, up_count: 2 },
          { game: { pitches: 18, outs: 3, wl: 11 }, warmup: { pitches: 9 } },
          { bullpen: { pitches: 24, classification: "GB", outs: 6, wl: 24 } },
        ],
      }),
    ],
    recentRpUsage: {
      games: [
        {
          game_id: "g1",
          game_key: "3/10 Tue",
          entries: [
            {
              name_show: "Starter",
              pitcher_hand: "R",
              inning_score_show: " ",
              out_runner_show: " ",
              leverage_group: null,
              is_starter_row: true,
            },
            {
              name_show: "Doe",
              pitcher_hand: "L",
              inning_score_show: "7th 2-1",
              out_runner_show: "1 on, 2 out",
              leverage_group: "medium",
            },
          ],
        },
      ],
    },
  });

  assert.match(html, new RegExp(`pitcher-monitoring-template:${PITCHER_MONITORING_BULLPEN_ALT_TEMPLATE_VERSION}`));
  assert.match(html, /border-collapse: collapse;/);
  assert.match(html, /border-bottom: 2px solid #FF5910;/);
  assert.match(html, /background: #002D72;/);
  assert.match(html, /border: 1\.5px solid #A9A9A9;/);
  assert.match(html, /background: #F5F5F5;/);
  assert.match(html, /-webkit-print-color-adjust: exact;/);
  assert.match(html, /print-color-adjust: exact;/);
  assert.match(html, /Daily Workload Reporting/);
  assert.match(html, /Each day block shows the highest-priority session for that date/);
  assert.match(html, /class="monitoring-legend-label">Legend<\/span>/);
  assert.match(html, /class="wl-row wl-row-acr"/);
  assert.match(html, /class="typical-row typical-row-leverage"/);
  assert.match(html, /class="fixed-col fixed-pitcher"/);
  assert.match(html, /class="rail-cell flags-rail-cell"/);
  assert.match(html, /class="rail-cell trend-rail-cell"/);
  assert.match(html, /class="recent-usage-section" data-density="sparse"/);
  assert.match(html, /day-block day-block-heat-1" data-wl="4">\s*<span class="day-block-text-top">12 PIT \| 1\.0 IP<\/span>\s*<span class="day-block-text-bottom">Up 2x<\/span>/);
  assert.match(html, /day-block day-block-heat-3" data-wl="11">\s*<span class="day-block-text-top">18 PIT \| 1\.0 IP<\/span>\s*<span class="day-block-text-bottom">W 9<\/span>/);
  assert.match(html, /day-block day-block-heat-5" data-wl="24">\s*<span class="day-block-text-top">24 PIT \| 2\.0 IP<\/span>\s*<span class="day-block-text-bottom">GB<\/span>/);
  assert.match(html, /flag-rel"><span class="pill-text">VELO<\/span><\/span>/);
  assert.match(html, /flag-hs"><span class="pill-text">HS<\/span><\/span>/);
  assert.doesNotMatch(html, /col-selected/);
  assert.doesNotMatch(html, /box-shadow: inset 0 0 0 1px rgba\(79, 129, 255, 0\.8\);/);
});

test("bullpen classic template renders a compact operational board without rails", () => {
  const html = buildPitcherMonitoringBullpenClassicReportHtml({
    gameDate: "2026-03-15",
    positionFilter: "RP",
    activityFilter: "PG+GB",
    rosterFilter: "40MAN",
    dateColumns: [
      { date: "2026-03-14", displayDate: "3/14", dayOfWeek: "Sat" },
      { date: "2026-03-15", displayDate: "3/15", dayOfWeek: "Sun" },
      { date: "2026-03-16", displayDate: "3/16", dayOfWeek: "Mon" },
    ],
    pitchers: [
      buildPitcher({
        days_of_rest: 0,
        daily: [
          { game: { pitches: 12, outs: 3, wl: 4 }, up_count: 2 },
          { game: { pitches: 18, outs: 3, wl: 11 }, warmup: { pitches: 9 } },
          {},
        ],
      }),
    ],
    recentRpUsage: {
      games: [
        {
          game_id: "g1",
          game_key: "3/10 Tue",
          entries: [
            {
              name_show: "Starter",
              pitcher_hand: "R",
              inning_score_show: " ",
              out_runner_show: " ",
              leverage_group: null,
              is_starter_row: true,
            },
            {
              name_show: "Doe",
              pitcher_hand: "L",
              inning_score_show: "7th 2-1",
              out_runner_show: "1 on, 2 out",
              leverage_group: "medium",
            },
          ],
        },
      ],
    },
  });

  assert.match(html, new RegExp(`pitcher-monitoring-template:${PITCHER_MONITORING_BULLPEN_CLASSIC_TEMPLATE_VERSION}`));
  assert.match(html, /class="classic-header"/);
  assert.match(html, /Pitcher<\/th>/);
  assert.match(html, /Recent<\/th>/);
  assert.match(html, /Leverage<\/th>/);
  assert.match(html, /Length<\/th>/);
  assert.match(html, /Days Off<\/th>/);
  assert.match(html, /Prior Workload/);
  assert.match(html, /class="classic-board-table"/);
  assert.match(html, /class="classic-report-meta-row"/);
  assert.match(html, /class="classic-recent-superhead"/);
  assert.match(html, /12 PIT \| 1\.0 IP/);
  assert.match(html, /Up 2x/);
  assert.match(html, /class="classic-recent-section"/);
  assert.match(html, /class="classic-comments-section"/);
  assert.match(html, /Comments<\/th>/);
  assert.doesNotMatch(html, /Flags<\/th>/);
  assert.doesNotMatch(html, /Trend<\/th>/);
  assert.doesNotMatch(html, /class="rail-cell flags-rail-cell"/);
  assert.doesNotMatch(html, /class="rail-cell trend-rail-cell"/);
});

test("bullpen classic template renders supplied comments", () => {
  const html = buildPitcherMonitoringBullpenClassicReportHtml({
    gameDate: "2026-03-15",
    dateColumns: [
      { date: "2026-03-15", displayDate: "3/15", dayOfWeek: "Sun" },
    ],
    pitchers: [buildPitcher()],
    comments: ["Watch usage if game goes extras", "Hold available if needed"],
  });

  assert.match(html, /Watch usage if game goes extras/);
  assert.match(html, /Hold available if needed/);
});
