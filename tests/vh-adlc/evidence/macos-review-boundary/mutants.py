"""Remove one part of the boundary at a time, run the darwin tests, report which fail, restore the source."""
import re, subprocess, os, shutil
W = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
RR = f"{W}/plugins/vh-adlc/scripts/loop/review-route.ts"
OP = f"{W}/plugins/vh-adlc/scripts/triage/owned-process.ts"
MUTANTS = {
    "no denied paths": (RR, "deny: [repo, gitDir, commonDir, ...(cloneDir ? [cloneDir] : []), ...(exportDir ? [exportDir] : [])]", "deny: []"),
    "no parent literal denies": (OP, '(deny file-write* ${rules("P", "literal", parents)})', ""),
    "no Git-directory denies": (RR, "deny: [repo, gitDir, commonDir,", "deny: [repo,"),
    "no clone deny": (RR, "...(cloneDir ? [cloneDir] : []), ...(exportDir", "...(exportDir"),
    "no export deny": (RR, ", ...(exportDir ? [exportDir] : [])]", "]"),
    "no link-count check": (RR, "if (linked) return", "if (linked && false) return"),
    "no boundary precheck": (RR, "if (!namespace && !seatbelt) return { status: \"pending\", reason: NO_BOUNDARY };", ""),
}
env = dict(os.environ, PATH="/opt/homebrew/opt/coreutils/libexec/gnubin:" + os.environ["PATH"])
for name, (path, old, new) in MUTANTS.items():
    original = open(path).read()
    assert original.count(old) == 1, name
    try:
        open(path, "w").write(original.replace(old, new))
        run = subprocess.run(["bun", "test", "--timeout", "60000", "tests/vh-adlc/loop/review-route.test.ts", "-t", "macOS write boundary"],
                             cwd=W, env=env, capture_output=True, text=True)
        out = run.stdout + run.stderr
        fails = [m.split(" > ", 1)[1].rsplit(" [", 1)[0] for m in re.findall(r"\(fail\) .*", out)]
        print(f"## {name}: {len(fails)} fail")
        for f in fails: print(f"   - {f}")
    finally:
        open(path, "w").write(original)
