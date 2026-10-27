// ─── Mermaid Diagram Rendering API ─────────────────────────────────────────
// Render Mermaid code to PNG or SVG images via Puppeteer.
//
// Endpoints:
//   POST /render  — Render diagram from JSON body { code, format, theme, scale }
//   GET  /render  — Render diagram from query string ?code=...&format=...
//   GET  /health  — Health check (used by Railway HEALTHCHECK)
//   GET  /        — API info

const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");

const PORT = parseInt(process.env.PORT, 10) || 8080;
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || null;
const MAX_CODE_LENGTH = 50_000;
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT, 10) || 4;

// ── App setup ──────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: "1mb" }));

// ── Request logging ──────────────────────────────────────────────────────
// Railway captures stdout, so one line per request is the service's log.
// Health probes are logged on purpose: their cadence is what keeps a
// serverless (sleepApplication) container warm, and it is otherwise
// invisible because /health itself logs nothing. Bodies are never logged
// (diagram code can be 50k chars); renders log a one-line summary instead.
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on("finish", () => {
    console.log(`[mermaid] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - t0}ms`);
  });
  next();
});

// ── Puppeteer browser pool ─────────────────────────────────────────────────

class BrowserPool {
  constructor(max) {
    this.max = max;
    this.available = [];
    this.waiting = [];
  }

  async acquire() {
    if (this.available.length > 0) {
      return this.available.pop();
    }
    if (this.active() < this.max) {
      const browser = await this._launch();
      return browser;
    }
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  release(browser) {
    if (this.waiting.length > 0) {
      const resolve = this.waiting.shift();
      resolve(browser);
    } else {
      this.available.push(browser);
    }
  }

  active() {
    return this.available.length + this.waiting.length;
  }

  async _launch() {
    const launchOpts = {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-crashpad-forwarding",
      ],
    };
    if (CHROMIUM_PATH) {
      launchOpts.executablePath = CHROMIUM_PATH;
    }
    return puppeteer.launch(launchOpts);
  }
}

const browserPool = new BrowserPool(MAX_CONCURRENT);

// ── Render engine ──────────────────────────────────────────────────────────

function buildHtml(mermaidCode, theme) {
  const sanitized = mermaidCode
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  return `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: transparent;
    }
    #diagram { max-width: 100%; }
    svg { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  <div id="diagram" class="mermaid">${sanitized}</div>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <script>
    mermaid.initialize({
      startOnLoad: true,
      theme: "${theme}",
      securityLevel: 'strict',
      logLevel: 'error'
    });
    window.onload = function() {
      document.body.dataset.rendered = 'true';
    };
  </script>
</body>
</html>`;
}

async function waitForRender(page, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const rendered = await page.evaluate(() => document.body.dataset.rendered === "true");
    if (rendered) return true;
    const hasSvg = await page.evaluate(() => !!document.querySelector("#diagram svg"));
    if (hasSvg) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

async function renderToPng(page, scale) {
  const clip = await page.evaluate(() => {
    const el = document.querySelector("#diagram svg") || document.querySelector("#diagram");
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  if (!clip) throw new Error("No diagram element found after rendering");

  return Buffer.from(await page.screenshot({
    clip,
    type: "png",
    scale: Math.min(Math.max(scale || 2, 1), 4),
  }));
}

async function renderToSvg(page) {
  const svg = await page.evaluate(() => {
    const el = document.querySelector("#diagram svg");
    if (!el) return null;
    return new XMLSerializer().serializeToString(el);
  });
  if (!svg) throw new Error("No SVG element found after rendering");
  return Buffer.from(svg, "utf-8");
}


// ── Request handler ────────────────────────────────────────────────────────

async function handleRender(code, format, theme, scale) {
  if (!code || typeof code !== "string" || code.trim().length === 0) {
    throw Object.assign(new Error("Missing or empty 'code' parameter"), { status: 400 });
  }
  if (code.length > MAX_CODE_LENGTH) {
    throw Object.assign(new Error("Code exceeds maximum length"), { status: 400 });
  }

  const safeFormat = format === "svg" ? "svg" : "png";
  const safeTheme = ["default", "dark", "forest", "neutral", "base"].includes(theme)
    ? theme
    : "default";

  const browser = await browserPool.acquire();
  let page = null;

  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

    const html = buildHtml(code, safeTheme);
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 20000 });

    const rendered = await waitForRender(page);
    if (!rendered) {
      throw Object.assign(new Error("Diagram rendering timed out"), { status: 422 });
    }

    if (safeFormat === "svg") {
      const buf = await renderToSvg(page);
      return { data: buf, contentType: "image/svg+xml" };
    } else {
      const buf = await renderToPng(page, scale || 2);
      return { data: buf, contentType: "image/png" };
    }
  } catch (err) {
    if (!err.status) err.status = 500;
    throw err;
  } finally {
    if (page) await page.close().catch(() => {});
    browserPool.release(browser);
  }
}

// ── Routes ──────────────────────────────────────────────────────────────────

app.get("/", (_req, res) => {
  res.json({
    service: "Mermaid API",
    version: "1.0.0",
    endpoints: {
      POST: { path: "/render", body: { code: "string (required)", format: '"png" | "svg"', theme: '"default" | "dark" | "forest" | "neutral"', scale: "number (1-4, PNG only)" } },
      GET: { path: "/render", query: "?code=...&format=...&theme=...&scale=..." },
    },
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", pool: { active: browserPool.active(), available: browserPool.available.length } });
});

app.post("/render", async (req, res) => {
  try {
    const { code, format, theme, scale } = req.body;
    const result = await handleRender(code, format || "png", theme || "default", scale);
    res.set("Content-Type", result.contentType);
    res.send(result.data);
    console.log(`[mermaid] render ok format=${format || "png"} code_len=${code.length} bytes=${result.data.length}`);
  } catch (err) {
    const status = err.status || 500;
    console.error(`[mermaid] render error status=${status} ${err.message}`);
    res.status(status).json({ error: err.message });
  }
});

app.get("/render", async (req, res) => {
  try {
    const { code, format, theme, scale } = req.query;
    const result = await handleRender(code, format || "png", theme || "default", Number(scale) || undefined);
    res.set("Content-Type", result.contentType);
    res.send(result.data);
    console.log(`[mermaid] render ok format=${format || "png"} code_len=${code.length} bytes=${result.data.length}`);
  } catch (err) {
    const status = err.status || 500;
    console.error(`[mermaid] render error status=${status} ${err.message}`);
    res.status(status).json({ error: err.message });
  }
});

// ── Start server ────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Mermaid API listening on port ${PORT}`);
});
