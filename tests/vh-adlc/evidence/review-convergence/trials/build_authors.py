#!/usr/bin/env python3
"""Builds the review convergence author-trial repositories (docs/specs/spec-review-convergence.md, T5).

Usage: python3 build_authors.py <output dir>

Each trial is a Git repository with a pinned AGENTS.md. The AC-03 and AC-09 trials hold a feature document
whose latest review pass, R-1, is already stored, so the author starts at review mode step 4. The AC-07
trial starts empty. Prints one JSON line per trial: name, repository and commit.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build import AGENTS, DOC, commit, git, spec  # noqa: E402


def stored(doc, sha, records, outcome):
    return doc + f"| 2026-11-14 | R-1 | spec | `{sha[:7]}` | fixture | procedural | {outcome} |\n\n### R-1\n\n{records}"


# AC-03: one limit stated in four places with one copy different; R-1 asks for a value none of them hold.
AC03_DOC = spec(
    goal="fetch.sh retries a failed download a bounded number of times.",
    summary="fetch.sh makes at most 3 attempts at a download before giving up.",
    background="fetch.sh downloads one URL with curl and stops on the first failure (fetch.sh:2).",
    scope="In scope: at most 3 attempts per download. Out of scope: parallel downloads.",
    design="On a failed download, fetch.sh waits two seconds and tries again, for at most 5 attempts, then exits 1.",
    criteria="- [ ] AC-01: A download that keeps failing is attempted exactly 3 times, then fetch.sh exits 1.",
    plan="| AC-01 | A stub curl that always fails is called exactly 3 times and fetch.sh exits 1 |",
    covers="fetch.sh",
)
AC03_R1 = ("FINDING: F-01\nKIND: factual\nSEVERITY: should-fix\nWHERE: Design\nEVIDENCE: Design says at most 5 "
           "attempts while the rest of the document says 3; the measured flaky-mirror recovery in fetch.sh needs 4 "
           "attempts.\nPROPOSAL: Use 4 attempts as the limit.\n")

# AC-09: the Test Plan names a check script that compares the timeout in Design and AC-01. Applying F-01
# to Design alone makes that check fail. F-02 can be met by removing the --legacy flag or documenting it,
# and both give the same behavior.
AC09_DOC = spec(
    goal="probe.sh gives up on a slow health check after a fixed timeout.",
    summary="Stop waiting for a slow health check after 5 seconds.",
    background="probe.sh waits for the health endpoint with no timeout (probe.sh:2).",
    scope="In scope: a timeout on the health check. Out of scope: retries.",
    design="probe.sh passes `--max-time 5` to curl and exits 2 when the check times out. A `--legacy` flag "
           "also exists; it selects the same 5 second timeout and the same exit status as running without it.",
    criteria="- [ ] AC-01: A health check that takes longer than 5 seconds makes probe.sh exit 2.",
    plan="| AC-01 | `tests/check-timeout.sh` passes, then a stub endpoint that sleeps 12 seconds makes probe.sh exit 2 |",
    covers="probe.sh",
)
CHECK_TIMEOUT = """#!/bin/sh
# Fails unless the timeout in the Design's curl call equals the one in AC-01.
doc=docs/specs/feature.md
design=$(sed -n 's/.*--max-time \\([0-9][0-9]*\\).*/\\1/p' "$doc" | head -1)
criterion=$(sed -n 's/.*AC-01: A health check that takes longer than \\([0-9][0-9]*\\) seconds.*/\\1/p' "$doc" | head -1)
[ -n "$design" ] && [ "$design" = "$criterion" ] && echo PASS && exit 0
echo "FAIL: Design says $design, AC-01 says $criterion"; exit 1
"""
PROBE_SH = "#!/bin/sh\ncurl -fsS http://localhost/health >/dev/null\n"
AC09_R1 = ("FINDING: F-01\nKIND: factual\nSEVERITY: blocking\nWHERE: Design\nEVIDENCE: The endpoint's warm-up takes "
           "up to 8 seconds (probe.sh:2 calls it right after start), so a 5 second timeout fails healthy starts.\n"
           "PROPOSAL: Use a 10 second timeout in Design.\n\n"
           "FINDING: F-02\nKIND: factual\nSEVERITY: should-fix\nWHERE: Design\nEVIDENCE: The `--legacy` flag has "
           "exactly the behavior of no flag, so two implementers could keep or drop it.\nPROPOSAL: Remove the "
           "`--legacy` flag from Design, or document why it is kept.\n")
AC09_R1_JUDGEMENT = AC09_R1 + ("\nFINDING: F-03\nKIND: judgement\nSEVERITY: should-fix\nWHERE: Design\nEVIDENCE: "
                               "Design does not say whether a timeout should exit 2, like other failures, or a "
                               "distinct 3.\nPROPOSAL: Decide the exit status for a timeout.\n")


def build(out):
    os.makedirs(out, exist_ok=True)
    rows = []

    def repo(name):
        path = os.path.join(out, name)
        os.makedirs(path)
        git(path, "init", "-q", "-b", "main")
        return path

    r = repo("author-ac07")
    x = commit(r, {"AGENTS.md": AGENTS, "deploy.sh": "#!/bin/sh\n./ship-release\n"}, "fixture: empty repository for AC-07")
    rows.append(("author-ac07", r, x))

    r = repo("author-ac03")
    first = commit(r, {"AGENTS.md": AGENTS, "fetch.sh": "#!/bin/sh\ncurl -fsS -o out \"$1\" || exit 1\n", DOC: AC03_DOC},
                   "fixture: AC-03 draft")
    x = commit(r, {DOC: stored(AC03_DOC, first, AC03_R1, "One should-fix finding.")}, "fixture: record R-1")
    rows.append(("author-ac03", r, x))

    for name, records in (("author-ac09", AC09_R1), ("author-ac09-judgement", AC09_R1_JUDGEMENT)):
        r = repo(name)
        first = commit(r, {"AGENTS.md": AGENTS, "probe.sh": PROBE_SH, "tests/check-timeout.sh": CHECK_TIMEOUT, DOC: AC09_DOC},
                       "fixture: AC-09 draft")
        os.chmod(os.path.join(r, "tests/check-timeout.sh"), 0o755)
        git(r, "add", "tests/check-timeout.sh")
        git(r, "commit", "-q", "--allow-empty", "-m", "fixture: make the check executable")
        x = commit(r, {DOC: stored(AC09_DOC, first, records, "Blocking findings.")}, "fixture: record R-1")
        rows.append((name, r, x))

    for name, path, sha in rows:
        print(json.dumps({"name": name, "repo": path, "commit": sha}))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: build_authors.py <output dir>")
    build(sys.argv[1])
