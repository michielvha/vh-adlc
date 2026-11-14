#!/usr/bin/env python3
"""Collects trial runs from run.ts into the committed evidence (docs/specs/spec-review-convergence.md).

Usage: python3 -I collect.py <evidence dir> <run output dir> [<run output dir> ...]

For every trial in each run output directory, copies result.txt and history.txt (author trials) and a
redacted copy of each raw transcript into <evidence dir>/<trial>/, and writes <evidence dir>/manifest.json
merging the run manifests. Redaction replaces the account's claude.ai connector names, which a copied
login adds to every session, and the host home directory; it changes nothing else. The manifest keeps
each raw transcript's sha256 next to the redacted copy's, so a raw file kept outside the repository can
be matched to its committed copy.
"""

import hashlib
import json
import os
import re
import shutil
import sys

HOME = os.path.expanduser("~")
RULES = [
    (re.compile(r"claude\.ai (Gmail|Google Calendar|Google Drive|[A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+)*)(?=\\n|\")"), "claude.ai <connector>"),
    (re.compile(r"mcp__claude_ai_[A-Za-z_]+"), "mcp__claude_ai_<tool>"),
    (re.compile(re.escape(HOME) + r"(?=/|\b)"), "~"),
]


def sha(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def redact(text):
    for pattern, replacement in RULES:
        text = pattern.sub(replacement, text)
    return text


def main(evidence, runs):
    os.makedirs(evidence, exist_ok=True)
    merged = None
    for run in runs:
        with open(os.path.join(run, "manifest.json")) as f:
            m = json.load(f)
        if merged is None:
            merged = {k: v for k, v in m.items() if k != "trials"} | {"runs": [], "trials": []}
        merged["runs"].append({k: m[k] for k in ("checkout", "plugin_dirty", "reviewer_agent_blob", "spec_skill_blob", "date")})
        for t in m["trials"]:
            src = os.path.join(run, "trials", t["trial"])
            dest = os.path.join(evidence, t["trial"])
            shutil.rmtree(dest, ignore_errors=True)
            os.makedirs(os.path.join(dest, "transcript"))
            for name in ("result.txt", "history.txt"):
                if os.path.exists(os.path.join(src, name)):
                    with open(os.path.join(src, name)) as f:
                        text = redact(f.read())
                    with open(os.path.join(dest, name), "w") as f:
                        f.write(text)
            files = []
            for entry in t["transcripts"]:
                raw = os.path.join(run, entry["file"])
                out = os.path.join(dest, "transcript", os.path.basename(raw))
                with open(raw) as f:
                    text = redact(f.read())
                with open(out, "w") as f:
                    f.write(text)
                files.append({"file": os.path.relpath(out, evidence), "raw_sha256": entry["sha256"], "sha256": sha(out)})
            merged["trials"].append(t | {"checkout": m["checkout"], "transcripts": files})
    merged.pop("checkout", None)
    merged.pop("date", None)
    with open(os.path.join(evidence, "manifest.json"), "w") as f:
        json.dump(merged, f, indent=2)
        f.write("\n")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit("usage: collect.py <evidence dir> <run output dir> [...]")
    main(sys.argv[1], sys.argv[2:])
