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
            discoveries: [{title:'Δοκιμαστική ιστορική πηγή',url:'https://example.org/source',repository:'Δοκιμαστικό αρχείο'}],
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
    assert.equal(await page.locator("#atlasHome .atlas-home-poster").isVisible(), true);
    assert.equal(await page.locator("#atlasExplore").isVisible(), true);
    assert.equal(await page.locator("#v2rail").isVisible(), false);
    assert.equal(await page.locator("#topbar").isVisible(), false);
    assert.equal(await page.locator("#clock").isVisible(), false);
    assert.equal(await page.locator("#n7-live-test-button").count(), 0);

    // Explore → research page
    await page.locator("#atlasExplore").click();
    await page.waitForFunction(() => document.body.dataset.atlasPage === "research");
    assert.equal(await page.locator("#atlasHome").isVisible(), false);
    assert.equal(await page.locator("#atlasResearch").isVisible(), true);
    assert.equal(await page.locator("#atlasResearch .atlas-panel-head").isVisible(), true);
    assert.equal(await page.locator("#atlasResearch .atlas-panel-title-row h1").isVisible(), false);
    assert.equal(await page.locator("body").evaluate(el => el.classList.contains("atlas-reading")), true);
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


    page.on('console',m=>{if(m.text().startsWith('N7 CLICK'))console.log(m.text());});
    await page.evaluate(()=>document.addEventListener('click',e=>console.log('N7 CLICK',e.target.outerHTML.slice(0,250)),true));
    const nav = key => page.locator('.atlas-page:not([hidden]) [data-atlas-nav="'+key+'"]');
    const go = async key => { await nav(key).click(); };
    for(const width of [390,360]){
      await page.setViewportSize({width,height:900});
      await go('sources');
      console.log('SOURCE NAV',width,await page.locator('body').evaluate(el=>({...el.dataset})),await page.locator('#readerSources').getAttribute('hidden'));
      await page.locator('#readerSources').waitFor({state:'visible',timeout:5000});
      await page.waitForFunction(()=>document.querySelector('#readerSources ol')?.textContent.includes('Δοκιμαστική ιστορική πηγή'));
      assert.equal(await nav('sources').getAttribute('aria-current'),'page');
      await page.locator('#readerSourceSearch').fill('ανύπαρκτο');
      assert.equal(await page.locator('#readerSources li').count(),0);
      await page.locator('#readerSourceSearch').fill('ιστορικη');
      assert.equal(await page.locator('#readerSources li').count(),1);
      assert.equal(await page.locator('#readerSources a').getAttribute('href'),'https://example.org/source');
      await page.locator('#readerSourceSearch').fill('');
      await go('agents');
      assert.equal(await nav('agents').getAttribute('aria-current'),'page');
      await page.locator('#nxsAgentsPage').waitFor({state:'visible'});
      for(const [filter,count]of [['analysis',6],['archive',11],['all',17]]){
        await page.locator('[data-agent-filter="'+filter+'"]').click();
        assert.equal(await page.locator('.nxs-agent-group:not([hidden]) [data-agent]').count(),count);
      }
      // Every researcher opens its inspector and Close returns to the researchers.
      for(const agent of (width===1440?['greek','spanish_simancas','venetian','french','british','dutch','german','italian_states','ottoman','north_african','travellers','source_genealogy','identity_resolution','contradiction','relationship_network','timeline','pirate_base']:['greek'])){
        await page.locator('#nxsAgentGroups [data-agent="'+agent+'"]').click();
        await page.locator('#detailPanel').waitFor({state:'visible'});
        await page.locator('#closeDetail').click();
        await page.locator('#nxsAgentsPage').waitFor({state:'visible'});
      }
      await page.locator('#nxsCloseAgents').click();
      assert.equal(await page.locator('#resultsDrawer').isVisible(),true);
      await go('tools');
      await page.locator('#learningPanel').waitFor({state:'visible'});
      assert.equal(await nav('tools').getAttribute('aria-current'),'page');
      assert.equal(await page.locator('#learningAnalyze').isEnabled(),false);
      assert.equal(await page.locator('#learningSave').isEnabled(),false);
      await page.locator('#closeLearning').click();
      assert.equal(await page.locator('#resultsDrawer').isVisible(),true);
      await go('tools');await go('map');
      assert.equal(await page.locator('#learningPanel').isVisible(),false);
      await go('research');
      assert.equal(await page.locator('#resultsDrawer').isVisible(),true);
      await go('agents');await go('map');
      assert.equal(await page.locator('#nxsAgentsPage').isVisible(),false);
      await page.getByRole('button',{name:'Μεγέθυνση αρχικού χάρτη',exact:true}).click();
      assert.equal(await page.locator('#atlasHome').isVisible(),true);
      assert.ok(Number(await page.locator('.atlas-home-frame').evaluate(el=>el.style.getPropertyValue('--reader-home-zoom')))>1);
      await page.getByRole('button',{name:'Σμίκρυνση αρχικού χάρτη',exact:true}).click();
      await go('sources');await page.keyboard.press('Escape');
      assert.equal(await page.locator('#resultsDrawer').isVisible(),true);
      assert.equal(await page.locator('#readerSources').isVisible(),false);
      await page.keyboard.press('Escape');
      await page.locator('#atlasHome').waitFor({state:'visible'});
      // Clicking the map picture no longer accidentally opens research.
      await page.locator('.atlas-home-frame').click({position:{x:100,y:100}});
      assert.equal(await page.locator('#atlasHome').isVisible(),true);
      await page.locator('#atlasExplore').click();
      await page.locator('#atlasCloseResearch').click();
      assert.equal(await page.locator('#atlasHome').isVisible(),true);
    }
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
