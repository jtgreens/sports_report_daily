/**
 * Alternative bullpen-style pitcher monitoring PDF template.
 */

import { COLORS, sharedCss } from "./shared-styles.js";
import { getPitcherMonitoringExportMeta } from "../pitcher-monitoring-export.js";
import { formatEasternTimestamp } from "./time-format.js";

const COLUMN_WIDTHS = {
  pitcher: 120,
  typical: 50,
  rest: 40,
  wl: 54,
  flags: 60,
};

const RECENT_USAGE_MAX_GAMES = 7;
const RECENT_USAGE_TITLE = "Last 7 Games - Reliever Entrances by Leverage";
export const PITCHER_MONITORING_BULLPEN_ALT_TEMPLATE_VERSION = "2026-03-21-bullpen-alt-palace-palette";
const ALT_COLORS = {
  metsBlue: "#002D72",
  metsOrange: "#FF5910",
  grayBorder: "#A9A9A9",
  whiteSmoke: "#F5F5F5",
  palaceBlue: "#DFE5ED",
  divider: "#000000",
  futureWash: "#F8FAFC",
  leverageLow: "#FFF4E6",
  leverageMedium: "#FBD9B5",
  leverageHigh: "#FDAE61",
  leverageLowBorder: "#EFD8B9",
  leverageMediumBorder: "#EDBE8B",
  leverageHighBorder: "#E48E3C",
  dayHeat1: "#F3E1DC",
  dayHeat2: "#F4D0CA",
  dayHeat3: "#F5BBB4",
  dayHeat4: "#F59B95",
  dayHeat5: "#FF6961",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function fmtWorkloadCompact(value) {
  const num = safeNum(value);
  if (num == null) return "—";
  return num.toFixed(1);
}

function fmtWorkloadWhole(value) {
  const num = safeNum(value);
  if (num == null) return "—";
  return String(Math.round(num));
}

function fmtInningsCompact(value) {
  const num = safeNum(value);
  if (num == null) return null;
  return num.toFixed(1);
}

function fmtTypicalPitchCount(value) {
  const num = safeNum(value);
  if (num == null) return value || "—";
  return String(Math.round(num));
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

function getDensity(count) {
  if (count <= 12) return "normal";
  if (count <= 16) return "compact";
  return "ultra";
}

function getSparklineSize(density) {
  if (density === "normal") return { width: 122, height: 34 };
  if (density === "compact") return { width: 114, height: 30 };
  return { width: 106, height: 26 };
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
        .sort((left, right) => (
          (left.rowNumber - right.rowNumber)
          || (left.sortOrder - right.sortOrder)
        ));

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

// ─── Sparkline SVG ───────────────────────────────────────────────────────────

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
  if (numeric == null) {
    return { key: "neutral", color: "#94A3B8", value: null };
  }
  if (numeric > 1.5) {
    return { key: "elevated", color: "#BE123C", value: numeric };
  }
  if (numeric > 1.3 && numeric <= 1.5) {
    return { key: "watch", color: "#C2410C", value: numeric };
  }
  if (numeric < 0.8) {
    return { key: "suppressed", color: "#0F766E", value: numeric };
  }
  return { key: "neutral", color: "#64748B", value: numeric };
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
  let started = false;
  let lastPoint = null;

  points.forEach((point) => {
    const y = point?.[yKey];
    if (!Number.isFinite(y)) {
      started = false;
      return;
    }

    path += `${started ? " L" : "M"} ${point.x.toFixed(2)} ${y.toFixed(2)}`;
    started = true;
    lastPoint = { x: point.x, y };
  });

  return { path: path.trim(), lastPoint };
}

function buildSparklineSvg(data, width = 116, height = 32) {
  const normalized = normalizeSparklinePayload(data);
  const points = normalized?.points || [];
  if (!points.length) return '<span class="empty-cell">—</span>';

  const hasPitches = points.some((point) => point.pitches > 0);
  const hasWorkloads = points.some((point) => Number.isFinite(point.acute) || Number.isFinite(point.chronic));
  if (!hasPitches && !hasWorkloads) return '<span class="empty-cell">—</span>';

  const PAD_X = 3;
  const PAD_TOP = 2;
  const PAD_BOTTOM = 3;
  const innerWidth = Math.max(1, width - PAD_X * 2);
  const chartHeight = Math.max(10, height - PAD_TOP - PAD_BOTTOM);
  const trendHeight = hasPitches ? Math.max(10, chartHeight - 6) : chartHeight;
  const trendBaselineY = PAD_TOP + trendHeight;
  const barBaselineY = height - PAD_BOTTOM;
  const barBandHeight = hasPitches ? Math.max(2, barBaselineY - (trendBaselineY + 2)) : 0;
  const slotWidth = innerWidth / Math.max(points.length, 1);
  const barWidth = Math.max(1, Math.min(2.5, slotWidth - 2.1));
  const { min: trendMin, max: trendMax } = getMonitoringTrendLineDomain(points);
  const trendRange = Math.max(0.5, trendMax - trendMin);
  const barMax = Math.max(1, ...points.map((point) => point.pitches));
  const scaleTrendY = (value) => (
    trendBaselineY - ((Math.max(trendMin, value || 0) - trendMin) / trendRange) * trendHeight
  );

  const chartPoints = points.map((point, index) => {
    const x = PAD_X + slotWidth * index + slotWidth / 2;
    const acuteY = Number.isFinite(point.acute) ? scaleTrendY(point.acute) : null;
    const chronicY = Number.isFinite(point.chronic) ? scaleTrendY(point.chronic) : null;
    return { ...point, x, acuteY, chronicY };
  });

  const { path: chronicPath } = buildSparklinePath(chartPoints, "chronicY");
  const { path: acutePath } = buildSparklinePath(chartPoints, "acuteY");
  const latestPoint = chartPoints.at(-1) || null;
  const latestChronic = latestPoint && Number.isFinite(latestPoint.chronic)
    ? { x: latestPoint.x, y: latestPoint.chronicY }
    : null;
  const endpointStatus = getMonitoringTrendEndpointStatus(normalized?.acRatio);

  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<line x1="${PAD_X}" y1="${barBaselineY}" x2="${width - PAD_X}" y2="${barBaselineY}" stroke="#D5DFEB" stroke-width="1"/>`;

  if (hasPitches) {
    chartPoints.forEach((point, index) => {
      if (!(point.pitches > 0)) return;
      const barHeight = Math.max(1, (point.pitches / barMax) * Math.min(7, barBandHeight));
      const x = PAD_X + slotWidth * index + (slotWidth - barWidth) / 2;
      svg += `<rect x="${x.toFixed(2)}" y="${(barBaselineY - barHeight).toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" rx="${(barWidth > 2 ? 1 : 0.5).toFixed(2)}" fill="#AEBFD6" opacity="0.92"/>`;
    });
  }

  for (let index = 0; index < chartPoints.length - 1; index += 1) {
    const left = chartPoints[index];
    const right = chartPoints[index + 1];
    if (![left?.acute, left?.chronic, right?.acute, right?.chronic].every(Number.isFinite)) continue;

    const acuteDiffLeft = left.acute - left.chronic;
    const acuteDiffRight = right.acute - right.chronic;
    const isPositive = acuteDiffLeft > 0 || acuteDiffRight > 0;
    const fill = isPositive ? "#2563EB" : "#7C8FA8";
    const opacity = isPositive ? 0.14 : 0.05;
    svg += `<polygon points="${left.x.toFixed(2)},${left.acuteY.toFixed(2)} ${right.x.toFixed(2)},${right.acuteY.toFixed(2)} ${right.x.toFixed(2)},${right.chronicY.toFixed(2)} ${left.x.toFixed(2)},${left.chronicY.toFixed(2)}" fill="${fill}" opacity="${opacity}"/>`;
  }

  if (chronicPath) {
    svg += `<path d="${chronicPath}" fill="none" stroke="#1E293B" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  if (acutePath) {
    svg += `<path d="${acutePath}" fill="none" stroke="#2563EB" stroke-opacity="0.88" stroke-width="1.55" stroke-dasharray="4 3" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  if (latestChronic) {
    svg += `<circle cx="${latestChronic.x.toFixed(2)}" cy="${latestChronic.y.toFixed(2)}" r="2.45" fill="${endpointStatus.color}" stroke="#F8FAFC" stroke-width="0.8"/>`;
  }

  svg += "</svg>";
  return svg;
}

// ─── Cells ───────────────────────────────────────────────────────────────────

function buildRestPill(days) {
  const num = safeNum(days);
  if (num == null) return '<span class="empty-cell">—</span>';

  let cls = "rest-green";
  if (num <= 0) cls = "rest-red";
  else if (num === 1) cls = "rest-amber";

  return `<span class="rest-pill ${cls}"><span class="pill-text">${escapeHtml(String(num))}</span></span>`;
}

function buildFlagBadges(flags) {
  const badges = [];
  if (flags?.is_back_to_back) badges.push('<span class="flag-badge flag-b2b"><span class="pill-text">B2B</span></span>');
  if (flags?.pitched_3_of_last_5) badges.push('<span class="flag-badge flag-3of5"><span class="pill-text">3/5</span></span>');
  if (flags?.is_pitch_off_pitch_off_pitch) badges.push('<span class="flag-badge flag-popop"><span class="pill-text">PO</span></span>');
  if (flags?.release_abnormal_recent) badges.push('<span class="flag-badge flag-rel"><span class="pill-text">VELO</span></span>');
  if (flags?.max_leverage_abnormal) badges.push('<span class="flag-badge flag-lev"><span class="pill-text">LEV</span></span>');
  if (flags?.high_workload_recent) badges.push('<span class="flag-badge flag-hw"><span class="pill-text">HW</span></span>');
  if (flags?.high_stress) badges.push('<span class="flag-badge flag-hs"><span class="pill-text">HS</span></span>');

  return `<div class="flag-stack">${badges.length ? badges.join("") : '<span class="flag-empty">—</span>'}</div>`;
}

function buildWorkloadCell(pitcher) {
  const summary = pitcher?.workload_summary || {};
  const acute = safeNum(summary.acute) ?? safeNum(pitcher?.combined_ewma_7d_total_wl);
  const chronic = safeNum(summary.chronic) ?? safeNum(pitcher?.combined_ewma_28d_total_wl);
  const acr = safeNum(summary.acr)
    ?? (acute != null && chronic != null && chronic > 0 ? acute / chronic : null);
  const pitchedDaysLast5 = Math.max(0, Math.round(safeNum(summary.pitched_days_last_5) ?? 0));
  const rows = [
    { label: "7d", value: fmtWorkloadWhole(acute), rowClass: "wl-row-primary" },
    { label: "28d", value: fmtWorkloadWhole(chronic), rowClass: "wl-row-primary" },
    { label: "ACR", value: fmtWorkloadCompact(acr), rowClass: "wl-row-acr" },
    { label: "5d", value: `${pitchedDaysLast5}/5`, rowClass: "wl-row-frequency" },
  ];

  return `
    <div class="wl-cell">
      ${rows.map((row) => (
        `<div class="wl-row ${row.rowClass}"><span class="wl-label">${escapeHtml(row.label)}</span><span class="wl-value">${escapeHtml(row.value)}</span></div>`
      )).join("")}
    </div>
  `;
}

function buildTypicalUsageCell(pitcher) {
  const typicalUsage = pitcher?.pdf_typical_usage || {};
  const leverageBucket = getTypicalLeverageBucket(
    typicalUsage.avg_max_leverage ?? typicalUsage.leverage_label,
    typicalUsage.leverage_label || "—",
  );
  const rows = [
    { label: "P", value: fmtTypicalPitchCount(typicalUsage.pitches_label), rowClass: "typical-row-primary" },
    { label: "IP", value: typicalUsage.innings_label || "—", rowClass: "typical-row-primary" },
    { label: "R", value: typicalUsage.rest_label || "—", rowClass: "typical-row-primary" },
    {
      label: "L",
      value: leverageBucket.value,
      valueClass: leverageBucket.valueClass,
      rowClass: "typical-row-leverage",
    },
  ];

  return `
    <div class="typical-cell">
      ${rows.map((row) => (
        `<div class="typical-row ${row.rowClass || ""}"><span class="typical-label">${escapeHtml(row.label)}</span><span class="typical-value${row.valueClass ? ` ${row.valueClass}` : ""}">${escapeHtml(row.value)}</span></div>`
      )).join("")}
    </div>
  `;
}

function getPitcherNameClass(pitcher) {
  const throwSide = getPitcherThrowSide(pitcher);
  return throwSide === "L" ? "pitcher-name pitcher-name-left" : "pitcher-name";
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

function buildDailyCell(dayData, activityFilter) {
  if (!dayData) return '<span class="empty-cell">—</span>';

  const primarySession = getPrimaryDaySession(dayData, activityFilter);
  if (!primarySession) return '<span class="empty-cell">—</span>';

  const wl = resolveDayWorkload(dayData, primarySession);
  return `
    <div class="day-block ${getDayBlockHeatClass(wl)}" data-wl="${wl == null ? "" : escapeHtml(String(wl))}">
      <span class="day-block-text-top">${escapeHtml(buildDayBlockTopText(primarySession))}</span>
      <span class="day-block-text-bottom">${escapeHtml(buildDayBlockBottomText(dayData, primarySession))}</span>
    </div>
  `;
}

function buildFlagsRail(flags) {
  return `<div class="rail-panel rail-panel-flags">${buildFlagBadges(flags)}</div>`;
}

function buildTrendRail(sparkline, sparkWidth, sparkHeight) {
  return `
    <div class="rail-panel rail-panel-trend">
      <div class="sparkline-wrap">${buildSparklineSvg(sparkline || [], sparkWidth, sparkHeight)}</div>
    </div>
  `;
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

function buildRecentUsageSectionHtml(recentRpUsage) {
  const normalizedRecentUsage = normalizeRecentRpUsage(recentRpUsage);
  if (!normalizedRecentUsage) return "";
  const recentUsageDensity = normalizedRecentUsage.rowCount <= 3 ? "sparse" : "regular";

  const headerCells = normalizedRecentUsage.games.map((game) => (
    `<th colspan="2">${escapeHtml(game.gameKey || "—")}</th>`
  )).join("");

  const rowsHtml = Array.from({ length: normalizedRecentUsage.rowCount }).map((_, index) => {
    const rowNumber = index + 1;
    const rowClass = rowNumber === 1 ? "recent-usage-row recent-usage-row-starter" : "recent-usage-row";

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
    <section class="recent-usage-section" data-density="${recentUsageDensity}">
      <div class="recent-usage-title">${escapeHtml(RECENT_USAGE_TITLE)}</div>
      <table class="recent-usage-table">
        ${buildRecentUsageColGroupHtml(normalizedRecentUsage.games.length)}
        <thead>
          <tr>${headerCells}</tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </section>
  `;
}

function buildMonitoringLegendHtml() {
  return `
    <div class="monitoring-caption">
      <span class="monitoring-caption-label">Note</span>
      <span class="monitoring-caption-text">Pitchers are ordered by handedness. Each day block shows the highest-priority session for that date, with same-day context shown on the second line.</span>
    </div>
    <div class="monitoring-legend">
      <span class="monitoring-legend-label">Legend</span>
      <span class="monitoring-legend-text">P = Pitches, IP = Innings, R = Rest, L = Leverage, 7d = 7d Rolling Game Average, 28d = 28d Rolling Average, ACR = Acute:Chronic Pitching Workload Ratio, HS = High Stress Outing, HWL = High Workload, Lev = Leverage, Velo = FB Velocity</span>
    </div>
  `;
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

function monitoringCss() {
  return `
    @page { size: letter landscape; margin: 5.5mm 6mm; }

    html, body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .report-page {
      width: 100%;
      padding: 6px 9px 6px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .report-page-break {
      break-after: page;
      page-break-after: always;
    }

    .report-header {
      align-items: flex-start;
      margin-bottom: 8px;
      padding-bottom: 7px;
      border-bottom: 1px solid #d6dde7;
      box-shadow: inset 0 -2px 0 rgba(255, 89, 16, 0.8);
      gap: 14px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .report-header-left {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 5px;
      min-width: 0;
      flex: 1;
    }
    .report-kicker {
      font-size: 6.45px;
      font-weight: 700;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: #64748b;
    }
    .report-title-row {
      display: flex;
      align-items: center;
      gap: 9px;
      min-width: 0;
    }
    .report-title-block {
      min-width: 0;
    }
    .report-logo {
      width: 25px;
      height: 25px;
      flex-shrink: 0;
    }
    .report-title {
      font-size: 15.1px;
      font-weight: 800;
      letter-spacing: 0.04em;
      line-height: 0.98;
      color: #0f294d;
    }
    .report-subtitle {
      margin-top: 3px;
      display: flex;
      align-items: center;
      gap: 5px;
      flex-wrap: wrap;
      font-size: 7.15px;
      line-height: 1.14;
    }
    .report-date {
      color: #1f2937;
      font-weight: 700;
    }
    .report-context {
      color: #64748b;
      font-weight: 600;
    }
    .report-context-sep {
      color: #94a3b8;
      font-weight: 700;
    }
    .report-meta {
      min-width: 112px;
      padding: 3px 0 0 12px;
      border-left: 1px solid #d6dde7;
      font-size: 7.1px;
      line-height: 1.15;
      text-align: right;
    }
    .report-meta-label {
      display: block;
      font-size: 6.15px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #64748b;
    }
    .report-count {
      display: block;
      margin-top: 1px;
      font-size: 15.4px;
      font-weight: 800;
      color: #0f294d;
      line-height: 1;
    }
    .report-count-label {
      display: block;
      margin-top: 2px;
      font-size: 6px;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: #64748b;
    }
    .report-generated {
      display: block;
      margin-top: 5px;
      font-size: 6.45px;
      font-weight: 600;
      line-height: 1.16;
      color: #475569;
    }

    .monitoring-table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      border: 1.5px solid ${ALT_COLORS.grayBorder};
      font-variant-numeric: tabular-nums;
      background: #ffffff;
      box-shadow: 0 0 0 1px rgba(15, 41, 77, 0.04);
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .monitoring-table thead th {
      background: ${ALT_COLORS.metsBlue};
      color: ${COLORS.white};
      border-right: 1px solid rgba(255, 255, 255, 0.14);
      padding: 4px 4px;
      font-size: 6.75px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.11em;
      text-align: center;
      white-space: nowrap;
    }
    .monitoring-table thead th.fixed-col {
      text-align: left;
    }
    .monitoring-table thead th.align-center {
      text-align: center;
    }
    .monitoring-table .group-row th {
      background: ${ALT_COLORS.metsBlue};
      color: ${COLORS.white};
      font-size: 6.05px;
      padding: 3px 4px 2px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    }
    .monitoring-table .group-row th.group-past {
      border-left: 2px solid ${ALT_COLORS.divider};
    }
    .monitoring-table .group-row th.group-current {
      color: ${COLORS.white};
      background: ${ALT_COLORS.metsBlue};
      border-left: 2px solid ${ALT_COLORS.divider};
      border-right: 2px solid ${ALT_COLORS.divider};
    }
    .monitoring-table .group-row th.group-future {
      background: ${ALT_COLORS.metsBlue};
    }
    .monitoring-table .main-row th.col-current {
      background: #12356f;
      color: ${COLORS.white};
      box-shadow: none;
    }
    .monitoring-table .main-row th.col-future {
      background: ${ALT_COLORS.metsBlue};
    }
    .monitoring-table .main-row th.col-first-date,
    .monitoring-table td.col-first-date {
      border-left: 2px solid ${ALT_COLORS.divider};
    }
    .monitoring-table .main-row th.col-boundary,
    .monitoring-table td.col-boundary {
      border-left: 2px solid ${ALT_COLORS.divider};
    }
    .monitoring-table .main-row th {
      border-bottom: 2px solid ${ALT_COLORS.metsOrange};
    }
    .monitoring-table .rail-header {
      border-left: 2px solid ${ALT_COLORS.divider};
    }
    .monitoring-table th:last-child,
    .monitoring-table td:last-child {
      border-right: 0;
    }
    .monitoring-table td {
      padding: 3px 5px;
      border-right: 1px solid ${ALT_COLORS.grayBorder};
      border-bottom: 1px solid ${ALT_COLORS.grayBorder};
      font-size: 7.1px;
      color: ${COLORS.text};
      text-align: center;
      vertical-align: middle;
      background: #ffffff;
      white-space: nowrap;
    }
    .monitoring-table td.meta-cell {
      background: #ffffff;
      vertical-align: top;
    }
    .monitoring-table tbody tr:last-child td {
      border-bottom: 0;
    }
    .monitoring-table td.col-current {
      background: #fbfdff;
    }
    .monitoring-table td.col-future {
      background: ${ALT_COLORS.futureWash};
    }
    .monitoring-table td.text-left {
      text-align: left;
    }
    .monitoring-table td.day-cell {
      padding: 0;
      background: ${ALT_COLORS.whiteSmoke};
    }
    .monitoring-table td.pitcher-meta-cell {
      border-left: 1px solid ${ALT_COLORS.divider};
      border-right: 1px solid ${ALT_COLORS.divider};
      background: #ffffff;
    }
    .monitoring-table td.typical-meta-cell {
      background: #ffffff;
    }
    .monitoring-table td.rest-meta-cell {
      background: #ffffff;
      border-right: 1px solid ${ALT_COLORS.divider};
    }
    .monitoring-table td.load-meta-cell {
      background: #ffffff;
      border-right: 2px solid ${ALT_COLORS.divider};
    }
    .monitoring-table tbody[data-density="compact"] td {
      padding: 3px 4px;
      font-size: 6.95px;
    }
    .monitoring-table tbody[data-density="ultra"] td {
      padding: 2px 3px;
      font-size: 6.35px;
    }

    .pitcher-cell {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 1px;
      min-width: 0;
    }
    .pitcher-name {
      font-size: 8.45px;
      font-weight: 700;
      line-height: 1.1;
      color: ${COLORS.text};
      white-space: normal;
    }
    .pitcher-name-left {
      color: #c81e1e;
    }
    .monitoring-table tbody[data-density="compact"] .pitcher-name {
      font-size: 8.35px;
    }
    .monitoring-table tbody[data-density="ultra"] .pitcher-name {
      font-size: 7.55px;
    }

    .rest-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 15px;
      border-radius: 999px;
      box-sizing: border-box;
      padding: 0 6px;
      font-size: 6.55px;
      font-weight: 700;
      line-height: 1;
      text-align: center;
      letter-spacing: 0.02px;
      font-variant-numeric: tabular-nums;
      border: 1px solid ${ALT_COLORS.grayBorder};
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.38);
    }
    .pill-text {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      max-width: 100%;
      line-height: 1;
      text-align: center;
      white-space: nowrap;
    }
    .rest-pill,
    .flag-badge,
    .activity-cell {
      border-radius: 999px;
    }
    .rest-pill,
    .flag-badge {
      height: 14px;
    }
    .rest-pill {
      min-width: 20px;
      padding: 0 7px;
    }
    .rest-red { background: #f3e1dc; color: #7b332b; }
    .rest-amber { background: #fdf3d4; color: #74502a; }
    .rest-green { background: ${ALT_COLORS.palaceBlue}; color: #35506d; }

    .wl-cell {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 2px;
      width: 100%;
      line-height: 1.04;
      padding: 1px 0;
    }
    .wl-row {
      display: grid;
      grid-template-columns: 20px minmax(0, 1fr);
      align-items: center;
      column-gap: 3px;
      width: 100%;
      padding-bottom: 1px;
    }
    .wl-label {
      color: #6b7280;
      font-weight: 700;
      font-size: 5.75px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .wl-value {
      font-weight: 700;
      color: ${COLORS.text};
      font-size: 6.85px;
      text-align: right;
    }
    .wl-row-primary .wl-value {
      color: #172536;
    }
    .wl-row-acr {
      margin-top: 1px;
      padding-top: 2px;
      border-top: 1px solid ${ALT_COLORS.grayBorder};
    }
    .wl-row-acr .wl-value {
      font-size: 7.05px;
      color: #0f294d;
    }
    .wl-row-frequency .wl-value {
      color: #475569;
    }
    .typical-cell {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 3px;
      width: 100%;
      line-height: 1.08;
      padding: 2px 0 1px;
    }
    .typical-row {
      display: grid;
      grid-template-columns: 14px minmax(0, 1fr);
      align-items: center;
      column-gap: 4px;
      width: 100%;
      min-height: 11px;
      padding-bottom: 0;
    }
    .typical-label {
      color: #7b8796;
      font-weight: 700;
      letter-spacing: 0.05em;
      font-size: 5.75px;
      text-transform: uppercase;
    }
    .typical-value {
      font-weight: 700;
      color: #18212f;
      text-align: right;
      min-width: 0;
      font-size: 6.95px;
    }
    .typical-row-leverage {
      margin-top: 0;
      padding-top: 2px;
      border-top: 1px solid ${ALT_COLORS.grayBorder};
    }
    .typical-row-leverage .typical-value {
      color: #111827;
      font-size: 6.7px;
      padding: 1px 5px;
      border-radius: 6px;
      text-align: center;
      justify-self: end;
      border: 1px solid transparent;
      min-width: 25px;
    }
    .typical-value-li-low {
      color: #111827;
      background: ${ALT_COLORS.leverageLow};
      border-color: ${ALT_COLORS.leverageLowBorder};
    }
    .typical-value-li-medium {
      color: #111827;
      background: ${ALT_COLORS.leverageMedium};
      border-color: ${ALT_COLORS.leverageMediumBorder};
    }
    .typical-value-li-high {
      color: #111827;
      background: ${ALT_COLORS.leverageHigh};
      border-color: ${ALT_COLORS.leverageHighBorder};
    }

    .date-header-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0;
      line-height: 1.05;
    }
    .date-header-top {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 2px;
    }
    .date-header-date {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.01em;
    }
    .date-header-day {
      font-size: 6.2px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.88);
      letter-spacing: 0.1em;
    }
    .date-header-matchup {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    .date-header-matchup-prefix {
      font-size: 5.2px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.9);
      letter-spacing: 0.06em;
    }
    .opp-logo {
      width: 10px;
      height: 10px;
      object-fit: contain;
    }

    .day-block {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      min-height: 35px;
      width: 100%;
      height: 100%;
      padding: 5px 4px 4px;
      border: 0;
      box-sizing: border-box;
      background: ${ALT_COLORS.whiteSmoke};
      text-align: center;
    }
    .monitoring-table tbody[data-density="compact"] .day-block {
      min-height: 32px;
      padding: 4px 3px 3px;
    }
    .monitoring-table tbody[data-density="ultra"] .day-block {
      min-height: 29px;
      padding: 3px 2px 2px;
    }
    .day-block-text-top {
      display: block;
      max-width: 100%;
      font-size: 8px;
      font-weight: 800;
      line-height: 1.04;
      color: #111827;
      letter-spacing: 0;
      white-space: normal;
    }
    .day-block-text-bottom {
      display: block;
      max-width: 100%;
      font-size: 5.4px;
      font-weight: 700;
      line-height: 1.02;
      color: #6b7280;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      white-space: normal;
    }
    .monitoring-table tbody[data-density="compact"] .day-block-text-top {
      font-size: 7.45px;
    }
    .monitoring-table tbody[data-density="compact"] .day-block-text-bottom {
      font-size: 5.25px;
    }
    .monitoring-table tbody[data-density="ultra"] .day-block-text-top {
      font-size: 6.95px;
    }
    .monitoring-table tbody[data-density="ultra"] .day-block-text-bottom {
      font-size: 5px;
    }
    .day-block-neutral {
      background: #f3f5f7;
    }
    .day-block-heat-1 {
      background: ${ALT_COLORS.dayHeat1};
    }
    .day-block-heat-2 {
      background: ${ALT_COLORS.dayHeat2};
    }
    .day-block-heat-3 {
      background: ${ALT_COLORS.dayHeat3};
    }
    .day-block-heat-4 {
      background: ${ALT_COLORS.dayHeat4};
    }
    .day-block-heat-5 {
      background: ${ALT_COLORS.dayHeat5};
    }
    .monitoring-table td.col-current .day-block {
      background-image: linear-gradient(to bottom, rgba(18, 53, 111, 0.03), rgba(18, 53, 111, 0.01));
    }
    .day-cell .empty-cell {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-height: 35px;
      background: #f3f5f7;
      color: #c4c4c4;
      font-size: 7px;
      letter-spacing: 0.04em;
    }

    .rail-cell {
      padding: 0 !important;
      background: ${ALT_COLORS.whiteSmoke} !important;
    }
    .flags-rail-cell {
      border-left: 2px solid ${ALT_COLORS.divider};
    }
    .trend-rail-cell {
      background: ${ALT_COLORS.whiteSmoke} !important;
    }
    .rail-panel {
      min-height: 35px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px 5px;
    }
    .monitoring-table tbody[data-density="compact"] .rail-panel {
      min-height: 32px;
      padding: 3px 4px;
    }
    .monitoring-table tbody[data-density="ultra"] .rail-panel {
      min-height: 29px;
      padding: 2px 3px;
    }
    .rail-panel-trend .sparkline-wrap {
      width: 100%;
      min-height: 100%;
    }

    .flag-stack {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 2px;
      min-height: 14px;
    }
    .flag-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 28px;
      min-height: 11px;
      box-sizing: border-box;
      padding: 0 5px;
      font-size: 5.35px;
      font-weight: 700;
      line-height: 1;
      letter-spacing: 0.04em;
      border: 1px solid rgba(169, 169, 169, 0.72);
      box-shadow: none;
    }
    .flag-b2b { background: #f7efe3; color: #6a5230; }
    .flag-3of5 { background: #f5ece5; color: #715443; }
    .flag-popop { background: #ebf0f6; color: #47627b; }
    .flag-rel { background: #f5efe6; color: #6f5940; }
    .flag-lev { background: #f2efe5; color: #5d6341; }
    .flag-hw { background: #f2dfd9; color: #6d4946; }
    .flag-hs { background: #f3e5e4; color: #6c4a5c; }
    .flag-empty,
    .empty-cell {
      color: #9aa5b1;
      font-weight: 600;
    }

    .trend-cell {
      padding: 2px 5px;
    }
    .sparkline-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .monitoring-legend {
      margin-top: 2px;
      padding-top: 3px;
      text-align: left;
      display: flex;
      align-items: baseline;
      gap: 8px;
      flex-wrap: wrap;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .monitoring-caption {
      margin-top: 5px;
      padding-top: 4px;
      border-top: 1px solid ${ALT_COLORS.grayBorder};
      text-align: left;
      display: flex;
      align-items: baseline;
      gap: 8px;
      flex-wrap: wrap;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .monitoring-caption-label {
      font-size: 6px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #64748b;
    }
    .monitoring-caption-text {
      display: inline-block;
      font-size: 5.95px;
      line-height: 1.22;
      color: #667085;
      letter-spacing: 0;
      orphans: 2;
      widows: 2;
    }
    .monitoring-legend-label {
      font-size: 6px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #64748b;
    }
    .monitoring-legend-text {
      display: inline-block;
      font-size: 5.95px;
      line-height: 1.22;
      color: #667085;
      letter-spacing: 0;
      orphans: 2;
      widows: 2;
    }

    .recent-usage-section {
      margin-top: 8px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .recent-usage-title {
      padding: 4px 8px 4px;
      border: 1px solid ${ALT_COLORS.grayBorder};
      border-bottom: 0;
      background: ${ALT_COLORS.metsBlue};
      color: ${COLORS.white};
      font-size: 7.25px;
      font-weight: 800;
      text-align: left;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .recent-usage-table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      border: 1px solid ${ALT_COLORS.grayBorder};
      font-variant-numeric: tabular-nums;
      background: #ffffff;
    }
    .recent-usage-table th {
      padding: 4px 3px;
      border-right: 1px solid rgba(255, 255, 255, 0.18);
      border-bottom: 2px solid ${ALT_COLORS.metsOrange};
      background: ${ALT_COLORS.metsBlue};
      color: ${COLORS.white};
      font-size: 6.15px;
      font-weight: 800;
      text-align: center;
      line-height: 1.1;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .recent-usage-table th:last-child,
    .recent-usage-table td:last-child {
      border-right: 0;
    }
    .recent-usage-row td {
      border-right: 1px solid ${ALT_COLORS.grayBorder};
      border-bottom: 1px solid ${ALT_COLORS.whiteSmoke};
      padding: 4px 5px;
      vertical-align: middle;
      background: #ffffff;
    }
    .recent-usage-section[data-density="sparse"] .recent-usage-row td {
      padding: 3px 5px;
    }
    .recent-usage-table tbody tr:nth-child(even) td {
      background: ${ALT_COLORS.whiteSmoke};
    }
    .recent-usage-row-starter td {
      border-bottom: 2px solid ${ALT_COLORS.metsOrange};
      background: ${ALT_COLORS.palaceBlue};
    }
    .recent-usage-table tbody tr:last-child td {
      border-bottom: 0;
    }
    .recent-usage-name-cell {
      font-size: 7.2px;
      font-weight: 700;
      line-height: 1.08;
      text-align: left;
      white-space: nowrap;
    }
    .recent-usage-name-left { color: #dc2626; }
    .recent-usage-name-right { color: ${COLORS.text}; }
    .recent-usage-name-switch { color: ${ALT_COLORS.metsOrange}; }
    .recent-usage-name-starter { font-style: italic; }
    .recent-usage-name-empty { color: transparent; }
    .recent-usage-context-cell {
      padding-top: 3px;
      padding-bottom: 3px;
    }
    .recent-usage-section[data-density="sparse"] .recent-usage-context-cell {
      padding-top: 2px;
      padding-bottom: 2px;
    }
    .recent-usage-context-top {
      min-height: 8px;
      font-size: 6.05px;
      font-weight: 700;
      line-height: 1.06;
      color: ${COLORS.text};
      white-space: nowrap;
    }
    .recent-usage-context-bottom {
      min-height: 7px;
      margin-top: 1px;
      font-size: 5.45px;
      line-height: 1.06;
      color: #667085;
      white-space: nowrap;
    }
    .recent-usage-context-high { background: ${ALT_COLORS.leverageHigh} !important; }
    .recent-usage-context-medium { background: ${ALT_COLORS.leverageMedium} !important; }
    .recent-usage-context-low { background: ${ALT_COLORS.leverageLow} !important; }
    .recent-usage-context-neutral { background: ${ALT_COLORS.whiteSmoke} !important; }
    .recent-usage-context-starter,
    .recent-usage-context-empty {
      background: #fbfcfe !important;
    }
  `;
}

function classicBullpenMonitoringCss() {
  return `
    @page { size: letter landscape; margin: 5.5mm 6mm; }

    html, body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .classic-report-page {
      width: 100%;
      padding: 3px 5px 5px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .report-page-break {
      break-after: page;
      page-break-after: always;
    }
    .classic-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 12px;
      position: relative;
      padding-bottom: 5px;
      margin-bottom: 5px;
      border-bottom: 1px solid ${ALT_COLORS.grayBorder};
    }
    .classic-header::after {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      bottom: -1px;
      height: 2px;
      background: ${ALT_COLORS.metsOrange};
    }
    .classic-header-main {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      flex: 1;
    }
    .classic-header-kicker {
      font-size: 5.55px;
      font-weight: 800;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #64748b;
    }
    .classic-header-title-row {
      display: flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
    }
    .classic-header-logo-shell {
      width: 21px;
      height: 21px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid #d9e1ea;
      border-radius: 999px;
      background: #ffffff;
      flex-shrink: 0;
    }
    .classic-header-title-block {
      min-width: 0;
    }
    .classic-header-title {
      font-size: 12.8px;
      line-height: 1;
      font-weight: 800;
      letter-spacing: 0.03em;
      color: ${ALT_COLORS.metsBlue};
      text-transform: uppercase;
    }
    .classic-header-meta {
      margin-top: 2px;
      font-size: 5.95px;
      font-weight: 600;
      color: #475569;
      line-height: 1.15;
      white-space: normal;
    }
    .classic-header-side {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      justify-content: flex-end;
      gap: 1px;
      min-width: 118px;
      padding-left: 10px;
      border-left: 1px solid #dbe2eb;
    }
    .classic-header-logo {
      width: 15px;
      height: 15px;
      object-fit: contain;
    }
    .classic-header-side-label {
      font-size: 5.25px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #64748b;
      line-height: 1;
    }
    .classic-header-generated {
      font-size: 5.55px;
      font-weight: 700;
      color: #475569;
      line-height: 1.1;
      text-align: right;
    }

    .classic-board-table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      border: 1.35px solid ${ALT_COLORS.divider};
      background: #ffffff;
      font-variant-numeric: tabular-nums;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .classic-board-table th,
    .classic-board-table td {
      border-right: 1px solid ${ALT_COLORS.grayBorder};
      border-bottom: 1px solid ${ALT_COLORS.grayBorder};
      padding: 2px 4px;
      font-size: 6.35px;
      line-height: 1.08;
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
      padding: 0 4px 4px;
      background: transparent !important;
      color: #111827;
      font-size: 5.75px;
      font-weight: 800;
      letter-spacing: 0.02em;
      text-transform: none;
      text-align: center;
    }
    .classic-group-spacer {
      padding: 0 !important;
    }
    .classic-group-current {
      color: #0f172a;
    }
    .classic-main-row th {
      background: ${ALT_COLORS.metsBlue};
      color: ${COLORS.white};
      font-size: 5.95px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 3px 4px;
      border-bottom: 2px solid ${ALT_COLORS.metsOrange};
    }
    .classic-main-row th.col-first-date,
    .classic-board-table td.col-first-date {
      border-left: 2px solid ${ALT_COLORS.divider};
    }
    .classic-main-row th.col-boundary,
    .classic-board-table td.col-boundary {
      border-left: 2px solid ${ALT_COLORS.divider};
    }
    .classic-main-row th.col-current {
      background: #12356f;
    }
    .classic-fixed {
      text-align: center;
    }
    .classic-fixed-pitcher {
      text-align: left !important;
    }
    .classic-fixed-days-off,
    .classic-meta-cell-days-off {
      border-right: 2px solid ${ALT_COLORS.divider} !important;
    }
    .classic-text-left {
      text-align: left !important;
    }
    .classic-pitcher-cell,
    .classic-meta-cell {
      background: #ffffff;
    }
    .classic-pitcher-cell {
      padding-left: 6px !important;
      border-left: 1px solid ${ALT_COLORS.divider};
    }
    .classic-meta-cell {
      font-size: 6.05px;
      color: #111827;
    }
    .classic-pitcher-name {
      display: inline-block;
      max-width: 100%;
      font-size: 7px;
      font-weight: 700;
      line-height: 1.04;
    }
    .classic-pitcher-name-left { color: #dc2626; }
    .classic-pitcher-name-right { color: #111827; }
    .classic-pitcher-name-switch { color: ${ALT_COLORS.metsOrange}; }
    .classic-leverage-value,
    .classic-length-value,
    .classic-days-off-value {
      display: inline-block;
      width: 100%;
    }
    .classic-leverage-value {
      padding: 3px 2px;
      font-size: 6.05px;
      font-weight: 700;
      font-style: italic;
      line-height: 1.04;
    }
    .classic-leverage-high { background: ${ALT_COLORS.leverageHigh}; }
    .classic-leverage-medium { background: ${ALT_COLORS.leverageMedium}; }
    .classic-leverage-low { background: ${ALT_COLORS.leverageLow}; }
    .classic-length-value,
    .classic-days-off-value {
      color: #111827;
      font-weight: 600;
      line-height: 1.04;
    }

    .classic-date-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0;
      line-height: 1;
    }
    .classic-date-header-date {
      font-size: 9px;
      font-weight: 800;
      line-height: 1;
    }
    .classic-date-header-day {
      margin-top: 1px;
      font-size: 5.6px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: rgba(255,255,255,0.88);
    }

    .classic-day-cell {
      padding: 0 !important;
      background: #ffffff;
    }
    .classic-day-board {
      min-height: 27px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1px;
      width: 100%;
      padding: 2px 2px 1px;
      background: #ffffff;
    }
    .classic-day-board-top {
      display: block;
      max-width: 100%;
      font-size: 6.65px;
      font-weight: 800;
      line-height: 1.02;
      color: #111827;
      white-space: nowrap;
    }
    .classic-day-board-bottom {
      display: block;
      max-width: 100%;
      font-size: 5.1px;
      font-weight: 700;
      line-height: 1.02;
      color: #5b6472;
      text-transform: none;
      white-space: nowrap;
    }
    .classic-day-board-empty {
      background: ${ALT_COLORS.whiteSmoke};
    }
    .classic-day-board-future-empty {
      background: ${ALT_COLORS.futureWash};
    }
    .classic-board-table td.col-future {
      background: ${ALT_COLORS.futureWash};
    }
    .classic-board-table td.col-current {
      background: #fcfdff;
    }
    .classic-board-table .day-block-neutral {
      background: #ffffff;
    }
    .classic-board-table .day-block-heat-1 {
      background: ${ALT_COLORS.dayHeat1};
    }
    .classic-board-table .day-block-heat-2 {
      background: ${ALT_COLORS.dayHeat2};
    }
    .classic-board-table .day-block-heat-3 {
      background: ${ALT_COLORS.dayHeat3};
    }
    .classic-board-table .day-block-heat-4 {
      background: ${ALT_COLORS.dayHeat4};
    }
    .classic-board-table .day-block-heat-5 {
      background: ${ALT_COLORS.dayHeat5};
    }

    .classic-footnotes {
      margin-top: 4px;
      border-top: 1px solid ${ALT_COLORS.grayBorder};
      padding-top: 3px;
    }
    .classic-report-meta {
      display: grid;
      gap: 2px;
    }
    .classic-report-meta-row {
      display: grid;
      grid-template-columns: 33px 1fr;
      column-gap: 8px;
      align-items: baseline;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .classic-report-meta-label {
      font-size: 5.55px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #64748b;
    }
    .classic-report-meta-text {
      font-size: 5.5px;
      line-height: 1.18;
      color: #667085;
      orphans: 2;
      widows: 2;
    }

    .classic-recent-section,
    .classic-comments-section {
      margin-top: 5px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .classic-recent-table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      border: 1px solid ${ALT_COLORS.divider};
      background: #ffffff;
      font-variant-numeric: tabular-nums;
    }
    .classic-recent-table th,
    .classic-recent-table td {
      border-right: 1px solid ${ALT_COLORS.grayBorder};
      border-bottom: 1px solid ${ALT_COLORS.grayBorder};
      padding: 2px 4px;
      font-size: 5.8px;
      line-height: 1.05;
      vertical-align: middle;
    }
    .classic-recent-table th:last-child,
    .classic-recent-table td:last-child {
      border-right: 0;
    }
    .classic-recent-superhead th {
      padding: 3px 6px;
      background: ${ALT_COLORS.metsBlue};
      color: ${COLORS.white};
      border-bottom: 1px solid rgba(255, 255, 255, 0.18);
      font-size: 5.95px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      text-align: left;
    }
    .classic-recent-gamehead th {
      padding: 3px 3px;
      background: ${ALT_COLORS.metsBlue};
      color: ${COLORS.white};
      border-bottom: 2px solid ${ALT_COLORS.metsOrange};
      font-size: 5.55px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      text-align: center;
    }
    .classic-recent-row td {
      background: #ffffff;
    }
    .classic-recent-row:nth-child(even) td {
      background: #fbfcfd;
    }
    .classic-recent-row-starter td {
      background: ${ALT_COLORS.palaceBlue};
      border-bottom: 2px solid ${ALT_COLORS.metsOrange};
    }
    .classic-recent-section[data-density="sparse"] .classic-recent-table td {
      padding-top: 1px;
      padding-bottom: 1px;
    }
    .classic-recent-table .recent-usage-name-cell {
      font-size: 6px;
      font-weight: 700;
      text-align: left;
      white-space: nowrap;
    }
    .classic-recent-table .recent-usage-name-left { color: #dc2626; }
    .classic-recent-table .recent-usage-name-right { color: #111827; }
    .classic-recent-table .recent-usage-name-switch { color: ${ALT_COLORS.metsOrange}; }
    .classic-recent-table .recent-usage-name-starter {
      font-style: italic;
      color: #111827;
    }
    .classic-recent-table .recent-usage-name-empty {
      color: transparent;
    }
    .classic-recent-table .recent-usage-context-cell {
      background: #ffffff;
    }
    .classic-recent-table .recent-usage-context-top {
      min-height: 7px;
      font-size: 5.7px;
      font-weight: 700;
      line-height: 1.02;
      color: #111827;
      white-space: nowrap;
    }
    .classic-recent-table .recent-usage-context-bottom {
      min-height: 6px;
      margin-top: 1px;
      font-size: 5.1px;
      line-height: 1.02;
      color: #667085;
      white-space: nowrap;
    }
    .classic-recent-section[data-density="sparse"] .recent-usage-context-top {
      min-height: 6px;
    }
    .classic-recent-section[data-density="sparse"] .recent-usage-context-bottom {
      min-height: 5px;
    }
    .classic-recent-table .recent-usage-context-high { background: ${ALT_COLORS.leverageHigh} !important; }
    .classic-recent-table .recent-usage-context-medium { background: ${ALT_COLORS.leverageMedium} !important; }
    .classic-recent-table .recent-usage-context-low { background: ${ALT_COLORS.leverageLow} !important; }
    .classic-recent-table .recent-usage-context-neutral { background: ${ALT_COLORS.whiteSmoke} !important; }
    .classic-recent-table .recent-usage-context-starter,
    .classic-recent-table .recent-usage-context-empty {
      background: #fbfcfe !important;
    }

    .classic-comments-table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      border: 1px solid ${ALT_COLORS.divider};
      background: #ffffff;
    }
    .classic-comments-table th,
    .classic-comments-table td {
      border-bottom: 1px solid ${ALT_COLORS.grayBorder};
      vertical-align: top;
    }
    .classic-comments-table thead th {
      padding: 3px 6px;
      background: ${ALT_COLORS.metsBlue};
      color: ${COLORS.white};
      border-bottom: 2px solid ${ALT_COLORS.metsOrange};
      font-size: 5.95px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      text-align: left;
    }
    .classic-comments-table tbody td {
      padding: 0;
      border-bottom: 0;
    }

    .classic-comments-body {
      background: #ffffff;
      padding: 0 6px;
      min-height: 56px;
    }
    .classic-comments-line {
      min-height: 18px;
      border-bottom: 1px solid ${ALT_COLORS.grayBorder};
      font-size: 5.9px;
      line-height: 17px;
      color: #475569;
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

// ─── Template Builders ───────────────────────────────────────────────────────

function buildSubtitleHtml({ displayDate, roleLabel, activityFilter, rosterFilter, workloadViewLabel }) {
  const filters = [];
  if (roleLabel) filters.push(roleLabel);
  if (activityFilter && activityFilter !== "ALL") filters.push(activityFilter);
  if (rosterFilter && rosterFilter !== "ALL") filters.push(rosterFilter);
  if (workloadViewLabel) filters.push(workloadViewLabel);

  const filterHtml = filters.map((filter) => (
    `<span class="report-context-sep">·</span><span class="report-context">${escapeHtml(filter)}</span>`
  )).join("");

  return `
    <div class="report-subtitle">
      <span class="report-date">${escapeHtml(displayDate)}</span>
      ${filterHtml}
    </div>
  `;
}

function buildDateHeaderCell(column, classes) {
  let opponentHtml = "";

  if (column.opponent) {
    const prefix = column.opponent.homeAway === "home" ? "vs" : "@";
    if (column.opponent.logoUrl) {
      opponentHtml = `
        <span class="date-header-matchup-prefix">${escapeHtml(prefix)}</span>
        <img class="opp-logo" src="${escapeHtml(column.opponent.logoUrl)}" alt="" />
      `;
    } else {
      opponentHtml = `
        <span class="date-header-matchup-prefix">${escapeHtml(`${prefix} ${column.opponent.teamName || ""}`)}</span>
      `;
    }
  }

  return `
    <th class="${classes}">
      <div class="date-header-wrap">
        <div class="date-header-top">
          <span class="date-header-date">${escapeHtml(column.displayDate || "")}</span>
          ${opponentHtml}
        </div>
        <span class="date-header-day">${escapeHtml(column.dayOfWeek || "")}</span>
      </div>
    </th>
  `;
}

function buildTableHeaderHtml({ dateColumns, selectedIndex, firstFutureIndex, futureCount, trendWidth }) {
  const dateHeaderCells = dateColumns.map((column, index) => (
    buildDateHeaderCell(column, buildColumnClasses(index, selectedIndex, firstFutureIndex))
  )).join("");

  if (futureCount > 0) {
    const pastCount = Math.max(selectedIndex, 0);
    return `
      <tr class="group-row">
        <th class="fixed-col fixed-pitcher" rowspan="2" style="width:${COLUMN_WIDTHS.pitcher}px">Pitcher</th>
        <th class="fixed-col fixed-typical align-center" rowspan="2" style="width:${COLUMN_WIDTHS.typical}px">Typical</th>
        <th class="fixed-col fixed-rest align-center" rowspan="2" style="width:${COLUMN_WIDTHS.rest}px">Rest</th>
        <th class="fixed-col fixed-wl align-center" rowspan="2" style="width:${COLUMN_WIDTHS.wl}px">Load</th>
        ${pastCount > 0 ? `<th class="group-past" colspan="${pastCount}">Past ${pastCount}</th>` : ""}
        ${selectedIndex >= 0 ? '<th class="group-current" colspan="1">Today</th>' : ""}
        <th class="group-future" colspan="${futureCount}">Planned ${futureCount}</th>
        <th class="align-center rail-header flags-header" rowspan="2" style="width:${COLUMN_WIDTHS.flags}px">Flags</th>
        <th class="align-center rail-header trend-header" rowspan="2" style="width:${trendWidth}px">Trend</th>
      </tr>
      <tr class="main-row">
        ${dateHeaderCells}
      </tr>
    `;
  }

  return `
    <tr class="main-row">
      <th class="fixed-col fixed-pitcher" style="width:${COLUMN_WIDTHS.pitcher}px">Pitcher</th>
      <th class="fixed-col fixed-typical align-center" style="width:${COLUMN_WIDTHS.typical}px">Typical</th>
      <th class="fixed-col fixed-rest align-center" style="width:${COLUMN_WIDTHS.rest}px">Rest</th>
      <th class="fixed-col fixed-wl align-center" style="width:${COLUMN_WIDTHS.wl}px">Load</th>
      ${dateHeaderCells}
      <th class="align-center rail-header flags-header" style="width:${COLUMN_WIDTHS.flags}px">Flags</th>
      <th class="align-center rail-header trend-header" style="width:${trendWidth}px">Trend</th>
    </tr>
  `;
}

function buildPitcherRowsHtml({ pitchers, dateColumnCount, sparkWidth, sparkHeight, selectedIndex, firstFutureIndex, activityFilter }) {
  return (pitchers || []).map((pitcher) => {
    const daily = pitcher.daily || [];
    const dateCells = dateColumnCount > 0
      ? Array.from({ length: dateColumnCount }).map((_, index) => {
          const classes = [buildColumnClasses(index, selectedIndex, firstFutureIndex), "day-cell"].filter(Boolean).join(" ");
          return `<td class="${classes}">${buildDailyCell(daily[index] || null, activityFilter)}</td>`;
        }).join("")
      : "";

    return `
      <tr>
        <td class="text-left meta-cell pitcher-meta-cell">
          <div class="pitcher-cell">
            <div class="${getPitcherNameClass(pitcher)}">${escapeHtml(pitcher.pitcher_name_last_first || "—")}</div>
          </div>
        </td>
        <td class="text-left meta-cell typical-meta-cell">${buildTypicalUsageCell(pitcher)}</td>
        <td class="meta-cell rest-meta-cell">${buildRestPill(pitcher.days_of_rest)}</td>
        <td class="text-left meta-cell load-meta-cell">${buildWorkloadCell(pitcher)}</td>
        ${dateCells}
        <td class="rail-cell flags-rail-cell">${buildFlagsRail(pitcher.flags)}</td>
        <td class="rail-cell trend-rail-cell">${buildTrendRail(pitcher.sparkline, sparkWidth, sparkHeight)}</td>
      </tr>
    `;
  }).join("");
}

function buildReportPageHtml({
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
}) {
  const density = getDensity(pitchers.length);
  const { width: sparkWidth, height: sparkHeight } = getSparklineSize(density);
  const trendWidth = sparkWidth + 8;
  const headerHtml = buildTableHeaderHtml({
    dateColumns,
    selectedIndex,
    firstFutureIndex,
    futureCount,
    trendWidth,
  });
  const rowsHtml = buildPitcherRowsHtml({
    pitchers,
    dateColumnCount: dateColumns.length,
    sparkWidth,
    sparkHeight,
    selectedIndex,
    firstFutureIndex,
    activityFilter,
  });
  const legendHtml = buildMonitoringLegendHtml();
  const recentUsageHtml = buildRecentUsageSectionHtml(recentRpUsage);

  return `
    <!-- pitcher-monitoring-template:${escapeHtml(PITCHER_MONITORING_BULLPEN_ALT_TEMPLATE_VERSION)} -->
    <section class="page report-page ${pageIndex < totalPages - 1 ? "report-page-break" : ""}" data-role="${escapeHtml(roleLabel || "")}">
      <div class="report-header">
        <div class="report-header-left">
          <div class="report-kicker">Daily Workload Reporting</div>
          <div class="report-title-row">
            <img class="report-logo" src="https://upload.wikimedia.org/wikipedia/en/7/7b/New_York_Mets.svg" alt="Mets" />
            <div class="report-title-block">
              <div class="report-title">${escapeHtml(reportTitle)}</div>
              ${buildSubtitleHtml({ displayDate, roleLabel, activityFilter, rosterFilter, workloadViewLabel })}
            </div>
          </div>
        </div>
        <div class="report-meta">
          <span class="report-meta-label">Pitchers</span>
          <span class="report-count">${pitchers.length}</span>
          <span class="report-count-label">Shareable Daily Snapshot</span>
          <span class="report-generated">Generated ${escapeHtml(generatedDate)}</span>
        </div>
      </div>

      <table class="monitoring-table">
        <thead>
          ${headerHtml}
        </thead>
        <tbody data-density="${density}">
          ${rowsHtml}
        </tbody>
      </table>

      ${legendHtml}
      ${recentUsageHtml}
    </section>
  `;
}

// ─── Main Template ───────────────────────────────────────────────────────────

export function buildPitcherMonitoringBullpenAltReportHtml(data) {
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

  const reportPagesHtml = pages.map((page, pageIndex) => buildReportPageHtml({
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
  })).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <style>
    ${sharedCss()}
    ${monitoringCss()}
  </style>
</head>
<body>
${reportPagesHtml}
</body>
</html>`;
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

function buildPitcherMonitoringBullpenClassicReportHtml(data) {
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
