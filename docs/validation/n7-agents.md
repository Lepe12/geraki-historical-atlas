# N7 Humanoid: news and weather agents, and a Greek voice fix

Status: draft for review. Dates 2026-11-14 to 2026-11-16. The agents themselves live in
`Lepe12/independent-ai-bot` (branch `feat/n7-specialist-agents`, `docs/N7-SPECIALIST-AGENTS.md`). This change is the
Humanoid side only. It does not touch the approved Humanoid figure, its head motion, or the NABOU 3D renderer.

## What changes in the Humanoid

- **One conversation.** The agents answer inside the existing N7 chat. The workspace and the figure's conversation
  panel show the answer as written, and source addresses become active links (`https` only, new tab, `noopener`).
- **Greek speech of the answer** (`N7AgentSpeech.ts`): figures, units, dates and wind directions are spoken as Greek
  words (`18,4°C` → «18,4 βαθμούς Κελσίου»), addresses, citation marks and error codes are left out, and speech stops at
  about half a minute and says that the full answer with its sources is written in the conversation. Text that is
  not from an agent is spoken exactly as before.
- **A fix for the Greek voice** (all answers, not only the agents'): see below.

## A defect found and fixed in the Greek voice

Every sentence containing the Greek chi before i/e («βροχής», «χιλιόμετρα», «χιλιάδες») could not be spoken. The
phonemizer writes this palatal chi as `c` plus a combining cedilla (U+0327) and gives that mark id 140. The Piper model
has 130 symbols (0 to 129) and holds the composed `ç` as one symbol, so the model run failed with an out-of-range index
(`/enc_p/emb/Gather ... idx=140`). The worker now rebuilds the ids from the phonemes with the model's own
`phoneme_id_map` when an id is out of range; sentences that already worked keep the phonemizer's ids untouched.
The worker file is renamed `n7-female-voice-worker-v3.js` because the host caches files for ten days.

Reproduction before the fix (real model, real worker): 4 of 9 probe sentences failed, all containing such a chi, one of
them plain Greek words only. After the fix all 7 sentences of `test_greek_voice_fit.cjs` produce audio.

## Verification (exact commands, local, Chromium with SwiftShader, Node 22.23.4)

| Check | Result |
|---|---|
| `node --test tools/n7_apex_preview/test_agent_speech.mjs` | 6 pass |
| `test_greek_voice_fit.cjs` on the built production Humanoid (real Piper model and worker) | 7 of 7 sentences synthesized, including those that failed before |
| `test_agents_humanoid.cjs`, fixture API answers | pass: two dictated commands (weather, geopolitics), 7 clips, 53 s of Greek speech, links active, listening resumes by itself, typed requests routed, ordinary message not sent to an agent |
| `test_agents_humanoid.cjs` against a real N7 server with real providers (`N7_BACKEND_URL`, `N7_AGENTS_LIVE=1`) | pass: 2 dictated commands, 56 s of speech, 18 active news links. The dictated weather command hit Open-Meteo's free limit (HTTP 429): the answer said so, gave no figures, and the voice read it without the error code. The typed weather request succeeded with real data |
| Existing suites on the same production build: menu with H01, head joints, voice lifecycle, Greek female voice, voice reactivity | pass |
| `test_complete_guide.cjs` (assembly, moods, head, effects, workspace) on the production build | pass, no browser errors |
| `test_conversation.cjs` | not applicable to production: it tests the passwordless chat, which exists only in the preview builds (CI runs it there only) |

## Not verified, and limits

- **Speech recognition input is a fixture transcript.** No microphone is claimed. Audio is checked after decoding
  (duration and level); playback through a real speaker is not claimed.
- **The server side is not deployed.** On the owner's production server nothing was tried (it needs the owner's password).
  Until the server runs the agents, the Humanoid shows normal replies; this change is harmless without them.
- One-word utterances such as «Ύψος.» produce a clip of about six seconds. This is the model's behaviour on very short
  input and is unchanged by this work; agent answers are spoken in pieces of about 200 characters.
- The model-written summary of the news agent was exercised only with a loopback model.

## Deployment warning

`n7-apex-preview.yml` deploys `/n7-apex/` when a change reaches `main`. **Merging this pull request deploys it to
production.** The change is independent of the server and can be merged first or later; do not merge before approval.
The guarded deploy keeps the previous production release on the server as a rollback point
(`N7_APEX_ROLLBACK_POINT`), and rolls back automatically if its live verification fails.
