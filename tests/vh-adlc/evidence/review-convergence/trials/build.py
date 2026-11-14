#!/usr/bin/env python3
"""Builds the review convergence reviewer-trial repositories (docs/specs/spec-review-convergence.md, T4).

Usage: python3 build.py <output dir>

Each trial becomes a Git repository under <output dir>/<name> with a pinned AGENTS.md, one feature
document and any files the document cites. Trials that need history (AC-05, AC-09) get more than one
commit. The script prints one line per trial: name, repository, document path and the commit to review.
"""

import json
import os
import subprocess
import sys

PIN = "1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff"
DOC = "docs/specs/feature.md"
AGENTS = f"""# Repository instructions

Read the personal conventions at
https://github.com/vhco-pro/docs/blob/{PIN}/AGENTS.md
and follow the task routes there before implementation.

Feature documents: docs/specs/
"""


def spec(goal, summary, background, scope, design, criteria, plan, covers="tool.sh", review=""):
    return f"""---
status: draft
status_description: "Fixture for a vh-adlc reviewer trial; nothing is accepted or implemented."
issue: null
goal: "{goal}"
covers:
  - {covers}
---

# Plan: Fixture feature

{goal}

## Context

### Owner summary

{summary}

### Background

{background}

## Scope

{scope}

## Design

{design}

## Acceptance Criteria

{criteria}

## Test Plan

| Criterion | Proof |
| --- | --- |
{plan}

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
{review}"""


def git(repo, *args):
    env = dict(os.environ, GIT_AUTHOR_NAME="Fixture", GIT_AUTHOR_EMAIL="fixture@example.invalid",
               GIT_COMMITTER_NAME="Fixture", GIT_COMMITTER_EMAIL="fixture@example.invalid",
               GIT_CONFIG_GLOBAL="/dev/null", GIT_CONFIG_NOSYSTEM="1")
    return subprocess.run(["git", *args], cwd=repo, env=env, check=True, capture_output=True, text=True).stdout.strip()


def write(repo, path, text):
    full = os.path.join(repo, path)
    os.makedirs(os.path.dirname(full) or repo, exist_ok=True)
    with open(full, "w") as f:
        f.write(text)


def commit(repo, files, message):
    for path, text in files.items():
        write(repo, path, text)
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", message)
    return git(repo, "rev-parse", "HEAD")


COUNT_SH = "#!/bin/sh\n# usage: count.sh FILE\nwc -l < \"$1\"\n"

# AC-02: a false claim the design depends on, a harmless wrong line number, an ambiguous criterion and a
# wording slip. The lens dispatch reuses this repository with a declared spelling lens at should-fix.
AC02 = spec(
    goal="count.sh prints a file's line count as JSON when asked.",
    summary="Add JSON output to count.sh for scripts. Text stays the default.",
    background="count.sh prints a line count for one file; its usage line is at count.sh:9.",
    scope="In scope: a JSON output mode. Out of scope: counting words. Teh default output stays text.",
    design="count.sh already parses a `--json` flag (count.sh:3), so the change only formats the existing "
           "count as `{\"lines\": N}` when that flag is set.",
    criteria="- [ ] AC-01: `count.sh --json FILE` prints `{\"lines\": N}` for a file of N lines.\n"
             "- [ ] AC-02: The output is formatted nicely.",
    plan="| AC-01 | `./count.sh --json fixture.txt` prints `{\"lines\": 3}` for a three-line fixture |\n"
         "| AC-02 | Read the output |",
    covers="count.sh",
)

# AC-03: one limit stated in four places, one copy different.
AC03 = spec(
    goal="fetch.sh retries a failed download a bounded number of times.",
    summary="fetch.sh retries a failed download at most 3 times before giving up.",
    background="fetch.sh downloads one URL with curl and stops on the first failure (fetch.sh:2).",
    scope="In scope: retrying a failed download at most 3 times. Out of scope: parallel downloads.",
    design="On a failed download, fetch.sh waits two seconds and tries again, at most 5 times, then exits 1.",
    criteria="- [ ] AC-01: A download that keeps failing is tried at most 3 times, then fetch.sh exits 1.",
    plan="| AC-01 | A stub curl that always fails is called exactly 3 times and fetch.sh exits 1 |",
    covers="fetch.sh",
)
FETCH_SH = "#!/bin/sh\ncurl -fsS -o out \"$1\" || exit 1\n"

