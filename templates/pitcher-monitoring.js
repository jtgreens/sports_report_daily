/**
 * Pitcher Monitoring PDF template.
 *
 * Renders a simplified workload table that mirrors the live monitoring page
 * more closely than the previous PDF export.
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
export const PITCHER_MONITORING_TEMPLATE_VERSION = "2026-03-20-activity-text-centered";

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
  if (index === selectedIndex) classes.push("col-selected");
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

  return `
    <div class="wl-cell">
      <div class="wl-row"><span class="wl-label">7d:</span><span class="wl-value">${fmtWorkloadWhole(acute)}</span></div>
      <div class="wl-row"><span class="wl-label">28d:</span><span class="wl-value">${fmtWorkloadWhole(chronic)}</span></div>
      <div class="wl-row"><span class="wl-label">ACR:</span><span class="wl-value">${fmtWorkloadCompact(acr)}</span></div>
      <div class="wl-row"><span class="wl-label">5d:</span><span class="wl-value">${pitchedDaysLast5}/5</span></div>
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
    { label: "P", value: fmtTypicalPitchCount(typicalUsage.pitches_label) },
    { label: "IP", value: typicalUsage.innings_label || "—" },
    { label: "R", value: typicalUsage.rest_label || "—" },
    {
      label: "L",
      value: leverageBucket.value,
      valueClass: leverageBucket.valueClass,
    },
  ];

  return `
    <div class="typical-cell">
      ${rows.map((row) => (
        `<div class="typical-row"><span class="typical-label">${escapeHtml(row.label)}</span><span class="typical-value${row.valueClass ? ` ${row.valueClass}` : ""}">${escapeHtml(row.value)}</span></div>`
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

function buildSessionPill(label, className) {
  if (label && typeof label === "object") {
    return `
      <span class="activity-cell ${className}">
        <span class="pill-text">
          <span class="pill-prefix">${escapeHtml(label.prefix || "")}</span>
          <span class="pill-detail">${escapeHtml(label.detail || "")}</span>
        </span>
      </span>
    `;
  }

  return `<span class="activity-cell ${className}"><span class="pill-text">${escapeHtml(label)}</span></span>`;
}

function getSessionDisplayInnings(session) {
  const inningsValue = safeNum(session?.innings);
  if (inningsValue != null && inningsValue > 0) return inningsValue;

  const outsValue = safeNum(session?.outs);
  if (outsValue == null || outsValue <= 0) return null;

  return Math.floor(outsValue / 3) + ((outsValue % 3) / 10);
}

function buildSessionPitchLabel(prefix, pitches, session) {
  const displayInnings = getSessionDisplayInnings(session);
  const inningsText = fmtInningsCompact(displayInnings);
  return {
    prefix,
    detail: inningsText != null
      ? `${inningsText} IP ${pitches} P`
      : `${pitches} P`,
  };
}

function buildDailyCell(dayData, activityFilter) {
  if (!dayData) return '<span class="empty-cell">—</span>';

  const gameOnly = activityFilter === "GAME";
  const pills = [];
  const bullpen = dayData.bullpen;
  const bullpenClassification = String(bullpen?.classification || "Side").trim();
  const hasGB = bullpenClassification === "GB" && ((bullpen?.pitches || 0) > 0 || (bullpen?.wl || 0) > 0);
  const hasGame = ((dayData.game?.pitches || 0) > 0 || (dayData.game?.wl || 0) > 0);

  if (!gameOnly || hasGame || hasGB) {
    const warmupPitches = safeNum(dayData.warmup?.pitches);
    if (warmupPitches != null && warmupPitches > 0) {
      pills.push(buildSessionPill(`W ${warmupPitches}`, "activity-warmup"));
    }
  }

  const gamePitches = safeNum(dayData.game?.pitches);
  if (gamePitches != null && gamePitches > 0) {
    pills.push(buildSessionPill(buildSessionPitchLabel("G", gamePitches, dayData.game), "activity-game"));
  }

  if (!gameOnly) {
    const liveBpPitches = safeNum(dayData.live_bp?.pitches);
    if (liveBpPitches != null && liveBpPitches > 0) {
      pills.push(buildSessionPill(`L ${liveBpPitches}`, "activity-live"));
    }

    const catchPlay = dayData.catch_play;
    const catchPlayPitches = safeNum(catchPlay?.pitches);
    if (catchPlay && ((catchPlayPitches != null && catchPlayPitches > 0) || safeNum(catchPlay?.avg_speed) != null)) {
      pills.push(buildSessionPill(catchPlayPitches != null && catchPlayPitches > 0 ? `CP ${catchPlayPitches}` : "CP", "activity-cp"));
    }

    const bullpenPitches = safeNum(bullpen?.pitches);
    if (bullpenPitches != null && bullpenPitches > 0) {
      const labelMap = {
        Side: { label: `S ${bullpenPitches}`, cls: "activity-side" },
        "T&F": { label: `T ${bullpenPitches}`, cls: "activity-tf" },
        "Live BP": { label: `L ${bullpenPitches}`, cls: "activity-live" },
        Game: { label: `G ${bullpenPitches}`, cls: "activity-game" },
        GB: { label: buildSessionPitchLabel("GB", bullpenPitches, bullpen), cls: "activity-gb" },
      };
      const match = labelMap[bullpenClassification]
        || (bullpenClassification.toUpperCase().includes("TF") ? labelMap["T&F"] : labelMap.Side);
      pills.push(buildSessionPill(match.label, match.cls));
    }
  } else if (hasGB) {
    pills.push(buildSessionPill(buildSessionPitchLabel("GB", bullpen?.pitches || 0, bullpen), "activity-gb"));
  }

  return pills.length > 0
    ? `<div class="activity-stack">${pills.join("")}</div>`
    : '<span class="empty-cell">—</span>';
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
  if (!entry?.display_name) return "&nbsp;";
  return escapeHtml(entry.display_name);
}

function buildRecentUsageContextCellHtml(entry) {
  if (!entry || entry.is_starter_row) {
    return [
      buildRecentUsageTextLine("recent-usage-context-top", ""),
      buildRecentUsageTextLine("recent-usage-context-bottom", ""),
    ].join("");
  }

  const topValue = entry.score_state_text || entry.role_to_show || "";
  const bottomValue = entry.base_state_text || entry.pitches_and_innings || "";

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
    <section class="recent-usage-section">
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
    <div class="monitoring-legend">
      <span class="monitoring-legend-text">
        <em>P = Pitches, IP = Innings, R = Rest, L = Leverage, 7d = 7d Rolling Game Average, 28d = 28d Rolling Average, ACR = Acute:Chronic Pitching Workload Ratio</em>
      </span>
    </div>
  `;
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

function monitoringCss() {
  return `
    @page { size: letter landscape; margin: 5.5mm 6mm; }

    .report-page {
      width: 100%;
      padding: 8px 10px 7px;
    }
    .report-page-break {
      break-after: page;
      page-break-after: always;
    }

    .report-header {
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom-width: 2px;
      gap: 14px;
    }
    .report-header-left {
      gap: 10px;
      min-width: 0;
    }
    .report-logo {
      width: 36px;
      height: 36px;
      flex-shrink: 0;
    }
    .report-title {
      font-size: 17.2px;
      letter-spacing: 0.5px;
      line-height: 1;
    }
    .report-subtitle {
      margin-top: 3px;
      display: flex;
      align-items: center;
      gap: 5px;
      flex-wrap: wrap;
      font-size: 10.4px;
      line-height: 1.16;
    }
    .report-date {
      color: ${COLORS.mutedText};
      font-weight: 700;
    }
    .report-meta {
      min-width: 66px;
      padding-left: 10px;
      border-left: 1px solid #cfd8e4;
      font-size: 8.6px;
      line-height: 1.2;
    }
    .report-count {
      display: block;
      font-size: 17px;
      font-weight: 800;
      color: ${COLORS.metsNavy};
      line-height: 1;
    }
    .report-count-label {
      display: block;
      margin-top: 2px;
      font-size: 7.2px;
      text-transform: uppercase;
      letter-spacing: 0.42px;
      color: ${COLORS.mutedText};
    }
    .report-generated {
      display: block;
      margin-top: 5px;
      font-size: 7.6px;
      font-weight: 600;
      line-height: 1.22;
      color: ${COLORS.mutedText};
    }
    .filter-label {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 1px 8px;
      font-size: 7.2px;
      font-weight: 700;
      color: ${COLORS.metsNavy};
      background: #e6eef9;
      border: 1px solid #bed0e6;
      letter-spacing: 0.28px;
      text-transform: uppercase;
    }

    .monitoring-table {
      width: 100%;
      table-layout: fixed;
      border-collapse: separate;
      border-spacing: 0;
      border: 1px solid #cad5e3;
      border-radius: 9px;
      overflow: hidden;
      font-variant-numeric: tabular-nums;
      background: #ffffff;
    }
    .monitoring-table thead th {
      background: #eef3f9;
      color: #334155;
      border-right: 1px solid #d2dbe8;
      border-bottom: 1px solid #d2dbe8;
      padding: 4px 3px;
      font-size: 7.6px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.28px;
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
      background: #f3f6fb;
      color: #526175;
      font-size: 6.95px;
      padding: 4px 3px 3px;
    }
    .monitoring-table .group-row th.group-current {
      color: #1d4ed8;
      background: #e8f1fe;
    }
    .monitoring-table .group-row th.group-future {
      background: #f9fafb;
    }
    .monitoring-table .main-row th.col-selected {
      background: #e8f1fe;
      color: #1d4ed8;
      box-shadow: inset 2px 0 0 #3b82f6;
    }
    .monitoring-table .main-row th.col-future {
      background: #fafafa;
    }
    .monitoring-table .main-row th.col-boundary,
    .monitoring-table td.col-boundary {
      border-left: 2px solid #c1cede;
    }
    .monitoring-table th:last-child,
    .monitoring-table td:last-child {
      border-right: 0;
    }
    .monitoring-table td {
      padding: 3px 4px;
      border-right: 1px solid #d8e0eb;
      border-bottom: 1px solid #dee5ef;
      font-size: 7.6px;
      color: ${COLORS.text};
      text-align: center;
      vertical-align: middle;
      background: #ffffff;
      white-space: nowrap;
    }
    .monitoring-table tbody tr:nth-child(even) td {
      background: #f9fbfe;
    }
    .monitoring-table tbody tr:last-child td {
      border-bottom: 0;
    }
    .monitoring-table td.col-selected {
      background: #f3f8ff !important;
      box-shadow: inset 2px 0 0 #3b82f6;
    }
    .monitoring-table td.col-future {
      background: #fbfcfd !important;
    }
    .monitoring-table td.text-left {
      text-align: left;
    }
    .monitoring-table tbody[data-density="compact"] td {
      padding: 2.5px 3px;
      font-size: 7.1px;
    }
    .monitoring-table tbody[data-density="ultra"] td {
      padding: 2px 2px;
      font-size: 6.5px;
    }

    .pitcher-cell {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      min-width: 0;
    }
    .pitcher-name {
      font-size: 9.1px;
      font-weight: 700;
      line-height: 1.16;
      color: ${COLORS.text};
      white-space: normal;
    }
    .pitcher-name-left {
      color: #b91c1c;
    }
    .monitoring-table tbody[data-density="compact"] .pitcher-name {
      font-size: 8.35px;
    }
    .monitoring-table tbody[data-density="ultra"] .pitcher-name {
      font-size: 7.55px;
    }

    .rest-pill {
      display: inline-grid;
      place-items: center;
      min-width: 26px;
      height: 13px;
      border-radius: 6px;
      box-sizing: border-box;
      padding: 0 8px;
      font-size: 7.05px;
      font-weight: 800;
      line-height: 1;
      text-align: center;
      letter-spacing: 0.03px;
      font-variant-numeric: tabular-nums;
    }
    .pill-text {
      display: block;
      line-height: 1;
      text-align: center;
      white-space: nowrap;
      position: relative;
      top: -0.15px;
    }
    .rest-red { background: #fdf0f3; color: #9f1239; border: 1px solid #efc0cb; }
    .rest-amber { background: #fff7e3; color: #92400e; border: 1px solid #efd39d; }
    .rest-green { background: #eef8f1; color: #166534; border: 1px solid #bfdcc9; }

    .wl-cell {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 2px;
      width: 100%;
      line-height: 1.08;
    }
    .wl-row {
      display: grid;
      grid-template-columns: 22px minmax(0, 1fr);
      align-items: center;
      column-gap: 5px;
      width: 100%;
    }
    .wl-label {
      color: ${COLORS.mutedText};
      font-weight: 700;
      font-size: 6.45px;
      letter-spacing: 0.08px;
    }
    .wl-value {
      font-weight: 700;
      color: ${COLORS.text};
      font-size: 6.95px;
      text-align: right;
    }
    .typical-cell {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 2px;
      width: 100%;
      line-height: 1.06;
    }
    .typical-row {
      display: grid;
      grid-template-columns: 13px minmax(0, 1fr);
      align-items: center;
      column-gap: 5px;
      width: 100%;
    }
    .typical-label {
      color: ${COLORS.mutedText};
      font-weight: 700;
      letter-spacing: 0.18px;
      font-size: 6.65px;
    }
    .typical-value {
      font-weight: 700;
      color: ${COLORS.text};
      text-align: right;
      min-width: 0;
      font-size: 7.2px;
    }
    .typical-value-li-low {
      color: #c26b1a;
    }
    .typical-value-li-medium {
      color: #b45309;
    }
    .typical-value-li-high {
      color: #9a3412;
    }

    .date-header-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1px;
      line-height: 1.05;
    }
    .date-header-top {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 2px;
    }
    .date-header-date {
      font-size: 7.55px;
      font-weight: 800;
      letter-spacing: 0.15px;
    }
    .date-header-day {
      font-size: 6.8px;
      font-weight: 600;
      color: #526175;
      letter-spacing: 0.22px;
    }
    .date-header-matchup {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    .date-header-matchup-prefix {
      font-size: 6.25px;
      font-weight: 700;
      color: #526175;
      letter-spacing: 0.2px;
    }
    .opp-logo {
      width: 10px;
      height: 10px;
      object-fit: contain;
    }

    .activity-stack {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      min-height: 15px;
    }
    .activity-cell {
      display: inline-grid;
      place-items: center;
      align-self: center;
      width: fit-content;
      max-width: calc(100% - 2px);
      min-width: 24px;
      height: 15px;
      border-radius: 6px;
      box-sizing: border-box;
      padding: 0 8px;
      font-size: 6.3px;
      font-weight: 700;
      line-height: 1;
      letter-spacing: 0.01px;
      border: 1px solid transparent;
      font-variant-numeric: tabular-nums;
      overflow: hidden;
    }
    .activity-cell .pill-text {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: auto;
      max-width: 100%;
      flex: 0 0 auto;
      gap: 2px;
      position: static;
      top: auto;
      transform: none;
      white-space: nowrap;
      text-align: center;
    }
    .activity-cell .pill-prefix {
      flex: 0 0 auto;
      font-weight: 800;
      letter-spacing: 0.05px;
    }
    .activity-cell .pill-detail {
      flex: 0 0 auto;
      font-weight: 700;
      opacity: 0.96;
      letter-spacing: 0;
    }
    .activity-game,
    .activity-gb {
      padding-left: 6px;
      padding-right: 6px;
      font-size: 6.15px;
    }
    .activity-game { background: #fdf0f3; border-color: #efc0cb; color: #8f1232; }
    .activity-live { background: #fdf2f6; border-color: #f0c8d5; color: #9f1239; }
    .activity-side { background: #fff6ea; border-color: #efd6b0; color: #9a3412; }
    .activity-tf { background: #fff7df; border-color: #ecd39c; color: #8a4b06; }
    .activity-gb { background: #fceff3; border-color: #e8c0cd; color: #8f1d4f; }
    .activity-cp { background: #eef4ff; border-color: #c4d5f3; color: #1d4ed8; }
    .activity-warmup { background: #f4f7fb; border-color: #d2dbe6; color: #334155; }

    .flag-stack {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 2.5px;
      min-height: 13px;
    }
    .flag-badge {
      display: inline-grid;
      place-items: center;
      border-radius: 6px;
      min-width: 30px;
      min-height: 13px;
      box-sizing: border-box;
      padding: 1px 8px;
      font-size: 6.35px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: 0.03px;
      border: 1px solid transparent;
    }
    .flag-b2b { background: #fff8e4; color: #78350f; border-color: #ecd39c; }
    .flag-3of5 { background: #fff3e5; color: #9a3412; border-color: #eed0ad; }
    .flag-popop { background: #eef4ff; color: #1d4ed8; border-color: #c4d5f3; }
    .flag-rel { background: #fff6e5; color: #9a3412; border-color: #eed0ad; }
    .flag-lev { background: #eef2ff; color: #3730a3; border-color: #c7d2fe; }
    .flag-hw { background: #fdf0f3; color: #9f1239; border-color: #efc0cb; }
    .flag-hs { background: #fbf0f7; color: #be185d; border-color: #e7c3d7; }
    .flag-empty,
    .empty-cell {
      color: #b8c5d6;
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
      margin-top: 4px;
      text-align: left;
    }
    .monitoring-legend-text {
      display: inline-block;
      font-size: 6.15px;
      line-height: 1.2;
      color: #64748b;
      letter-spacing: 0.03px;
    }

    .recent-usage-section {
      margin-top: 10px;
    }
    .recent-usage-title {
      padding: 5px 8px;
      border: 1px solid ${COLORS.metsNavy};
      border-bottom: 0;
      background: ${COLORS.metsNavy};
      color: ${COLORS.white};
      font-size: 10.3px;
      font-weight: 800;
      text-align: center;
      letter-spacing: 0.2px;
    }
    .recent-usage-table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      border: 1px solid #111827;
      font-variant-numeric: tabular-nums;
      background: #ffffff;
    }
    .recent-usage-table th {
      padding: 5px 3px;
      border-right: 1px solid #33538a;
      border-bottom: 2px solid ${COLORS.metsOrange};
      background: ${COLORS.metsNavy};
      color: ${COLORS.white};
      font-size: 7.5px;
      font-weight: 800;
      text-align: center;
      line-height: 1.15;
    }
    .recent-usage-table th:last-child,
    .recent-usage-table td:last-child {
      border-right: 0;
    }
    .recent-usage-row td {
      border-right: 1px solid #cbd5e1;
      border-bottom: 1px solid #e5e7eb;
      padding: 4px 5px;
      vertical-align: middle;
      background: #ffffff;
    }
    .recent-usage-row-starter td {
      border-bottom: 2px solid ${COLORS.metsOrange};
    }
    .recent-usage-table tbody tr:last-child td {
      border-bottom: 0;
    }
    .recent-usage-name-cell {
      font-size: 8.1px;
      font-weight: 700;
      line-height: 1.1;
      text-align: left;
      white-space: nowrap;
    }
    .recent-usage-name-left { color: #dc2626; }
    .recent-usage-name-right { color: ${COLORS.text}; }
    .recent-usage-name-switch { color: ${COLORS.metsOrange}; }
    .recent-usage-name-starter { font-style: italic; }
    .recent-usage-name-empty { color: transparent; }
    .recent-usage-context-cell {
      padding-top: 3px;
      padding-bottom: 3px;
    }
    .recent-usage-context-top {
      min-height: 10px;
      font-size: 6.9px;
      font-weight: 700;
      line-height: 1.1;
      color: ${COLORS.text};
      white-space: nowrap;
    }
    .recent-usage-context-bottom {
      min-height: 9px;
      margin-top: 1px;
      font-size: 6.2px;
      line-height: 1.1;
      color: #334155;
      white-space: nowrap;
    }
    .recent-usage-context-high { background: #fdba74 !important; }
    .recent-usage-context-medium { background: #fed7aa !important; }
    .recent-usage-context-low { background: #ffedd5 !important; }
    .recent-usage-context-neutral { background: #f8fafc !important; }
    .recent-usage-context-starter,
    .recent-usage-context-empty {
      background: #ffffff !important;
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

  const filterHtml = filters.map((filter) => `<span class="filter-label">${escapeHtml(filter)}</span>`).join("");

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
        <th class="fixed-col" rowspan="2" style="width:${COLUMN_WIDTHS.pitcher}px">Pitcher</th>
        <th class="fixed-col align-center" rowspan="2" style="width:${COLUMN_WIDTHS.typical}px">Typical</th>
        <th class="fixed-col align-center" rowspan="2" style="width:${COLUMN_WIDTHS.rest}px">Rest</th>
        <th class="fixed-col align-center" rowspan="2" style="width:${COLUMN_WIDTHS.wl}px">Load</th>
        ${pastCount > 0 ? `<th colspan="${pastCount}">Past ${pastCount}</th>` : ""}
        ${selectedIndex >= 0 ? '<th class="group-current" colspan="1">Today</th>' : ""}
        <th class="group-future" colspan="${futureCount}">Planned ${futureCount}</th>
        <th class="align-center" rowspan="2" style="width:${COLUMN_WIDTHS.flags}px">Flags</th>
        <th class="align-center" rowspan="2" style="width:${trendWidth}px">Trend</th>
      </tr>
      <tr class="main-row">
        ${dateHeaderCells}
      </tr>
    `;
  }

  return `
    <tr class="main-row">
      <th class="fixed-col" style="width:${COLUMN_WIDTHS.pitcher}px">Pitcher</th>
      <th class="fixed-col align-center" style="width:${COLUMN_WIDTHS.typical}px">Typical</th>
      <th class="fixed-col align-center" style="width:${COLUMN_WIDTHS.rest}px">Rest</th>
      <th class="fixed-col align-center" style="width:${COLUMN_WIDTHS.wl}px">Load</th>
      ${dateHeaderCells}
      <th class="align-center" style="width:${COLUMN_WIDTHS.flags}px">Flags</th>
      <th class="align-center" style="width:${trendWidth}px">Trend</th>
    </tr>
  `;
}

function buildPitcherRowsHtml({ pitchers, dateColumnCount, sparkWidth, sparkHeight, selectedIndex, firstFutureIndex, activityFilter }) {
  return (pitchers || []).map((pitcher) => {
    const daily = pitcher.daily || [];
    const dateCells = dateColumnCount > 0
      ? Array.from({ length: dateColumnCount }).map((_, index) => {
          const classes = buildColumnClasses(index, selectedIndex, firstFutureIndex);
          return `<td class="${classes}">${buildDailyCell(daily[index] || null, activityFilter)}</td>`;
        }).join("")
      : "";

    return `
      <tr>
        <td class="text-left">
          <div class="pitcher-cell">
            <div class="${getPitcherNameClass(pitcher)}">${escapeHtml(pitcher.pitcher_name_last_first || "—")}</div>
          </div>
        </td>
        <td class="text-left">${buildTypicalUsageCell(pitcher)}</td>
        <td>${buildRestPill(pitcher.days_of_rest)}</td>
        <td class="text-left">${buildWorkloadCell(pitcher)}</td>
        ${dateCells}
        <td>${buildFlagBadges(pitcher.flags)}</td>
        <td class="trend-cell"><div class="sparkline-wrap">${buildSparklineSvg(pitcher.sparkline || [], sparkWidth, sparkHeight)}</div></td>
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
    <!-- pitcher-monitoring-template:${escapeHtml(PITCHER_MONITORING_TEMPLATE_VERSION)} -->
    <section class="page report-page ${pageIndex < totalPages - 1 ? "report-page-break" : ""}" data-role="${escapeHtml(roleLabel || "")}">
      <div class="report-header">
        <div class="report-header-left">
          <img class="report-logo" src="https://upload.wikimedia.org/wikipedia/en/7/7b/New_York_Mets.svg" alt="Mets" />
          <div>
            <div class="report-title">${escapeHtml(reportTitle)}</div>
            ${buildSubtitleHtml({ displayDate, roleLabel, activityFilter, rosterFilter, workloadViewLabel })}
          </div>
        </div>
        <div class="report-meta">
          <span class="report-count">${pitchers.length}</span>
          <span class="report-count-label">Pitchers</span>
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

export function buildPitcherMonitoringReportHtml(data) {
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
