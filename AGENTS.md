<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:bitrymdym-egress-dev-rules -->

# Audio egress — development practice (WAVE 1 OPS)

Process control (not a network firewall):

- Develop player and Studio against **local** Supabase / fixtures / mocks.
- Do **not** play full production masters during ordinary Cursor work.
- Do **not** use Simple Browser (or embedded Cursor browser) to repeatedly exercise production playback or Studio audio.
- UI layout checks must use fixtures or muted/mocked audio — never “open prod and press Play” just to verify a component.
- A production smoke test requires an explicit Owner reason, a minimal scope, and must avoid bulk full-file downloads of large masters.
- Prefer `BRD_INTEGRATION_TESTS=1` + `LOCAL_SUPABASE_*` for live-shaped tests; never point Vitest at production Storage.

<!-- END:bitrymdym-egress-dev-rules -->