# AC-04: five designs, each defining all failure-mode questions but one, and one wording-only edit.
AC04 = {
    "ac04-concurrency": spec(
        goal="Every run of build.sh adds one to a shared counter file.",
        summary="Count builds across all runs in counter.txt.",
        background="Several build.sh runs start in parallel from CI on the same host (build.sh:1).",
        scope="In scope: incrementing counter.txt. Out of scope: reporting.",
        design="build.sh reads counter.txt, adds one and writes it back. If the write fails, the old file "
               "stays because the new value goes to counter.txt.tmp and is renamed over counter.txt. A failed "
               "rename is retried once. counter.txt holds a single integer, the format the previous version "
               "also wrote, so an upgrade reads the old file unchanged and a rollback reads the new one.",
        criteria="- [ ] AC-01: After a run, counter.txt holds the previous value plus one.",
        plan="| AC-01 | Run build.sh once on counter.txt holding 4 and read 5 |",
        covers="build.sh"),
    "ac04-retry": spec(
        goal="notify.sh posts a build result to a remote status API.",
        summary="Report each build result to the status service.",
        background="notify.sh runs once per build; the status API is a remote HTTPS service (notify.sh:1).",
        scope="In scope: one POST per build. Out of scope: reading statuses.",
        design="notify.sh sends one POST with the build ID. Builds never overlap, a lock file in /run "
               "serializes notify.sh runs, so concurrent requests cannot happen. If the POST fails, notify.sh "
               "exits 1 and the build is marked unreported. The request body keeps the previous version's "
               "fields, so upgrade and rollback need no migration.",
        criteria="- [ ] AC-01: A successful build produces one POST with its build ID.",
        plan="| AC-01 | A stub server records exactly one POST with the build ID |",
        covers="notify.sh"),
    "ac04-upgrade": spec(
        goal="cache.sh stores computed results in a state file between runs.",
        summary="Keep computed results across runs in state.json.",
        background="cache.sh recomputes every result on each run today (cache.sh:1).",
        scope="In scope: a state.json cache. Out of scope: cache expiry.",
        design="cache.sh writes results to state.json as a new JSON object keyed by input hash. Only one "
               "cache.sh runs at a time, guarded by flock. A write goes to state.json.tmp and is renamed, so a "
               "crash leaves the last complete file. A failed rename is retried once.",
        criteria="- [ ] AC-01: A second run with the same input reads its result from state.json.",
        plan="| AC-01 | Run cache.sh twice with one input and see the second run skip the computation |",
        covers="cache.sh"),
    "ac04-partial": spec(
        goal="release.sh records each release in two ledger files.",
        summary="Write each release to releases.log and latest.txt.",
        background="release.sh prints the version and exits today (release.sh:1).",
        scope="In scope: releases.log and latest.txt. Out of scope: publishing artifacts.",
        design="release.sh appends the version to releases.log and then overwrites latest.txt with it. Only "
               "one release.sh runs at a time, guarded by flock. A failed append is retried once. Both files "
               "keep the previous version's plain-text format, so upgrade and rollback need no migration.",
        criteria="- [ ] AC-01: After a release, releases.log ends with the version and latest.txt holds it.",
        plan="| AC-01 | Run release.sh 1.2.0 and read both files |",
        covers="release.sh"),
    "ac04-wording": spec(
        goal="The install guide explains the prerequisites in plainer words.",
        summary="Reword the prerequisites paragraph of the install guide.",
        background="The guide's prerequisites paragraph uses jargon (guide.md:3).",
        scope="In scope: rewording one paragraph. Out of scope: changing any command.",
        design="Rewrite the prerequisites paragraph in guide.md in plain sentences, keeping every command "
               "and version it names.",
        criteria="- [ ] AC-01: The prerequisites paragraph names the same commands and versions in plain sentences.",
        plan="| AC-01 | Compare the old and new paragraph: same commands and versions, no jargon terms |",
        covers="guide.md"),
}
AC04_FILES = {
    "ac04-concurrency": {"build.sh": "#!/bin/sh\nmake\n"},
    "ac04-retry": {"notify.sh": "#!/bin/sh\ntrue\n"},
    "ac04-upgrade": {"cache.sh": "#!/bin/sh\ncompute \"$1\"\n"},
    "ac04-partial": {"release.sh": "#!/bin/sh\necho \"$1\"\n"},
    "ac04-wording": {"guide.md": "# Install\n\nPrerequisites: ensure idempotent provisioning of the toolchain via `make deps` (Go 1.27).\n"},
}

# AC-05: a free-text pattern row that has passed review, with examples that miss a wrong output and
# reject a correct output, both stated in Design.
AC05_DESIGN = ("lint-msg.sh checks a commit subject. A correct subject starts with a type, a colon and a space, "
               "for example `fix: handle empty input` or `docs(readme): fix a link`. A wrong subject has no type, "
               "for example `handle empty input`, or ends with a period, for example `fix: handle empty input.`.")


