import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPitcherMonitoringReportHtml } from './pitcher-monitoring.js';

function buildPitcher(overrides = {}) {
  return {
    pitcher_name_last_first: 'Doe, Jane',
    position: 'RP',
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
    sparkline: [
      { ewma_7d: 12.3, ewma_28d: 10.4 },
    ],
    pdf_typical_usage: {
      pitches_label: '18.6',
      innings_label: '1.1',
      rest_label: '4.0',
      avg_max_leverage: 2.2,
      leverage_label: '2.20',
    },
    ...overrides,
  };
}

function buildRecentRpUsageFixture() {
  return {
    games: [
      {
        game_id: 'g1',
        game_date: '2026-03-13',
        game_key: '3/13 vs MIA',
        entries: [
          {
            row_number: 1,
            display_name: 'Senga',
            pitcher_hand: 'R',
            is_starter_row: true,
          },
          {
            row_number: 2,
            display_name: 'Peterson',
            pitcher_hand: 'L',
            leverage_group: 'High',
            score_state_text: 'T6, Winning 2 - 1',
            base_state_text: '2 Out, 1 2 3',
            role_to_show: 'HLD',
            pitches_and_innings: '18 Pit, 1.0 IP',
            is_starter_row: false,
          },
        ],
      },
      {
        game_id: 'g2',
        game_date: '2026-03-14',
        game_key: '3/14 @ STL',
        entries: [
          {
            row_number: 1,
            display_name: 'Quintana',
            pitcher_hand: 'L',
            is_starter_row: true,
          },
          {
            row_number: 2,
            display_name: 'Butto',
            pitcher_hand: 'R',
            leverage_group: 'Low',
            score_state_text: 'B7, Losing 1 - 2',
            base_state_text: '0 Out, _ _ _',
            role_to_show: 'BS',
            pitches_and_innings: '16 Pit, 1.0 IP',
            is_starter_row: false,
          },
        ],
      },
    ],
    metadata: {
      lookback_games: 15,
      leverage_source: 'automated_last_15_games',
      note_override_applied: false,
    },
  };
}

test('pitcher monitoring report renders compact Typical and WL summary columns', () => {
  const html = buildPitcherMonitoringReportHtml({
    gameDate: '2026-03-14',
    workloadViewLabel: 'P · G+GB',
    pitchers: [
      buildPitcher(),
    ],
  });

  assert.match(html, /<th[^>]*>Load<\/th>/);
  assert.match(html, /<th[^>]*>Typical<\/th>/);
  assert.match(html, /pitcher-monitoring-template:2026-03-20-activity-text-centered/);
  assert.match(html, /<span class="filter-label">P · G\+GB<\/span>/);
  assert.match(html, /<span class="typical-label">P<\/span><span class="typical-value">19<\/span>/);
  assert.match(html, /<span class="typical-label">IP<\/span><span class="typical-value">1\.1<\/span>/);
  assert.match(html, /<span class="typical-label">R<\/span><span class="typical-value">4\.0<\/span>/);
  assert.match(html, /<span class="typical-label">L<\/span><span class="typical-value typical-value-li-high">High<\/span>/);
  assert.match(html, /<span class="wl-label">7d:<\/span><span class="wl-value">12<\/span>/);
  assert.match(html, /<span class="wl-label">28d:<\/span><span class="wl-value">10<\/span>/);
  assert.match(html, /<span class="wl-label">ACR:<\/span><span class="wl-value">1\.2<\/span>/);
  assert.match(html, /<span class="wl-label">5d:<\/span><span class="wl-value">2\/5<\/span>/);
  assert.match(html, /stroke="#1E293B"/);
  assert.match(html, /stroke="#2563EB"/);
  assert.match(html, /stroke-dasharray="4 3"/);
  assert.match(html, /<div class="monitoring-legend">[\s\S]*P = Pitches, IP = Innings, R = Rest, L = Leverage, 7d = 7d Rolling Game Average, 28d = 28d Rolling Average, ACR = Acute:Chronic Pitching Workload Ratio[\s\S]*<\/div>/);
  assert.doesNotMatch(html, />A<\/text>/);
  assert.doesNotMatch(html, />C<\/text>/);
  assert.equal((html.match(/<circle\b/g) || []).length, 1);
});

