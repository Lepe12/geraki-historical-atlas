// A deterministic Niki worker and microphone, with real browser audio playback.
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const url = process.env.N7_VISUAL_URL || 'http://127.0.0.1:8261/n7-apex/';
const longReply = 'Η Νίκη ολοκληρώνει την απάντησή της. '.repeat(13).trim();

function speechDevices() {
  const fixture = window.voiceFixture = { mics: 0, chunks: [], played: 0, stopped: 0, aborts: 0 };
  class Recognition {
    start() {
      fixture.mics++;
      fixture.recognition = this;
      queueMicrotask(() => this.onstart?.());
    }
    abort() { fixture.aborts++; }
  }
  Object.defineProperty(window, 'SpeechRecognition', { value: Recognition });
  const OriginalWorker = window.Worker;
  window.Worker = class Worker {
    constructor(url, options) {
      if (!String(url).endsWith('/n7-niki-voice-worker-v1.js')) return new OriginalWorker(url, options);
    }
    postMessage({ id, text, warm }) {
      if (warm) return;
      fixture.chunks.push(text);
      const frames = 12000;
      const buffer = new ArrayBuffer(44 + frames * 2);
      const data = new DataView(buffer);
      for (const [offset, field] of [[0, 'RIFF'], [8, 'WAVEfmt '], [36, 'data']]) {
        [...field].forEach((char, index) => data.setUint8(offset + index, char.charCodeAt(0)));
      }
      data.setUint32(4, buffer.byteLength - 8, true);
      data.setUint32(16, 16, true);
      data.setUint16(20, 1, true);
      data.setUint16(22, 1, true);
      data.setUint32(24, 24000, true);
      data.setUint32(28, 48000, true);
      data.setUint16(32, 2, true);
      data.setUint16(34, 16, true);
      data.setUint32(40, frames * 2, true);
      setTimeout(() => this.onmessage?.({ data: { id, type: 'audio', buffer } }), 15);
    }
    terminate() {}
  };
  const start = AudioBufferSourceNode.prototype.start;
  const stop = AudioBufferSourceNode.prototype.stop;
  const isFixture = node => Math.abs((node.buffer?.duration || 0) - 0.5) < 0.001;
  AudioBufferSourceNode.prototype.start = function (...args) {
    if (isFixture(this)) this.addEventListener('ended', () => fixture.played++, { once: true });
    return start.apply(this, args);
  };
  AudioBufferSourceNode.prototype.stop = function (...args) {
    if (isFixture(this)) fixture.stopped++;
    return stop.apply(this, args);
  };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce',
    });
    await page.addInitScript(speechDevices);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const messages = [];
    const posts = [];
    let releaseList;
    await page.route('**/api/**', async route => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      let data = {};
      if (path === '/api/status') data = { authenticated: true };
      if (path === '/api/conversations' && req.method() === 'POST') data = { id: 'voice-call' };
      if (path === '/api/conversations' && req.method() === 'GET') {
        if (!releaseList && posts.length === 1) {
          // The list is ancillary. Hold it until the caller has spoken their second turn.
          await new Promise(resolve => { releaseList = resolve; });
          return route.fulfill({ status: 503, json: { error: 'Conversation list temporarily unavailable' } });
        }
        data = { conversations: [] };
      }
      if (path === '/api/conversations/voice-call/chat') {
        const prompt = req.postDataJSON().message;
        posts.push(prompt);
        messages.push({ role: 'user', content: prompt }, {
          role: 'assistant', content: posts.length === 1 ? longReply : 'Άκουσα τη δεύτερη ερώτηση.',
        });
        data = { conversation: { messages } };
      }
      await route.fulfill({ json: data });
    });
    await page.goto(url);
    const core = page.locator('#n7-guide-call').getByRole('button', { name: 'Έναρξη κλήσης', exact: true });
    await core.tap();
    await page.waitForFunction(() => window.voiceFixture.chunks.length || window.voiceFixture.mics);
    const start = await page.evaluate(() => ({ chunks: window.voiceFixture.chunks, mics: window.voiceFixture.mics }));
    assert.match(start.chunks[0] || '', /Καλώς ήρθες/, 'One tap must start the N7 welcome');
    assert.equal(start.mics, 0, 'The mic opened over the welcome');
    assert.equal(await page.getByRole('button', { name: 'Ενεργοποίηση ήχου', exact: true }).count(), 0);
    const hangUp = page.locator('#n7-guide-call').getByRole('button', { name: 'Λήξη κλήσης', exact: true });
    const turn = text => page.evaluate(transcript => {
      const r = window.voiceFixture.recognition;
      r.onresult({ results: [{ isFinal: true, 0: { transcript } }] });
      r.onend();
    }, text);
    const waitForMics = expected => page.waitForFunction(n => window.voiceFixture.mics === n, expected);
    await waitForMics(1);
    const greetingChunks = await page.evaluate(() => window.voiceFixture.chunks.length);
    await turn('Πρώτη ερώτηση.');
    await waitForMics(2);
    const firstReply = await page.evaluate(() => ({ ...window.voiceFixture, recognition: undefined }));
    assert.equal(firstReply.chunks.slice(greetingChunks).join(' ').replace(/\s+/g, ' '), longReply);
    assert.equal(firstReply.played, firstReply.chunks.length);
    assert.equal(firstReply.stopped, 0, 'Answer audio was interrupted');
    assert.equal(typeof releaseList, 'function');
    await turn('Δεύτερη ερώτηση.');
    releaseList();
    await waitForMics(3);
    assert.deepEqual(posts, ['Πρώτη ερώτηση.', 'Δεύτερη ερώτηση.']);
    assert.equal(await hangUp.getAttribute('aria-pressed'), 'true');
    await hangUp.tap();
    await core.waitFor();
    await page.waitForFunction(() => window.voiceFixture.aborts === 1);
    assert.equal(await page.evaluate(() => window.voiceFixture.mics), 3);
    const speechCount = await page.evaluate(() => window.voiceFixture.chunks.length);
    await core.tap();
    await waitForMics(4);
    assert.equal(await page.evaluate(() => window.voiceFixture.chunks.length), speechCount, 'The welcome repeated in the same tab');
    await turn('Τέλος συζήτησης.');
    await core.waitFor();
    assert.equal(posts.length, 2, 'The spoken hang-up reached the model');
    assert.deepEqual(errors, []);
    console.log('PASS one touch, welcome, complete Niki audio, two turns despite list failure, explicit hang-up');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
