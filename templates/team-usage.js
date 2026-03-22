/**
 * Team Usage PDF report template.
 * Renders a line chart (inline SVG) of % outs pitched per team,
 * plus a ranked patterns table.
 */

import { COLORS, sharedCss, FONT_FAMILY } from "./shared-styles.js";
import { formatEasternTimestamp } from "./time-format.js";

const TEAM_COLORS = [
  '#2e59a8', '#cb2c31', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
  '#06b6d4', '#f97316', '#84cc16', '#a855f7', '#ef4444', '#14b8a6',
  '#f43f5e', '#6366f1', '#22c55e', '#eab308', '#d946ef', '#0ea5e9'
];

// ─── Smooth Path Helper ─────────────────────────────────────────────────────

/**
 * Build a smooth SVG path through points using Catmull-Rom → cubic Bezier.
 * Produces curves similar to Recharts type="monotone".
 */
function smoothPath(points) {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}L${points[1].x.toFixed(1)},${points[1].y.toFixed(1)}`;
  }

  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }

  return d;
}

// ─── Chart Builder ──────────────────────────────────────────────────────────

function buildUsageChartSvg(chartData, selectedTeams, rollingWindow, leagueMedianData) {
  if (!chartData || chartData.length === 0 || !selectedTeams || selectedTeams.length === 0) {
    return '<div style="text-align:center;color:#64748b;padding:40px;font-weight:600;">No chart data available</div>';
  }

  const W = 920;
  const H = 400;
  const pad = { top: 20, right: 20, bottom: 40, left: 50 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  // Group data by team
  const teamData = {};
  for (const d of chartData) {
    const t = d.teamName;
    if (!selectedTeams.includes(t)) continue;
    if (!teamData[t]) teamData[t] = [];
    teamData[t].push(d);
  }

  // Sort each team's data by date
  for (const t of Object.keys(teamData)) {
    teamData[t].sort((a, b) => a.date.localeCompare(b.date));
  }

  // Get date range
  const allDates = chartData
    .filter((d) => selectedTeams.includes(d.teamName))
    .map((d) => d.date)
    .sort();
  if (allDates.length === 0) {
    return '<div style="text-align:center;color:#64748b;padding:40px;font-weight:600;">No chart data</div>';
  }
  const minDate = allDates[0];
  const maxDate = allDates[allDates.length - 1];
  const dateToX = (dateStr) => {
    const min = new Date(minDate).getTime();
    const max = new Date(maxDate).getTime();
    const cur = new Date(dateStr).getTime();
    if (max === min) return pad.left + plotW / 2;
    return pad.left + ((cur - min) / (max - min)) * plotW;
  };

  // Clip league median to selected teams' date range
  const clippedMedianData = (leagueMedianData || []).filter(
    (d) => d.date >= minDate && d.date <= maxDate
  );

  // Auto-scale Y range from data (with padding), including clipped league median
  let dataMin = Infinity;
  let dataMax = -Infinity;
  for (const d of chartData) {
    if (!selectedTeams.includes(d.teamName)) continue;
    if (d.rollingAvg != null) {
      const pct = d.rollingAvg * 100;
      if (pct < dataMin) dataMin = pct;
      if (pct > dataMax) dataMax = pct;
    }
  }
  for (const d of clippedMedianData) {
    const pct = d.median * 100;
    if (pct < dataMin) dataMin = pct;
    if (pct > dataMax) dataMax = pct;
  }
  if (!isFinite(dataMin)) { dataMin = 0; dataMax = 100; }
  // Round down/up to nearest 5% with padding
  const yMin = Math.max(0, Math.floor((dataMin - 3) / 5) * 5);
  const yMax = Math.min(100, Math.ceil((dataMax + 3) / 5) * 5);
  const yRange = yMax - yMin || 1;

  const valToY = (pct) => {
    return pad.top + plotH - ((pct - yMin) / yRange) * plotH;
  };

  // Grid lines (horizontal only, dashed like frontend) + Y axis labels
  const gridStep = yRange <= 20 ? 2 : yRange <= 40 ? 5 : 10;
  let gridLines = '';
  for (let v = yMin; v <= yMax; v += gridStep) {
    const y = valToY(v);
    gridLines += `<line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" stroke="#d6dee9" stroke-width="1" stroke-dasharray="3 3"/>`;
    gridLines += `<text x="${pad.left - 6}" y="${y + 3}" text-anchor="end" font-size="9.5" font-weight="600" fill="#475569">${v}%</text>`;
  }

  // X axis date labels
  const uniqueDates = [...new Set(allDates)].sort();
  const labelInterval = Math.max(1, Math.floor(uniqueDates.length / 12));
  let xLabels = '';
  for (let i = 0; i < uniqueDates.length; i += labelInterval) {
    const d = uniqueDates[i];
    const x = dateToX(d);
    const parts = d.split('-');
    const label = `${parseInt(parts[1])}/${parseInt(parts[2])}`;
    xLabels += `<text x="${x}" y="${H - pad.bottom + 16}" text-anchor="middle" font-size="9.5" font-weight="600" fill="#475569">${label}</text>`;
  }

  // Draw smooth rolling average lines per team
  let teamLines = '';
  selectedTeams.forEach((team, idx) => {
    const points = teamData[team];
    if (!points || points.length === 0) return;
    const color = TEAM_COLORS[idx % TEAM_COLORS.length];

    const rollingPts = points
      .filter((p) => p.rollingAvg != null)
      .map((p) => ({
        x: dateToX(p.date),
        y: valToY(p.rollingAvg * 100),
      }));

    if (rollingPts.length > 0) {
      const d = smoothPath(rollingPts);
      teamLines += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.5"/>`;
    }
  });

  // Draw league median dashed line (clipped to selected teams' date range)
  let medianLine = '';
  const hasMedian = clippedMedianData.length > 1;
  if (hasMedian) {
    const medianPts = clippedMedianData.map((d) => ({
      x: dateToX(d.date),
      y: valToY(d.median * 100),
    }));
    const d = smoothPath(medianPts);
    medianLine = `<path d="${d}" fill="none" stroke="#475569" stroke-width="2.3" stroke-dasharray="6 4" stroke-opacity="0.85"/>`;
  }

  // Legend
  let legend = '';
  let legendItemCount = selectedTeams.length;
  selectedTeams.forEach((team, idx) => {
    const color = TEAM_COLORS[idx % TEAM_COLORS.length];
    const xOff = idx * 130;
    legend += `<line x1="${xOff}" y1="2" x2="${xOff + 14}" y2="2" stroke="${color}" stroke-width="2.5"/>`;
    legend += `<text x="${xOff + 18}" y="5" font-size="9.4" font-weight="600" fill="#1f2937">${team} (${rollingWindow}d)</text>`;
  });

  // Add league median legend entry
  if (hasMedian) {
    const xOff = legendItemCount * 130;
    legend += `<line x1="${xOff}" y1="2" x2="${xOff + 14}" y2="2" stroke="#475569" stroke-width="2.3" stroke-dasharray="4 3" stroke-opacity="0.85"/>`;
    legend += `<text x="${xOff + 18}" y="5" font-size="9.4" font-weight="600" fill="#1f2937">League Median</text>`;
    legendItemCount += 1;
  }

  const legendWidth = legendItemCount * 130;
  const legendX = pad.left + (plotW - legendWidth) / 2;

  return `
    <svg width="100%" viewBox="0 0 ${W} ${H + 20}" xmlns="http://www.w3.org/2000/svg" style="font-family:${FONT_FAMILY}">
      <!-- Grid -->
      ${gridLines}
      <!-- X axis -->
      <line x1="${pad.left}" y1="${pad.top + plotH}" x2="${W - pad.right}" y2="${pad.top + plotH}" stroke="#c5d0de" stroke-width="1"/>
      ${xLabels}
      <!-- Y axis label -->
      <text x="12" y="${pad.top + plotH / 2}" text-anchor="middle" font-size="10.6" fill="#334155" font-weight="700" transform="rotate(-90,12,${pad.top + plotH / 2})">% Outs Pitched</text>
      <!-- Team lines -->
      ${teamLines}
      <!-- Median line -->
      ${medianLine}
      <!-- Legend -->
      <g transform="translate(${legendX}, ${H - 2})">
        ${legend}
      </g>
    </svg>
  `;
}

