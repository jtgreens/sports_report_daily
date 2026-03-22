/**
 * Playwright-based PDF renderer.
 *
 * Renders an HTML string to a vector PDF using headless Chromium.
 * Manages a browser singleton for fast repeated renders within the same process.
 */

import { chromium } from "playwright";

let browserInstance = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildPdfFooterTemplate({
  reportTitle = "",
  generatedLabel = "",
  scopeLabel = "",
} = {}) {
  void reportTitle;
  void generatedLabel;
  void scopeLabel;

  return `
    <div style="
      width: 100%;
      padding: 0 8mm;
      font-family: 'Source Sans 3 PDF', 'Source Sans 3', 'Segoe UI', Arial, sans-serif;
      font-size: 8.4px;
      font-weight: 600;
      color: #475569;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      line-height: 1.2;
      letter-spacing: 0.15px;
    ">
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>
  `;
}

export function buildBlankHeaderTemplate() {
  return '<div></div>';
}

/**
 * Get or create a shared browser instance.
 * Reusing the browser avoids the ~1-2 s cold-start cost on every request.
 */
async function getBrowser() {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }

  browserInstance = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });

  browserInstance.on("disconnected", () => {
    browserInstance = null;
  });

  return browserInstance;
}

/**
 * Render an HTML string to a PDF buffer.
 *
 * @param {string} html – complete HTML document
 * @param {Object} [opts]
 * @param {string} [opts.format]    – page format (default "Letter")
 * @param {boolean} [opts.landscape] – landscape orientation (default true)
 * @param {Object} [opts.margin]    – page margins
 * @returns {Promise<Buffer>} PDF file contents
 */
export async function renderPdf(html, opts = {}) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1680, height: 1188 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  try {
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.emulateMedia({ media: "print" });

    // Wait for fonts to settle.
    await page.evaluate(async () => {
      if (document.fonts?.ready) {
        try {
          await document.fonts.ready;
        } catch {
          // System fallbacks are fine.
        }
      }
    });

    await page.waitForTimeout(150);

    const displayHeaderFooter = Boolean(opts.displayHeaderFooter);
    const margin = opts.margin || {
      top: "8mm",
      right: "8mm",
      bottom: displayHeaderFooter ? "10mm" : "8mm",
      left: "8mm",
    };

    const pdfBuffer = await page.pdf({
      format: opts.format || "Letter",
      landscape: opts.landscape !== false,
      scale: opts.scale || 1,
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter,
      headerTemplate: displayHeaderFooter
        ? (opts.headerTemplate || buildBlankHeaderTemplate())
        : undefined,
      footerTemplate: displayHeaderFooter
        ? (opts.footerTemplate || buildPdfFooterTemplate(opts.footerContext))
        : undefined,
      margin,
    });

    return pdfBuffer;
  } finally {
    await context.close();
  }
}

/**
 * Gracefully shut down the browser (call on process exit).
 */
export async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
}
