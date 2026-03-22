/**
 * Hybrid Pitcher Monitoring PDF template.
 * Combines modern design with comprehensive data from original template.
 */

import { COLORS, sharedCss } from "./shared-styles.js";
import { getPitcherMonitoringExportMeta } from "../pitcher-monitoring-export.js";
import { formatEasternTimestamp } from "./time-format.js";

const RECENT_USAGE_MAX_GAMES = 7;
const RECENT_USAGE_TITLE = "Last 7 Games - Reliever Entrances by Leverage";
export const PITCHER_MONITORING_BULLPEN_HYBRID_TEMPLATE_VERSION = "2026-03-21-bullpen-hybrid-v1";

const HYBRID_COLORS = {
  // Brand colors
  metsBlue: "#002D72",
  metsOrange: "#FF5910",

  // Modern neutral palette
  text: {
    primary: "#111827",
    secondary: "#6b7280",
    muted: "#9ca3af",
    light: "#d1d5db",
  },

  // Backgrounds and borders
  bgWhite: "#ffffff",
  bgGray: "#f9fafb",
  bgLight: "#f3f4f6",
  border: "#e5e7eb",
  borderLight: "#f3f4f6",
  shadow: "rgba(0, 0, 0, 0.04)",

  // Rest day indicators
  restGreen: "#10b981",
  restAmber: "#f59e0b",
  restRed: "#ef4444",

  // Leverage colors
  leverageLow: "#ecfdf5",
  leverageMedium: "#fef3c7",
  leverageHigh: "#fee2e2",
  leverageLowText: "#065f46",
  leverageMediumText: "#92400e",
  leverageHighText: "#991b1b",

  // Workload heat map
  wlHeat1: "#f0fdf4",
  wlHeat2: "#dcfce7",
  wlHeat3: "#fef3c7",
  wlHeat4: "#fed7aa",
  wlHeat5: "#fca5a5",

  // Activity types
  activityGame: "#1e40af",
  activityBullpen: "#7c3aed",
  activityLive: "#0891b2",
  activitySide: "#6366f1",

  // Flag badge colors
  flagB2B: "#dc2626",
  flag3of5: "#ea580c",
  flagPO: "#ca8a04",
  flagVelo: "#0891b2",
  flagLev: "#9333ea",
  flagHW: "#e11d48",
  flagHS: "#991b1b",

  // ACR status colors
  acrElevated: "#dc2626",
  acrWatch: "#f97316",
  acrNormal: "#6b7280",
  acrSuppressed: "#059669",
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

function getACRStatus(acr) {
  const num = safeNum(acr);
  if (num == null) return { color: HYBRID_COLORS.text.muted, label: "—" };
  if (num > 1.5) return { color: HYBRID_COLORS.acrElevated, label: num.toFixed(2) };
  if (num > 1.3) return { color: HYBRID_COLORS.acrWatch, label: num.toFixed(2) };
  if (num < 0.8) return { color: HYBRID_COLORS.acrSuppressed, label: num.toFixed(2) };
  return { color: HYBRID_COLORS.acrNormal, label: num.toFixed(2) };
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

// ─── Sparkline SVG ───────────────────────────────────────────────────────────

function normalizeSparklinePayload(data) {
  if (Array.isArray(data)) {
    const points = data.map((item, index) => ({
      date: String(index),
      pitches: 0,
      acute: safeNum(item?.ewma_7d),
      chronic: safeNum(item?.ewma_28d),
    }));
    const getLastFinite = (values) => {
      for (let i = values.length - 1; i >= 0; i--) {
        const val = safeNum(values[i]);
        if (val != null) return val;
      }
      return null;
    };
    const latestAcute = getLastFinite(points.map(p => p.acute));
    const latestChronic = getLastFinite(points.map(p => p.chronic));
    const acRatio = latestAcute != null && latestChronic != null && latestChronic > 0
      ? latestAcute / latestChronic : null;
    return { points, acRatio };
  }
  return { points: [], acRatio: null };
}

function getMonitoringTrendLineDomain(series) {
  const values = (Array.isArray(series) ? series : [])
    .flatMap((point) => [point?.acute, point?.chronic])
    .map(v => safeNum(v))
    .filter((value) => value != null);

  if (!values.length) return { min: 0, max: 1 };

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

function buildSparklineSvg(data, width = 100, height = 28) {
  const normalized = normalizeSparklinePayload(data);
  const points = normalized?.points || [];
  if (!points.length) return '';

  const hasWorkloads = points.some((point) =>
    Number.isFinite(point.acute) || Number.isFinite(point.chronic)
  );
  if (!hasWorkloads) return '';

  const PAD_X = 3;
  const PAD_TOP = 2;
  const PAD_BOTTOM = 2;
  const innerWidth = width - PAD_X * 2;
  const innerHeight = height - PAD_TOP - PAD_BOTTOM;

  const { min: yMin, max: yMax } = getMonitoringTrendLineDomain(points);
  const xStep = innerWidth / Math.max(points.length - 1, 1);

  const toX = (index) => PAD_X + index * xStep;
  const toY = (value) => {
    const num = safeNum(value);
    if (num == null) return null;
    return PAD_TOP + innerHeight - ((num - yMin) / (yMax - yMin)) * innerHeight;
  };

  const acutePath = [];
  const chronicPath = [];

  points.forEach((point, index) => {
    const x = toX(index);
    const acuteY = toY(point.acute);
    const chronicY = toY(point.chronic);

    if (acuteY != null) {
      acutePath.push(index === 0 ? `M${x},${acuteY}` : `L${x},${acuteY}`);
    }
    if (chronicY != null) {
      chronicPath.push(index === 0 ? `M${x},${chronicY}` : `L${x},${chronicY}`);
    }
  });

  const acrStatus = getACRStatus(normalized.acRatio);

  return `
    <svg width="${width}" height="${height}" style="display:block">
      <rect x="0" y="0" width="${width}" height="${height}" fill="${HYBRID_COLORS.bgGray}" rx="2"/>
      ${chronicPath.length ? `<path d="${chronicPath.join(" ")}" fill="none" stroke="${HYBRID_COLORS.text.muted}" stroke-width="1" opacity="0.5"/>` : ''}
      ${acutePath.length ? `<path d="${acutePath.join(" ")}" fill="none" stroke="${HYBRID_COLORS.text.secondary}" stroke-width="1.5"/>` : ''}
      ${normalized.acRatio != null ? `
        <circle cx="${width - 6}" cy="${height / 2}" r="3" fill="${acrStatus.color}"/>
      ` : ''}
    </svg>
  `;
}

// ─── Cell Builders ───────────────────────────────────────────────────────────

function buildPitcherNameCell(pitcher) {
  const throwSide = getPitcherThrowSide(pitcher);
  const handClass = throwSide === "L" ? "hand-left" : throwSide === "S" ? "hand-switch" : "hand-right";
  const handLabel = throwSide === "L" ? "L" : throwSide === "S" ? "S" : "";

  return `
    <div class="pitcher-name-cell">
      ${handLabel ? `<span class="hand-indicator ${handClass}">${handLabel}</span>` : ''}
      <span class="pitcher-name">${escapeHtml(pitcher.pitcher_name_last_first || "—")}</span>
    </div>
  `;
}

function buildTypicalUsageCell(pitcher) {
  const usage = pitcher?.pdf_typical_usage || {};
  const pitches = safeNum(usage.pitches_label);
  const innings = usage.innings_label || "—";
  const rest = usage.rest_label || "—";
  const leverage = safeNum(usage.avg_max_leverage);

  let levClass = "";
  let levLabel = "—";
  if (leverage != null) {
    if (leverage < 0.85) {
      levClass = "lev-low";
      levLabel = "Low";
    } else if (leverage <= 2) {
      levClass = "lev-medium";
      levLabel = "Med";
    } else {
      levClass = "lev-high";
      levLabel = "High";
    }
  }

  return `
    <div class="typical-usage-cell">
      <div class="usage-row">
        <span class="usage-label">P:</span>
        <span class="usage-value">${pitches != null ? Math.round(pitches) : "—"}</span>
      </div>
      <div class="usage-row">
        <span class="usage-label">IP:</span>
        <span class="usage-value">${escapeHtml(innings)}</span>
      </div>
      <div class="usage-row">
        <span class="usage-label">R:</span>
        <span class="usage-value">${escapeHtml(rest)}</span>
      </div>
      ${leverage != null ? `
        <div class="usage-leverage ${levClass}">
          ${escapeHtml(levLabel)}
        </div>
      ` : ''}
    </div>
  `;
}

function buildRestPill(days) {
  const num = safeNum(days);
  if (num == null) return '<span class="rest-pill rest-unknown">—</span>';

  let cls = "rest-green";
  if (num <= 0) cls = "rest-red";
  else if (num === 1) cls = "rest-amber";

  return `<span class="rest-pill ${cls}">${Math.round(num)}</span>`;
}

function buildWorkloadCell(pitcher) {
  const summary = pitcher?.workload_summary || {};
  const acute = safeNum(summary.acute) ?? safeNum(pitcher?.combined_ewma_7d_total_wl);
  const chronic = safeNum(summary.chronic) ?? safeNum(pitcher?.combined_ewma_28d_total_wl);
  const acr = safeNum(summary.acr) ??
    (acute != null && chronic != null && chronic > 0 ? acute / chronic : null);
  const pitchedDays = safeNum(summary.pitched_days_last_5) ?? 0;

  const acrStatus = getACRStatus(acr);

  return `
    <div class="workload-cell">
      <div class="wl-row">
        <span class="wl-label">7d:</span>
        <span class="wl-value">${fmtWorkloadWhole(acute)}</span>
      </div>
      <div class="wl-row">
        <span class="wl-label">28d:</span>
        <span class="wl-value">${fmtWorkloadWhole(chronic)}</span>
      </div>
      <div class="wl-row">
        <span class="wl-label">ACR:</span>
        <span class="wl-value" style="color: ${acrStatus.color}">${acrStatus.label}</span>
      </div>
      ${pitchedDays > 2 ? `
        <div class="wl-alert">${Math.round(pitchedDays)}/5d</div>
      ` : ''}
    </div>
  `;
}

function buildFlagBadges(flags) {
  const badges = [];
  if (flags?.is_back_to_back) badges.push('<span class="flag-badge flag-b2b">B2B</span>');
  if (flags?.pitched_3_of_last_5) badges.push('<span class="flag-badge flag-3of5">3/5</span>');
  if (flags?.is_pitch_off_pitch_off_pitch) badges.push('<span class="flag-badge flag-po">PO</span>');
  if (flags?.release_abnormal_recent) badges.push('<span class="flag-badge flag-velo">VELO</span>');
  if (flags?.max_leverage_abnormal) badges.push('<span class="flag-badge flag-lev">LEV</span>');
  if (flags?.high_workload_recent) badges.push('<span class="flag-badge flag-hw">HW</span>');
  if (flags?.high_stress) badges.push('<span class="flag-badge flag-hs">HS</span>');

  return `
    <div class="flag-cell">
      ${badges.length ? badges.join('') : '<span class="flag-empty">—</span>'}
    </div>
  `;
}

function buildDailyActivityCell(dayData, activityFilter) {
  if (!dayData || typeof dayData !== "object") {
    return '<div class="daily-cell daily-empty"></div>';
  }

  const gameOnly = activityFilter === "GAME";
  const activities = [];

  // Check for game activity
  if (hasSessionActivity(dayData.game)) {
    const pitches = safeNum(dayData.game?.pitches);
    const wl = safeNum(dayData.game?.wl);
    activities.push({
      type: "game",
      label: pitches ? `${Math.round(pitches)}p` : "G",
      wl,
      primary: true
    });
  }

  if (!gameOnly) {
    // Check for bullpen
    const bullpen = dayData.bullpen;
    if (hasSessionActivity(bullpen)) {
      const classification = String(bullpen?.classification || "").trim();
      const pitches = safeNum(bullpen?.pitches);
      const isGB = classification === "GB";
      activities.push({
        type: isGB ? "gb" : "side",
        label: pitches ? `${Math.round(pitches)}p` : (isGB ? "GB" : "S"),
        wl: safeNum(bullpen?.wl),
        primary: !activities.length
      });
    }

    // Check for live BP
    if (hasSessionActivity(dayData.live_bp)) {
      const pitches = safeNum(dayData.live_bp?.pitches);
      activities.push({
        type: "live",
        label: pitches ? `${Math.round(pitches)}p` : "L",
        wl: safeNum(dayData.live_bp?.wl),
        primary: !activities.length
      });
    }
  }

  if (!activities.length) {
    return '<div class="daily-cell daily-empty"></div>';
  }

  // Get workload heat level
  const maxWl = Math.max(...activities.map(a => a.wl || 0));
  let heatClass = "";
  if (maxWl > 0) {
    if (maxWl < 5) heatClass = "heat-1";
    else if (maxWl < 10) heatClass = "heat-2";
    else if (maxWl < 15) heatClass = "heat-3";
    else if (maxWl < 22) heatClass = "heat-4";
    else heatClass = "heat-5";
  }

  const primary = activities.find(a => a.primary);
  const upCount = safeNum(dayData?.up_count ?? dayData?.upCount);

  return `
    <div class="daily-cell daily-${primary.type} ${heatClass}">
      <div class="daily-primary">${escapeHtml(primary.label)}</div>
      ${upCount && upCount > 0 ? `<div class="daily-secondary">Up${Math.round(upCount)}</div>` : ''}
    </div>
  `;
}

// ─── Legend ──────────────────────────────────────────────────────────────────

function buildLegendHtml() {
  return `
    <div class="legend-section">
      <div class="legend-row">
        <span class="legend-label">Rest Days:</span>
        <span class="rest-pill rest-green">2+</span>
        <span class="rest-pill rest-amber">1</span>
        <span class="rest-pill rest-red">0</span>
        <span class="legend-spacer"></span>
        <span class="legend-label">Flags:</span>
        <span class="flag-badge flag-b2b">B2B</span>
        <span class="legend-text">Back-to-back</span>
        <span class="flag-badge flag-3of5">3/5</span>
        <span class="legend-text">3 of last 5 days</span>
        <span class="flag-badge flag-hw">HW</span>
        <span class="legend-text">High workload</span>
        <span class="legend-spacer"></span>
        <span class="legend-label">ACR:</span>
        <span style="color: ${HYBRID_COLORS.acrElevated}">●</span>
        <span class="legend-text">>1.5</span>
        <span style="color: ${HYBRID_COLORS.acrWatch}">●</span>
        <span class="legend-text">1.3-1.5</span>
        <span style="color: ${HYBRID_COLORS.acrNormal}">●</span>
        <span class="legend-text">0.8-1.3</span>
      </div>
    </div>
  `;
}

// ─── CSS Styles ──────────────────────────────────────────────────────────────

function hybridCss() {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

    @page { size: letter landscape; margin: 8mm 10mm; }

    * {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 0;
      background: ${HYBRID_COLORS.bgWhite};
      color: ${HYBRID_COLORS.text.primary};
      font-size: 11px;
      line-height: 1.4;
    }

    .hybrid-page {
      width: 100%;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    /* Header */
    .hybrid-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 12px;
      margin-bottom: 16px;
      border-bottom: 1px solid ${HYBRID_COLORS.border};
    }

    .hybrid-header-left {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .hybrid-logo {
      width: 32px;
      height: 32px;
      opacity: 0.8;
    }

    .hybrid-title {
      font-size: 18px;
      font-weight: 700;
      color: ${HYBRID_COLORS.text.primary};
      line-height: 1.2;
    }

    .hybrid-subtitle {
      font-size: 12px;
      color: ${HYBRID_COLORS.text.secondary};
      margin-top: 2px;
    }

    .hybrid-meta {
      text-align: right;
      font-size: 10px;
      color: ${HYBRID_COLORS.text.muted};
    }

    /* Table */
    .hybrid-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      margin-bottom: 16px;
    }

    .hybrid-table th {
      background: ${HYBRID_COLORS.bgGray};
      color: ${HYBRID_COLORS.text.primary};
      font-weight: 600;
      text-transform: uppercase;
      font-size: 9px;
      letter-spacing: 0.03em;
      padding: 8px 6px;
      text-align: left;
      border-bottom: 2px solid ${HYBRID_COLORS.border};
    }

    .hybrid-table td {
      padding: 6px 4px;
      border-bottom: 1px solid ${HYBRID_COLORS.borderLight};
      vertical-align: middle;
    }

    .hybrid-table tbody tr:hover {
      background: ${HYBRID_COLORS.bgLight};
    }

    /* Pitcher name cell */
    .pitcher-name-cell {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .hand-indicator {
      display: inline-flex;
      width: 18px;
      height: 18px;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-weight: 700;
      background: ${HYBRID_COLORS.bgGray};
      border-radius: 3px;
    }

    .hand-left {
      background: ${HYBRID_COLORS.bgGray};
      color: ${HYBRID_COLORS.text.secondary};
    }

    .hand-switch {
      background: ${HYBRID_COLORS.metsOrange}20;
      color: ${HYBRID_COLORS.metsOrange};
    }

    .pitcher-name {
      font-weight: 600;
      color: ${HYBRID_COLORS.text.primary};
    }

    /* Typical usage cell */
    .typical-usage-cell {
      font-size: 9px;
    }

    .usage-row {
      display: flex;
      gap: 4px;
      line-height: 1.3;
    }

    .usage-label {
      color: ${HYBRID_COLORS.text.muted};
      min-width: 18px;
    }

    .usage-value {
      color: ${HYBRID_COLORS.text.primary};
      font-weight: 500;
    }

    .usage-leverage {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 8px;
      font-weight: 600;
      margin-top: 2px;
    }

    .lev-low {
      background: ${HYBRID_COLORS.leverageLow};
      color: ${HYBRID_COLORS.leverageLowText};
    }

    .lev-medium {
      background: ${HYBRID_COLORS.leverageMedium};
      color: ${HYBRID_COLORS.leverageMediumText};
    }

    .lev-high {
      background: ${HYBRID_COLORS.leverageHigh};
      color: ${HYBRID_COLORS.leverageHighText};
    }

    /* Rest pills */
    .rest-pill {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 600;
      color: white;
      min-width: 24px;
      text-align: center;
    }

    .rest-green {
      background: ${HYBRID_COLORS.restGreen};
    }

    .rest-amber {
      background: ${HYBRID_COLORS.restAmber};
    }

    .rest-red {
      background: ${HYBRID_COLORS.restRed};
    }

    .rest-unknown {
      background: ${HYBRID_COLORS.text.muted};
    }

    /* Workload cell */
    .workload-cell {
      font-size: 9px;
    }

    .wl-row {
      display: flex;
      gap: 4px;
      line-height: 1.3;
    }

    .wl-label {
      color: ${HYBRID_COLORS.text.muted};
      min-width: 24px;
    }

    .wl-value {
      color: ${HYBRID_COLORS.text.primary};
      font-weight: 600;
    }

    .wl-alert {
      display: inline-block;
      background: ${HYBRID_COLORS.restAmber};
      color: white;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 8px;
      font-weight: 600;
      margin-top: 2px;
    }

    /* Daily activity cells */
    .daily-cell {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-width: 36px;
      min-height: 28px;
      padding: 2px 4px;
      border-radius: 4px;
      font-size: 9px;
      background: ${HYBRID_COLORS.bgGray};
      border: 1px solid ${HYBRID_COLORS.borderLight};
    }

    .daily-empty {
      background: ${HYBRID_COLORS.bgWhite};
      border: 1px dashed ${HYBRID_COLORS.borderLight};
    }

    .daily-game {
      border-color: ${HYBRID_COLORS.activityGame}40;
      background: ${HYBRID_COLORS.activityGame}10;
    }

    .daily-gb {
      border-color: ${HYBRID_COLORS.activityBullpen}40;
      background: ${HYBRID_COLORS.activityBullpen}10;
    }

    .daily-side {
      border-color: ${HYBRID_COLORS.activitySide}40;
      background: ${HYBRID_COLORS.activitySide}10;
    }

    .daily-live {
      border-color: ${HYBRID_COLORS.activityLive}40;
      background: ${HYBRID_COLORS.activityLive}10;
    }

    .daily-primary {
      font-weight: 600;
      color: ${HYBRID_COLORS.text.primary};
    }

    .daily-secondary {
      font-size: 8px;
      color: ${HYBRID_COLORS.text.secondary};
    }

    /* Heat levels for daily cells */
    .heat-1 { background-color: ${HYBRID_COLORS.wlHeat1} !important; }
    .heat-2 { background-color: ${HYBRID_COLORS.wlHeat2} !important; }
    .heat-3 { background-color: ${HYBRID_COLORS.wlHeat3} !important; }
    .heat-4 { background-color: ${HYBRID_COLORS.wlHeat4} !important; }
    .heat-5 { background-color: ${HYBRID_COLORS.wlHeat5} !important; }

    /* Flag badges */
    .flag-cell {
      display: flex;
      flex-wrap: wrap;
      gap: 2px;
      max-width: 80px;
    }

    .flag-badge {
      display: inline-block;
      padding: 2px 5px;
      border-radius: 3px;
      font-size: 8px;
      font-weight: 700;
      color: white;
      text-transform: uppercase;
    }

    .flag-b2b { background: ${HYBRID_COLORS.flagB2B}; }
    .flag-3of5 { background: ${HYBRID_COLORS.flag3of5}; }
    .flag-po { background: ${HYBRID_COLORS.flagPO}; }
    .flag-velo { background: ${HYBRID_COLORS.flagVelo}; }
    .flag-lev { background: ${HYBRID_COLORS.flagLev}; }
    .flag-hw { background: ${HYBRID_COLORS.flagHW}; }
    .flag-hs { background: ${HYBRID_COLORS.flagHS}; }

    .flag-empty {
      color: ${HYBRID_COLORS.text.muted};
    }

    /* Legend */
    .legend-section {
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid ${HYBRID_COLORS.border};
      font-size: 9px;
    }

    .legend-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .legend-label {
      font-weight: 600;
      color: ${HYBRID_COLORS.text.secondary};
      text-transform: uppercase;
      font-size: 8px;
    }

    .legend-text {
      color: ${HYBRID_COLORS.text.muted};
    }

    .legend-spacer {
      width: 16px;
    }

    /* Column alignments */
    .text-center { text-align: center; }
    .text-left { text-align: left; }
    .text-right { text-align: right; }
  `;
}

// ─── Main Template ───────────────────────────────────────────────────────────

export function buildPitcherMonitoringBullpenHybridReportHtml(data) {
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

  // Build table rows
  const rowsHtml = (pitchers || []).map((pitcher) => {
    const daily = Array.isArray(pitcher?.daily) ? pitcher.daily : [];
    const dailyCells = dateColumns.map((_, index) => {
      return `<td class="text-center">${buildDailyActivityCell(daily[index], activityFilter)}</td>`;
    }).join("");

    return `
      <tr>
        <td>${buildPitcherNameCell(pitcher)}</td>
        <td>${buildTypicalUsageCell(pitcher)}</td>
        <td class="text-center">${buildRestPill(pitcher.days_of_rest)}</td>
        <td>${buildWorkloadCell(pitcher)}</td>
        ${dailyCells}
        <td>${buildFlagBadges(pitcher.flags)}</td>
        <td>${buildSparklineSvg(pitcher.sparkline || [], 100, 28)}</td>
      </tr>
    `;
  }).join("");

  // Build date column headers
  const dateHeadersHtml = dateColumns.map((col) => `
    <th class="text-center" style="font-size: 8px;">
      <div>${escapeHtml(col.displayDate || "")}</div>
      <div style="font-weight: 400; color: ${HYBRID_COLORS.text.muted};">${escapeHtml(col.dayOfWeek || "")}</div>
    </th>
  `).join("");

  const metaParts = [displayDate];
  if (positionFilter && positionFilter !== "TEAM") metaParts.push(positionFilter);
  if (activityFilter && activityFilter !== "ALL") metaParts.push(activityFilter);
  if (workloadViewLabel) metaParts.push(workloadViewLabel);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <style>
    ${hybridCss()}
  </style>
</head>
<body>
  <div class="hybrid-page">
    <div class="hybrid-header">
      <div class="hybrid-header-left">
        <img class="hybrid-logo" src="https://upload.wikimedia.org/wikipedia/en/7/7b/New_York_Mets.svg" alt="Mets" />
        <div>
          <div class="hybrid-title">${escapeHtml(reportTitle)}</div>
          <div class="hybrid-subtitle">${escapeHtml(metaParts.join(" • "))}</div>
        </div>
      </div>
      <div class="hybrid-meta">
        <div>Generated</div>
        <div style="font-weight: 600; color: ${HYBRID_COLORS.text.secondary};">${escapeHtml(generatedDate)}</div>
      </div>
    </div>

    <table class="hybrid-table">
      <thead>
        <tr>
          <th style="width: 140px;">Pitcher</th>
          <th style="width: 80px;">Typical</th>
          <th style="width: 50px;" class="text-center">Rest</th>
          <th style="width: 70px;">Workload</th>
          ${dateHeadersHtml}
          <th style="width: 80px;">Flags</th>
          <th style="width: 100px;">Trend</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    ${buildLegendHtml()}
  </div>
</body>
</html>`;
}