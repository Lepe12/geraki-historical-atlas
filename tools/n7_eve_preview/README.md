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

## Components (`components/eve`)
`N7EveShell` (layout and routing) · `EveRail` (left rail, icons, tooltips, expandable) ·
`EveHumanoid` (stage-scale figure) · `EveCommandBar` (field, microphone, send) ·
`EveStateIndicator` (IDLE / LISTENING / THINKING / SPEAKING from real signals) ·
`EvePanel` (+ `EveEmpty`, `EveDetails`, `EveField`) · `EveConversation` · `EveSources` ·
`LibraryPanel` · `AgentsPanel` · `OtherPanels` (Research, History, News, Weather, Settings) ·
`NabouWorkspace` · `useN7Session` · `eveApi` · `eve.css`.

## Honest states
* Without the owner's N7 sign-in, the chat field searches the library and labels the results as
  library results, never as an N7 answer. With sign-in, messages go to the N7 runtime as today.
* NEWS and WEATHER have no backend yet: they say so and show no sample data.
* AGENTS shows only what the services report (no computed progress or completion).

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
pct-live and N7 status; NEWS/WEATHER honest empty states; rail tooltip/expand; mobile menu;
voice playback → SPEAKING → IDLE (desktop).

## Publishing (not done)
A remote preview would need the static export uploaded to its own folder on the N7 server
(e.g. `/bot.piratecartography.com/n7-app/public/n7-eve`) so it shares the N7 origin and sign-in.
That is an FTPS deploy and needs the owner's approval; it is intentionally not part of this folder.
