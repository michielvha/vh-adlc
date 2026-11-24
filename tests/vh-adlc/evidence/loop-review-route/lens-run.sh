#!/bin/bash
# T50: a real Codex spec review flags a spec that breaks a declared lens, and passes a compliant control.
set -u; export PATH=$HOME/.bun/bin:$PATH
CLI=/home/m/code/vh-adlc-shared-development-loop/plugins/vh-adlc/scripts/loop/cli.ts
for kind in breaks complies; do
  R=$(mktemp -d /tmp/vh-t50-$kind.XXXX); cd "$R"; git init -q -b main; git config user.name t; git config user.email t@example.invalid
  mkdir -p docs/specs .vh-adlc
  printf '# Repository instructions\n\nFeature documents: docs/specs/\n' > AGENTS.md
  cat > .vh-adlc/loop.yaml <<'Y'
schema_version: 1
instruction_files: [AGENTS.md]
lenses:
  - name: satellite
    check: A change that adds a binary or image that deploys on its own names the satellite repository that publishes it.
    severity: blocking
roles:
  spec_reviewer:
    route: command
    model: gpt-6.1-sol
    model_attestation: codex-session
    argv: [/usr/bin/codex, exec, --json, --skip-git-repo-check, -s, read-only, -m, "{model}", "{prompt}"]
Y
  if [ $kind = breaks ]; then SAT=""; else SAT=" It is published by its own satellite repository, \`acme/widget-exporter\`, through that repository's release workflow."; fi
  cat > docs/specs/exporter.md <<Y
---
status: draft
status_description: "Lens trial fixture."
issue: null
goal: "A widget exporter image ships."
covers:
  - exporter/
---

# Plan: Widget exporter image

## Context

### Owner summary

Adds \`exporter/\`, a new container image that deploys on its own and exports widget metrics.$SAT

## Scope

The exporter image only.

## Design

\`exporter/Dockerfile\` builds a static binary into a distroless image.$SAT

## Acceptance Criteria

- [ ] AC-01: \`docker build exporter/\` produces an image whose entrypoint prints \`ok\` for \`--health\`.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Build the image and run it with \`--health\`; it prints \`ok\` and exits 0. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
Y
  git add -A; git commit -q -m fixture; X=$(git rev-parse HEAD)
  bun $CLI review --repo "$R" --document docs/specs/exporter.md --commit $X --kind spec --docs-revision d8f07c9dd69038375a535af8ad586086688f85ab --binary /home/m/.cache/vh-adlc/bin/0.9.0/linux_amd64/vh-adlc --plugin-pin c70769ebf43ea03a4bdffb3cda51954eb05b35a7 --timeout-ms 1200000 > /tmp/sdd-diff/t50-$kind.json 2>/dev/null
  echo "$kind exit $?"
done
