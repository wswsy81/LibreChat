---
name: verify-deploy
description: Run the fail-closed Future Lines deployment Definition of Done. Use when changing LibreChat client code, future-engine-shim, librechat.yaml/promptPrefix, profile schema or migrations, or when asked to deploy, ship, verify production, check health/hash/console, or prepare an evidence-backed delivery report.
---

# Verify Deploy

Treat every completion claim as unproven until a command, response, screenshot, or diff supports it.

## 1. Establish scope and authority

1. Read `../../../CLAUDE.md`, the active spec, and the red-line summary in the brain repo's `state/当前状态.md`.
2. Inspect both worktrees: the LibreChat repository and the brain repository at `../../..` from the LibreChat root.
3. Do not deploy merely because this skill was invoked. Deploy only when the user request authorizes production changes.
4. Preserve unrelated dirty-worktree changes. Never reset or overwrite them.

## 2. Run the local gate

From this skill directory run:

```bash
scripts/verify-local.sh --full
```

During development, `--quick` may be used for syntax, compiler, schema, YAML, diff, and shim-test checks. Final delivery requires `--full`, which additionally runs client typecheck, changed-file ESLint, and both production builds.

Stop on the first failure. Report the exact failing command and output; do not call the result “mostly passing.”

## 3. Protect production data

Before any production write:

1. Create a timestamped `0600` backup of profile data, report data, and any database collection touched by the change.
2. Record the backup path and verify the file exists and is non-empty.
3. Write the exact rollback command before deploying.
4. For schema migration, record the canonical user's pre-deploy counts and content hashes needed to prove zero loss.

Do not continue if the backup, rollback path, target host, or remote directory is unknown.

## 4. Deploy in the fixed order

Run only the steps required by the changed surfaces, without reordering them:

1. `npm run build:client-package`
2. `npm run build:client`
3. Sync `client/dist` and any changed package dist artifacts.
4. Restart the LibreChat API after replacing `client/dist`.
5. If the shim changed, rebuild it with `docker compose up -d --build future-engine`.
6. If YAML/prompt changed, verify YAML parsing and container logs contain no config error.
7. Compare the entry HTML asset hash with the deployed asset and require a 200 response.
8. Check future-engine `/health` and the LibreChat health surface.
9. Walk the changed path in a fresh real browser session; require console/page errors = 0 and same-origin failed requests = 0.

## 5. Verify data and product behavior

For migrations, compare pre/post counts and hashes and exercise login, archive read, and an existing report. For state-machine work, prove:

- a new profile begins at S0 and advances only with acknowledged evidence;
- direct or skipped stage writes are rejected;
- `load_profile` returns exactly one current stage card;
- a tool forbidden in the current stage is rejected;
- legacy profile content remains present after migration.

## 6. Produce the evidence report

Use this exact structure:

1. Changed files and why.
2. Acceptance table: requirement ID, result, command/evidence.
3. Deployment evidence: backup, rollback, build, restart, hash, health, browser.
4. Data integrity evidence.
5. Not done / degraded / bypassed. Write `None — because ...` only when supported.
6. Completeness audit:
   - Which spec items were not touched?
   - What was done beyond the spec?
   - Which validations were skipped, and why?

Never omit a known failure or unsupported claim.
