const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { PNG } = require('pngjs');

const base = process.env.N7_VISUAL_URL || 'http://127.0.0.1:4173/n7-apex-step5-hacker-3d/';
const out = process.env.N7_HACKER_OUT || '/tmp/n7-hacker-evidence';
const label = 'N7 guide artwork-tile humanoid';

function difference(a, b, firstRow, lastRow) {
  assert.equal(a.width, b.width);
  assert.equal(a.height, b.height);
  let changed = 0;
  for (let i = firstRow * a.width * 4; i < lastRow * a.width * 4; i += 4) {
    const delta = [0, 1, 2].reduce((sum, channel) =>
      sum + Math.abs(a.data[i + channel] - b.data[i + channel]), 0);
    if (delta > 24) changed++;
  }
  return changed;
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
    page.setDefaultTimeout(60000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && message.text().includes('THREE.WebGLProgram')) errors.push(message.text());
    });
    const button = name => page.getByRole('button', { name, exact: true });
    const response = await page.goto(new URL('?controls=1&face=n7', base).href, { waitUntil: 'domcontentloaded' });
    assert(response.ok());
    const host = page.getByLabel(label, { exact: true });
    const canvas = host.locator('canvas:visible');
    const wait = condition => page.waitForFunction(condition, label);
    await wait(label => document.querySelector('[aria-label="'+label+'"]')?.dataset.referenceReady === 'true');
    await button('Idle').click();
    await button('Technical details').click();
    await page.getByRole('checkbox', { name: 'Breathing' }).uncheck();
    const box = await host.boundingBox();
    const move = async (yaw, pitch) => {
      await page.mouse.move(box.x + box.width * (.5 + .44 * yaw), box.y + box.height * (.5 - .44 * pitch));
      await page.waitForFunction(({ label, yaw, pitch }) => {
        const {currentTurn, currentPitch} = document.querySelector('[aria-label="'+label+'"]').dataset;
        return +currentTurn === yaw && +currentPitch === pitch;
      }, { label, yaw, pitch });
    };
    const pixels = async name => {
      const url = await canvas.evaluate(element => element.toDataURL('image/png'));
      const buffer = Buffer.from(url.split(',')[1], 'base64');
      if (name) fs.writeFileSync(path.join(out, name + '.png'), buffer);
      return PNG.sync.read(buffer);
    };

    // Use the animated renderer for both outfits at the same head pose.
    await move(1, 0);
    const original = await pixels('original-right');
    await button('Hacker outfit').click();
    await move(-1, 0);
    await move(1, 0);
    const right = await pixels('hacker-right');
    assert.equal(difference(original, right, 0, 231), 0, 'Outfit toggle altered the posed head or hair');
    assert(difference(original, right, 255, 475) > 3000, 'No visible fitted garment');
    await move(0, 0);
    const neutral = await pixels('hacker-front');
    for (const [name, yaw, pitch] of [['left', -1, 0], ['up', 0, 1], ['down', 0, -1], ['diagonal', 1, 1]]) {
      await move(yaw, pitch);
      const posed = await pixels('hacker-' + name);
      assert(difference(neutral, posed, 25, 205) > 150, name + ' did not move the head');
      assert.equal(difference(neutral, posed, 300, 475), 0, name + ' displaced the jacket with the head');
    }
    await move(0, 0);
    await page.getByRole('checkbox', { name: 'Breathing' }).check();
    await wait(label => Math.abs(+document.querySelector('[aria-label="'+label+'"]').dataset.breath) > .65);
    const breathing = await pixels('hacker-breathing');
    assert.equal(difference(neutral, breathing, 25, 205), 0, 'Breathing moved the face');
    assert(difference(neutral, breathing, 300, 475) > 10, 'Breathing did not move the jacket');

    // Record the same live WebGL canvas used in the preview.
    await canvas.evaluate(element => {
      const stream = element.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks = [];
      recorder.ondataavailable = event => chunks.push(event.data);
      element.stopMotionRecording = () => new Promise(resolve => {
        recorder.onstop = () => {
          stream.getTracks().forEach(track => track.stop());
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' }));
        };
        recorder.stop();
      });
      recorder.start();
    });
    for (const [yaw, pitch] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]]) await move(yaw, pitch);
    const movie = await canvas.evaluate(element => element.stopMotionRecording());
    const video = Buffer.from(movie.split(',')[1], 'base64');
    assert(video.length > 1000, 'Motion recording is empty');
    fs.writeFileSync(path.join(out, 'hacker-motion.webm'), video);

    for (const mood of ['Listening', 'Thinking', 'Speaking', 'Idle']) {
      await button(mood).click();
      await page.getByText(new RegExp('MOOD · ' + mood, 'i')).waitFor();
      assert.equal(await host.getAttribute('data-outfit'), 'hacker');
    }
    await page.screenshot({ path: path.join(out, 'hacker-preview.png') });
    await button('N7 outfit').click();
    await wait(label => document.querySelector('[aria-label="'+label+'"]').dataset.outfit === 'original');
    await page.route('**/?view=nabou', route => route.fulfill({ body: 'NABOU route reached' }));
    await button('NABOU').click();
    await page.waitForURL('**/?view=nabou');
    assert.deepEqual(errors, []);
    console.log('Hacker outfit: identity pixels, jacket fit, yaw/pitch, independent breathing, moods and toggle passed.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