// ─── Patterns Table Builder ─────────────────────────────────────────────────

function buildPatternsTable(patternsData) {
  if (!patternsData || patternsData.length === 0) {
    return '<div style="text-align:center;color:#64748b;padding:20px;font-weight:600;">No patterns data available</div>';
  }

  const metrics = [
    { key: 'back_to_backs', label: 'B2B' },
    { key: 'back_to_back_to_backs', label: 'B2B2B' },
    { key: 'over_3_outs', label: '> 3 Outs' },
    { key: 'over_35_pitches', label: '> 35 P' },
    { key: 'pitch_2_of_3_days', label: '2/3 Days' },
    { key: 'pitch_3_of_5_days', label: '3/5 Days' },
    { key: 'pattern_pitch_off_pitch_off_pitch', label: 'P-O-P-O-P' },
    { key: 'pattern_pitch_off_pitch_off_pitch_off_pitch', label: 'POPOP-OP' },
    { key: 'pattern_pitch_pitch_off_off_pitch_pitch', label: 'PP-OO-PP' },
  ];

  // Compute ranks per metric (1 = highest value)
  const ranked = patternsData.map((row) => ({ ...row }));
  const total = ranked.length;

  for (const m of metrics) {
    const sorted = [...ranked]
      .map((r, i) => ({ val: r[m.key] || 0, idx: i }))
      .sort((a, b) => b.val - a.val);
    sorted.forEach((entry, rank) => {
      ranked[entry.idx][`${m.key}_rank`] = rank + 1;
    });
  }

  // Sort alphabetically
  ranked.sort((a, b) => (a.team_name || '').localeCompare(b.team_name || ''));

  const getRankBg = (rank) => {
    if (!rank || total === 0) return '';
    const normalized = (rank - 1) / Math.max(1, total - 1);
    if (normalized <= 0.33) {
      const intensity = 1 - normalized / 0.33;
      const alpha = (0.08 + intensity * 0.12).toFixed(2);
      return `background:rgba(239,68,68,${alpha});`;
    } else if (normalized >= 0.67) {
      const intensity = (normalized - 0.67) / 0.33;
      const alpha = (0.08 + intensity * 0.12).toFixed(2);
      return `background:rgba(59,130,246,${alpha});`;
    }
    return '';
  };

  const headerCells = ['<th style="text-align:left;">Team</th>']
    .concat(metrics.map((m) => `<th>${m.label}</th>`))
    .join('');

  const bodyRows = ranked.map((row) => {
    const isMets = (row.team_name || '').toLowerCase() === 'mets';
    const bold = isMets ? 'font-weight:700;' : '';
    const teamCell = `<td class="text-left" style="${bold}">${row.team_name || '—'}</td>`;
    const dataCells = metrics.map((m) => {
      const val = row[m.key] || 0;
      const rank = row[`${m.key}_rank`] || '-';
      const bg = getRankBg(row[`${m.key}_rank`]);
      return `<td style="${bg}${bold}">${val.toLocaleString()} <span style="color:#64748b;font-size:8.2px;font-weight:600;">(${rank})</span></td>`;
    }).join('');
    return `<tr>${teamCell}${dataCells}</tr>`;
  }).join('');

  const metricColWidth = `${(100 / (metrics.length + 1)).toFixed(1)}%`;
  const colgroup = `<colgroup><col style="width:auto;"/>${metrics.map(() => `<col style="width:${metricColWidth};"/>`).join('')}</colgroup>`;

  return `
    <table class="data-table" style="table-layout:fixed;width:100%;">
      ${colgroup}
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  `;
}

