# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
# Start the server
npm start
# or
npm run dev

# Run tests (using Node.js built-in test runner)
node --test *.test.js templates/*.test.js

# Run a single test file
node --test <filename>.test.js
```

### Docker
```bash
# Build Docker image
docker build -t cf-pwl-pdf .

# Run container locally
docker run -p 8080:8080 cf-pwl-pdf
```

## Architecture Overview

This is a PDF generation service for baseball pitching workload reports. It runs as an Express.js server that converts HTML to PDF using Playwright with headless Chromium.

### Core Components

**Server (`server.js`)**: Express API with three main endpoints:
- `POST /generate/pitcher-monitoring` - Generates pitcher monitoring workload tables
- `POST /generate/team-usage` - Generates team usage charts and pattern reports
- `GET /health` - Health check endpoint

**Renderer (`renderer.js`)**: Manages Playwright browser singleton for PDF generation. Key functions:
- `renderPdf()` - Converts HTML to vector PDF with customizable page settings
- `buildPdfFooterTemplate()` - Creates pagination footers
- Maintains browser instance for fast repeated renders

**Templates (`templates/`)**: HTML generators for different report types. Each template exports:
- Main HTML builder function (e.g., `buildPitcherMonitoringReportHtml()`)
- Template version constant for tracking changes
- Shared styles via `shared-styles.js` for consistent Mets branding

### Data Flow

1. Client POSTs report data to `/generate/*` endpoint
2. Server validates request and calls appropriate template builder
3. Template generates styled HTML with embedded data
4. Renderer converts HTML to PDF via Playwright
5. Server returns PDF buffer with appropriate headers

### Testing Approach

Tests use Node.js built-in test runner (`node:test`). Each template has a corresponding `.test.js` file that validates HTML generation and data transformations. Run all tests with `node --test` or individual files directly.

### Deployment

Deployed to Google Cloud Run via Bitbucket Pipelines on push to main branch. Configuration in `bitbucket-pipelines.yml` sets up 2GB memory, 2 CPU instances with auto-scaling.