#!/usr/bin/env bash
# Preserve committed work when another research job advances main. Never force.
set -euo pipefail
for attempt in 1 2 3 4 5; do
  if ! git pull --rebase origin main; then
    echo "Publish stopped: rebase conflict requires review; no remote data was overwritten." >&2
    git rebase --abort || true
    exit 1
  fi
  if git push origin HEAD:main; then exit 0; fi
  if [ "$attempt" -lt 5 ]; then sleep $((attempt * 2)); fi
done
echo "Publish failed after five attempts; local commit is preserved." >&2
exit 1