// ─── CSS ────────────────────────────────────────────────────────────────────

function teamUsageCss() {
  return `
    .page {
      padding: 8px 14px;
    }
    .report-header {
      padding-bottom: 7px;
      margin-bottom: 6px;
    }
    .chart-section {
      margin-bottom: 10px;
    }
    .chart-section .section-title {
      margin-bottom: 7px;
    }
    .filter-badges {
      display: inline-flex;
      gap: 6px;
      margin-left: 8px;
    }
    .filter-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 8.3px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
      background: ${COLORS.cardBg};
      border: 1px solid ${COLORS.cardBorder};
      color: ${COLORS.mutedText};
    }
    .patterns-section {
      margin-top: 2px;
    }
    .patterns-section .section-title {
      margin-bottom: 6px;
      padding-bottom: 3px;
    }
    .patterns-section .data-table td {
      font-size: 9px;
      padding: 3px 5px;
    }
    .patterns-section .data-table th {
      font-size: 8.1px;
      padding: 4px 5px;
    }
    .report-meta {
      font-size: 10.4px;
      font-weight: 600;
    }
    .report-title {
      font-size: 18px;
    }
    .report-subtitle {
      font-size: 11px;
      font-weight: 600;
    }
    .chart-container {
      padding: 12px;
    }
  `;
}

