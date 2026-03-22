/**
 * Shared PDF generation service for pitching-wl-dash workload reports.
 *
 * Endpoints:
 *   POST /generate/pitcher-monitoring – Pitcher monitoring workload table
 *   POST /generate/team-usage         – Team usage chart + patterns report
 *   GET  /health                      – Health check
 *
 * Environment variables:
 *   PORT – listen port (default 8080)
 */

import express from "express";
import { buildPitcherMonitoringFileName } from "./pitcher-monitoring-export.js";
import {
  buildPitcherMonitoringReportHtml,
  PITCHER_MONITORING_TEMPLATE_VERSION,
} from "./templates/pitcher-monitoring.js";
import {
  buildPitcherMonitoringBullpenAltReportHtml,
  PITCHER_MONITORING_BULLPEN_ALT_TEMPLATE_VERSION,
} from "./templates/pitcher-monitoring-bullpen-alt.js";
import {
  buildPitcherMonitoringBullpenClassicReportHtml,
  PITCHER_MONITORING_BULLPEN_CLASSIC_TEMPLATE_VERSION,
} from "./templates/pitcher-monitoring-bullpen-classic.js";
import {
  buildPitcherMonitoringRpPremiumReportHtml,
  PITCHER_MONITORING_RP_PREMIUM_TEMPLATE_VERSION,
} from "./templates/pitcher-monitoring-rp-premium.js";
import { buildTeamUsageReportHtml } from "./templates/team-usage.js";
import { renderPdf, closeBrowser, buildPdfFooterTemplate } from "./renderer.js";

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 8080;

function buildPdfRenderOptions({
  title,
  generatedAt,
  scopeLabel = "",
  landscape = true,
  scale = 1,
  margin = null,
} = {}) {
  void title;
  void generatedAt;
  void scopeLabel;
  return {
    format: "Letter",
    landscape,
    scale,
    displayHeaderFooter: true,
    footerTemplate: buildPdfFooterTemplate(),
    margin: margin || {
      top: "8mm",
      right: "8mm",
      bottom: "10mm",
      left: "8mm",
    },
  };
}

// ─── CORS ───────────────────────────────────────────────────────────────────

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-access-token"
  );
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ─── Health ─────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "cf-pwl-pdf",
    pitcherMonitoringTemplateVersion: PITCHER_MONITORING_TEMPLATE_VERSION,
    pitcherMonitoringBullpenAltTemplateVersion: PITCHER_MONITORING_BULLPEN_ALT_TEMPLATE_VERSION,
    pitcherMonitoringBullpenClassicTemplateVersion: PITCHER_MONITORING_BULLPEN_CLASSIC_TEMPLATE_VERSION,
    pitcherMonitoringRpPremiumTemplateVersion: PITCHER_MONITORING_RP_PREMIUM_TEMPLATE_VERSION,
  });
});

// ─── POST /generate/pitcher-monitoring ─────────────────────────────────────
//
// Body:
//   {
//     gameDate: "YYYY-MM-DD",
//     positionFilter: "TEAM" | "SP" | "RP",
//     templateVariant?: "classic" | "rp_premium" | "bullpen_alt" | "bullpen_classic",
//     activityFilter: "ALL" | "GAME",
//     rosterFilter: "ALL" | "40MAN",
//     dateColumns: [{ date, dayOfWeek, displayDate, opponent? }],
//     pitchers: [{ pitcher_name_last_first, position, days_of_rest,
//                  combined_ewma_7d_total_wl, combined_ewma_28d_total_wl,
//                  flags, daily, sparkline }]
//     daily[*]: { up_count?: number, game?, bullpen?, live_bp?, catch_play?, warmup? }
//     recentRpUsage?: { games: [{ game_id, game_date, game_key, entries: [...] }], metadata? }
//     comments?: string | string[]
//   }
//
// Returns: application/pdf

