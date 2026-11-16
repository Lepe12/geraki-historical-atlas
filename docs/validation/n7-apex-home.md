# N7 APEX Humanoid as the home screen (atlas side)

Draft. Nothing here is merged or deployed. The page at `https://bot.piratecartography.com/` (bot repository, `docs/N7-APEX-HOME.md`)
sends the logged-in visitor to this Humanoid; this repository holds the Humanoid.

## Changes (approved figure, face, proportions, lighting, backdrop, animations and voice are untouched)

| File | Change |
|---|---|
| `N7Navigation.ts` (new) | Navigation phrases («άνοιξε το Chat / τον ιστορικό χάρτη / τη βιβλιοθήκη / τους agents», «επέστρεψε στο ολόγραμμα»), the shared conversation ID (`n7-shared-state-v1`, only `conversationId` is written, other fields kept), the greeting flag, `describeAgents` (text from the real `/api/agents` report). |
| `N7Workspace.tsx` | Opens the shared conversation with its history instead of starting a new one; writes the ID whenever it changes; navigation and agent-status commands are handled before the model; one greeting per login with the «Έναρξη N7» button where audio is blocked; the greeting flag is cleared when the session ends. |
| `N7GuideView.tsx`, `N7HumanoidView.tsx`, `N7ApexStage.tsx` | «Chat» and «NABOU» buttons in the existing header (production build only, not the passwordless preview routes); Exit keeps its existing meaning (closes the Humanoid view inside the page; the workspace and pending requests survive); phone header fits. |
| `build_apex_preview.py` | Copies `N7Navigation.ts`. |
| `test_navigation.mjs` (new), workflow step | 7 unit tests with the same sentences as the bot's `test/n7-apex-home-commands.test.js`. |

The preview builds (`/n7-apex-step5*`, passwordless guest chat) are unchanged: the new buttons and behaviour are only in the production build (`/n7-apex`).

## Verification

End to end (real Chromium, assembled N7 runtime, this build served from the same origin): 16 / 16 checks, see the bot repository's `docs/N7-APEX-HOME.md`.
Here: `node --test tools/n7_apex_preview/test_navigation.mjs` 7 pass; TypeScript build of the exported site passes.

Not verified: real microphone, the real Greek voice through speakers, the real NABOU confirmation, a real phone, and any production installation.

## Voice-first final interface (draft, preview at `/n7-apex-home/`)

Owner request: the Humanoid is the interface. Permanently visible: the approved figure and **one small keyboard icon at the bottom centre**. No header, no
technical controls, no «Φωνητική συνομιλία», no Chat / NABOU / library / agents buttons, no frames. The technical controls and the old voice panel stay in the code
and appear with `?controls=1` (used by the existing browser tests).

| Area | Behaviour |
|---|---|
| Welcome | On login N7 greets by voice. First visit (nothing stored in this browser **and** the server has no conversation): the full text; later logins: «Καλώς ήρθες ξανά. Πώς μπορώ να σε βοηθήσω;». Once per login (per tab session), not on refresh or screen changes. First visit is stored in `localStorage` (`n7-apex-welcomed-v1`). |
| Autoplay blocked | A temporary line «Πάτησε οπουδήποτε για να ξεκινήσει η N7»; the first tap or key starts the welcome and listening. No permanent start button. |
| Listening | Starts after the welcome when the microphone permission is already `granted` (or after the visitor's tap, which lets the browser ask). Not started when the permission is undecided or denied. Resumes on a return from Chat / NABOU / library. |
| Echo | The microphone is closed while N7 speaks (existing hook) and listening restarts after a pause of 0.7 s; the end-to-end test samples every 15 ms and counts no moment of listening during speech. |
| Typing | The icon opens a small field (focused; Esc closes; Enter sends and closes). The message goes through the same `send()` as speech: same conversation, same backend. The reply to a typed message is also shown as a transient caption (30 s); so is any reply when the browser cannot speak. |
| Commands | Spoken or typed whole phrases: open NABOU / library / agents / Chat, return to the Humanoid, «θέλω να γράψω» (opens the field), and three answers from real data: tasks (`/api/tasks`), agents (`/api/agents`), capabilities (`/api/agents`). They are not sent to the model. News, weather and historical sources go through the existing conversation and agents. |
| States | Existing moods only: listening, thinking, speaking, idle; running or queued tasks (polled from `/api/tasks`) count as thinking and show the line «Εκτελείται εργασία…». |

Files: `N7Navigation.ts` (phrases, welcomes, first-visit record, real-data answers), `N7Workspace.tsx` (welcome, listening, typing field, caption, commands),
`useN7Voice.ts` (an optional end-of-speech callback and `resume`), `N7GuideView.tsx` (class `n7-minimal` hides header and controls; the voice host has no panel in this mode),
`build_apex_preview.py` and the workflow (isolated preview path `/n7-apex-home`, built like production).

## Greek voice quality (draft)

Owner report: the Greek voice sounded robotic and stuttered. Cause found: the built-in voice is Piper «rapunzelina» **low** (16 kHz, fine-tuned from an English voice; there is no better Greek Piper model),
and it is synthesised piece by piece on the visitor's CPU, so pieces can arrive late.

* **Browser voices first.** The best Greek *female* voice the browser offers is used automatically (Edge «Natural» voices, then Google's Greek voice, then any other Greek voice that is not a male name); the built-in voice
  stays as the fallback and with `?voice=piper` (for comparison). The hint at the first tap names the voice that will be used.
* **Chrome's rule:** a page may speak with the browser's voices only after the visitor has interacted with the page, so with a browser voice the first tap (the temporary hint) is needed on each page load; the built-in voice does not have this rule.
* **Said in Greek:** N7, NABOU, Agents, Chat, Humanoid, APEX, Open-Meteo and similar names are spoken from a Greek spelling (the text on screen is unchanged).
* **Whole sentences:** speech is cut at sentence ends (then commas), the first sentence alone so speech starts quickly; pieces are shorter for browser voices (some stop after about fifteen seconds).
* Files: `N7Pronunciation.ts` (+ `test_pronunciation.mjs`, 3 tests), `useN7Voice.ts`, `N7Workspace.tsx`.
* **Not verified:** how the voices actually sound (no audio output here), which Greek voices the owner's browser really offers, and Chrome's activation rule in the owner's browser; the end-to-end test uses a stand-in `speechSynthesis` with an Edge-style voice and Chrome's activation rule.