// ─── Main Template ──────────────────────────────────────────────────────────

export function buildTeamUsageReportHtml(data) {
  const {
    generatedAt,
    selectedYear = 2025,
    isStarter = false,
    selectedTeams = [],
    rollingWindow = 28,
    chartData = [],
    leagueMedianData = [],
    seasonPatternsData = [],
    trailing28PatternsData = [],
    trailingWindow = null,
  } = data || {};

  const metsLogoUrl = 'https://upload.wikimedia.org/wikipedia/en/7/7b/New_York_Mets.svg';
  const pitcherType = isStarter ? 'Starters' : 'Bullpen';
  const genTime = formatEasternTimestamp(generatedAt);

  const chartSvg = buildUsageChartSvg(chartData, selectedTeams, rollingWindow, leagueMedianData);
  const seasonPatternsHtml = buildPatternsTable(seasonPatternsData);
  const trailingPatternsHtml = buildPatternsTable(trailing28PatternsData);
  const trailingWindowLabel = trailingWindow?.label || null;
  const mainHeaderTitle = `Team Pitcher Usage Patterns`;
  const mainHeaderSubtitle = `${selectedYear} Season · 1 = Highest`;
  const headerHtml = `
    <div class="report-header">
      <div class="report-header-left">
        <img src="${metsLogoUrl}" alt="Mets" width="36" height="36"/>
        <div>
          <div class="report-title">${mainHeaderTitle}</div>
          <div class="report-subtitle">
            ${mainHeaderSubtitle}
          </div>
        </div>
      </div>
      <div class="report-meta">
        ${genTime ? `Generated ${genTime}` : ''}
      </div>
    </div>
  `;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    ${sharedCss()}
    ${teamUsageCss()}
  </style>
</head>
<body>
  <div class="page">
    ${headerHtml}

    <!-- Patterns Table (Page 1) -->
    <div class="patterns-section">
      ${seasonPatternsHtml}
    </div>
  </div>

  <div class="page" style="page-break-before:always;">
    ${headerHtml}

    <!-- Trailing 28-Day Table (Page 2) -->
    <div class="patterns-section">
      <div class="section-title">
        Team Pitcher Usage Patterns – Previous 28 Days
        ${trailingWindowLabel ? `<span style="font-weight:400;font-size:9px;color:${COLORS.mutedText};">(${trailingWindowLabel})</span>` : ''}
        <span style="font-weight:400;font-size:9px;color:${COLORS.mutedText};">(1 = highest)</span>
      </div>
      ${trailingPatternsHtml}
    </div>
  </div>

  <div class="page" style="page-break-before:always;">
    ${headerHtml}

    <!-- Chart Section (Page 3) -->
    <div class="chart-section">
      <div class="section-title">NYM – % Outs Pitched – ${pitcherType} (${rollingWindow}-Day Rolling Average)</div>
      <div class="chart-container">
        ${chartSvg}
      </div>
    </div>
  </div>
</body>
</html>`;
}