app.post("/generate/pitcher-monitoring", async (req, res) => {
  const startMs = Date.now();

  try {
    const body = req.body || {};

    if (!body.pitchers?.length) {
      return res.status(400).json({ error: "No pitcher data provided" });
    }

    const generatedAt = new Date().toISOString();
    const templateVariant = body.templateVariant === "bullpen_alt"
      ? "bullpen_alt"
      : body.templateVariant === "rp_premium"
        ? "rp_premium"
      : body.templateVariant === "bullpen_classic"
        ? "bullpen_classic"
        : "classic";

    const html = (templateVariant === "bullpen_alt"
      ? buildPitcherMonitoringBullpenAltReportHtml
      : templateVariant === "rp_premium"
        ? buildPitcherMonitoringRpPremiumReportHtml
      : templateVariant === "bullpen_classic"
        ? buildPitcherMonitoringBullpenClassicReportHtml
        : buildPitcherMonitoringReportHtml)({
      ...body,
      generatedAt,
    });
    const selectedTemplateVersion = templateVariant === "bullpen_alt"
      ? PITCHER_MONITORING_BULLPEN_ALT_TEMPLATE_VERSION
      : templateVariant === "rp_premium"
        ? PITCHER_MONITORING_RP_PREMIUM_TEMPLATE_VERSION
      : templateVariant === "bullpen_classic"
        ? PITCHER_MONITORING_BULLPEN_CLASSIC_TEMPLATE_VERSION
        : PITCHER_MONITORING_TEMPLATE_VERSION;

    const pdfBuffer = await renderPdf(
      html,
      buildPdfRenderOptions({
        title: reportTitleForPosition(body.positionFilter),
        generatedAt,
        scopeLabel: body.workloadViewLabel || body.positionFilter || "",
        scale: templateVariant === "bullpen_alt" ? 0.97 : templateVariant === "bullpen_classic" || templateVariant === "rp_premium" ? 0.985 : 0.965,
        margin: {
          top: "6mm",
          right: "6mm",
          bottom: "13mm",
          left: "6mm",
        },
      })
    );

    const safeDate = String(body.gameDate || "unknown").slice(0, 10);
    const fileName = buildPitcherMonitoringFileName(body.positionFilter, safeDate, templateVariant);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Generation-Time-Ms", String(Date.now() - startMs));
    res.setHeader("X-PDF-Template-Version", selectedTemplateVersion);
    res.setHeader("X-PDF-Template-Variant", templateVariant);

    console.log(
      `[generate/pitcher-monitoring] ${safeDate} – ${body.pitchers.length} pitchers – variant ${templateVariant} – template ${selectedTemplateVersion} – ${Date.now() - startMs}ms`
    );

    return res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error("[generate/pitcher-monitoring] Error:", err);
    return res.status(500).json({
      error: "Failed to generate pitcher monitoring PDF",
      details: err.message,
    });
  }
});

// ─── POST /generate/team-usage ──────────────────────────────────────────────
//
// Body:
//   {
//     selectedYear: number,
//     isStarter: boolean,
//     selectedTeams: string[],
//     rollingWindow: number,
//     chartData: [{ date, teamName, pctOutsPitched, rollingAvg, outs, pitches }],
//     seasonPatternsData: [{ team_name, back_to_backs, ... }],
//     trailing28PatternsData: [{ team_name, back_to_backs, ... }],
//     trailingWindow: { startDate, endDate, windowDays, label }
//   }
//
// Returns: application/pdf

app.post("/generate/team-usage", async (req, res) => {
  const startMs = Date.now();

  try {
    const body = req.body || {};

    if (
      !body.seasonPatternsData?.length &&
      !body.trailing28PatternsData?.length &&
      !body.chartData?.length
    ) {
      return res.status(400).json({ error: "No team usage data provided" });
    }

    const generatedAt = new Date().toISOString();

    const html = buildTeamUsageReportHtml({
      ...body,
      generatedAt,
    });

    const pdfBuffer = await renderPdf(
      html,
      buildPdfRenderOptions({
        title: "Team Usage Report",
        generatedAt,
        scopeLabel: `${body.selectedYear || ""} ${body.isStarter ? "Starters" : "Bullpen"}`.trim(),
        scale: 0.985,
      })
    );

    const safeYear = String(body.selectedYear || "unknown").slice(0, 4);
    const fileName = `team_usage_${safeYear}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Generation-Time-Ms", String(Date.now() - startMs));

    console.log(
      `[generate/team-usage] ${safeYear} – ${body.selectedTeams?.length || 0} teams, ${body.seasonPatternsData?.length || 0} season rows, ${body.trailing28PatternsData?.length || 0} trailing rows – ${Date.now() - startMs}ms`
    );

    return res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error("[generate/team-usage] Error:", err);
    return res.status(500).json({
      error: "Failed to generate team usage PDF",
      details: err.message,
    });
  }
});

function reportTitleForPosition(positionFilter) {
  const normalized = String(positionFilter || "TEAM").toUpperCase();
  if (normalized === "SP") return "Starter Monitoring Report";
  if (normalized === "RP") return "Reliever Monitoring Report";
  return "Pitcher Monitoring Report";
}

// ─── Start ──────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`cf-pwl-pdf listening on port ${PORT}`);
});

// Graceful shutdown
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    console.log(`Received ${sig}, shutting down…`);
    await closeBrowser();
    process.exit(0);
  });
}
