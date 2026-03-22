/**
 * Premium RP one-page pitcher monitoring PDF template.
 */

import { sharedCss } from "./shared-styles.js";
import { getPitcherMonitoringExportMeta } from "../pitcher-monitoring-export.js";
import { formatEasternTimestamp } from "./time-format.js";

const RECENT_USAGE_MAX_GAMES = 7;
const RECENT_USAGE_TITLE = "Last 7 Games - Reliever Entrances by Leverage";
export const PITCHER_MONITORING_RP_PREMIUM_TEMPLATE_VERSION = "2026-03-21-rp-premium-v12";
const RP_PREMIUM_SPARKLINE_WIDTH = 96;
const RP_PREMIUM_SPARKLINE_HEIGHT = 30;
const RP_PREMIUM_FLAG_PRIORITY = [
  ["high_workload_current", "HWL"],
  ["high_workload_recent", "HWL"],
  ["high_stress", "HS"],
  ["release_abnormal_current", "VELO"],
  ["release_abnormal_recent", "VELO"],
  ["max_leverage_abnormal", "LEV"],
  ["is_back_to_back", "B2B"],
  ["pitched_3_of_last_5", "3/5"],
  ["is_pitch_off_pitch_off_pitch", "POP"],
];

const RP_PREMIUM_COLORS = {
  metsBlue: "#1F3A5F",
  metsBlueAlt: "#274B75",
  todayBorder: "#2F5F94",
  metsOrange: "#E06A2C",
  metsOrangeDark: "#C65A1E",
  text: "#1A1A1A",
  textMuted: "#4A4A4A",
  textLight: "#7A7A7A",
  border: "#D9D9D9",
  borderStrong: "#B7C2D0",
  borderSoft: "#E7EBF0",
  gridBg: "#ffffff",
  rowAlt: "#F9FAFB",
  subtleBg: "#F8FAFC",
  empty: "#F5F6F7",
  todayTint: "#EEF6FF",
  palaceBlue: "#E8F0F8",
  heat1: "#FDF2EA",
  heat2: "#F9E5D8",
  heat3: "#F3D2BF",
  heat4: "#EABDA4",
  heat5: "#E2A184",
  starterFill: "#E8F0F8",
  leverageHigh: "#F0C39D",
  leverageMedium: "#F6E3CF",
  leverageLow: "#F7F2EC",
  leverageStarter: "#EEF6EE",
  statusFill: "#ffffff",
  statusAccent: "#F8FAFC",
  flagText: "#405065",
  flagHigh: "#FDECEA",
  flagHighText: "#B42318",
  flagMedium: "#FFF4E5",
  flagMediumText: "#B54708",
  flagLow: "#EEF4FF",
  flagLowText: "#1D4ED8",
  flagNeutral: "#F3F4F6",
  flagNeutralText: "#4B5563",
  flagOverflow: "#F3F4F6",
  sparklineAcute: "#1F3A5F",
  sparklineChronic: "#9CA3AF",
  sparklineEndpoint: "#E06A2C",
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

function formatReportDate(value) {
  if (!value) return "";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
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

function getMonitoringTrendLineDomain(series, keys = ["acute", "chronic"]) {
  const values = (Array.isArray(series) ? series : [])
    .flatMap((point) => keys.map((key) => safeNum(point?.[key])))
    .filter((value) => value != null);

  if (!values.length) {
    return { min: 0, max: 1 };
  }

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const center = (rawMin + rawMax) / 2;
  const rawSpread = rawMax - rawMin;
  const minimumSpread = Math.max(1.4, Math.abs(center) * 0.18);
  const guardedSpread = Math.max(rawSpread, minimumSpread);
  const padding = Math.min(2.5, Math.max(0.35, guardedSpread * 0.14));
  const halfRange = guardedSpread / 2;

  return {
    min: Math.max(0, center - halfRange - padding),
    max: center + halfRange + padding,
  };
}

function getMonitoringTrendEndpointStatus(acRatio) {
  const numeric = safeNum(acRatio);
  if (numeric == null) return { color: "#94A3B8" };
  if (numeric > 1.5) return { color: "#BE123C" };
  if (numeric > 1.3) return { color: "#C2410C" };
  if (numeric < 0.8) return { color: "#0F766E" };
  return { color: "#64748B" };
}

function getLastFiniteValue(values) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = safeNum(values[index]);
    if (value != null) return value;
  }
  return null;
}

function normalizeSparklinePayload(data) {
  if (Array.isArray(data)) {
    const points = data.map((item, index) => ({
      date: String(index),
      pitches: 0,
      acute: safeNum(item?.ewma_7d),
      chronic: safeNum(item?.ewma_28d),
    }));
    const latestAcute = getLastFiniteValue(points.map((point) => point.acute));
    const latestChronic = getLastFiniteValue(points.map((point) => point.chronic));
    const acRatio = latestAcute != null && latestChronic != null && latestChronic > 0
      ? latestAcute / latestChronic
      : null;
    return { points, acRatio };
  }

  if (!data || typeof data !== "object") return null;

  const dates = Array.isArray(data.dates) ? data.dates : [];
  const activityValues = Array.isArray(data.activityValues)
    ? data.activityValues
    : (Array.isArray(data.pitches) ? data.pitches : []);
  const acuteWorkload = Array.isArray(data.acuteWorkload) ? data.acuteWorkload : [];
  const chronicWorkload = Array.isArray(data.chronicWorkload) ? data.chronicWorkload : [];
  const pointCount = Math.max(dates.length, activityValues.length, acuteWorkload.length, chronicWorkload.length);

  if (!pointCount) return null;

  const points = Array.from({ length: pointCount }).map((_, index) => ({
    date: dates[index] || String(index),
    pitches: safeNum(activityValues[index]) ?? 0,
    acute: safeNum(acuteWorkload[index]),
    chronic: safeNum(chronicWorkload[index]),
  }));

  const latestAcute = getLastFiniteValue(points.map((point) => point.acute));
  const latestChronic = getLastFiniteValue(points.map((point) => point.chronic));
  const acRatio = safeNum(data.acRatio)
    ?? (latestAcute != null && latestChronic != null && latestChronic > 0
      ? latestAcute / latestChronic
      : null);

  return { points, acRatio };
}

