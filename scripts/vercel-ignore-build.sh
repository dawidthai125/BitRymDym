#!/usr/bin/env bash
# Vercel ignoreCommand for this Next.js app.
# Exit 0 skips the build. Exit 1 or greater builds.
# https://vercel.com/docs/project-configuration/vercel-json#ignorecommand
#
# Skip only when EVERY changed path is non-app: docs, markdown, .github,
# .cursor, .agents, and tests. Anything else (src, public, messages,
# Next/build config, package.json, lockfile, vercel.json, Studio worker
# build, scripts/master, …) builds. Missing HEAD^ builds (Vercel shallow
# clone is depth 10; the parent is not guaranteed).

set -euo pipefail

is_non_app_path() {
  case "$1" in
    docs | docs/*) return 0 ;;
    .github | .github/*) return 0 ;;
    .cursor | .cursor/*) return 0 ;;
    .agents | .agents/*) return 0 ;;
    *.md | *.markdown | *.mdc) return 0 ;;
    *.test.ts | *.test.tsx | *.test.js | *.test.jsx | *.test.mjs | *.test.cjs) return 0 ;;
    *.spec.ts | *.spec.tsx | *.spec.js | *.spec.jsx | *.spec.mjs | *.spec.cjs) return 0 ;;
    *.snap) return 0 ;;
    *.test.py | test_*.py | */test_*.py) return 0 ;;
    src/test | src/test/*) return 0 ;;
    supabase/tests | supabase/tests/*) return 0 ;;
    scripts/e2e | scripts/e2e/*) return 0 ;;
    vitest.config.ts | vitest.integration.config.ts | vitest.media.config.ts) return 0 ;;
    *) return 1 ;;
  esac
}

if [[ "${1:-}" == "--classify" ]]; then
  if [[ -z "${2:-}" ]]; then
    echo "usage: vercel-ignore-build.sh --classify <path>" >&2
    exit 2
  fi
  if is_non_app_path "$2"; then
    echo "skip"
    exit 0
  fi
  echo "build"
  exit 1
fi

if ! git rev-parse --verify --quiet HEAD^ >/dev/null; then
  echo "vercel-ignore: HEAD^ missing, building"
  exit 1
fi

# Command substitution drops NUL separators, so keep the diff on disk.
# A failed diff must build: an empty list would otherwise look like "nothing changed".
diff_file=$(mktemp)
trap 'rm -f "$diff_file"' EXIT
if ! git diff -z --name-only HEAD^ HEAD >"$diff_file"; then
  echo "vercel-ignore: git diff failed, building"
  exit 1
fi

changed=()
while IFS= read -r -d '' path; do
  changed+=("$path")
done <"$diff_file"

if [[ ${#changed[@]} -eq 0 ]]; then
  echo "vercel-ignore: empty diff, skipping"
  exit 0
fi

for path in "${changed[@]}"; do
  if ! is_non_app_path "$path"; then
    echo "vercel-ignore: app path changed (${path}), building"
    exit 1
  fi
done

echo "vercel-ignore: only non-app paths, skipping"
exit 0
