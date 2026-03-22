/**
 * Shared CSS constants and utility functions for PDF report templates.
 * Mets brand colors, table styles, pitch type colors, typography.
 */

const SOURCE_SANS_400_URL = new URL("../assets/fonts/source-sans-3-400.ttf", import.meta.url).href;
const SOURCE_SANS_600_URL = new URL("../assets/fonts/source-sans-3-600.ttf", import.meta.url).href;
const SOURCE_SANS_700_URL = new URL("../assets/fonts/source-sans-3-700.ttf", import.meta.url).href;

export const COLORS = {
  metsNavy: "#002D72",
  metsOrange: "#FF5910",
  metsNavyLight: "#1e3a8a",
  white: "#ffffff",
  pageBackground: "#ffffff",
  text: "#0b1526",
  mutedText: "#475569",
  lightText: "#64748b",
  tableBorder: "#bcc8d8",
  tableHeaderBg: "#002D72",
  tableHeaderText: "#ffffff",
  zebraRow: "#f4f7fb",
  cardBg: "#f5f8fc",
  cardBorder: "#d6dee9",
  pageRule: "#cdd7e5",
  panelBg: "#fbfcfe",
};

export const PITCH_COLORS = {
  "4FB": "#cb2c31",
  "2FB": "#e66f73",
  FF: "#cb2c31",
  FA: "#cb2c31",
  SI: "#f4a6a3",
  FC: "#fd8d3c",
  CT: "#78c679",
  CH: "#41ab5d",
  FS: "#41ab5d",
  CU: "#2e59a8",
  CB: "#2e59a8",
  KC: "#74a9cf",
  SL: "#5b8ac4",
  SW: "#9ebcda",
  SF: "#6aaed6",
  KN: "#a8a29e",
  UN: "#6b7280",
};

export const FONT_FAMILY =
  '"Source Sans 3 PDF", "Source Sans 3", "Segoe UI", Arial, sans-serif';

function fontFaceCss() {
  return `
    @font-face {
      font-family: "Source Sans 3 PDF";
      font-style: normal;
      font-weight: 400;
      font-display: swap;
      src: url("${SOURCE_SANS_400_URL}") format("truetype");
    }
    @font-face {
      font-family: "Source Sans 3 PDF";
      font-style: normal;
      font-weight: 600;
      font-display: swap;
      src: url("${SOURCE_SANS_600_URL}") format("truetype");
    }
    @font-face {
      font-family: "Source Sans 3 PDF";
      font-style: normal;
      font-weight: 700;
      font-display: swap;
      src: url("${SOURCE_SANS_700_URL}") format("truetype");
    }
  `;
}

/**
 * Returns the shared <style> block for all PDF templates.
 */
export function sharedCss() {
  return `
    ${fontFaceCss()}
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html {
      background: ${COLORS.pageBackground};
    }
    body {
      font-family: ${FONT_FAMILY};
      color: ${COLORS.text};
      background: ${COLORS.pageBackground};
      font-size: 11.35px;
      line-height: 1.38;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      text-rendering: geometricPrecision;
      font-synthesis-weight: none;
    }
    .page {
      width: 100%;
      padding: 12px 16px;
    }

    /* Header */
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid ${COLORS.metsNavy};
      padding-bottom: 9px;
      margin-bottom: 10px;
    }
    .report-header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .report-title {
      font-size: 20px;
      font-weight: 800;
      color: ${COLORS.metsNavy};
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .report-subtitle {
      font-size: 12px;
      font-weight: 600;
      color: ${COLORS.mutedText};
      margin-top: 2px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .report-meta {
      text-align: right;
      font-size: 10px;
      font-weight: 600;
      color: ${COLORS.mutedText};
      line-height: 1.35;
    }

    /* Summary cards row */
    .summary-row {
      display: flex;
      gap: 8px;
      margin-bottom: 14px;
    }
    .summary-card {
      flex: 1;
      background: ${COLORS.cardBg};
      border: 1px solid ${COLORS.cardBorder};
      border-radius: 8px;
      padding: 8px 10px 7px;
      text-align: center;
    }
    .summary-card-label {
      font-size: 9.2px;
      font-weight: 600;
      color: ${COLORS.mutedText};
      text-transform: uppercase;
      letter-spacing: 0.35px;
      margin-bottom: 2px;
    }
    .summary-card-value {
      font-size: 18.5px;
      font-weight: 800;
      color: ${COLORS.metsNavy};
      font-variant-numeric: tabular-nums;
    }

    /* Section headers */
    .section-title {
      font-size: 12.5px;
      font-weight: 700;
      color: ${COLORS.metsNavy};
      text-transform: uppercase;
      letter-spacing: 0.32px;
      margin-bottom: 7px;
      padding-bottom: 4px;
      border-bottom: 1px solid ${COLORS.pageRule};
    }

    /* Tables */
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.25px;
      font-variant-numeric: tabular-nums;
    }
    .data-table th {
      background: ${COLORS.tableHeaderBg};
      color: ${COLORS.tableHeaderText};
      padding: 6px 8px;
      font-weight: 700;
      text-align: center;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.24px;
      white-space: nowrap;
      border: 1px solid ${COLORS.metsNavyLight};
    }
    .data-table td {
      padding: 5px 8px;
      text-align: center;
      border: 1px solid ${COLORS.tableBorder};
      white-space: nowrap;
    }
    .data-table tbody tr:nth-child(even) {
      background: ${COLORS.zebraRow};
    }
    .data-table td.text-left {
      text-align: left;
      font-weight: 600;
    }

    /* Two-column layout */
    .two-col {
       display: flex;
       gap: 16px;
       margin-bottom: 12px;
     }
    .two-col > * {
      flex: 1;
    }

    /* Three-column layout */
    .three-col {
      display: flex;
      gap: 16px;
      margin-bottom: 12px;
    }
    /* Chart containers */
     .chart-container {
       border: 1px solid ${COLORS.cardBorder};
       border-radius: 8px;
       padding: 10px 11px;
       background: ${COLORS.panelBg};
     }

    /* Footer */
    .report-footer {
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px solid ${COLORS.pageRule};
      display: flex;
      justify-content: flex-end;
      font-size: 8px;
      font-weight: 600;
      color: ${COLORS.mutedText};
      letter-spacing: 0.15px;
    }

    /* Pitch type color dot */
    .pitch-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 4px;
      vertical-align: middle;
    }

    /* Legend */
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: center;
      margin-top: 6px;
      font-size: 9.2px;
      color: ${COLORS.mutedText};
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 3px;
    }
  `;
}

/**
 * Format a number to fixed decimal places, returning "—" for null/undefined.
 */
export function fmt(value, decimals = 1) {
  if (value == null || isNaN(value)) return "—";
  return Number(value).toFixed(decimals);
}

/**
 * Format a percentage value.
 */
export function fmtPct(value, decimals = 1) {
  if (value == null || isNaN(value)) return "—";
  return `${Number(value).toFixed(decimals)}%`;
}

/**
 * Get pitch type color, with fallback.
 */
export function pitchColor(type) {
  return PITCH_COLORS[type] || PITCH_COLORS.UN;
}
