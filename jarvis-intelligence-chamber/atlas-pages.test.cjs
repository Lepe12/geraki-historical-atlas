// Atlas home vs research page states — no stacked lab chrome underneath.
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
      res.setHeader(
        "content-type",
        file.endsWith(".js")
          ? "text/javascript"
          : file.endsWith(".css")
            ? "text/css"
            : file.endsWith(".png") || file.endsWith(".jpg")
              ? "image/" + path.extname(file).slice(1)
              : "text/html",
      );
      res.end(fs.readFileSync(file));
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.JARVIS_BROWSER_EXECUTABLE
        ? { executablePath: process.env.JARVIS_BROWSER_EXECUTABLE }
        : {}),
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (r) => {
      if (!r.request().url().startsWith("https://")) return r.continue();
      const u = r.request().url();
      if (u.includes("raw.githubusercontent.com") || u.includes("/status/")) {
        return r.fulfill({
          json: {
            schema: "pct-command-center-live-v1",
            run_id: "100",
            mission: { target: "Δοκιμή", status: "COMPLETED" },
            agents: [],
            claims: [],
            blockers: [],
            discoveries: [],
            events: [],
            safety: { automatic_verified: false },
          },
        });
      }
      return r.abort();
    });
    await page.routeWebSocket(/.*/, () => {});
    await page.goto(
      "http://127.0.0.1:" + server.address().port + "/jarvis-intelligence-chamber/?skip=1",
    );
    await page.waitForFunction(() => document.body.classList.contains("atlas-ui"));
    await page.waitForFunction(() => document.body.dataset.atlasPage === "home");

    // Home: home chrome visible, research chrome not, lab rail/clock not visible.
    assert.equal(await page.locator("#atlasHome").isVisible(), true);
    assert.equal(await page.locator("#atlasResearch").isVisible(), false);
    assert.equal(await page.locator("#atlasHome >> text=Στα ίχνη της ιστορίας.").isVisible(), true);
    assert.equal(await page.locator("#atlasExplore").isVisible(), true);
    assert.equal(await page.locator("#v2rail").isVisible(), false);
    assert.equal(await page.locator("#topbar").isVisible(), false);
    assert.equal(await page.locator("#clock").isVisible(), false);
    assert.equal(await page.locator("#n7-live-test-button").count(), 0);
    assert.ok(await page.locator("#chartFrame").isVisible(), "live map must remain");
    assert.ok(await page.locator("#zoomIn").isVisible(), "zoom stays");

    // Explore → research page
    await page.locator("#atlasExplore").click();
    await page.waitForFunction(() => document.body.dataset.atlasPage === "research");
    assert.equal(await page.locator("#atlasHome").isVisible(), false);
    assert.equal(await page.locator("#atlasResearch").isVisible(), true);
    assert.equal(await page.locator("#atlasResearch >> text=Η έρευνά μου").first().isVisible(), true);
    assert.equal(await page.locator("#resultsDrawer").isVisible(), true);
    assert.equal(await page.locator("#operatorCommand").isVisible(), true);
    assert.equal(await page.locator("#v2rail").isVisible(), false);
    assert.equal(await page.locator("#topbar").isVisible(), false);
    // Only one atlas page root on screen
    assert.equal(await page.locator(".atlas-page:visible").count(), 1);

    // Close → home
    await page.locator("#atlasCloseResearch").click();
    await page.waitForFunction(() => document.body.dataset.atlasPage === "home");
    assert.equal(await page.locator("#atlasHome").isVisible(), true);
    assert.equal(await page.locator("#atlasResearch").isVisible(), false);

    assert.deepEqual(errors, []);
    console.log("PASS atlas home/research page states; lab chrome not visible underneath");
  } finally {
    await browser?.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
