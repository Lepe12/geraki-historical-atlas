# N7 private corpus — operational record

## Confirmed architecture

- The source research lanes retain their original checksum-bound handoff tarballs.
- tools/n7_private_corpus_store.py encrypts each original archive and each manifest with AES-256-GCM using an HKDF domain-separated key derived from the private N7 server key.
- Encrypted content is stored via certificate-verified FTPS under the existing Plesk app directory: /bot.piratecartography.com/n7-app/data/n7-corpora/<numeric run_id>.
- A public HTTP visibility probe must reject access before and after upload. The private archive and manifest ciphertext are read back and independently authenticated.
- A second GitHub Actions runner restores all 11 lanes from the private server, NOT from original Actions artifacts or public Git history, and then invokes the approved free local CPU Qwen source-based analysis.
- The resulting answer.json is encrypted again and stored only on the private host. GET /api/research/corpus/<numeric run_id> is session-authenticated and returns limited source-bound text, never VERIFIED claims.
- The regular JARVIS N7 mission route now dispatches private storage automatically after all 11 source lanes have completed; it does not make the blocked public raw-evidence Git push. Other research jobs retain their original behavior.

## Original source run

Run: 42434462262. Safe public metadata: evidence/runs/42434462262/RECOVERY_SUMMARY.json. Recovered source-record entries: 1502. Exact-duplicate groups: 282. Possible derivative groups: 67. All 11 lanes were recovered, but no original historical page has been authenticated merely by this count.

## Security boundaries and limitations

1. Original GitHub Actions artifacts still follow the access and retention rules of their PUBLIC repository. Encrypting a private mirror does not retroactively make those original artifacts private. Do not delete originals without a separate retention decision.
2. The existing 32-byte .n7-library-bridge-key is the root of the at-rest encryption key derivation. Replacing it without re-encrypting the corpus or having a secure backup would make the files unreadable. Never publish or log this key.
3. FTPS, authenticated encryption, HTTP path isolation, application session cookies and same-origin controls protect distinct stages. This is not a penetration-test certification of the hosting provider.
4. Source retrieval and model analysis are separate status gates. A successful private upload or download does not establish model synthesis success; a completed model run does not establish historical accuracy or source independence.
5. The historical 3D renderer, WordPress application and conversations are not altered by source storage or local model inference.

## Operational entry points

Actions workflow: .github/workflows/n7-private-corpus-synthesis.yml, workflow_dispatch input run_id. Use numeric original run IDs only. The first stage verifies an existing private corpus or, once, copies the original artifacts. The second stage restores exclusively from the private host and produces a private encrypted result. The model budget is bounded; a missing or failed model is recorded explicitly rather than labelled as a successful historical answer.