test('typical column renders placeholders when trailing usage is unavailable', () => {
  const html = buildPitcherMonitoringReportHtml({
    gameDate: '2026-03-14',
    pitchers: [
      buildPitcher({
        pdf_typical_usage: {
          pitches_label: '--',
          innings_label: '--',
          rest_label: '--',
          avg_max_leverage: null,
          leverage_label: '--',
        },
      }),
    ],
  });

  assert.match(html, /<span class="typical-label">P<\/span><span class="typical-value">--<\/span>/);
  assert.match(html, /<span class="typical-label">IP<\/span><span class="typical-value">--<\/span>/);
  assert.match(html, /<span class="typical-label">R<\/span><span class="typical-value">--<\/span>/);
  assert.match(html, /<span class="typical-label">L<\/span><span class="typical-value">--<\/span>/);
  assert.doesNotMatch(html, /typical-value-li-(low|medium|high)">--<\/span>/);
});

test('typical LI buckets render low and medium labels with leverage tones', () => {
  const lowHtml = buildPitcherMonitoringReportHtml({
    gameDate: '2026-03-14',
    pitchers: [
      buildPitcher({
        pdf_typical_usage: {
          pitches_label: '18.6',
          innings_label: '1.1',
          rest_label: '4.0',
          avg_max_leverage: 0.7,
          leverage_label: '0.70',
        },
      }),
    ],
  });

  const medHtml = buildPitcherMonitoringReportHtml({
    gameDate: '2026-03-14',
    pitchers: [
      buildPitcher({
        pdf_typical_usage: {
          pitches_label: '18.6',
          innings_label: '1.1',
          rest_label: '4.0',
          avg_max_leverage: 1.4,
          leverage_label: '1.40',
        },
      }),
    ],
  });

  assert.match(lowHtml, /<span class="typical-label">L<\/span><span class="typical-value typical-value-li-low">Low<\/span>/);
  assert.match(medHtml, /<span class="typical-label">L<\/span><span class="typical-value typical-value-li-medium">Med<\/span>/);
});

test('left-handed pitchers render their names with the lefty styling class', () => {
  const html = buildPitcherMonitoringReportHtml({
    gameDate: '2026-03-14',
    pitchers: [
      buildPitcher({
        throw_side: 'L',
      }),
    ],
  });

  assert.match(html, /class="pitcher-name pitcher-name-left">Doe, Jane<\/div>/);
  assert.doesNotMatch(html, /class="pitcher-role"/);
});

test('pitcher monitoring report uses the position-specific export title and omits redundant role badges', () => {
  const html = buildPitcherMonitoringReportHtml({
    gameDate: '2026-03-15',
    positionFilter: 'SP',
    activityFilter: 'GAME',
    pitchers: [
      buildPitcher({
        position: 'SP',
        days_of_rest: 4,
        combined_ewma_7d_total_wl: 18.2,
        combined_ewma_28d_total_wl: 16.1,
        sparkline: [],
      }),
    ],
  });

  assert.match(html, /class="report-title">Starting Pitcher<\/div>/);
  assert.match(html, /<span class="filter-label">GAME<\/span>/);
  assert.doesNotMatch(html, /<span class="filter-label">SP<\/span>/);
});

test('team export splits SP and RP into separate report pages', () => {
  const html = buildPitcherMonitoringReportHtml({
    gameDate: '2026-03-15',
    positionFilter: 'TEAM',
    pitchers: [
      buildPitcher({
        pitcher_name_last_first: 'Starter, Sam',
        position: 'SP',
        days_of_rest: 4,
        combined_ewma_7d_total_wl: 10,
        combined_ewma_28d_total_wl: 9,
        sparkline: [],
      }),
      buildPitcher({
        pitcher_name_last_first: 'Reliever, Ray',
        position: 'RP',
        days_of_rest: 1,
        combined_ewma_7d_total_wl: 8,
        combined_ewma_28d_total_wl: 7,
        sparkline: [],
      }),
    ],
  });

  const pageMatches = html.match(/class="page report-page/g) || [];
  const roleMatches = Array.from(html.matchAll(/data-role="([^"]+)"/g)).map((match) => match[1]);
  assert.equal(pageMatches.length, 2);
  assert.deepEqual(roleMatches, ['RP', 'SP']);
  assert.match(html, /report-page-break/);
});

test('trend sparkline mirrors the live microchart styling for frontend payloads', () => {
  const html = buildPitcherMonitoringReportHtml({
    gameDate: '2026-03-15',
    pitchers: [
      buildPitcher({
        days_of_rest: 1,
        combined_ewma_7d_total_wl: 9.2,
        combined_ewma_28d_total_wl: 7.6,
        sparkline: {
          dates: ['2026-03-13', '2026-03-14', '2026-03-15'],
          pitches: [18, 0, 26],
          acuteWorkload: [8.5, 9.2, 10.1],
          chronicWorkload: [7.6, 8.1, 8.8],
          acRatio: 1.56,
        },
      }),
    ],
  });

  assert.match(html, /<rect[^>]*fill="#AEBFD6"[^>]*\/>/);
  assert.match(html, /<path[^>]*stroke="#1E293B"[^>]*\/>/);
  assert.match(html, /<path[^>]*stroke="#2563EB"[^>]*stroke-opacity="0\.88"[^>]*stroke-dasharray="4 3"[^>]*\/>/);
  assert.match(html, /<polygon[^>]*fill="#2563EB"[^>]*opacity="0\.14"[^>]*\/>/);
  assert.match(html, /<circle[^>]*fill="#BE123C"[^>]*\/>/);
  assert.equal((html.match(/<circle\b/g) || []).length, 1);
});

test('date headers render opponent prefix and logos without matchup pills', () => {
  const html = buildPitcherMonitoringReportHtml({
    gameDate: '2026-03-15',
    dateColumns: [
      {
        date: '2026-03-15',
        displayDate: '3/15',
        dayOfWeek: 'Sun',
        opponent: { homeAway: 'home', teamName: 'MIA', logoUrl: 'https://example.com/mia.svg' },
      },
      {
        date: '2026-03-16',
        displayDate: '3/16',
        dayOfWeek: 'Mon',
        opponent: { homeAway: 'away', teamName: 'STL', logoUrl: '' },
      },
    ],
    pitchers: [
      buildPitcher({
        days_of_rest: 1,
        combined_ewma_7d_total_wl: 9.2,
        combined_ewma_28d_total_wl: 7.6,
        sparkline: [],
      }),
    ],
  });

  assert.match(html, /date-header-matchup-prefix">vs<\/span>\s*<img class="opp-logo" src="https:\/\/example\.com\/mia\.svg"/);
  assert.match(html, /date-header-matchup-prefix">@ STL<\/span>/);
  assert.match(html, /class="opp-logo"/);
  assert.doesNotMatch(html, /class="date-header-matchup"/);
});

test('planned exports keep grouped Past, Today, and Planned headers', () => {
  const html = buildPitcherMonitoringReportHtml({
    gameDate: '2026-03-15',
    dateColumns: [
      { date: '2026-03-14', displayDate: '3/14', dayOfWeek: 'Sat' },
      { date: '2026-03-15', displayDate: '3/15', dayOfWeek: 'Sun' },
      { date: '2026-03-16', displayDate: '3/16', dayOfWeek: 'Mon' },
    ],
    pitchers: [
      buildPitcher({
        days_of_rest: 0,
        combined_ewma_7d_total_wl: 8.2,
        combined_ewma_28d_total_wl: 7.6,
        flags: {
          is_back_to_back: true,
          release_abnormal_current: false,
          release_abnormal_recent: true,
          max_leverage_abnormal: true,
          high_workload_current: false,
          high_workload_recent: true,
          high_stress: true,
        },
        daily: [
          { catch_play: { pitches: 18, avg_speed: 72 } },
          { game: { pitches: 22, outs: 3 } },
          { bullpen: { pitches: 20, classification: 'Side' } },
        ],
        sparkline: [{ ewma_7d: 8.2, ewma_28d: 7.6 }],
      }),
    ],
  });

  assert.match(html, />Past 1<\/th>/);
  assert.match(html, />Today<\/th>/);
  assert.match(html, />Planned 1<\/th>/);
  assert.match(html, /class="[^"]*col-selected[^"]*"/);
  assert.match(html, /flag-rel"><span class="pill-text">VELO<\/span><\/span>/);
  assert.match(html, /flag-lev"><span class="pill-text">LEV<\/span><\/span>/);
  assert.match(html, /flag-hs"><span class="pill-text">HS<\/span><\/span>/);
  assert.match(html, /activity-cp">\s*<span class="pill-text">CP 18<\/span>\s*<\/span>/);
  assert.match(html, /activity-game">\s*<span class="pill-text">\s*<span class="pill-prefix">G<\/span>\s*<span class="pill-detail">1\.0 IP 22 P<\/span>\s*<\/span>\s*<\/span>/);
  assert.match(html, /activity-side">\s*<span class="pill-text">S 20<\/span>\s*<\/span>/);
});

test('daily session pills show innings for game and GB only when available', () => {
  const html = buildPitcherMonitoringReportHtml({
    gameDate: '2026-03-15',
    dateColumns: [
      { date: '2026-03-13', displayDate: '3/13', dayOfWeek: 'Fri' },
      { date: '2026-03-14', displayDate: '3/14', dayOfWeek: 'Sat' },
      { date: '2026-03-15', displayDate: '3/15', dayOfWeek: 'Sun' },
    ],
    pitchers: [
      buildPitcher({
        days_of_rest: 1,
        combined_ewma_7d_total_wl: 7.8,
        combined_ewma_28d_total_wl: 6.9,
        daily: [
          { game: { pitches: 3, outs: 1 } },
          { bullpen: { pitches: 21, classification: 'GB', outs: 7 } },
          { game: { pitches: 22, outs: 3 }, bullpen: { pitches: 17, classification: 'GB' } },
        ],
        sparkline: [{ ewma_7d: 7.8, ewma_28d: 6.9 }],
      }),
      buildPitcher({
        pitcher_name_last_first: 'Doe, Jake',
        days_of_rest: 2,
        combined_ewma_7d_total_wl: 6.8,
        combined_ewma_28d_total_wl: 6.1,
        daily: [
          { bullpen: { pitches: 19, classification: 'Side', outs: 6 } },
          {},
          {},
        ],
        sparkline: [{ ewma_7d: 6.8, ewma_28d: 6.1 }],
      }),
    ],
  });

  assert.match(html, /activity-game">\s*<span class="pill-text">\s*<span class="pill-prefix">G<\/span>\s*<span class="pill-detail">0\.1 IP 3 P<\/span>\s*<\/span>\s*<\/span>/);
  assert.match(html, /activity-gb">\s*<span class="pill-text">\s*<span class="pill-prefix">GB<\/span>\s*<span class="pill-detail">2\.1 IP 21 P<\/span>\s*<\/span>\s*<\/span>/);
  assert.match(html, /activity-game">\s*<span class="pill-text">\s*<span class="pill-prefix">G<\/span>\s*<span class="pill-detail">1\.0 IP 22 P<\/span>\s*<\/span>\s*<\/span>/);
  assert.match(html, /activity-gb">\s*<span class="pill-text">\s*<span class="pill-prefix">GB<\/span>\s*<span class="pill-detail">17 P<\/span>\s*<\/span>\s*<\/span>/);
  assert.match(html, /activity-side">\s*<span class="pill-text">S 19<\/span>\s*<\/span>/);
  assert.doesNotMatch(html, /activity-side">\s*<span class="pill-text">\s*<span class="pill-prefix">S<\/span>\s*<span class="pill-detail">6\.0 IP 19 P<\/span>\s*<\/span>\s*<\/span>/);
});

test('trend sparkline falls back to a placeholder when all values are empty', () => {
  const html = buildPitcherMonitoringReportHtml({
    gameDate: '2026-03-15',
    pitchers: [
      buildPitcher({
        days_of_rest: 2,
        combined_ewma_7d_total_wl: 0,
        combined_ewma_28d_total_wl: 0,
        sparkline: {
          dates: ['2026-03-14', '2026-03-15'],
          pitches: [0, 0],
          acuteWorkload: [null, null],
          chronicWorkload: [null, null],
          acRatio: null,
        },
      }),
    ],
  });

  assert.match(html, /sparkline-wrap"><span class="empty-cell">—<\/span><\/div>/);
});

test('rp export renders the recent reliever usage section when recentRpUsage is provided', () => {
  const html = buildPitcherMonitoringReportHtml({
    gameDate: '2026-03-15',
    positionFilter: 'RP',
    recentRpUsage: buildRecentRpUsageFixture(),
    pitchers: [
      buildPitcher({ pitcher_name_last_first: 'Reliever, Ray' }),
    ],
  });

  assert.match(html, /Last 7 Games - Reliever Entrances by Leverage/);
  assert.match(html, /<section class="recent-usage-section">/);
  assert.match(html, /<th colspan="2">3\/13 vs MIA<\/th>/);
  assert.match(html, /<th colspan="2">3\/14 @ STL<\/th>/);
  assert.match(html, /class="recent-usage-name-cell recent-usage-name-right recent-usage-name-starter">Senga<\/td>/);
  assert.match(html, /class="recent-usage-name-cell recent-usage-name-left">Peterson<\/td>/);
  assert.match(html, /class="recent-usage-context-cell recent-usage-context-high">/);
  assert.match(html, /class="recent-usage-context-cell recent-usage-context-low">/);
  assert.match(html, /T6, Winning 2 - 1/);
  assert.match(html, /2 Out, 1 2 3/);
  assert.match(html, /data-row-number="1"[\s\S]*?recent-usage-context-top">&nbsp;<\/div>/);
});

test('team export keeps recent reliever usage on the RP page before the SP page', () => {
  const html = buildPitcherMonitoringReportHtml({
    gameDate: '2026-03-15',
    positionFilter: 'TEAM',
    recentRpUsage: buildRecentRpUsageFixture(),
    pitchers: [
      buildPitcher({
        pitcher_name_last_first: 'Starter, Sam',
        position: 'SP',
        sparkline: [],
      }),
      buildPitcher({
        pitcher_name_last_first: 'Reliever, Ray',
        position: 'RP',
        sparkline: [],
      }),
    ],
  });

  const rpPageIndex = html.indexOf('data-role="RP"');
  const recentUsageIndex = html.indexOf('class="recent-usage-section"');
  const spPageIndex = html.indexOf('data-role="SP"');

  assert.ok(rpPageIndex >= 0);
  assert.ok(recentUsageIndex > rpPageIndex);
  assert.ok(spPageIndex > recentUsageIndex);
  assert.equal((html.match(/class="recent-usage-section"/g) || []).length, 1);
});

test('sp exports omit the recent reliever usage section even when the payload is present', () => {
  const html = buildPitcherMonitoringReportHtml({
    gameDate: '2026-03-15',
    positionFilter: 'SP',
    recentRpUsage: buildRecentRpUsageFixture(),
    pitchers: [
      buildPitcher({
        pitcher_name_last_first: 'Starter, Sam',
        position: 'SP',
        sparkline: [],
      }),
    ],
  });

  assert.doesNotMatch(html, /Last 7 Games - Reliever Entrances by Leverage/);
  assert.doesNotMatch(html, /class="recent-usage-section"/);
});

test('rp exports omit the recent reliever usage section when recentRpUsage is empty', () => {
  const html = buildPitcherMonitoringReportHtml({
    gameDate: '2026-03-15',
    positionFilter: 'RP',
    recentRpUsage: { games: [], metadata: {} },
    pitchers: [
      buildPitcher({ pitcher_name_last_first: 'Reliever, Ray' }),
    ],
  });

  assert.doesNotMatch(html, /Last 7 Games - Reliever Entrances by Leverage/);
  assert.doesNotMatch(html, /class="recent-usage-section"/);
});

test('non-planned exports use a single-row date header and no trend legend text', () => {
  const html = buildPitcherMonitoringReportHtml({
    gameDate: '2026-03-15',
    dateColumns: [
      { date: '2026-03-13', displayDate: '3/13', dayOfWeek: 'Fri' },
      { date: '2026-03-14', displayDate: '3/14', dayOfWeek: 'Sat' },
      { date: '2026-03-15', displayDate: '3/15', dayOfWeek: 'Sun' },
    ],
    pitchers: [
      {
        pitcher_name_last_first: 'Doe, Jane',
        position: 'RP',
        days_of_rest: 2,
        combined_ewma_7d_total_wl: 7.1,
        combined_ewma_28d_total_wl: 6.2,
        flags: {},
        daily: [],
        sparkline: [{ ewma_7d: 7.1, ewma_28d: 6.2 }],
      },
    ],
  });

  assert.doesNotMatch(html, />Past \d+<\/th>/);
  assert.doesNotMatch(html, />Today<\/th>/);
  assert.doesNotMatch(html, />Acute<\/text>/);
  assert.doesNotMatch(html, />Chronic<\/text>/);
  assert.match(html, /<div class="monitoring-legend">[\s\S]*7d = 7d Rolling Game Average[\s\S]*28d = 28d Rolling Average[\s\S]*<\/div>/);
});

test('pitcher monitoring report renders generated timestamps in Eastern Time with ET label', () => {
  const html = buildPitcherMonitoringReportHtml({
    gameDate: '2026-03-16',
    generatedAt: '2026-03-16T01:05:00.000Z',
    pitchers: [
      buildPitcher(),
    ],
  });

  assert.match(html, /Generated Mar 15, 2026, 9:05 PM ET/);
  assert.match(html, /Mar 16, 2026/);
});
