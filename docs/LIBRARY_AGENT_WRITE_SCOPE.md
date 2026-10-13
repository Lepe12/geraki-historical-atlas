# Standalone library agent persistence

The research job remains `contents: read`. A separate hosted job receives only
`contents: write` for Lepe12/geraki-historical-atlas, using the automatically
issued job-lifetime GITHUB_TOKEN. No PAT, GitHub App permission expansion,
Actions settings, secrets administration, server or WordPress credentials are
introduced. The existing SearchCulture secret stays in the research job only.
The writer has no secret references and does not execute downloaded output.

GitHub contents permission is repository-wide, not folder-specific. The reviewed
publisher enforces a code allowlist; this is not a native credential folder ACL.
Only `evidence/runs/<current run id>/travellers/**` and that run's
`MARIADB_STORAGE_INTENT.json` may be staged, committed and pushed by the results
publisher. Traversal, symlinks, existing results, a dirty checkout, other runs,
code and workflow edits are rejected. No force pushes. Credentials are provided
only to the push subprocess, never saved by checkout or placed in the remote URL.

The read job produces a normalized artifact. The existing `travellers` lane is
used as an import envelope, explicitly marked `standalone-library-agent`; this
does not claim the ten-agent workflow executed. A pinned request identity is
included under research_lanes for the unchanged database importer. Failures
remain failures; storing results never makes them VERIFIED.

The ten-agent workflow and the hosting-local every-five-minute importer are
unchanged. No WordPress, .htaccess, WordPress database or hosting settings change.

Library Storage Credential Control writes only
`evidence/library_agent_controls/<current run id>/write_test.json`. It is an
explicit nonresearch control excluded from evidence/runs and database import.
It runs when its own workflow file changes, or by manual dispatch, and checks
the same publisher policy before testing an actual ephemeral credential push.
