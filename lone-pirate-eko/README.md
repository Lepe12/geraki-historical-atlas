# LONE PIRATE — EKO experiment
An isolated experiment unrelated to NABOU. One pirate alone aboard a 17th-century sailing ship in the open sea. No pre-set tasks. Uses the open-source Clawblox physics world and a **real LLM** for every decision. No synthetic or randomized action path.

## Links
- Browser observer: https://lepe12.github.io/geraki-historical-atlas/lone-pirate/ (only after GitHub Pages publication finishes)
- GitHub action: https://github.com/Lepe12/geraki-historical-atlas/actions/workflows/lone-pirate-eko.yml
- Clawblox original: https://github.com/nacloos/clawblox

## Running without installing software
An Groq API key is required. Configure GitHub repository Actions secret `GROQ_API_KEY` with a key from https://console.groq.com/keys. **Do not paste it into a chat or commit it to a file.** The workflow explicitly fails without the key; no fake AI will run.

Launch the `Lone Pirate Eko — AI experiment` workflow from GitHub Actions, and select duration in minutes (30–240) and the model call budget. The default model `openai/gpt-oss-20b` uses Groq's free tier with per-minute and per-day request and token quotas. It does not use a variable model pool. Longer experiments may stop early from these limits. Logs are uploaded as artifacts and an attempted `lone-pirate/latest.json` commit for the public observer page.

## Current limitations
- No successful real agent run has been verified.
- The browser illustration is **not** a live 3D stream of Clawblox. Actual 3D requires an accessible running Clawblox renderer.
- World is in a stationary deck reference frame with surrounding open sea, not a sailing vessel with hydrodynamics.
- The workflow supports a maximum of 240 minutes per dispatch. Eight-hour continuation, restoring complete world physics and agent state across jobs, is **not** implemented or tested.
- Agent memory is currently retained within one workflow run. Long-term memory and checkpoint/resume require separate work.
- No cost is guaranteed for exhausted quotas; do not enable paid routing. `openai/gpt-oss-20b` has zero token pricing but rate limits.

## Architecture
`main.lua`: physical ship and action executor. `API.md`: allowed actions and world protocol. `run_agent.py`: /join, /observe, Groq completion, /input, append real observations to log. `.github/workflows/lone-pirate-eko.yml`: server startup and conditional log publishing.
