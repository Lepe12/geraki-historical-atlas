// Nightly read-only health check of the live NABOU//X page on GitHub Pages.
// - Loads the page (2D) and the 3D map (?map3d=1) in headless Chromium.
// - Fails on: uncaught JS errors, same-site requests answering >= 400, broken same-site links/images,
//   external links/assets answering 404/410, 3D map not becoming ready.
// - Read-only: every non-GET/HEAD request the page tries is blocked (never POSTs to any backend).
// Usage: SITE_URL=... node tools/site_health/check_site.mjs [report.json]
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const SITE = process.env.SITE_URL || "https://lepe12.github.io/geraki-historical-atlas/jarvis-intelligence-chamber/";
const OUT = process.argv[2] || "site-health-report.json";
const origin = new URL(SITE).origin;
const sitePrefix = new URL("/geraki-historical-atlas/", SITE).href;
const sameSite = (u) => u.startsWith(sitePrefix);
const problems = [];   // fail the run
const warnings = [];   // reported only
const blocked = [];    // non-GET requests the page attempted (blocked, not an error)

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

async function visit(label, url, after) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const seen = new Map();
  await page.route("**/*", (route) => {
    const m = route.request().method();
    if (m === "GET" || m === "HEAD") return route.continue();
    blocked.push({ label, method: m, url: route.request().url() });
    return route.abort("blockedbyclient");
  });
  page.on("pageerror", (e) => problems.push({ label, type: "js-error", message: String(e && e.message || e).slice(0, 500) }));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/Failed to load resource|net::ERR_BLOCKED_BY_CLIENT/.test(t)) return; // covered by response checks
    warnings.push({ label, type: "console-error", message: t.slice(0, 500) });
  });
  page.on("response", (r) => {
    const u = r.url(), s = r.status();
    seen.set(u, s);
    if (s >= 400 && sameSite(u)) problems.push({ label, type: "asset-http", status: s, url: u });
    else if ((s === 404 || s === 410) && !u.startsWith("data:")) problems.push({ label, type: "external-asset-missing", status: s, url: u });
    else if (s >= 400) warnings.push({ label, type: "external-asset-http", status: s, url: u });
  });
  page.on("requestfailed", (r) => {
    const f = r.failure()?.errorText || "";
    if (/ERR_BLOCKED_BY_CLIENT|ERR_ABORTED/.test(f)) return;
    (sameSite(r.url()) ? problems : warnings).push({ label, type: "request-failed", error: f, url: r.url() });
  });
  const resp = await page.goto(url, { waitUntil: "load", timeout: 60000 });
  if (!resp || resp.status() >= 400) problems.push({ label, type: "page-http", status: resp?.status() ?? 0, url });
  await page.waitForTimeout(3000);
  const extra = after ? await after(page) : {};
  return { page, seen, extra };
}

// 1) default 2D page
const main = await visit("page", SITE, async (page) => {
  const imgs = await page.$$eval("img", (els) => els.filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc).map((i) => i.currentSrc));
  for (const u of imgs) problems.push({ label: "page", type: "broken-image", url: u });
  return {
    links: await page.$$eval("a[href]", (els) => [...new Set(els.map((a) => a.href))]),
    title: await page.title(),
  };
});
await main.page.close();

// 2) links found on the page (GET only, no body kept)
const links = main.extra.links.filter((u) => /^https?:/.test(u)).map((u) => u.split("#")[0]);
for (const u of [...new Set(links)]) {
  if (main.seen.has(u)) continue;
  let status = 0, err = "";
  try {
    const ctrl = AbortSignal.timeout(20000);
    const r = await fetch(u, { method: "GET", redirect: "follow", signal: ctrl, headers: { "user-agent": "nabou-site-health/1.0 (read-only link check)" } });
    status = r.status;
    try { await r.body?.cancel(); } catch {}
  } catch (e) { err = String(e.message || e); }
  if (sameSite(u) && (status >= 400 || err)) problems.push({ label: "link", type: "broken-link", status, error: err, url: u });
  else if (status === 404 || status === 410) problems.push({ label: "link", type: "broken-external-link", status, url: u });
  else if (status >= 400 || err) warnings.push({ label: "link", type: "external-link-unreachable", status, error: err, url: u });
}

// 3) 3D map
const sep = SITE.includes("?") ? "&" : "?";
const three = await visit("map3d", SITE + sep + "map3d=1", async (page) => {
  try {
    await page.waitForFunction(() => window.NABOU_MAP3D && window.NABOU_MAP3D.supported !== undefined, null, { timeout: 30000 });
    const supported = await page.evaluate(() => window.NABOU_MAP3D.supported);
    if (!supported) { warnings.push({ label: "map3d", type: "no-webgl", message: "WebGL unavailable in CI browser; 3D not checked" }); return { ok: false }; }
    await page.evaluate(() => window.NABOU_MAP3D.enabled || window.NABOU_MAP3D.set(true));
    await page.waitForFunction(() => window.NABOU_MAP3D.ready && window.NABOU_MAP3D.enabled, null, { timeout: 60000 });
    await page.waitForTimeout(4000);
    const canvas = await page.$eval(".map3d-gl canvas", (c) => ({ w: c.width, h: c.height })).catch(() => null);
    if (!canvas || !canvas.w || !canvas.h) problems.push({ label: "map3d", type: "no-canvas", message: "3D canvas missing or empty" });
    await page.screenshot({ path: "site-health-map3d.png" }).catch(() => {});
    return { ok: true, canvas };
  } catch (e) {
    problems.push({ label: "map3d", type: "map3d-not-ready", message: String(e.message || e).slice(0, 300) });
    await page.screenshot({ path: "site-health-map3d.png" }).catch(() => {});
    return { ok: false };
  }
});
await three.page.close();
await browser.close();

const report = {
  site: SITE, checked_utc: new Date().toISOString(), title: main.extra.title,
  links_checked: new Set(links).size, map3d: three.extra,
  ok: problems.length === 0, problems, warnings, blocked_non_get_requests: blocked,
};
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`site health: ${report.ok ? "OK" : "FAIL"} · ${problems.length} problem(s), ${warnings.length} warning(s), ${links.length} link(s), blocked non-GET: ${blocked.length}`);
for (const p of problems) console.log("PROBLEM", JSON.stringify(p));
for (const w of warnings) console.log("warning", JSON.stringify(w));
process.exit(report.ok ? 0 : 1);
