# N7 APEX Humanoid as the home screen (atlas side)

Draft. Nothing here is merged or deployed. The page at `https://bot.piratecartography.com/` (bot repository, `docs/N7-APEX-HOME.md`)
sends the logged-in visitor to this Humanoid; this repository holds the Humanoid.

## Changes (approved figure, face, proportions, lighting, backdrop, animations and voice are untouched)

| File | Change |
|---|---|
| `N7Navigation.ts` (new) | Navigation phrases («άνοιξε το Chat / τον ιστορικό χάρτη / τη βιβλιοθήκη / τους agents», «επέστρεψε στο ολόγραμμα»), the shared conversation ID (`n7-shared-state-v1`, only `conversationId` is written, other fields kept), the greeting flag, `describeAgents` (text from the real `/api/agents` report). |
| `N7Workspace.tsx` | Opens the shared conversation with its history instead of starting a new one; writes the ID whenever it changes; navigation and agent-status commands are handled before the model; one greeting per login with the «Έναρξη N7» button where audio is blocked; the greeting flag is cleared when the session ends. |
| `N7GuideView.tsx`, `N7HumanoidView.tsx`, `N7ApexStage.tsx` | «Chat» and «NABOU» buttons in the existing header (production build only, not the passwordless preview routes); Exit leaves for the Chat; phone header fits. |
| `build_apex_preview.py` | Copies `N7Navigation.ts`. |
| `test_navigation.mjs` (new), workflow step | 7 unit tests with the same sentences as the bot's `test/n7-apex-home-commands.test.js`. |

The preview builds (`/n7-apex-step5*`, passwordless guest chat) are unchanged: the new buttons and behaviour are only in the production build (`/n7-apex`).

## Verification

End to end (real Chromium, assembled N7 runtime, this build served from the same origin): 16 / 16 checks, see the bot repository's `docs/N7-APEX-HOME.md`.
Here: `node --test tools/n7_apex_preview/test_navigation.mjs` 7 pass; TypeScript build of the exported site passes.

Not verified: real microphone, the real Greek voice through speakers, the real NABOU confirmation, a real phone, and any production installation.
