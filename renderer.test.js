import test from "node:test";
import assert from "node:assert/strict";

import { buildBlankHeaderTemplate, buildPdfFooterTemplate } from "./renderer.js";

test("buildPdfFooterTemplate renders a minimal pagination footer", () => {
  const html = buildPdfFooterTemplate();

  assert.match(html, /Page <span class="pageNumber"><\/span> of <span class="totalPages"><\/span>/);
  assert.match(html, /Source Sans 3 PDF/);
  assert.match(html, /font-weight: 600/);
  assert.doesNotMatch(html, /Report/);
  assert.doesNotMatch(html, /Generated/);
});

test("buildBlankHeaderTemplate returns an empty chrome-safe fragment", () => {
  assert.equal(buildBlankHeaderTemplate(), "<div></div>");
});
