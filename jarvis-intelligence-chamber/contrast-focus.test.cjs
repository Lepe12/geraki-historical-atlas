"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 640 }, colorScheme: "dark" });
  const screenshots = path.join(__dirname, "screenshots", "contrast-ci");
  fs.mkdirSync(screenshots, { recursive: true });

  try {
    await page.setContent(`<!doctype html><html lang="el"><head><meta charset="utf-8">
      <style>:root{--cyan:rgb(81,224,237);--white:#f3ffff;--faint:#c0ced3;--line:#4c6370;--display:serif;--mono:monospace}
      body{background:#081421;color:white;font-family:sans-serif;padding:28px}
      .nx-workspace{position:relative;margin-left:170px}
      .nx-workspace .nx-dock{position:absolute;left:130px;top:100px}
      button{cursor:pointer}</style></head>
      <body><h1>Έλεγχος εστίασης NABOU</h1>
        <aside class="nabou-rail"><button class="nabou-rail-item" id="rail">Research</button></aside>
        <section class="nx-workspace"><div class="nx-dock"><button id="dock"><span>⌕</span><small>Sources</small></button></div></section>
      </body></html>`);
    await page.addStyleTag({ path: path.join(__dirname, "navigation-rail.css") });
    await page.addStyleTag({ path: path.join(__dirname, "photon-windows.css") });

    // Test keyboard focus in normal contrast and accessible high contrast.
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.id), "rail", "Rail must be first keyboard target");
    assert.equal(await page.locator("#rail").evaluate(e => e.matches(":focus-visible")), true);
    const normal = await page.locator("#rail").evaluate(e => getComputedStyle(e).outlineWidth);
    assert.equal(normal, "2px", "Existing normal rail focus outline must remain 2px");

    await page.emulateMedia({ contrast: "more" });
    const high = await page.locator("#rail").evaluate(e => getComputedStyle(e).outlineWidth);
    assert.equal(high, "4px", "High contrast rail focus outline must be 4px");
    await page.screenshot({ path: path.join(screenshots, "nabou-rail-high-contrast.png") });

    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.id), "dock", "Dock must be keyboard reachable");
    assert.equal(await page.locator("#dock").evaluate(e => e.matches(":focus-visible")), true);
    const dock = await page.locator("#dock").evaluate(e => getComputedStyle(e).outlineWidth);
    assert.equal(dock, "2px", "High contrast dock focus outline must be 2px");
    await page.screenshot({ path: path.join(screenshots, "nabou-dock-high-contrast.png") });

    await page.emulateMedia({ contrast: "no-preference" });
    await page.keyboard.press("Shift+Tab");
    assert.equal(await page.evaluate(() => document.activeElement.id), "rail");
    assert.equal(await page.locator("#rail").evaluate(e => getComputedStyle(e).outlineWidth), "2px");
    console.log("PASS Chromium: normal/extra-contrast focus styling; rail 2px→4px, dock 2px; keyboard navigation preserved.");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
