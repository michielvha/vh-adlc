"""Remove one part of the macOS boundary at a time, run the darwin boundary tests, report which fail, restore the source.

Run on macOS outside any sandbox. Each mutation must make at least one test fail; a mutation that fails no
test, or a run that executes no test, makes this script exit nonzero.
"""
import os, re, subprocess, sys

W = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
RR = f"{W}/plugins/vh-adlc/scripts/loop/review-route.ts"
OP = f"{W}/plugins/vh-adlc/scripts/triage/owned-process.ts"
TESTS = "macOS write boundary|scratch directories that resolve|the link check over"
MUTANTS = {
    "no denied paths": (RR, "const writeDeny = { deny, allow:", "const writeDeny = { deny: [] as string[], allow:"),
    "no parent literal denies": (OP, '(deny file-write* ${rules("P", "literal", parents)})', ""),
    "no Git-directory denies": (RR, "const deny = [repo, gitDir, commonDir,", "const deny = [repo,"),
    "no clone deny": (RR, "...(cloneDir ? [cloneDir] : []), ...(exportDir ? [exportDir] : [])].map(resolvedPath)", "...(exportDir ? [exportDir] : [])].map(resolvedPath)"),
    "no export deny": (RR, ", ...(exportDir ? [exportDir] : [])].map(resolvedPath)", "].map(resolvedPath)"),
    "no allow rules": (OP, 'if (allow.length) profile += `(allow file-write* ${rules("A", "subpath", allow)})`;', ""),
    "no link-count check": (RR, "if (links.linked) return", "if (links.linked && false) return"),
    "no disappearing-file guard": (RR, "try { info = lstatSync(join(root, child)); } catch { return { changed: child }; }", "info = lstatSync(join(root, child));"),
    "no scratch overlap check": (RR, "if (overlap) return", "if (overlap && false) return"),
    "no boundary precheck": (RR, 'if (!namespace && !seatbelt) return { status: "pending", reason: NO_BOUNDARY };', ""),
}
env = dict(os.environ, PATH="/opt/homebrew/opt/coreutils/libexec/gnubin:" + os.environ["PATH"])
failed_to_fail = []
for name, (path, old, new) in MUTANTS.items():
    original = open(path).read()
    if original.count(old) != 1:
        sys.exit(f"mutation '{name}' no longer matches the source exactly once")
    try:
        open(path, "w").write(original.replace(old, new))
        run = subprocess.run(["bun", "test", "--timeout", "60000", "tests/vh-adlc/loop/review-route.test.ts", "-t", TESTS],
                             cwd=W, env=env, capture_output=True, text=True)
        out = run.stdout + run.stderr
        fails = [m.split(" > ", 1)[1].rsplit(" [", 1)[0] for m in re.findall(r"\(fail\) .*", out)]
        ran = re.search(r"Ran (\d+) tests?", out)
        print(f"## {name}: {len(fails)} fail (exit {run.returncode}, ran {ran.group(1) if ran else 0})")
        for f in fails: print(f"   - {f}")
        if not fails or not ran or ran.group(1) == "0":
            failed_to_fail.append(name)
    finally:
        open(path, "w").write(original)
if failed_to_fail:
    sys.exit(f"mutations that no test caught: {', '.join(failed_to_fail)}")