function buildSparklinePath(points, yKey) {
  let path = "";
  points.forEach((point) => {
    const y = point?.[yKey];
    if (!Number.isFinite(y)) return;
    path += `${path ? " L" : "M"} ${point.x.toFixed(2)} ${y.toFixed(2)}`;
  });
  return path.trim();
}

function buildSparklineAreaPath(points, yKey, baselineY) {
  const areaPoints = points.filter((point) => Number.isFinite(point?.[yKey]));
  if (!areaPoints.length) return "";

  let path = "";
  areaPoints.forEach((point) => {
    path += `${path ? " L" : "M"} ${point.x.toFixed(2)} ${point[yKey].toFixed(2)}`;
  });

  const lastPoint = areaPoints.at(-1);
  const firstPoint = areaPoints[0];
  return `${path} L ${lastPoint.x.toFixed(2)} ${baselineY.toFixed(2)} L ${firstPoint.x.toFixed(2)} ${baselineY.toFixed(2)} Z`;
}

function buildSparklineSvg(data, width = RP_PREMIUM_SPARKLINE_WIDTH, height = RP_PREMIUM_SPARKLINE_HEIGHT) {
  const normalized = normalizeSparklinePayload(data);
  const points = normalized?.points || [];
  if (!points.length) return '<span class="rp-premium-empty-mark">—</span>';

  const hasWorkloads = points.some((point) => Number.isFinite(point.acute) || Number.isFinite(point.chronic));
  if (!hasWorkloads) return '<span class="rp-premium-empty-mark">—</span>';

  const padX = 6;
  const padTop = 4;
  const padBottom = 5;
  const innerWidth = Math.max(1, width - padX * 2);
  const chartHeight = Math.max(10, height - padTop - padBottom);
  const trendHeight = chartHeight;
  const trendBaselineY = padTop + trendHeight;
  const slotWidth = innerWidth / Math.max(points.length, 1);
  const { min: trendMin, max: trendMax } = getMonitoringTrendLineDomain(points);
  const trendRange = Math.max(0.5, trendMax - trendMin);
  const scaleTrendY = (value) => (
    trendBaselineY - ((Math.max(trendMin, value || 0) - trendMin) / trendRange) * trendHeight
  );

  const chartPoints = points.map((point, index) => ({
    ...point,
    x: padX + slotWidth * index + slotWidth / 2,
    acuteY: Number.isFinite(point.acute) ? scaleTrendY(point.acute) : null,
    chronicY: Number.isFinite(point.chronic) ? scaleTrendY(point.chronic) : null,
  }));

  const chronicPath = buildSparklinePath(chartPoints, "chronicY");
  const acutePath = buildSparklinePath(chartPoints, "acuteY");
  const latestPoint = chartPoints.at(-1) || null;
  const latestAcute = latestPoint && Number.isFinite(latestPoint.acute)
    ? { x: latestPoint.x, y: latestPoint.acuteY }
    : null;

  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`;

  if (chronicPath) {
    svg += `<path class="rp-premium-sparkline-line rp-premium-sparkline-line-chronic" d="${chronicPath}" fill="none" stroke="${RP_PREMIUM_COLORS.sparklineChronic}" stroke-width="1.15" stroke-opacity="0.82" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  if (acutePath) {
    svg += `<path class="rp-premium-sparkline-line rp-premium-sparkline-line-acute" d="${acutePath}" fill="none" stroke="${RP_PREMIUM_COLORS.sparklineAcute}" stroke-width="2.05" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  if (latestAcute) {
    svg += `<circle class="rp-premium-sparkline-endpoint" cx="${latestAcute.x.toFixed(2)}" cy="${latestAcute.y.toFixed(2)}" r="1.95" fill="${RP_PREMIUM_COLORS.sparklineEndpoint}"/>`;
  }

  svg += "</svg>";
  return svg;
}

function getPremiumFlagLabels(flags) {
  const labels = [];

  RP_PREMIUM_FLAG_PRIORITY.forEach(([key, label]) => {
    if (!flags?.[key] || labels.includes(label)) return;
    labels.push(label);
  });

  return labels;
}

function getPremiumFlagToneClass(label) {
  if (label === "B2B" || label === "HS" || label === "3/5") return "is-high";
  if (label === "HWL") return "is-high";
  if (label === "VELO" || label === "LEV" || label === "POP") return "is-low";
  if (label === "+") return "is-overflow";
  return "is-neutral";
}

function getPalaceLeverageTone(leverageValue, leverageGroup) {
  if (leverageValue != null) {
    if (leverageValue < 0.85) return "low";
    if (leverageValue < 2.0) return "medium";
    return "high";
  }

  const normalizedGroup = String(leverageGroup || "").trim().toLowerCase();
  if (normalizedGroup === "starter") return "starter";
  if (normalizedGroup === "high") return "high";
  if (normalizedGroup === "medium") return "medium";
  if (normalizedGroup === "low") return "low";
  if (normalizedGroup === "long guy" || normalizedGroup === "swing man" || normalizedGroup === "long guy / swing man") {
    return "low";
  }
  return "neutral";
}

function getRecentUsageHandClass(pitcherHand) {
  const hand = String(pitcherHand || "").trim().toUpperCase();
  if (hand === "L") return "recent-name-left";
  if (hand === "S") return "recent-name-switch";
  return "recent-name-right";
}

function buildRecentUsageNameCellClass(entry) {
  const classes = ["recent-name-cell"];
  if (!entry) return `${classes.join(" ")} recent-name-empty`;
  classes.push(getRecentUsageHandClass(entry.pitcher_hand));
  if (entry.is_starter_row) classes.push("recent-name-starter");
  return classes.join(" ");
}

function buildRecentUsageContextCellClass(entry) {
  const classes = ["recent-context-cell"];
  if (!entry) return `${classes.join(" ")} recent-context-empty`;
  if (entry.is_starter_row) return `${classes.join(" ")} recent-context-starter`;

  const leverageValue = safeNum(entry?.leverage_value);
  const leverageTone = getPalaceLeverageTone(leverageValue, entry?.leverage_group);

  if (leverageTone === "high") classes.push("recent-context-high");
  else if (leverageTone === "medium") classes.push("recent-context-medium");
  else if (leverageTone === "low") classes.push("recent-context-low");
  else if (leverageTone === "starter") classes.push("recent-context-starter");
  else classes.push("recent-context-neutral");
  return classes.join(" ");
}

function getRecentUsageDensityClass(rowCount) {
  if (rowCount >= 9) return "density-ultra";
  if (rowCount >= 6) return "density-compact";
  return "density-normal";
}

function buildRecentUsageTextLine(className, value) {
  return `<div class="${className}">${value ? escapeHtml(value) : "&nbsp;"}</div>`;
}

function buildRecentUsageNameCellHtml(entry) {
  const value = entry?.display_name || entry?.name_show || "";
  return value ? escapeHtml(value) : "&nbsp;";
}

function buildRecentUsageContextCellHtml(entry) {
  if (!entry || entry.is_starter_row) {
    return [
      buildRecentUsageTextLine("recent-context-top", ""),
      buildRecentUsageTextLine("recent-context-bottom", ""),
    ].join("");
  }

  const topValue = entry.score_state_text || entry.inning_score_show || entry.role_to_show || entry.pitches_and_innings || "";
  const bottomValue = entry.base_state_text || entry.out_runner_show || entry.pitches_and_innings || "";
  return [
    buildRecentUsageTextLine("recent-context-top", topValue),
    buildRecentUsageTextLine("recent-context-bottom", bottomValue),
  ].join("");
}

function buildRecentUsageColGroupHtml(gameCount) {
  const pairWidth = 100 / Math.max(gameCount, 1);
  const nameWidth = pairWidth * 0.56;
  const contextWidth = pairWidth - nameWidth;

  return `
    <colgroup>
      ${Array.from({ length: gameCount }).map(() => (
        `<col style="width:${nameWidth.toFixed(2)}%" /><col style="width:${contextWidth.toFixed(2)}%" />`
      )).join("")}
    </colgroup>
  `;
}

function buildPremiumHeaderHtml({
  reportTitle,
  gameDate,
  generatedAt,
  workloadViewLabel,
  positionFilter,
  pitcherCount,
}) {
  const metaParts = [
    formatReportDate(gameDate),
    positionFilter || "RP",
    workloadViewLabel || "WL · All",
    `${pitcherCount} Pitchers`,
  ].filter(Boolean);

  return `
    <header class="rp-premium-header">
      <div class="rp-premium-header-main">
        <div class="rp-premium-logo-shell">
          <img class="rp-premium-logo" src="https://upload.wikimedia.org/wikipedia/en/7/7b/New_York_Mets.svg" alt="Mets" />
        </div>
        <div class="rp-premium-title-block">
          <div class="rp-premium-kicker">Daily Workload Reporting</div>
          <div class="rp-premium-title">${escapeHtml(reportTitle)}</div>
          <div class="rp-premium-meta">${escapeHtml(metaParts.join(" • "))}</div>
        </div>
      </div>
      <div class="rp-premium-header-side">
        <div class="rp-premium-header-side-label">Generated</div>
        <div class="rp-premium-header-side-value">${escapeHtml(formatEasternTimestamp(generatedAt))}</div>
      </div>
    </header>
  `;
}

function buildGroupedHeaderHtml(dateColumns) {
  const recentCount = dateColumns.filter((column) => !column?.isToday).length;
  const todayCount = dateColumns.some((column) => column?.isToday) ? 1 : 0;

  return `
    <tr class="rp-premium-group-row">
      <th rowspan="2" class="rp-premium-static-header rp-premium-col-pitcher">Pitcher</th>
      <th rowspan="2" class="rp-premium-static-header rp-premium-col-typical">Typical</th>
      <th rowspan="2" class="rp-premium-static-header rp-premium-col-load">Load</th>
      ${recentCount > 0 ? `<th colspan="${recentCount}" class="rp-premium-group-head">Recent</th>` : ""}
      ${todayCount > 0 ? `<th colspan="${todayCount}" class="rp-premium-group-head rp-premium-group-head-today">Today</th>` : ""}
      <th rowspan="2" class="rp-premium-static-header rp-premium-static-header-center rp-premium-col-flags">Flags</th>
      <th rowspan="2" class="rp-premium-static-header rp-premium-static-header-center rp-premium-col-trend">Trend</th>
    </tr>
  `;
}

function buildDateHeaderCellHtml(column) {
  const classes = ["rp-premium-date-head"];
  if (column?.isToday) classes.push("is-today");
  let opponentHtml = "";

  if (column?.opponent) {
    const prefix = column.opponent.homeAway === "home" ? "vs" : "@";
    if (column.opponent.logoUrl) {
      opponentHtml = `
        <span class="rp-premium-date-matchup-prefix">${escapeHtml(prefix)}</span>
        <span class="rp-premium-date-logo-badge">
          <img class="rp-premium-date-opp-logo" src="${escapeHtml(column.opponent.logoUrl)}" alt="" />
        </span>
      `;
    } else {
      opponentHtml = `<span class="rp-premium-date-matchup-prefix">${escapeHtml(`${prefix} ${column.opponent.teamName || ""}`)}</span>`;
    }
  }

  return `
    <th class="${classes.join(" ")}">
      <div class="rp-premium-date-wrap">
        <div class="rp-premium-date-top">
          <span class="rp-premium-date-main">${escapeHtml(column?.displayDate || "")}</span>
          ${opponentHtml}
        </div>
        <span class="rp-premium-date-sub">${escapeHtml(column?.dayOfWeek || "")}</span>
      </div>
    </th>
  `;
}

function getDayToneClass(day) {
  const tone = String(day?.tone || "empty").trim();
  return `tone-${tone}`;
}

function buildPremiumPitcherCellHtml(pitcher) {
  const throwSide = String(pitcher?.throw_side || "").trim().toUpperCase();
  const throwLabel = throwSide ? `${throwSide}HP` : "";

  return `
    <td class="rp-premium-pitcher-cell">
      <div class="rp-premium-pitcher-name">${escapeHtml(pitcher?.pitcher_name_last_first || "—")}</div>
      <div class="rp-premium-pitcher-meta">${escapeHtml(throwLabel || " ")}</div>
    </td>
  `;
}

function buildPremiumMetricTokenHtml(label, value) {
  return `
    <span class="rp-premium-metric-token">
      <span class="rp-premium-metric-label">${escapeHtml(label)}</span>
      <span class="rp-premium-metric-value">${escapeHtml(value || "—")}</span>
    </span>
  `;
}

function buildPremiumMetricLineHtml(fragments, className = "") {
  const isPaired = className.includes("is-paired");
  return `
    <div class="rp-premium-metric-line${className ? ` ${className}` : ""}">
      ${fragments.map((fragment, index) => (
        `${index > 0 && !isPaired ? '<span class="rp-premium-metric-divider">·</span>' : ""}${buildPremiumMetricTokenHtml(fragment.label, fragment.value)}`
      )).join("")}
    </div>
  `;
}

function buildPremiumTypicalCellHtml(summary) {
  return `
    <td class="rp-premium-info-cell rp-premium-typical-cell">
      <div class="rp-premium-metric-stack rp-premium-metric-stack-typical">
        ${buildPremiumMetricLineHtml([
          { label: "P", value: summary?.pitchValue || "—" },
          { label: "IP", value: summary?.inningsValue || "—" },
        ], "is-primary is-paired")}
        ${buildPremiumMetricLineHtml([
          { label: "R", value: summary?.restValue || "—" },
        ], "is-secondary")}
        ${buildPremiumMetricLineHtml([
          { label: "Lev", value: summary?.leverageValue || "—" },
        ], "is-tertiary")}
      </div>
    </td>
  `;
}

function buildPremiumLoadCellHtml(summary) {
  return `
    <td class="rp-premium-info-cell rp-premium-load-cell">
      <div class="rp-premium-metric-stack rp-premium-metric-stack-load">
        ${buildPremiumMetricLineHtml([
          { label: "ACR", value: summary?.acrValue || "—" },
        ], "is-primary is-acr")}
        ${buildPremiumMetricLineHtml([
          { label: "7d", value: summary?.acuteValue || "—" },
          { label: "28d", value: summary?.chronicValue || "—" },
        ], "is-secondary is-paired")}
        ${buildPremiumMetricLineHtml([
          { label: "5d", value: summary?.fiveDayValue || "—" },
        ], "is-tertiary")}
      </div>
    </td>
  `;
}

function buildPremiumFlagsCellHtml(flags) {
  const labels = getPremiumFlagLabels(flags);
  const visible = labels.slice(0, 4);
  const extraCount = Math.max(0, labels.length - visible.length);

  return `
    <td class="rp-premium-flags-cell">
      <div class="rp-premium-flag-grid">
        ${visible.length
          ? visible.map((label) => `<span class="rp-premium-flag-chip ${getPremiumFlagToneClass(label)}">${escapeHtml(label)}</span>`).join("")
          : '<span class="rp-premium-flag-empty">—</span>'}
        ${extraCount > 0 ? `<span class="rp-premium-flag-chip is-overflow">+${extraCount}</span>` : ""}
      </div>
    </td>
  `;
}

function buildPremiumTrendCellHtml(sparkline) {
  return `
    <td class="rp-premium-trend-cell">
      <div class="rp-premium-sparkline-wrap">${buildSparklineSvg(sparkline || [], RP_PREMIUM_SPARKLINE_WIDTH, RP_PREMIUM_SPARKLINE_HEIGHT)}</div>
    </td>
  `;
}

function buildPremiumDayCellHtml(day) {
  const cellClasses = ["rp-premium-day-cell", getDayToneClass(day)];
  if (day?.isToday) cellClasses.push("is-today");

  const boardClasses = ["rp-premium-day-board"];
  const bottomText = [day?.sessionLabel, day?.supportLabel].filter(Boolean).join(" · ") || day?.bottomText || "";
  if (!day?.topText && !bottomText) {
    cellClasses.push("is-empty");
    boardClasses.push("is-empty");
  }

  return `
    <td class="${cellClasses.join(" ")}">
      <div class="${boardClasses.join(" ")}" data-wl="${day?.workloadValue == null ? "" : escapeHtml(String(day.workloadValue))}">
        <div class="rp-premium-day-top">${day?.topText ? escapeHtml(day.topText) : "&nbsp;"}</div>
        <div class="rp-premium-day-bottom">${bottomText ? escapeHtml(bottomText) : "&nbsp;"}</div>
      </div>
    </td>
  `;
}

function buildPremiumPitcherRowsHtml(pitchers, dateColumnCount) {
  return (Array.isArray(pitchers) ? pitchers : []).map((pitcher, rowIndex) => {
    const dayCells = Array.isArray(pitcher?.premium_daily)
      ? pitcher.premium_daily
      : Array.from({ length: dateColumnCount }).map(() => ({ topText: "", bottomText: "", tone: "empty" }));

    return `
      <tr class="rp-premium-row${rowIndex % 2 === 1 ? " is-alt" : ""}">
        ${buildPremiumPitcherCellHtml(pitcher)}
        ${buildPremiumTypicalCellHtml(pitcher?.premium_typical)}
        ${buildPremiumLoadCellHtml(pitcher?.premium_load)}
        ${dayCells.map((day) => buildPremiumDayCellHtml(day)).join("")}
        ${buildPremiumFlagsCellHtml(pitcher?.flags)}
        ${buildPremiumTrendCellHtml(pitcher?.sparkline)}
      </tr>
    `;
  }).join("");
}

function buildPremiumLegendHtml() {
  return `
    <section class="rp-premium-meta-strip">
      <div class="rp-premium-meta-row">
        <span class="rp-premium-meta-label">Note</span>
        <span class="rp-premium-meta-text">Typical shows P, IP, rest, and leverage. Load shows acute, chronic, ACR, and pitched days in the last 5.</span>
      </div>
      <div class="rp-premium-meta-row">
        <span class="rp-premium-meta-label">Legend</span>
        <span class="rp-premium-meta-text">HWL = High Workload, HS = High Stress, Velo = FB Velocity, Lev = Leverage, B2B = Back-to-Back, 3/5 = Pitched 3 of Last 5, POP = Pitch Off / Pitch On / Pitch Off.</span>
      </div>
    </section>
  `;
}

function buildPremiumRecentUsageSectionHtml(recentRpUsage) {
  const normalizedRecentUsage = normalizeRecentRpUsage(recentRpUsage);
  if (!normalizedRecentUsage) return "";

  const totalColumns = Math.max(normalizedRecentUsage.games.length * 2, 1);
  const densityClass = getRecentUsageDensityClass(normalizedRecentUsage.rowCount);
  const headerCells = normalizedRecentUsage.games.map((game, gameIndex) => (
    `<th colspan="2" class="rp-premium-recent-game-header${gameIndex === 0 ? " is-first" : ""}${gameIndex === normalizedRecentUsage.games.length - 1 ? " is-last" : ""}">${escapeHtml(game.gameKey || "—")}</th>`
  )).join("");

  const rowsHtml = Array.from({ length: normalizedRecentUsage.rowCount }).map((_, index) => {
    const rowNumber = index + 1;
    const isStarterRow = normalizedRecentUsage.games.some((game) => game.entryByRow.get(rowNumber)?.is_starter_row);
    const rowClass = isStarterRow ? "rp-premium-recent-row is-starter" : "rp-premium-recent-row";
    const cells = normalizedRecentUsage.games.map((game, gameIndex) => {
      const entry = game.entryByRow.get(rowNumber) || null;
      const nameClasses = `${buildRecentUsageNameCellClass(entry)} recent-pair-start`;
      const contextClasses = `${buildRecentUsageContextCellClass(entry)} recent-pair-end${gameIndex === normalizedRecentUsage.games.length - 1 ? " is-final" : ""}`;
      return `
        <td class="${nameClasses}">${buildRecentUsageNameCellHtml(entry)}</td>
        <td class="${contextClasses}">${buildRecentUsageContextCellHtml(entry)}</td>
      `;
    }).join("");

    return `<tr class="${rowClass}" data-row-number="${rowNumber}">${cells}</tr>`;
  }).join("");

  return `
    <section class="rp-premium-recent-section">
      <table class="rp-premium-recent-table ${densityClass}">
        ${buildRecentUsageColGroupHtml(normalizedRecentUsage.games.length)}
        <thead>
          <tr class="rp-premium-recent-superhead">
            <th colspan="${totalColumns}">${escapeHtml(RECENT_USAGE_TITLE)}</th>
          </tr>
          <tr class="rp-premium-recent-gamehead">${headerCells}</tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </section>
  `;
}

function buildBoardColGroupHtml(dateColumnCount) {
  return `
    <colgroup>
      <col style="width:132px" />
      <col style="width:98px" />
      <col style="width:102px" />
      ${Array.from({ length: Math.max(0, dateColumnCount) }).map(() => "<col />").join("")}
      <col style="width:56px" />
      <col style="width:96px" />
    </colgroup>
  `;
}

function rpPremiumMonitoringCss() {
  return `
    @page { size: letter landscape; margin: 6mm 6mm 13mm 6mm; }

    html, body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      font-variant-numeric: tabular-nums;
    }

    .rp-premium-page {
      width: 100%;
      padding: 0;
      background: #fff;
    }
    .rp-premium-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 12px;
      padding: 4px 0 7px;
      border-bottom: 2px solid ${RP_PREMIUM_COLORS.metsOrange};
      margin-bottom: 8px;
    }
    .rp-premium-header-main {
      display: flex;
      align-items: flex-end;
      gap: 10px;
      min-width: 0;
    }
    .rp-premium-logo-shell {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      overflow: hidden;
      border: 1px solid rgba(0, 45, 114, 0.14);
      flex: 0 0 auto;
    }
    .rp-premium-logo {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .rp-premium-kicker {
      font-size: 7px;
      font-weight: 700;
      letter-spacing: 0.28em;
      text-transform: uppercase;
      color: ${RP_PREMIUM_COLORS.textMuted};
      margin-bottom: 2px;
    }
    .rp-premium-title {
      font-size: 17.5px;
      line-height: 1;
      font-weight: 800;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      color: ${RP_PREMIUM_COLORS.metsBlue};
      margin-bottom: 2px;
    }
    .rp-premium-meta,
    .rp-premium-header-side {
      font-size: 8px;
      line-height: 1.25;
      color: ${RP_PREMIUM_COLORS.textMuted};
    }
    .rp-premium-header-side {
      text-align: right;
      padding-bottom: 1px;
      white-space: nowrap;
    }
    .rp-premium-header-side-label {
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: ${RP_PREMIUM_COLORS.textLight};
      margin-bottom: 1px;
    }
    .rp-premium-header-side-value {
      font-weight: 600;
      color: ${RP_PREMIUM_COLORS.text};
    }

    .rp-premium-board {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      border: 1px solid ${RP_PREMIUM_COLORS.borderStrong};
      background: ${RP_PREMIUM_COLORS.gridBg};
      margin-bottom: 7px;
    }
    .rp-premium-board th,
    .rp-premium-board td {
      border: 0;
      border-bottom: 1px solid ${RP_PREMIUM_COLORS.borderSoft};
      padding: 0;
      vertical-align: middle;
    }
    .rp-premium-group-row th {
      background: ${RP_PREMIUM_COLORS.metsBlue};
      color: #fff;
      font-size: 6.45px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      padding: 4px 6px 3px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    }
    .rp-premium-group-head {
      text-align: center;
    }
    .rp-premium-group-head-today {
      background: ${RP_PREMIUM_COLORS.metsBlueAlt};
      border-left: 2px solid ${RP_PREMIUM_COLORS.todayBorder} !important;
      border-right: 2px solid ${RP_PREMIUM_COLORS.todayBorder} !important;
      box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.16);
    }
    .rp-premium-static-header {
      text-align: left;
      padding-left: 7px !important;
    }
    .rp-premium-static-header-center {
      text-align: center;
      padding-left: 0 !important;
    }
    .rp-premium-col-pitcher { width: 132px; }
    .rp-premium-col-typical { width: 98px; }
    .rp-premium-col-load { width: 102px; }
    .rp-premium-col-flags { width: 56px; }
    .rp-premium-col-trend { width: 96px; }
    .rp-premium-date-head {
      background: ${RP_PREMIUM_COLORS.metsBlue};
      color: #fff;
      padding: 4px 2px 5px !important;
      border-top: 0 !important;
      border-bottom: 2px solid ${RP_PREMIUM_COLORS.metsOrange} !important;
      text-align: center;
    }
    .rp-premium-date-head.is-today {
      background: ${RP_PREMIUM_COLORS.metsBlueAlt};
      border-left: 2px solid ${RP_PREMIUM_COLORS.todayBorder} !important;
      border-right: 2px solid ${RP_PREMIUM_COLORS.todayBorder} !important;
      box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.14);
    }
    .rp-premium-date-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1px;
      min-height: 26px;
    }
    .rp-premium-date-top {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      min-height: 12px;
    }
    .rp-premium-date-main {
      display: block;
      font-size: 6.75px;
      font-weight: 700;
      line-height: 1.05;
      letter-spacing: 0.03em;
    }
    .rp-premium-date-sub {
      display: block;
      font-size: 6.35px;
      font-weight: 600;
      line-height: 1.05;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      opacity: 0.92;
      margin-top: 1px;
    }
    .rp-premium-date-matchup-prefix {
      font-size: 5.7px;
      line-height: 1;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      opacity: 0.9;
    }
    .rp-premium-date-logo-badge {
      width: 14px;
      height: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
    }
    .rp-premium-date-opp-logo {
      width: 13px;
      height: 13px;
      object-fit: contain;
      display: inline-block;
      filter: brightness(0) invert(1) opacity(0.88);
    }

    .rp-premium-row td {
      background: #fff;
    }
    .rp-premium-row.is-alt td {
      background: ${RP_PREMIUM_COLORS.rowAlt};
    }
    .rp-premium-pitcher-cell {
      width: 132px;
      padding: 5px 8px !important;
      text-align: left;
      border-right: 1.5px solid ${RP_PREMIUM_COLORS.borderStrong} !important;
    }
    .rp-premium-pitcher-name {
      font-size: 9px;
      line-height: 1.04;
      font-weight: 700;
      color: ${RP_PREMIUM_COLORS.text};
      margin-bottom: 3px;
    }
    .rp-premium-pitcher-meta {
      font-size: 6.75px;
      line-height: 1;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: ${RP_PREMIUM_COLORS.textMuted};
    }
    .rp-premium-info-cell {
      padding: 5px 6px !important;
      text-align: left;
    }
    .rp-premium-typical-cell {
      width: 98px;
      border-right: 0 !important;
    }
    .rp-premium-load-cell {
      width: 102px;
      background: ${RP_PREMIUM_COLORS.subtleBg};
      border-right: 1.5px solid ${RP_PREMIUM_COLORS.borderStrong} !important;
    }
    .rp-premium-metric-stack {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 4px;
    }
    .rp-premium-metric-line {
      min-width: 0;
      display: flex;
      align-items: baseline;
      justify-content: flex-start;
      gap: 4px;
      white-space: nowrap;
    }
    .rp-premium-metric-line:not(.is-paired) {
      justify-content: flex-start;
      gap: 4px;
    }
    .rp-premium-metric-line.is-paired {
      justify-content: space-between;
      gap: 6px;
    }
    .rp-premium-metric-token {
      min-width: 0;
      display: inline-flex;
      align-items: baseline;
      gap: 3px;
    }
    .rp-premium-metric-line.is-paired .rp-premium-metric-token {
      flex: 1 1 0;
      justify-content: flex-start;
      gap: 3px;
      min-width: 0;
    }
    .rp-premium-metric-stack-load .rp-premium-metric-line.is-primary .rp-premium-metric-value,
    .rp-premium-metric-stack-load .rp-premium-metric-line.is-primary .rp-premium-metric-label {
      color: ${RP_PREMIUM_COLORS.metsBlue};
    }
    .rp-premium-metric-line.is-primary .rp-premium-metric-value {
      font-size: 8.55px;
      font-weight: 800;
      color: ${RP_PREMIUM_COLORS.text};
    }
    .rp-premium-metric-line.is-primary .rp-premium-metric-label {
      font-size: 6.55px;
      color: ${RP_PREMIUM_COLORS.textMuted};
    }
    .rp-premium-metric-line.is-secondary .rp-premium-metric-value {
      font-size: 7.55px;
      font-weight: 700;
    }
    .rp-premium-metric-line.is-tertiary .rp-premium-metric-value,
    .rp-premium-metric-line.is-tertiary .rp-premium-metric-label {
      color: ${RP_PREMIUM_COLORS.textMuted};
    }
    .rp-premium-metric-line.is-tertiary .rp-premium-metric-value {
      font-size: 7.05px;
    }
    .rp-premium-metric-line.is-acr .rp-premium-metric-value {
      font-size: 9.15px;
    }
    .rp-premium-metric-label {
      font-size: 5.95px;
      line-height: 1.02;
      font-weight: 700;
      letter-spacing: 0.07em;
      color: ${RP_PREMIUM_COLORS.textMuted};
      flex: 0 0 auto;
    }
    .rp-premium-metric-value {
      font-size: 7.35px;
      line-height: 1.06;
      font-weight: 700;
      color: ${RP_PREMIUM_COLORS.text};
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .rp-premium-metric-divider {
      font-size: 6.4px;
      line-height: 1;
      color: ${RP_PREMIUM_COLORS.textLight};
      font-weight: 700;
      align-self: center;
    }
    .rp-premium-info-caption {
      margin-top: 3px;
      font-size: 6.2px;
      line-height: 1;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: ${RP_PREMIUM_COLORS.textLight};
    }

    .rp-premium-day-cell {
      padding: 0 !important;
      background: ${RP_PREMIUM_COLORS.empty};
      height: 36px;
    }
    .rp-premium-day-cell.is-today {
      border-left: 2px solid ${RP_PREMIUM_COLORS.todayBorder} !important;
      border-right: 2px solid ${RP_PREMIUM_COLORS.todayBorder} !important;
      background-image: linear-gradient(180deg, rgba(238, 246, 255, 0.48), rgba(238, 246, 255, 0.22));
      box-shadow: inset 0 0 0 1px rgba(47, 95, 148, 0.34);
    }
    .rp-premium-day-cell.tone-empty,
    .rp-premium-day-cell.tone-neutral {
      background: ${RP_PREMIUM_COLORS.empty};
    }
    .rp-premium-day-cell.tone-heat-1 {
      background: ${RP_PREMIUM_COLORS.heat1};
    }
    .rp-premium-day-cell.tone-heat-2 {
      background: ${RP_PREMIUM_COLORS.heat2};
    }
    .rp-premium-day-cell.tone-heat-3 {
      background: ${RP_PREMIUM_COLORS.heat3};
    }
    .rp-premium-day-cell.tone-heat-4 {
      background: ${RP_PREMIUM_COLORS.heat4};
    }
    .rp-premium-day-cell.tone-heat-5 {
      background: ${RP_PREMIUM_COLORS.heat5};
    }
    .rp-premium-day-cell.is-today.tone-empty,
    .rp-premium-day-cell.is-today.tone-neutral {
      background: ${RP_PREMIUM_COLORS.todayTint};
    }
    .rp-premium-day-board {
      min-height: 28px;
      padding: 3px 4px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      width: 100%;
      text-align: center;
      background: transparent;
      box-sizing: border-box;
    }
    .rp-premium-day-top {
      font-size: 8.35px;
      line-height: 1.05;
      font-weight: 700;
      color: ${RP_PREMIUM_COLORS.text};
      white-space: nowrap;
      letter-spacing: 0.01em;
    }
    .rp-premium-day-bottom {
      font-size: 6.3px;
      line-height: 1.05;
      font-weight: 600;
      color: ${RP_PREMIUM_COLORS.textMuted};
      white-space: nowrap;
    }
    .rp-premium-day-cell.is-today .rp-premium-day-board {
      background-image: linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(47, 95, 148, 0.02));
    }
    .rp-premium-day-cell.is-today .rp-premium-day-top {
      color: ${RP_PREMIUM_COLORS.metsBlue};
    }

    .rp-premium-flags-cell {
      width: 56px;
      padding: 3px 4px !important;
      border-left: 1.5px solid ${RP_PREMIUM_COLORS.borderStrong} !important;
      text-align: center;
      background: ${RP_PREMIUM_COLORS.subtleBg};
    }
    .rp-premium-flag-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 2px;
      align-items: center;
      align-content: center;
      min-height: 24px;
    }
    .rp-premium-flag-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 0;
      width: 100%;
      padding: 2px 3px;
      border: 0;
      border-radius: 2px;
      background: ${RP_PREMIUM_COLORS.flagNeutral};
      color: ${RP_PREMIUM_COLORS.flagNeutralText};
      font-size: 6px;
      line-height: 1;
      font-weight: 700;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      box-sizing: border-box;
    }
    .rp-premium-flag-chip.is-high {
      background: ${RP_PREMIUM_COLORS.flagHigh};
      color: ${RP_PREMIUM_COLORS.flagHighText};
    }
    .rp-premium-flag-chip.is-med {
      background: ${RP_PREMIUM_COLORS.flagMedium};
      color: ${RP_PREMIUM_COLORS.flagMediumText};
    }
    .rp-premium-flag-chip.is-low {
      background: ${RP_PREMIUM_COLORS.flagLow};
      color: ${RP_PREMIUM_COLORS.flagLowText};
    }
    .rp-premium-flag-chip.is-neutral {
      background: ${RP_PREMIUM_COLORS.flagNeutral};
      color: ${RP_PREMIUM_COLORS.flagNeutralText};
    }
    .rp-premium-flag-chip.is-overflow {
      background: ${RP_PREMIUM_COLORS.flagOverflow};
      color: ${RP_PREMIUM_COLORS.textMuted};
    }
    .rp-premium-flag-empty,
    .rp-premium-empty-mark {
      font-size: 7.1px;
      line-height: 1;
      color: ${RP_PREMIUM_COLORS.textLight};
    }

    .rp-premium-trend-cell {
      width: 96px;
      padding: 4px 6px !important;
      border-left: 1px solid ${RP_PREMIUM_COLORS.borderStrong} !important;
      background: linear-gradient(180deg, ${RP_PREMIUM_COLORS.subtleBg}, #ffffff);
      text-align: center;
    }
    .rp-premium-sparkline-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: ${RP_PREMIUM_SPARKLINE_HEIGHT}px;
      width: 100%;
    }

    .rp-premium-meta-strip {
      display: grid;
      gap: 2px;
      margin-bottom: 6px;
      padding-top: 4px;
      border-top: 1px solid ${RP_PREMIUM_COLORS.borderSoft};
    }
    .rp-premium-meta-row {
      display: grid;
      grid-template-columns: 44px 1fr;
      gap: 8px;
      align-items: baseline;
    }
    .rp-premium-meta-label {
      font-size: 6.2px;
      line-height: 1.1;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: ${RP_PREMIUM_COLORS.textMuted};
    }
    .rp-premium-meta-text {
      font-size: 6.45px;
      line-height: 1.2;
      color: ${RP_PREMIUM_COLORS.textLight};
      orphans: 2;
      widows: 2;
    }

    .rp-premium-recent-section {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .rp-premium-recent-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      border: 1px solid ${RP_PREMIUM_COLORS.border};
      background: #fff;
      font-variant-numeric: tabular-nums;
    }
    .rp-premium-recent-table th,
    .rp-premium-recent-table td {
      border-right: 1px solid ${RP_PREMIUM_COLORS.borderSoft};
      border-bottom: 1px solid ${RP_PREMIUM_COLORS.borderSoft};
      padding: 2px 4px;
      font-size: 7px;
      line-height: 1.15;
      vertical-align: middle;
    }
    .rp-premium-recent-table th:last-child,
    .rp-premium-recent-table td:last-child {
      border-right: 0;
    }
    .rp-premium-recent-superhead th {
      background: ${RP_PREMIUM_COLORS.metsBlue};
      color: #fff;
      border-bottom: 2px solid ${RP_PREMIUM_COLORS.metsOrange};
      padding: 4px 6px;
      font-size: 6.2px;
      font-weight: 650;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      text-align: left;
    }
    .rp-premium-recent-gamehead th {
      background: ${RP_PREMIUM_COLORS.metsBlueAlt};
      color: #fff;
      border-bottom: 1px solid ${RP_PREMIUM_COLORS.borderStrong};
      font-size: 6px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      text-align: center;
      padding: 3px 2px;
    }
    .rp-premium-recent-game-header {
      border-left: 1px solid ${RP_PREMIUM_COLORS.borderStrong} !important;
      border-right: 1px solid ${RP_PREMIUM_COLORS.borderStrong} !important;
    }
    .rp-premium-recent-row td {
      background: #fff;
    }
    .rp-premium-recent-row.is-starter td {
      background: ${RP_PREMIUM_COLORS.starterFill};
      border-bottom: 2px solid ${RP_PREMIUM_COLORS.metsOrange};
    }
    .recent-name-cell {
      font-size: 6.65px;
      font-weight: 700;
      text-align: left;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      border-left: 1px solid ${RP_PREMIUM_COLORS.borderStrong} !important;
    }
    .recent-name-right { color: ${RP_PREMIUM_COLORS.text}; }
    .recent-name-left { color: #b42318; }
    .recent-name-switch { color: ${RP_PREMIUM_COLORS.metsOrange}; }
    .recent-name-empty { color: ${RP_PREMIUM_COLORS.textLight}; }
    .recent-name-starter { color: ${RP_PREMIUM_COLORS.textMuted}; }
    .recent-context-top,
    .recent-context-bottom {
      display: block;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .recent-context-top {
      font-size: 6.2px;
      font-weight: 700;
      margin-bottom: 1px;
    }
    .recent-context-bottom {
      font-size: 5.85px;
      color: ${RP_PREMIUM_COLORS.textMuted};
    }
    .recent-context-high {
      background: ${RP_PREMIUM_COLORS.leverageHigh};
    }
    .recent-context-medium {
      background: ${RP_PREMIUM_COLORS.leverageMedium};
    }
    .recent-context-low {
      background: ${RP_PREMIUM_COLORS.leverageLow};
    }
    .recent-context-neutral {
      background: ${RP_PREMIUM_COLORS.empty};
    }
    .recent-context-starter { background: ${RP_PREMIUM_COLORS.starterFill}; }
    .recent-context-empty { color: ${RP_PREMIUM_COLORS.textLight}; }
    .recent-context-cell {
      border-right: 1px solid ${RP_PREMIUM_COLORS.borderStrong} !important;
    }
    .recent-context-cell.is-final {
      border-right: 0 !important;
    }
    .rp-premium-recent-table.density-compact th,
    .rp-premium-recent-table.density-compact td {
      padding-top: 2px;
      padding-bottom: 2px;
    }
    .rp-premium-recent-table.density-compact .recent-name-cell {
      font-size: 6.65px;
    }
    .rp-premium-recent-table.density-compact .recent-context-top {
      font-size: 6.25px;
    }
    .rp-premium-recent-table.density-compact .recent-context-bottom {
      font-size: 5.95px;
    }
    .rp-premium-recent-table.density-ultra th,
    .rp-premium-recent-table.density-ultra td {
      padding-top: 1px;
      padding-bottom: 1px;
    }
    .rp-premium-recent-table.density-ultra .recent-name-cell {
      font-size: 6.2px;
    }
    .rp-premium-recent-table.density-ultra .recent-context-top {
      font-size: 5.9px;
    }
    .rp-premium-recent-table.density-ultra .recent-context-bottom {
      font-size: 5.6px;
    }
  `;
}

export function buildPitcherMonitoringRpPremiumReportHtml(data) {
  const pitchers = Array.isArray(data?.pitchers) ? data.pitchers : [];
  const dateColumns = Array.isArray(data?.dateColumns) ? data.dateColumns : [];
  const { title: reportTitle } = getPitcherMonitoringExportMeta(data?.positionFilter || "RP");

  const html = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          ${sharedCss()}
          ${rpPremiumMonitoringCss()}
        </style>
      </head>
      <body>
        <!-- pitcher-monitoring-template:${escapeHtml(PITCHER_MONITORING_RP_PREMIUM_TEMPLATE_VERSION)} -->
        <div class="rp-premium-page">
          ${buildPremiumHeaderHtml({
            reportTitle,
            gameDate: data?.gameDate,
            generatedAt: data?.generatedAt,
            workloadViewLabel: data?.workloadViewLabel,
            positionFilter: data?.positionFilter,
            pitcherCount: pitchers.length,
          })}
          <table class="rp-premium-board">
            ${buildBoardColGroupHtml(dateColumns.length)}
            <thead>
              ${buildGroupedHeaderHtml(dateColumns)}
              <tr>
                ${dateColumns.map((column) => buildDateHeaderCellHtml(column)).join("")}
              </tr>
            </thead>
            <tbody>
              ${buildPremiumPitcherRowsHtml(pitchers, dateColumns.length)}
            </tbody>
          </table>
          ${buildPremiumLegendHtml()}
          ${buildPremiumRecentUsageSectionHtml(data?.recentRpUsage)}
        </div>
      </body>
    </html>
  `;

  return html;
}
