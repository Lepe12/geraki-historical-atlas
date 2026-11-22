'use strict';
// N7_CLOUD_VOICE_V1: owner-only Greek speech from ElevenLabs (Flash v2.5).
// The key stays on the server (Plesk secret ELEVENLABS_API_KEY); the browser
// only sends the sentence to say. A daily character cap protects the plan.
//   ELEVENLABS_API_KEY   secret, required
//   ELEVENLABS_VOICE_ID  voice to use, required
//   N7_TTS_DAILY_CHARS   optional, default 650 (Free plan ≈ 20k Flash chars/month)
const https = require('node:https');

function createVoiceTts({env = process.env, authenticated, request = https.request, now = Date.now} = {}) {
  let dayStart = now(), used = 0;
  const key = () => String(env.ELEVENLABS_API_KEY || '').trim();
  const voice = () => String(env.ELEVENLABS_VOICE_ID || '').trim();
  const cap = () => Math.max(0, Number(env.N7_TTS_DAILY_CHARS || 650));
  const json = (res, status, data) => {
    res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'});
    res.end(JSON.stringify(data));
  };
  async function handle(req, res) {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path !== '/api/n7-voice/status' && path !== '/api/n7-voice/tts') return false;
    if (now() - dayStart >= 86400000) { dayStart = now(); used = 0; }
    const configured = Boolean(key() && /^[A-Za-z0-9]{8,40}$/.test(voice()));
    const owner = Boolean(authenticated(req));
    if (path.endsWith('/status')) {
      json(res, 200, {available: configured && owner && used < cap(), provider: 'elevenlabs', remainingToday: Math.max(0, cap() - used)});
      return true;
    }
    if (req.method !== 'POST') { json(res, 405, {error: 'Method not allowed'}); return true; }
    if (!owner) { json(res, 401, {error: 'Η φωνή του server είναι μόνο για τον ιδιοκτήτη.'}); return true; }
    if (!configured) { json(res, 503, {error: 'Η φωνή του server δεν έχει ρυθμιστεί.'}); return true; }
    let text = '';
    try {
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 4000) throw Error('large'); chunks.push(chunk); }
      text = String(JSON.parse(Buffer.concat(chunks).toString('utf8')).text || '').trim();
    } catch { json(res, 400, {error: 'Μη έγκυρο κείμενο.'}); return true; }
    if (!text || text.length > 400) { json(res, 400, {error: 'Μη έγκυρο κείμενο.'}); return true; }
    if (used + text.length > cap()) { json(res, 429, {error: 'Η φωνή του server έφτασε το ημερήσιο όριο.'}); return true; }
    used += text.length;
    await new Promise(resolve => {
      const upstream = request({
        hostname: 'api.elevenlabs.io', method: 'POST', timeout: 20000,
        path: '/v1/text-to-speech/' + encodeURIComponent(voice()) + '/stream?output_format=mp3_44100_64',
        headers: {'xi-api-key': key(), 'Content-Type': 'application/json', Accept: 'audio/mpeg'},
      }, response => {
        if (response.statusCode !== 200) {
          // N7_VOICE_DIAG_V1: keep ElevenLabs' own reason so failures are explainable.
          let body = '';
          response.setEncoding('utf8');
          response.on('data', c => { if (body.length < 2000) body += c; });
          response.on('end', () => {
            let code = '';
            try { const d = JSON.parse(body).detail; code = String((d && (d.status || d.code)) || d || '').slice(0, 60); } catch {}
            const sc = response.statusCode;
            if (sc === 401 || sc === 429) used = cap(); else used -= text.length;
            console.error('[n7-voice] elevenlabs', sc, code);
            json(res, sc === 429 ? 429 : 502, {upstream: sc, reason: code, error: sc === 401
              ? (/quota|limit/i.test(code) ? 'Το πακέτο ElevenLabs έφτασε το όριό του.' : 'Το κλειδί ElevenLabs δεν ισχύει ή δεν έχει δικαίωμα φωνής (Text to Speech).')
              : sc === 402 || /paid|plan|subscription/i.test(code) ? 'Αυτή η φωνή θέλει πληρωμένο πακέτο ElevenLabs.'
              : sc === 404 || /voice/i.test(code) ? 'Η ElevenLabs δεν βρίσκει αυτή τη φωνή στον λογαριασμό.'
              : sc === 429 ? 'Η ElevenLabs είναι απασχολημένη ή έφτασε το όριο.' : 'Η φωνή του server δεν απάντησε.'});
            resolve();
          });
          return;
        }
        res.writeHead(200, {'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store'});
        response.pipe(res); response.on('end', resolve); response.on('error', resolve);
      });
      upstream.on('timeout', () => upstream.destroy(Error('timeout')));
      upstream.on('error', err => {
        used -= text.length;
        console.error('[n7-voice] network', err && (err.code || err.message));
        if (!res.headersSent) json(res, 502, {upstream: 0, reason: String(err && (err.code || err.message) || '').slice(0, 60), error: 'Ο server δεν μπορεί να συνδεθεί με την ElevenLabs.'});
        else res.end();
        resolve();
      });
      upstream.end(JSON.stringify({text, model_id: 'eleven_flash_v2_5', language_code: 'el'}));
    });
    return true;
  }
  return {handle};
}
module.exports = {createVoiceTts};
