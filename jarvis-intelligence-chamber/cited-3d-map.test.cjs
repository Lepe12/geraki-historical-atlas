// Static-file check of the cited 3D chart. No production research calls.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

(async () => {
  const root = path.resolve(__dirname, "..");
  const server = http.createServer((req, res) => {
    let file = path.join(root, new URL(req.url, "http://local").pathname);
    if (file.endsWith("/")) file += "index.html";
    try {
      const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html";
      res.setHeader("content-type", type);
      res.end(fs.readFileSync(file));
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port + "/jarvis-intelligence-chamber/";
  const shotDir = process.env.NABOU_SCREENSHOT_DIR || "/opt/cursor/artifacts/screenshots";
  fs.mkdirSync(shotDir, { recursive: true });
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.JARVIS_BROWSER_EXECUTABLE ? { executablePath: process.env.JARVIS_BROWSER_EXECUTABLE } : {}),
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
    });
    const snapshot = {
      schema: "pct-command-center-live-v1",
      run_id: "100",
      mission: { target: "Δοκιμή διεπαφής", status: "COMPLETED" },
      agents: [{ id: "greek", status: "COMPLETED" }],
      claims: [],
      blockers: [],
      discoveries: [],
      events: [],
      safety: { automatic_verified: false },
    };
    async function open(width, height, motion) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: motion });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => {
        if (!route.request().url().startsWith("https://")) return route.continue();
        const url = route.request().url();
        if (url.includes("raw.githubusercontent.com")) return route.fulfill({ json: snapshot });
        if (url.includes("/status/")) return route.fulfill({ json: { snapshot, events: [] } });
        return route.abort();
      });
      await page.routeWebSocket(/.*/, () => {});
      await page.goto(base);
      await page.waitForFunction(() => window.NABOU_CITED_3D && document.querySelector("#cited3dToggle"));
      return { page, errors };
    }

    const desktop = await open(1440, 900, "no-preference");
    assert.equal(await desktop.page.locator("#cited3dToggle").isEnabled(), true);
    assert.equal(await desktop.page.locator("#nodeLabels .node-label").count(), 17);
    assert.equal(await desktop.page.locator("#cited3dPanel").isVisible(), false);
    const beforeZoom = await desktop.page.locator("#zoomLevel").innerText();
    await desktop.page.locator("#zoomIn").click();
    await desktop.page.waitForFunction((before) => document.querySelector("#zoomLevel").textContent !== before, beforeZoom);

    await desktop.page.locator("#cited3dToggle").click();
    await desktop.page.locator("#cited3dPanel").waitFor({ state: "visible" });
    const panel = await desktop.page.locator("#cited3dPanel").innerText();
    assert.match(panel, /Αλεξάνδρεια/);
    assert.match(panel, /Κωνσταντινούπολη/);
    assert.match(panel, /Κουτζακιώτης/);
    assert.match(panel, /220/);
    assert.match(panel, /νηοπομπή/);
    assert.match(panel, /σχηματική/);
    assert.deepEqual(
      (await desktop.page.locator(".cited3d-place").allTextContents()).sort(),
      ["Αλεξάνδρεια", "Κωνσταντινούπολη"]
    );
    const start = await desktop.page.evaluate(() => window.NABOU_CITED_3D.progress);
    await desktop.page.waitForFunction((value) => window.NABOU_CITED_3D.progress !== value, start);
    await desktop.page.locator("#cited3dPanel button[data-voyage='1']").click();
    const second = await desktop.page.locator("#cited3dPanel").innerText();
    assert.match(second, /Μαμελούκων/);
    assert.match(second, /δεν δηλώνει κατεύθυνση/);
    await desktop.page.locator("#cited3dPanel summary").click();
    const excluded = await desktop.page.locator("#cited3dPanel").innerText();
    assert.match(excluded, /Καψής|Κάψης/);
    assert.match(excluded, /Αστυπάλαια/);
    assert.match(excluded, /Δεν σχεδιάστηκαν/);
    assert.equal(await desktop.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await desktop.page.screenshot({ path: path.join(shotDir, "cited-3d-routes.png"), animations: "disabled" });

    await desktop.page.locator("#cited3dToggle").click();
    assert.equal(await desktop.page.locator("#cited3dPanel").isVisible(), false);
    assert.equal(await desktop.page.locator("#cited3d").evaluate((node) => getComputedStyle(node).visibility), "hidden");
    assert.equal(await desktop.page.locator("body").evaluate((node) => node.classList.contains("nx-cited-3d")), false);
    assert.equal(await desktop.page.locator("#nodeLabels .node-label").count(), 17);
    assert.deepEqual(desktop.errors, []);
    await desktop.page.close();

    const mobile = await open(390, 844, "reduce");
    await mobile.page.locator("#cited3dToggle").click();
    await mobile.page.locator("#cited3dPanel").waitFor({ state: "visible" });
    const frozen = await mobile.page.evaluate(() => window.NABOU_CITED_3D.progress);
    await mobile.page.waitForTimeout(300);
    assert.equal(await mobile.page.evaluate(() => window.NABOU_CITED_3D.progress), frozen);
    assert.match(await mobile.page.locator("#cited3dPanel").innerText(), /Αλεξάνδρεια/);
    assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await mobile.page.screenshot({ path: path.join(shotDir, "cited-3d-routes-mobile.png"), animations: "disabled" });
    assert.deepEqual(mobile.errors, []);
    await mobile.page.close();
    console.log("PASS cited 3D map");
  } finally {
    await browser?.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
