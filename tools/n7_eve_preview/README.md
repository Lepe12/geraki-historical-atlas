# N7 · EVE — isolated redesign preview (`/n7-eve`)

A new shell for N7 in the spirit of EVE Online (graphite, dark navy, cool cyan, thin lines), built
**beside** the existing N7. Nothing existing is edited: `tools/n7_apex_preview`, the production
`/n7-apex`, the N7 backend, NABOU and the library are untouched, and this folder deploys nothing.

## What is reused (not rebuilt)
| Part | Source | How |
|---|---|---|
| N7 Humanoid (figure, assembly, breathing, moods, head turn, H01 face) | `tools/n7_apex_preview/N7GuideScene.tsx`, `N7GuideFx.ts`, `N7HeadSurface.ts`, approved assets | `build_eve_preview.py` runs the existing `build_apex_preview.py` (production asset set) and only adds `components/eve` |
| Environment | `N7Backdrop.tsx` + `n7-environment-v4.webp` | unchanged, cooled by a CSS vignette |
| Voice (Greek female voice, microphone) | `useN7Voice.ts`, `N7FemaleVoice.ts` | unchanged hook |
| N7 conversation, tasks, missions | N7 runtime `/api/*` (same contract as `N7Workspace.tsx`, owner session) | `components/eve/useN7Session.ts` |
| NABOU | live chamber `jarvis-intelligence-chamber/?skip=1` | embedded unchanged in an iframe, kept loaded for instant switching |
| Library | pct-live `/library/search`, `/library/books`, `/library/status` + `data/published-library.json` | read-only |
| Agents | pct-live `/n7/status`, `/health`; N7 `/api/status`; with sign-in `/api/tasks`, `/api/agents` | read-only |

## Layout (command interface)
Top bar: N7 logo «AI COMMAND INTERFACE», tabs Έρευνα · Πηγές · NABOU Χάρτης · Agents · Βιβλιοθήκη ·
Έργα, then «N7 Online/Offline» (real `/api/status` reachability), microphone, spoken replies, settings.
Left rail with Greek labels: N7, Συνομιλία, Έρευνα, Πηγές, Χάρτης NABOU, Agents, Βιβλιοθήκη, Έργα,
Ρυθμίσεις. Centre: the unchanged Humanoid over a decorative scene (Olive 1662 Aegean chart from the
atlas, darkened; planet glow; harbour skyline; the approved N7 nebula) with a state ring under it.
Left: «N7 — Υποδοχή» (output-voice waveform from `N7VoiceSignal`, flat when silent) and «Ενεργοί
Agents». Right: «Τρέχον Έργο», «Γρήγορες Ενέργειες», «Σύστημα»; an opened section replaces this
column. Bottom: «Γράψε ή μίλησε στο N7...». On a phone the side panels open from the menu (N7).

## Components (`components/eve`)
`N7EveShell` (layout and routing) · `EveScene` (decorative background) · `EveRail` ·
`EveSide` (Υποδοχή, Ενεργοί Agents, Τρέχον Έργο, Γρήγορες Ενέργειες, Σύστημα) ·
`useSystemStatus` (pct-live `/n7/status`, `/health`, `/library/status`, catalogue) · `EveHud` (state ring) ·
`EveHumanoid` (stage-scale figure) · `EveCommandBar` (field, microphone, send) ·
`EveStateIndicator` (IDLE / LISTENING / THINKING / SPEAKING from real signals) ·
`EvePanel` (chamfered glass panel + `EveEmpty`, `EveDetails`, `EveField`) · `EveConversation` · `EveSources` ·
`LibraryPanel` (search, or the «Πηγές» catalogue) · `AgentsPanel` · `OtherPanels` (Research, Projects, History, Settings) ·
`NabouWorkspace` · `useN7Session` · `eveApi` · `eve.css`.

## Honest states
* Without the owner's N7 sign-in, the chat field searches the library and labels the results as
  library results, never as an N7 answer. With sign-in, messages go to the N7 runtime as today.
* No service reports progress percentages, so agent rows show «—» and an empty bar (striped only
  while a signed-in task really runs). Missing values are «—», never a sample.
* Quick actions: NABOU map and Ιστορική έρευνα work; web search and text synthesis go through the
  real N7 chat and are disabled until sign-in; OCR source analysis is not connected here and is
  disabled with a note.

## Build and run locally
```bash
N7_EVE_PCT_API=/pct-api/live python3 tools/n7_eve_preview/build_eve_preview.py --out /tmp/n7eve/build
cd /tmp/n7eve/build && npm ci && npm run build
mkdir -p /tmp/n7eve/http && ln -sfn /tmp/n7eve/build/out /tmp/n7eve/http/n7-eve
python3 tools/n7_eve_preview/serve_preview.py --root /tmp/n7eve/http --port 4180
# open http://127.0.0.1:4180/n7-eve/   (#nabou, #library, #agents … open a section directly)
```
`serve_preview.py` binds to 127.0.0.1 and forwards `/api/*` and `/n7-apex-voice/*` to the N7
server and `/pct-api/live/*` to pct-live, because those services only answer the N7 origin.
A production build (default `N7_EVE_PCT_API`) calls pct-live directly; pct-live already allows the
`https://bot.piratecartography.com` origin.

## Checks
`test_eve_preview.cjs` (CI: `.github/workflows/n7-eve-preview.yml`, no secrets, no deploy) checks
on desktop 1440×900 and mobile 390×844: large Humanoid and completed assembly; chat send →
THINKING → real library hits → IDLE; microphone → LISTENING (scripted speech-recognition
stand-in, headless browsers have no microphone) → dictated text sent; NABOU loads the real chamber
with N7 chat beside it and switches back; LIBRARY «Λάντζας» returns real cited hits; AGENTS shows
pct-live and N7 status; home side panels hold only real values (no percentages, OCR/web disabled
when not available); Πηγές and Έργα; quick action and top tab navigation; mobile menu and overview;
voice playback → SPEAKING → IDLE (desktop).

## Publishing (not done)
A remote preview would need the static export uploaded to its own folder on the N7 server
(e.g. `/bot.piratecartography.com/n7-app/public/n7-eve`) so it shares the N7 origin and sign-in.
That is an FTPS deploy and needs the owner's approval; it is intentionally not part of this folder.