def ac05_doc(pattern_row, review=""):
    return spec(
        goal="lint-msg.sh rejects commit subjects that break the team's format.",
        summary="Check commit subjects before a push.",
        background="lint-msg.sh accepts every subject today (lint-msg.sh:1).",
        scope="In scope: the subject format. Out of scope: the commit body.",
        design=AC05_DESIGN,
        criteria="- [ ] AC-01: lint-msg.sh accepts correct subjects and rejects wrong ones.",
        plan=pattern_row,
        covers="lint-msg.sh",
        review=review,
    )


AC05_ROW = ("| AC-01 | lint-msg.sh matches the subject against `^[a-z]+: .+$`. Must pass: `fix: handle empty input`. "
            "Must fail: `handle empty input`. |")
AC05_ROW_CHANGED = ("| AC-01 | lint-msg.sh matches the subject against `^[a-z]+: [a-z].*$`. Must pass: `fix: handle empty input`. "
                    "Must fail: `handle empty input`. |")

# AC-09: the latest revision commit, applying R-1, introduced a contradiction.
AC09_BEFORE = spec(
    goal="probe.sh gives up on a slow health check after a fixed timeout.",
    summary="Stop waiting for a slow health check after 5 seconds.",
    background="probe.sh waits for the health endpoint with no timeout (probe.sh:2).",
    scope="In scope: a timeout on the health check. Out of scope: retries.",
    design="probe.sh passes `--max-time 5` to curl and exits 2 when the check times out.",
    criteria="- [ ] AC-01: A health check that takes longer than 5 seconds makes probe.sh exit 2.",
    plan="| AC-01 | A stub endpoint that sleeps 7 seconds makes probe.sh exit 2 after about 5 seconds |",
    covers="probe.sh",
)
PROBE_SH = "#!/bin/sh\ncurl -fsS http://localhost/health >/dev/null\n"
R1_RECORD = ("FINDING: F-01\nKIND: judgement\nSEVERITY: should-fix\nWHERE: Design\nEVIDENCE: A 5 second "
             "timeout is shorter than the endpoint's documented warm-up.\nPROPOSAL: Raise the timeout to 10 "
             "seconds.\n")


def build(out):
    os.makedirs(out, exist_ok=True)
    trials = []

    def repo(name):
        path = os.path.join(out, name)
        os.makedirs(path, exist_ok=False)
        git(path, "init", "-q", "-b", "main")
        return path

    r = repo("ac02-severity")
    x = commit(r, {"AGENTS.md": AGENTS, "count.sh": COUNT_SH, DOC: AC02}, "fixture: AC-02 severities")
    trials.append(("ac02-severity", r, x))
    trials.append(("ac02-lens", r, x))

    r = repo("ac03-restatement")
    x = commit(r, {"AGENTS.md": AGENTS, "fetch.sh": FETCH_SH, DOC: AC03}, "fixture: AC-03 restatement")
    trials.append(("ac03-restatement", r, x))

    for name, doc in AC04.items():
        r = repo(name)
        x = commit(r, {"AGENTS.md": AGENTS, DOC: doc, **AC04_FILES[name]}, f"fixture: {name}")
        trials.append((name, r, x))

    for name, changed in (("ac05-passed", False), ("ac05-changed", True)):
        r = repo(name)
        first = commit(r, {"AGENTS.md": AGENTS, "lint-msg.sh": "#!/bin/sh\nexit 0\n", DOC: ac05_doc(AC05_ROW)},
                       "fixture: AC-05 draft")
        review = (f"| 2026-11-14 | R-1 | spec | `{first[:7]}` | fixture | procedural | Clean. |\n\n"
                  f"### R-1\n\nNO FINDINGS\n")
        x = commit(r, {DOC: ac05_doc(AC05_ROW, review)}, "fixture: record a clean R-1")
        if changed:
            x = commit(r, {DOC: ac05_doc(AC05_ROW_CHANGED, review)}, "fixture: change the pattern row")
        trials.append((name, r, x))

    r = repo("ac09-trace")
    first = commit(r, {"AGENTS.md": AGENTS, "probe.sh": PROBE_SH, DOC: AC09_BEFORE}, "fixture: AC-09 draft")
    review = (f"| 2026-11-14 | R-1 | spec | `{first[:7]}` | fixture | procedural | One should-fix finding. |\n\n"
              f"### R-1\n\n{R1_RECORD}")
    recorded = AC09_BEFORE + review
    commit(r, {DOC: recorded}, "fixture: record R-1")
    revised = recorded.replace("passes `--max-time 5` to curl", "passes `--max-time 10` to curl")
    x = commit(r, {DOC: revised}, "fixture: apply R-1 (timeout 10 seconds in Design)")
    trials.append(("ac09-trace", r, x))

    for name, path, sha in trials:
        print(json.dumps({"name": name, "repo": path, "doc": DOC, "commit": sha}))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: build.py <output dir>")
    build(sys.argv[1])
