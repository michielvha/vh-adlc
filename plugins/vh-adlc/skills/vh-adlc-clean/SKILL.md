---
name: vh-adlc-clean
description: Free space a repository's killed runs left in /tmp, its temp root and, when the user asks, its Compose projects and kind clusters, through vh-adlc clean. Use when the user asks for cleanup or a session is blocked because /tmp is full. It removes only what the binary's built-in Go globs and the repository's default-branch manifest declare.
---

# vh-adlc-clean

The plugin root is two directories above this skill, and the paths below start there. Follow
`references/clean.md` for the procedure, the report fields and what each result means.

This operation is the exception `references/loop.md` names: it calls `vh-adlc` from `PATH` as is, so the
one allow rule matches, and it runs no installer and no `knowledge` call.

1. Run `vh-adlc clean --dry-run` in the repository and report its plan.
2. Apply it with `vh-adlc clean` when the user asked for cleanup or the session is blocked on space and
   the dry run answered without a failing finding.
3. Add `--compose` or `--kind` only when the user asks for that by name, on the dry run and the applied
   run alike. A session that is only blocked on space passes neither.

Never run `rm`, `docker rm`, `docker volume rm` or `pkill` on anything the plan lists or keeps. When the
binary is missing or answers `clean` with `usage`, or refuses with `pid-namespace`, give the user the one
line `references/clean.md` gives for that case and stop. When the applied run still leaves the session
blocked, hand the user the report's kept and unmatched entries; they decide what else goes.
