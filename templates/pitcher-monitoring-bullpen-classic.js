/**
 * Classic bullpen-board style pitcher monitoring PDF template.
 */

import { COLORS, sharedCss } from "./shared-styles.js";
import { getPitcherMonitoringExportMeta } from "../pitcher-monitoring-export.js";
import { formatEasternTimestamp } from "./time-format.js";

const RECENT_USAGE_MAX_GAMES = 7;
const RECENT_USAGE_TITLE = "Last 7 Games - Reliever Entrances by Leverage";
export const PITCHER_MONITORING_BULLPEN_CLASSIC_TEMPLATE_VERSION = "2026-03-21-bullpen-classic-v4-modern";
const CLASSIC_COLUMN_WIDTHS = {
  pitcher: 132,
  leverage: 72,
  length: 84,
  daysOff: 58,
};
const CLASSIC_COMMENTS_PLACEHOLDER_LINES = 3;
const CLASSIC_COLORS = {
  // Brand colors
  metsBlue: "#002D72",
  metsOrange: "#FF5910",

  // Modern neutral palette
  text: {
    primary: "#1a1a1a",
    secondary: "#6b7280",
    muted: "#9ca3af",
    light: "#d1d5db",
  },

  // Borders and backgrounds
  border: "#e5e7eb",
  borderLight: "#f3f4f6",
  bgGray: "#f9fafb",
  bgWhite: "#ffffff",

  // Status colors - modern, muted
  leverageLow: "#ecfdf5",
  leverageMedium: "#fef3c7",
  leverageHigh: "#fee2e2",
  leverageLowText: "#065f46",
  leverageMediumText: "#92400e",
  leverageHighText: "#991b1b",

  // Workload heat map - subtle gradients
  dayHeat1: "#f0fdf4",
  dayHeat2: "#dcfce7",
  dayHeat3: "#fef3c7",
  dayHeat4: "#fed7aa",
  dayHeat5: "#fca5a5",

  // Accent colors
  accent: "#FF5910",
  accentLight: "rgba(255, 89, 16, 0.1)",
  shadow: "rgba(0, 0, 0, 0.04)",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeNum(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return Number(value);
}

function fmtInningsCompact(value) {
  const num = safeNum(value);
  if (num == null) return null;
  return num.toFixed(1);
}

function getTypicalLeverageBucket(value, fallbackValue = "—") {
  const num = safeNum(value);
  if (num == null) return { value: fallbackValue || "—", valueClass: "" };
  if (num < 0.85) return { value: "Low", valueClass: "typical-value-li-low" };
  if (num <= 2) return { value: "Med", valueClass: "typical-value-li-medium" };
  return { value: "High", valueClass: "typical-value-li-high" };
}

function buildColumnClasses(index, selectedIndex, firstFutureIndex) {
  const classes = [];
  if (index === 0) classes.push("col-first-date");
  if (index === selectedIndex) classes.push("col-current");
  if (index > selectedIndex) classes.push("col-future");
  if (index === firstFutureIndex) classes.push("col-boundary");
  return classes.join(" ");
}

function normalizeRecentRpUsage(recentRpUsage) {
  const gamesSource = Array.isArray(recentRpUsage?.games) ? recentRpUsage.games : [];
  const games = gamesSource
    .slice(-RECENT_USAGE_MAX_GAMES)
    .map((game, gameIndex) => {
      const entriesSource = Array.isArray(game?.entries) ? game.entries : [];
      const entries = entriesSource
        .map((entry, entryIndex) => ({
          ...entry,
          rowNumber: Math.max(1, Math.round(safeNum(entry?.row_number) ?? (entryIndex + 1))),
          sortOrder: entryIndex,
        }))
        .sort((left, right) => ((left.rowNumber - right.rowNumber) || (left.sortOrder - right.sortOrder)));

      const entryByRow = new Map();
      entries.forEach((entry) => {
        if (!entryByRow.has(entry.rowNumber)) entryByRow.set(entry.rowNumber, entry);
      });

      return {
        key: String(game?.game_id ?? game?.game_key ?? gameIndex),
        gameKey: String(game?.game_key ?? ""),
        entries,
        entryByRow,
      };
    })
    .filter((game) => game.gameKey || game.entries.length > 0);

  if (!games.length) return null;

  const rowCount = games.reduce((maxRows, game) => {
    const gameMaxRow = game.entries.reduce((maxRow, entry) => Math.max(maxRow, entry.rowNumber), 0);
    return Math.max(maxRows, gameMaxRow);
  }, 0);

  if (rowCount <= 0) return null;
  return { games, rowCount };
}

function getPitcherThrowSide(pitcher) {
  return String(
    pitcher?.throw_side
    || pitcher?.pitcher_hand
    || pitcher?.throws
    || ""
  ).trim().toUpperCase();
}

function getSessionDisplayInnings(session) {
  const inningsValue = safeNum(session?.innings);
  if (inningsValue != null && inningsValue > 0) return inningsValue;

  const outsValue = safeNum(session?.outs);
  if (outsValue == null || outsValue <= 0) return null;

  return Math.floor(outsValue / 3) + ((outsValue % 3) / 10);
}

function hasPositiveMetric(value) {
  const num = safeNum(value);
  return num != null && num > 0;
}

function hasSessionActivity(session, { allowSpeed = false } = {}) {
  if (!session || typeof session !== "object") return false;
  return hasPositiveMetric(session?.pitches)
    || hasPositiveMetric(session?.wl)
    || hasPositiveMetric(session?.innings)
    || hasPositiveMetric(session?.outs)
    || (allowSpeed && safeNum(session?.avg_speed) != null);
}

function getBullpenLabel(classification) {
  const normalized = String(classification || "Side").trim();
  const upper = normalized.toUpperCase();
  if (upper === "GB") return "GB";
  if (upper === "SIDE") return "S";
  if (upper.includes("TF")) return "T";
  if (upper === "LIVE BP" || upper === "LIVEBP") return "L";
  if (upper === "GAME") return "G";
  return "S";
}

function getPrimaryDaySession(dayData, activityFilter) {
  if (!dayData || typeof dayData !== "object") return null;
  const gameOnly = activityFilter === "GAME";
  const bullpen = dayData.bullpen;
  const bullpenLabel = getBullpenLabel(bullpen?.classification);

  const candidates = [];
  if (hasSessionActivity(dayData.game)) {
    candidates.push({ key: "game", label: "G", session: dayData.game });
  }
  if (bullpenLabel === "GB" && hasSessionActivity(bullpen)) {
    candidates.push({ key: "bullpen", label: "GB", session: bullpen });
  }

  if (gameOnly) return candidates[0] || null;

  if (bullpenLabel !== "GB" && hasSessionActivity(bullpen)) {
    candidates.push({ key: "bullpen", label: bullpenLabel, session: bullpen });
  }
  if (hasSessionActivity(dayData.live_bp)) {
    candidates.push({ key: "live_bp", label: "L", session: dayData.live_bp });
  }
  if (hasSessionActivity(dayData.catch_play, { allowSpeed: true })) {
    candidates.push({ key: "catch_play", label: "CP", session: dayData.catch_play });
  }
  if (hasSessionActivity(dayData.warmup)) {
    candidates.push({ key: "warmup", label: "W", session: dayData.warmup });
  }

  return candidates[0] || null;
}

function resolveDayWorkload(dayData, primarySession) {
  const primaryWl = safeNum(primarySession?.session?.wl);
  if (primaryWl != null) return primaryWl;

  const fallbackWl = [
    safeNum(dayData?.game?.wl),
    safeNum(dayData?.bullpen?.wl),
    safeNum(dayData?.live_bp?.wl),
    safeNum(dayData?.catch_play?.wl),
    safeNum(dayData?.warmup?.wl),
  ].filter((value) => value != null);

  return fallbackWl.length ? Math.max(...fallbackWl) : null;
}

function getDayBlockHeatClass(wl) {
  const value = safeNum(wl);
  if (value == null || value <= 0) return "day-block-neutral";
  if (value < 5) return "day-block-heat-1";
  if (value < 10) return "day-block-heat-2";
  if (value < 15) return "day-block-heat-3";
  if (value < 22) return "day-block-heat-4";
  return "day-block-heat-5";
}

function buildDayBlockTopText(primarySession) {
  if (!primarySession) return "—";

  const parts = [];
  const pitches = safeNum(primarySession.session?.pitches);
  const inningsText = fmtInningsCompact(getSessionDisplayInnings(primarySession.session));

  if (pitches != null && pitches > 0) parts.push(`${Math.round(pitches)} PIT`);
  if (inningsText != null) parts.push(`${inningsText} IP`);

  return parts.length ? parts.join(" | ") : primarySession.label;
}

function buildDayBlockBottomText(dayData, primarySession) {
  const upCount = safeNum(dayData?.up_count ?? dayData?.upCount);
  if (upCount != null && upCount > 0) return `Up ${Math.round(upCount)}x`;

  const warmupPitches = safeNum(dayData?.warmup?.pitches);
  if (warmupPitches != null && warmupPitches > 0) return `W ${Math.round(warmupPitches)}`;

  return primarySession?.label || "—";
}

function getRecentUsageHandClass(pitcherHand) {
  const hand = String(pitcherHand || "").trim().toUpperCase();
  if (hand === "L") return "recent-usage-name-left";
  if (hand === "S") return "recent-usage-name-switch";
  return "recent-usage-name-right";
}

function buildRecentUsageNameCellClass(entry) {
  const classes = ["recent-usage-name-cell"];
  if (!entry) {
    classes.push("recent-usage-name-empty");
    return classes.join(" ");
  }

  classes.push(getRecentUsageHandClass(entry.pitcher_hand));
  if (entry.is_starter_row) classes.push("recent-usage-name-starter");
  return classes.join(" ");
}

function buildRecentUsageContextCellClass(entry) {
  const classes = ["recent-usage-context-cell"];
  if (!entry) {
    classes.push("recent-usage-context-empty");
    return classes.join(" ");
  }
  if (entry.is_starter_row) {
    classes.push("recent-usage-context-starter");
    return classes.join(" ");
  }

  const leverageGroup = String(entry.leverage_group || "").trim().toLowerCase();
  if (leverageGroup === "high") classes.push("recent-usage-context-high");
  else if (leverageGroup === "medium") classes.push("recent-usage-context-medium");
  else if (leverageGroup === "low") classes.push("recent-usage-context-low");
  else classes.push("recent-usage-context-neutral");

  return classes.join(" ");
}

function buildRecentUsageTextLine(className, value) {
  return `<div class="${className}">${value ? escapeHtml(value) : "&nbsp;"}</div>`;
}

function buildRecentUsageNameCellHtml(entry) {
  const value = entry?.display_name || entry?.name_show || "";
  if (!value) return "&nbsp;";
  return escapeHtml(value);
}

function buildRecentUsageContextCellHtml(entry) {
  if (!entry || entry.is_starter_row) {
    return [
      buildRecentUsageTextLine("recent-usage-context-top", ""),
      buildRecentUsageTextLine("recent-usage-context-bottom", ""),
    ].join("");
  }

  const topValue = entry.score_state_text || entry.inning_score_show || entry.role_to_show || "";
  const bottomValue = entry.base_state_text || entry.out_runner_show || entry.pitches_and_innings || "";

  return [
    buildRecentUsageTextLine("recent-usage-context-top", topValue),
    buildRecentUsageTextLine("recent-usage-context-bottom", bottomValue),
  ].join("");
}

function buildRecentUsageColGroupHtml(gameCount) {
  const pairWidth = 100 / Math.max(gameCount, 1);
  const nameWidth = pairWidth * 0.53;
  const contextWidth = pairWidth - nameWidth;

  return `
    <colgroup>
      ${Array.from({ length: gameCount }).map(() => (
        `<col style="width:${nameWidth.toFixed(3)}%" /><col style="width:${contextWidth.toFixed(3)}%" />`
      )).join("")}
    </colgroup>
  `;
}

function getClassicLeverageLabel(pitcher) {
  const typicalUsage = pitcher?.pdf_typical_usage || {};
  const leverageBucket = getTypicalLeverageBucket(
    typicalUsage.avg_max_leverage ?? typicalUsage.leverage_label,
    typicalUsage.leverage_label || "—",
  );

  if (leverageBucket.value === "Med") return "Medium";
  return leverageBucket.value || "—";
}

function getClassicLengthLabel(pitcher) {
  const typicalUsage = pitcher?.pdf_typical_usage || {};
  const explicitLabel = String(
    typicalUsage.length_label
    || typicalUsage.length_category
    || typicalUsage.role_label
    || "",
  ).trim();

  if (explicitLabel) {
    if (/multi/i.test(explicitLabel)) return "Multi-Inning";
    if (/1/.test(explicitLabel)) return "1 Inning";
    return explicitLabel;
  }

  const innings = safeNum(typicalUsage.innings_label);
  if (innings == null) return "—";
  return innings >= 1.6 ? "Multi-Inning" : "1 Inning";
}

function getClassicPitcherNameClass(pitcher) {
  const throwSide = getPitcherThrowSide(pitcher);
  if (throwSide === "L") return "classic-pitcher-name classic-pitcher-name-left";
  if (throwSide === "S") return "classic-pitcher-name classic-pitcher-name-switch";
  return "classic-pitcher-name classic-pitcher-name-right";
}

function buildClassicPitcherCell(pitcher) {
  return `<span class="${getClassicPitcherNameClass(pitcher)}">${escapeHtml(pitcher.pitcher_name_last_first || "—")}</span>`;
}

function buildClassicLeverageCell(pitcher) {
  const label = getClassicLeverageLabel(pitcher);
  const className = label === "High"
    ? "classic-leverage-high"
    : label === "Medium"
      ? "classic-leverage-medium"
      : label === "Low"
        ? "classic-leverage-low"
        : "";
  return `<span class="classic-leverage-value ${className}">${escapeHtml(label)}</span>`;
}

function buildClassicLengthCell(pitcher) {
  return `<span class="classic-length-value">${escapeHtml(getClassicLengthLabel(pitcher))}</span>`;
}

function buildClassicDaysOffCell(pitcher) {
  const days = safeNum(pitcher?.days_of_rest);
  return `<span class="classic-days-off-value">${escapeHtml(days == null ? "—" : String(Math.round(days)))}</span>`;
}

function buildClassicWorkloadDayCell(dayData, activityFilter, { isFuture = false } = {}) {
  const emptyClass = isFuture ? "classic-day-board classic-day-board-future-empty" : "classic-day-board classic-day-board-empty";
  if (!dayData || typeof dayData !== "object") return `<div class="${emptyClass}">&nbsp;</div>`;

  const primarySession = getPrimaryDaySession(dayData, activityFilter);
  if (!primarySession) return `<div class="${emptyClass}">&nbsp;</div>`;

  const wl = resolveDayWorkload(dayData, primarySession);
  return `
    <div class="classic-day-board ${getDayBlockHeatClass(wl)}" data-wl="${wl == null ? "" : escapeHtml(String(wl))}">
      <span class="classic-day-board-top">${escapeHtml(buildDayBlockTopText(primarySession))}</span>
      <span class="classic-day-board-bottom">${escapeHtml(buildDayBlockBottomText(dayData, primarySession))}</span>
    </div>
  `;
}

function buildClassicDateHeaderCell(column, classes) {
  return `
    <th class="${classes}">
      <div class="classic-date-header">
        <span class="classic-date-header-date">${escapeHtml(column.displayDate || "")}</span>
        <span class="classic-date-header-day">${escapeHtml(column.dayOfWeek || "")}</span>
      </div>
    </th>
  `;
}

function buildClassicTableHeaderHtml({ dateColumns, selectedIndex, firstFutureIndex, futureCount }) {
  const dateHeaderCells = dateColumns.map((column, index) => (
    buildClassicDateHeaderCell(column, buildColumnClasses(index, selectedIndex, firstFutureIndex))
  )).join("");
  const groupCells = [
    '<th class="classic-group-spacer" colspan="1">&nbsp;</th>',
    '<th class="classic-group-recent" colspan="3">Recent</th>',
  ];
  const pastCount = Math.max(selectedIndex, 0);

  if (pastCount > 0) groupCells.push(`<th class="classic-group-past" colspan="${pastCount}">Prior Workload</th>`);
  if (selectedIndex >= 0 && selectedIndex < dateColumns.length) groupCells.push('<th class="classic-group-current" colspan="1">Today</th>');
  if (futureCount > 0) groupCells.push(`<th class="classic-group-future" colspan="${futureCount}">Planned</th>`);
  if (dateColumns.length > 0 && groupCells.length === 2) {
    groupCells.push(`<th class="classic-group-board" colspan="${dateColumns.length}">Workload Board</th>`);
  }

  return `
    <tr class="classic-group-row">
      ${groupCells.join("")}
    </tr>
    <tr class="classic-main-row">
      <th class="classic-fixed classic-fixed-pitcher" style="width:${CLASSIC_COLUMN_WIDTHS.pitcher}px">Pitcher</th>
      <th class="classic-fixed classic-fixed-leverage" style="width:${CLASSIC_COLUMN_WIDTHS.leverage}px">Leverage</th>
      <th class="classic-fixed classic-fixed-length" style="width:${CLASSIC_COLUMN_WIDTHS.length}px">Length</th>
      <th class="classic-fixed classic-fixed-days-off" style="width:${CLASSIC_COLUMN_WIDTHS.daysOff}px">Days Off</th>
      ${dateHeaderCells}
    </tr>
  `;
}

function buildClassicPitcherRowsHtml({ pitchers, dateColumns, selectedIndex, firstFutureIndex, activityFilter }) {
  return (pitchers || []).map((pitcher) => {
    const daily = Array.isArray(pitcher?.daily) ? pitcher.daily : [];
    const dateCells = dateColumns.map((column, index) => {
      const cellClasses = [buildColumnClasses(index, selectedIndex, firstFutureIndex), "classic-day-cell"].filter(Boolean).join(" ");
      return `<td class="${cellClasses}">${buildClassicWorkloadDayCell(daily[index] || null, activityFilter, { isFuture: index > selectedIndex })}</td>`;
    }).join("");

    return `
      <tr class="classic-board-row">
        <td class="classic-text-left classic-pitcher-cell">${buildClassicPitcherCell(pitcher)}</td>
        <td class="classic-meta-cell classic-meta-cell-leverage">${buildClassicLeverageCell(pitcher)}</td>
        <td class="classic-meta-cell classic-meta-cell-length">${buildClassicLengthCell(pitcher)}</td>
        <td class="classic-meta-cell classic-meta-cell-days-off">${buildClassicDaysOffCell(pitcher)}</td>
        ${dateCells}
      </tr>
    `;
  }).join("");
}

function buildClassicHeaderHtml({
  reportTitle,
  displayDate,
  generatedDate,
  roleLabel,
  activityFilter,
  rosterFilter,
  workloadViewLabel,
}) {
  const metaParts = [displayDate];
  if (roleLabel) metaParts.push(roleLabel);
  if (activityFilter && activityFilter !== "ALL") metaParts.push(activityFilter);
  if (rosterFilter && rosterFilter !== "ALL") metaParts.push(rosterFilter);
  if (workloadViewLabel) metaParts.push(workloadViewLabel);

  return `
    <header class="classic-header">
      <div class="classic-header-main">
        <div class="classic-header-kicker">Daily Workload Reporting</div>
        <div class="classic-header-title-row">
          <span class="classic-header-logo-shell">
            <img class="classic-header-logo" src="https://upload.wikimedia.org/wikipedia/en/7/7b/New_York_Mets.svg" alt="Mets" />
          </span>
          <div class="classic-header-title-block">
            <div class="classic-header-title">${escapeHtml(reportTitle)}</div>
            <div class="classic-header-meta">${escapeHtml(metaParts.join(" • "))}</div>
          </div>
        </div>
      </div>
      <div class="classic-header-side">
        <span class="classic-header-side-label">Generated</span>
        <span class="classic-header-generated">${escapeHtml(generatedDate)}</span>
      </div>
    </header>
  `;
}

function buildClassicMetaRowHtml(label, text) {
  return `
    <div class="classic-report-meta-row">
      <span class="classic-report-meta-label">${escapeHtml(label)}</span>
      <span class="classic-report-meta-text">${escapeHtml(text)}</span>
    </div>
  `;
}

function buildClassicLegendHtml() {
  return `
    <div class="classic-report-meta">
      ${buildClassicMetaRowHtml("Note", "Pitchers are ordered by handedness. Each activity cell shows the highest-priority session for that date, with same-day context shown on the second line.")}
      ${buildClassicMetaRowHtml("Legend", "P = Pitches, IP = Innings, Up = Up Count, W = Warm-up Pitches.")}
    </div>
  `;
}

function buildClassicRecentUsageSectionHtml(recentRpUsage) {
  const normalizedRecentUsage = normalizeRecentRpUsage(recentRpUsage);
  if (!normalizedRecentUsage) return "";
  const recentUsageDensity = normalizedRecentUsage.rowCount <= 3 ? "sparse" : "regular";
  const totalColumns = Math.max(normalizedRecentUsage.games.length * 2, 1);

  const headerCells = normalizedRecentUsage.games.map((game) => (
    `<th colspan="2">${escapeHtml(game.gameKey || "—")}</th>`
  )).join("");

  const rowsHtml = Array.from({ length: normalizedRecentUsage.rowCount }).map((_, index) => {
    const rowNumber = index + 1;
    const rowClass = rowNumber === 1 ? "classic-recent-row classic-recent-row-starter" : "classic-recent-row";
    const cells = normalizedRecentUsage.games.map((game) => {
      const entry = game.entryByRow.get(rowNumber) || null;
      return `
        <td class="${buildRecentUsageNameCellClass(entry)}">${buildRecentUsageNameCellHtml(entry)}</td>
        <td class="${buildRecentUsageContextCellClass(entry)}">${buildRecentUsageContextCellHtml(entry)}</td>
      `;
    }).join("");

    return `<tr class="${rowClass}" data-row-number="${rowNumber}">${cells}</tr>`;
  }).join("");

  return `
    <section class="classic-recent-section" data-density="${recentUsageDensity}">
      <table class="classic-recent-table">
        ${buildRecentUsageColGroupHtml(normalizedRecentUsage.games.length)}
        <thead>
          <tr class="classic-recent-superhead">
            <th colspan="${totalColumns}">${escapeHtml(RECENT_USAGE_TITLE)}</th>
          </tr>
          <tr class="classic-recent-gamehead">${headerCells}</tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </section>
  `;
}

function normalizeClassicComments(comments) {
  if (Array.isArray(comments)) {
    return comments
      .map((comment) => String(comment ?? "").trim())
      .filter(Boolean);
  }

  const text = String(comments ?? "").trim();
  if (!text) return [];
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildClassicCommentsSectionHtml(comments) {
  const lines = normalizeClassicComments(comments);
  const bodyHtml = lines.length
    ? lines.map((line) => `<div class="classic-comments-line classic-comments-text">${escapeHtml(line)}</div>`).join("")
    : Array.from({ length: CLASSIC_COMMENTS_PLACEHOLDER_LINES }).map(() => (
        '<div class="classic-comments-line">&nbsp;</div>'
      )).join("");

  return `
    <section class="classic-comments-section">
      <table class="classic-comments-table">
        <thead>
          <tr>
            <th>Comments</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <div class="classic-comments-body">
                ${bodyHtml}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  `;
}

function classicBullpenMonitoringCss() {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

    @page { size: letter landscape; margin: 8mm 10mm; }

    html, body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    * {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }

    .classic-report-page {
      width: 100%;
      padding: 8px 0;
      break-inside: avoid;
      page-break-inside: avoid;
      background: ${CLASSIC_COLORS.bgWhite};
    }
    .report-page-break {
      break-after: page;
      page-break-after: always;
    }
    .classic-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      padding-bottom: 12px;
      margin-bottom: 16px;
      border-bottom: 1px solid ${CLASSIC_COLORS.border};
    }
    .classic-header-main {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      flex: 1;
    }
    .classic-header-kicker {
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: ${CLASSIC_COLORS.text.muted};
    }
    .classic-header-title-row {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .classic-header-logo-shell {
      width: 32px;
      height: 32px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      background: ${CLASSIC_COLORS.bgGray};
      flex-shrink: 0;
    }
    .classic-header-title-block {
      min-width: 0;
    }
    .classic-header-title {
      font-size: 20px;
      line-height: 1.2;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: ${CLASSIC_COLORS.text.primary};
    }
    .classic-header-meta {
      margin-top: 2px;
      font-size: 13px;
      font-weight: 400;
      color: ${CLASSIC_COLORS.text.secondary};
      line-height: 1.3;
      white-space: normal;
    }
    .classic-header-side {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 2px;
    }
    .classic-header-logo {
      width: 20px;
      height: 20px;
      object-fit: contain;
      opacity: 0.8;
    }
    .classic-header-side-label {
      font-size: 9px;
      font-weight: 500;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: ${CLASSIC_COLORS.text.muted};
      line-height: 1;
    }
    .classic-header-generated {
      font-size: 11px;
      font-weight: 500;
      color: ${CLASSIC_COLORS.text.secondary};
      line-height: 1.2;
      text-align: right;
    }

    .classic-board-table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      border: none;
      background: ${CLASSIC_COLORS.bgWhite};
      font-variant-numeric: tabular-nums;
      break-inside: avoid;
      page-break-inside: avoid;
      border-radius: 8px;
      overflow: hidden;
    }
    .classic-board-table th,
    .classic-board-table td {
      border-right: 1px solid ${CLASSIC_COLORS.borderLight};
      border-bottom: 1px solid ${CLASSIC_COLORS.borderLight};
      padding: 8px 6px;
      font-size: 11px;
      line-height: 1.3;
      text-align: center;
      vertical-align: middle;
      white-space: nowrap;
    }
    .classic-board-table th:last-child,
    .classic-board-table td:last-child {
      border-right: 0;
    }
    .classic-board-table tbody tr:last-child td {
      border-bottom: 0;
    }
    .classic-group-row th {
      border: 0 !important;
      padding: 4px 6px 8px;
      background: transparent !important;
      color: ${CLASSIC_COLORS.text.secondary};
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      text-align: center;
    }
    .classic-group-spacer {
      padding: 0 !important;
    }
    .classic-group-current {
      color: #0f172a;
    }
    .classic-main-row th {
      background: ${CLASSIC_COLORS.bgGray};
      color: ${CLASSIC_COLORS.text.primary};
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      padding: 10px 8px;
      border-bottom: 2px solid ${CLASSIC_COLORS.border};
      border-top: 1px solid ${CLASSIC_COLORS.border};
    }
    .classic-main-row th.col-first-date,
    .classic-board-table td.col-first-date {
      border-left: 2px solid ${CLASSIC_COLORS.border};
    }
    .classic-main-row th.col-boundary,
    .classic-board-table td.col-boundary {
      border-left: 2px solid ${CLASSIC_COLORS.border};
    }
    .classic-main-row th.col-current {
      background: ${CLASSIC_COLORS.accentLight};
      color: ${CLASSIC_COLORS.accent};
      font-weight: 700;
    }
    .classic-fixed {
      text-align: center;
    }
    .classic-fixed-pitcher {
      text-align: left !important;
    }
    .classic-fixed-days-off,
    .classic-meta-cell-days-off {
      border-right: 2px solid ${CLASSIC_COLORS.border} !important;
    }
    .classic-text-left {
      text-align: left !important;
    }
    .classic-pitcher-cell,
    .classic-meta-cell {
      background: ${CLASSIC_COLORS.bgWhite};
    }
    .classic-pitcher-cell {
      padding-left: 10px !important;
      text-align: left !important;
    }
    .classic-meta-cell {
      font-size: 11px;
      color: ${CLASSIC_COLORS.text.primary};
    }
    .classic-pitcher-name {
      display: inline-block;
      max-width: 100%;
      font-size: 12px;
      font-weight: 600;
      line-height: 1.2;
    }
    .classic-pitcher-name-left {
      color: ${CLASSIC_COLORS.text.primary};
    }
    .classic-pitcher-name-left::before {
      content: "L";
      display: inline-block;
      width: 16px;
      height: 16px;
      line-height: 16px;
      text-align: center;
      font-size: 9px;
      font-weight: 700;
      background: ${CLASSIC_COLORS.bgGray};
      color: ${CLASSIC_COLORS.text.secondary};
      border-radius: 3px;
      margin-right: 6px;
    }
    .classic-pitcher-name-right {
      color: ${CLASSIC_COLORS.text.primary};
    }
    .classic-pitcher-name-switch {
      color: ${CLASSIC_COLORS.text.primary};
    }
    .classic-pitcher-name-switch::before {
      content: "S";
      display: inline-block;
      width: 16px;
      height: 16px;
      line-height: 16px;
      text-align: center;
      font-size: 9px;
      font-weight: 700;
      background: ${CLASSIC_COLORS.accentLight};
      color: ${CLASSIC_COLORS.accent};
      border-radius: 3px;
      margin-right: 6px;
    }
    .classic-leverage-value,
    .classic-length-value,
    .classic-days-off-value {
      display: inline-block;
      width: auto;
    }
    .classic-leverage-value {
      padding: 3px 8px;
      font-size: 10px;
      font-weight: 500;
      line-height: 1.2;
      border-radius: 4px;
    }
    .classic-leverage-high {
      background: ${CLASSIC_COLORS.leverageHigh};
      color: ${CLASSIC_COLORS.leverageHighText};
      font-weight: 600;
    }
    .classic-leverage-medium {
      background: ${CLASSIC_COLORS.leverageMedium};
      color: ${CLASSIC_COLORS.leverageMediumText};
    }
    .classic-leverage-low {
      background: ${CLASSIC_COLORS.leverageLow};
      color: ${CLASSIC_COLORS.leverageLowText};
    }
    .classic-length-value,
    .classic-days-off-value {
      color: ${CLASSIC_COLORS.text.primary};
      font-weight: 500;
      font-size: 11px;
      line-height: 1.2;
    }

    .classic-date-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      line-height: 1.2;
    }
    .classic-date-header-date {
      font-size: 12px;
      font-weight: 700;
      line-height: 1;
      color: ${CLASSIC_COLORS.text.primary};
    }
    .classic-date-header-day {
      font-size: 9px;
      font-weight: 400;
      letter-spacing: 0.03em;
      color: ${CLASSIC_COLORS.text.secondary};
      text-transform: uppercase;
    }

    .classic-day-cell {
      padding: 4px !important;
      background: ${CLASSIC_COLORS.bgWhite};
    }
    .classic-day-board {
      min-height: 36px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      width: 100%;
      padding: 6px 4px;
      background: ${CLASSIC_COLORS.bgWhite};
      border-radius: 4px;
      transition: all 0.15s ease;
    }
    .classic-day-board-top {
      display: block;
      max-width: 100%;
      font-size: 11px;
      font-weight: 600;
      line-height: 1.2;
      color: ${CLASSIC_COLORS.text.primary};
      white-space: nowrap;
    }
    .classic-day-board-bottom {
      display: block;
      max-width: 100%;
      font-size: 9px;
      font-weight: 400;
      line-height: 1.2;
      color: ${CLASSIC_COLORS.text.secondary};
      text-transform: none;
      white-space: nowrap;
    }
    .classic-day-board-empty {
      background: ${CLASSIC_COLORS.bgGray};
      border: 1px solid ${CLASSIC_COLORS.borderLight};
    }
    .classic-day-board-future-empty {
      background: ${CLASSIC_COLORS.bgWhite};
      border: 1px dashed ${CLASSIC_COLORS.borderLight};
    }
    .classic-board-table td.col-future {
      background: ${CLASSIC_COLORS.bgGray};
      opacity: 0.7;
    }
    .classic-board-table td.col-current {
      background: ${CLASSIC_COLORS.accentLight};
      border-left: 3px solid ${CLASSIC_COLORS.accent};
      border-right: 1px solid ${CLASSIC_COLORS.accent};
    }
    .classic-board-table .day-block-neutral {
      background: ${CLASSIC_COLORS.bgWhite};
      border: 1px solid ${CLASSIC_COLORS.borderLight};
    }
    .classic-board-table .day-block-heat-1 {
      background: ${CLASSIC_COLORS.dayHeat1};
      border: 1px solid #bbf7d0;
    }
    .classic-board-table .day-block-heat-2 {
      background: ${CLASSIC_COLORS.dayHeat2};
      border: 1px solid #86efac;
    }
    .classic-board-table .day-block-heat-3 {
      background: ${CLASSIC_COLORS.dayHeat3};
      border: 1px solid #fde047;
    }
    .classic-board-table .day-block-heat-4 {
      background: ${CLASSIC_COLORS.dayHeat4};
      border: 1px solid #fb923c;
      font-weight: 600;
    }
    .classic-board-table .day-block-heat-5 {
      background: ${CLASSIC_COLORS.dayHeat5};
      border: 1px solid #f87171;
    }
    .classic-board-table .day-block-heat-4 .classic-day-board-top,
    .classic-board-table .day-block-heat-5 .classic-day-board-top {
      font-weight: 700;
    }

    .classic-footnotes {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid ${CLASSIC_COLORS.border};
    }
    .classic-report-meta {
      display: grid;
      gap: 6px;
    }
    .classic-report-meta-row {
      display: grid;
      grid-template-columns: 60px 1fr;
      column-gap: 12px;
      align-items: baseline;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .classic-report-meta-label {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      color: ${CLASSIC_COLORS.text.muted};
    }
    .classic-report-meta-text {
      font-size: 11px;
      line-height: 1.4;
      color: ${CLASSIC_COLORS.text.secondary};
      orphans: 2;
      widows: 2;
    }

    .classic-recent-section,
    .classic-comments-section {
      margin-top: 16px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .classic-recent-table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      border: 1px solid ${CLASSIC_COLORS.border};
      background: ${CLASSIC_COLORS.bgWhite};
      font-variant-numeric: tabular-nums;
      border-radius: 6px;
      overflow: hidden;
    }
    .classic-recent-table th,
    .classic-recent-table td {
      border-right: 1px solid ${CLASSIC_COLORS.borderLight};
      border-bottom: 1px solid ${CLASSIC_COLORS.borderLight};
      padding: 6px 8px;
      font-size: 10px;
      line-height: 1.3;
      vertical-align: middle;
    }
    .classic-recent-table th:last-child,
    .classic-recent-table td:last-child {
      border-right: 0;
    }
    .classic-recent-superhead th {
      padding: 8px 12px;
      background: ${CLASSIC_COLORS.bgGray};
      color: ${CLASSIC_COLORS.text.primary};
      border-bottom: 1px solid ${CLASSIC_COLORS.border};
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      text-align: left;
    }
    .classic-recent-gamehead th {
      padding: 6px 8px;
      background: ${CLASSIC_COLORS.bgWhite};
      color: ${CLASSIC_COLORS.text.secondary};
      border-bottom: 2px solid ${CLASSIC_COLORS.border};
      font-size: 10px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      text-align: center;
    }
    .classic-recent-row td {
      background: ${CLASSIC_COLORS.bgWhite};
    }
    .classic-recent-row:nth-child(even) td {
      background: ${CLASSIC_COLORS.bgGray};
    }
    .classic-recent-row-starter td {
      background: ${CLASSIC_COLORS.bgGray};
      border-bottom: 2px solid ${CLASSIC_COLORS.border};
      font-style: italic;
    }
    .classic-recent-section[data-density="sparse"] .classic-recent-table td {
      padding-top: 1px;
      padding-bottom: 1px;
    }
    .classic-recent-table .recent-usage-name-cell {
      font-size: 10px;
      font-weight: 600;
      text-align: left;
      white-space: nowrap;
    }
    .classic-recent-table .recent-usage-name-left { color: ${CLASSIC_COLORS.text.primary}; }
    .classic-recent-table .recent-usage-name-right { color: ${CLASSIC_COLORS.text.primary}; }
    .classic-recent-table .recent-usage-name-switch { color: ${CLASSIC_COLORS.text.primary}; }
    .classic-recent-table .recent-usage-name-starter {
      font-style: italic;
      color: ${CLASSIC_COLORS.text.secondary};
    }
    .classic-recent-table .recent-usage-name-empty {
      color: transparent;
    }
    .classic-recent-table .recent-usage-context-cell {
      background: #ffffff;
    }
    .classic-recent-table .recent-usage-context-top {
      min-height: 10px;
      font-size: 9px;
      font-weight: 500;
      line-height: 1.2;
      color: ${CLASSIC_COLORS.text.primary};
      white-space: nowrap;
    }
    .classic-recent-table .recent-usage-context-bottom {
      min-height: 8px;
      margin-top: 2px;
      font-size: 8px;
      line-height: 1.2;
      color: ${CLASSIC_COLORS.text.secondary};
      white-space: nowrap;
    }
    .classic-recent-section[data-density="sparse"] .recent-usage-context-top {
      min-height: 6px;
    }
    .classic-recent-section[data-density="sparse"] .recent-usage-context-bottom {
      min-height: 5px;
    }
    .classic-recent-table .recent-usage-context-high {
      background: ${CLASSIC_COLORS.leverageHigh} !important;
      color: ${CLASSIC_COLORS.leverageHighText};
      font-weight: 500;
    }
    .classic-recent-table .recent-usage-context-medium {
      background: ${CLASSIC_COLORS.leverageMedium} !important;
      color: ${CLASSIC_COLORS.leverageMediumText};
    }
    .classic-recent-table .recent-usage-context-low {
      background: ${CLASSIC_COLORS.leverageLow} !important;
      color: ${CLASSIC_COLORS.leverageLowText};
    }
    .classic-recent-table .recent-usage-context-neutral {
      background: ${CLASSIC_COLORS.bgGray} !important;
    }
    .classic-recent-table .recent-usage-context-starter,
    .classic-recent-table .recent-usage-context-empty {
      background: ${CLASSIC_COLORS.bgGray} !important;
    }

    .classic-comments-table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      border: 1px solid ${CLASSIC_COLORS.border};
      background: ${CLASSIC_COLORS.bgWhite};
      border-radius: 6px;
      overflow: hidden;
    }
    .classic-comments-table th,
    .classic-comments-table td {
      border-bottom: 1px solid ${CLASSIC_COLORS.border};
      vertical-align: top;
    }
    .classic-comments-table thead th {
      padding: 8px 12px;
      background: ${CLASSIC_COLORS.bgGray};
      color: ${CLASSIC_COLORS.text.primary};
      border-bottom: 2px solid ${CLASSIC_COLORS.border};
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      text-align: left;
    }
    .classic-comments-table tbody td {
      padding: 0;
      border-bottom: 0;
    }

    .classic-comments-body {
      background: ${CLASSIC_COLORS.bgWhite};
      padding: 12px;
      min-height: 60px;
    }
    .classic-comments-line {
      min-height: 20px;
      padding: 8px 0;
      border-bottom: 1px solid ${CLASSIC_COLORS.borderLight};
      font-size: 11px;
      line-height: 1.5;
      color: ${CLASSIC_COLORS.text.secondary};
    }
    .classic-comments-line:last-child {
      border-bottom: 0;
    }
    .classic-comments-text {
      line-height: 1.3;
      padding-top: 4px;
      padding-bottom: 4px;
      min-height: 18px;
    }
  `;
}

function buildClassicReportPageHtml({
  reportTitle,
  displayDate,
  generatedDate,
  roleLabel,
  activityFilter,
  rosterFilter,
  workloadViewLabel,
  dateColumns,
  selectedIndex,
  firstFutureIndex,
  futureCount,
  pitchers,
  pageIndex,
  totalPages,
  recentRpUsage,
  comments,
}) {
  const headerHtml = buildClassicHeaderHtml({
    reportTitle,
    displayDate,
    generatedDate,
    roleLabel,
    activityFilter,
    rosterFilter,
    workloadViewLabel,
  });
  const headerTableHtml = buildClassicTableHeaderHtml({
    dateColumns,
    selectedIndex,
    firstFutureIndex,
    futureCount,
  });
  const rowsHtml = buildClassicPitcherRowsHtml({
    pitchers,
    dateColumns,
    selectedIndex,
    firstFutureIndex,
    activityFilter,
  });
  const recentUsageHtml = buildClassicRecentUsageSectionHtml(recentRpUsage);
  const commentsHtml = pageIndex === totalPages - 1 ? buildClassicCommentsSectionHtml(comments) : "";
  const footnotesHtml = buildClassicLegendHtml();

  return `
    <!-- pitcher-monitoring-template:${escapeHtml(PITCHER_MONITORING_BULLPEN_CLASSIC_TEMPLATE_VERSION)} -->
    <section class="page classic-report-page ${pageIndex < totalPages - 1 ? "report-page-break" : ""}" data-role="${escapeHtml(roleLabel || "")}">
      ${headerHtml}
      <table class="classic-board-table">
        <thead>
          ${headerTableHtml}
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
      <div class="classic-footnotes">
        ${footnotesHtml}
      </div>
      ${recentUsageHtml}
      ${commentsHtml}
    </section>
  `;
}

export function buildPitcherMonitoringBullpenClassicReportHtml(data) {
  const {
    gameDate,
    generatedAt,
    positionFilter = "TEAM",
    activityFilter = "ALL",
    rosterFilter = "ALL",
    workloadViewLabel = "",
    dateColumns = [],
    pitchers = [],
    recentRpUsage = null,
    comments = null,
  } = data;

  const displayDate = gameDate
    ? new Date(`${gameDate}T12:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
  const generatedDate = formatEasternTimestamp(generatedAt || Date.now());
  const { title: reportTitle } = getPitcherMonitoringExportMeta(positionFilter);
  const selectedIndexRaw = dateColumns.findIndex((column) => column.date === gameDate);
  const selectedIndex = selectedIndexRaw >= 0
    ? selectedIndexRaw
    : (dateColumns.length > 0 ? dateColumns.length - 1 : -1);
  const firstFutureIndex = selectedIndex >= 0 && selectedIndex < dateColumns.length - 1
    ? selectedIndex + 1
    : -1;
  const futureCount = selectedIndex >= 0 ? Math.max(dateColumns.length - selectedIndex - 1, 0) : 0;

  const pages = [];
  if (positionFilter === "TEAM") {
    const spPitchers = pitchers.filter((pitcher) => String(pitcher.position || "").toUpperCase() === "SP");
    const rpPitchers = pitchers.filter((pitcher) => String(pitcher.position || "").toUpperCase() !== "SP");
    if (rpPitchers.length) pages.push({ roleLabel: "RP", pitchers: rpPitchers, recentRpUsage });
    if (spPitchers.length) pages.push({ roleLabel: "SP", pitchers: spPitchers, recentRpUsage: null });
  } else {
    pages.push({
      roleLabel: "",
      pitchers,
      recentRpUsage: positionFilter === "RP" ? recentRpUsage : null,
    });
  }

  const reportPagesHtml = pages.map((page, pageIndex) => buildClassicReportPageHtml({
    reportTitle,
    displayDate,
    generatedDate,
    roleLabel: page.roleLabel,
    activityFilter,
    rosterFilter,
    workloadViewLabel,
    dateColumns,
    selectedIndex,
    firstFutureIndex,
    futureCount,
    pitchers: page.pitchers,
    pageIndex,
    totalPages: pages.length,
    recentRpUsage: page.recentRpUsage,
    comments,
  })).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <style>
    ${sharedCss()}
    ${classicBullpenMonitoringCss()}
  </style>
</head>
<body>
${reportPagesHtml}
</body>
</html>`;
}
