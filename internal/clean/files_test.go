package clean

import (
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

// fakeHost is a temporary directory standing in for /tmp, /proc, the mount
// table and the temp base, with a fixed clock and an owner table.
type fakeHost struct {
	t                                 *testing.T
	now                               time.Time
	tmp, proc, mountinfo, unix, outer string
	foreign                           map[string]bool // paths owned by another user
	base                              string
}

const otherUID = 4242

func newFakeHost(t *testing.T) *fakeHost {
	t.Helper()
	outer := t.TempDir()
	h := &fakeHost{
		t: t, now: time.Date(2026, 11, 3, 12, 0, 0, 0, time.UTC),
		outer:     outer,
		tmp:       filepath.Join(outer, "tmp"),
		proc:      filepath.Join(outer, "proc"),
		mountinfo: filepath.Join(outer, "mountinfo"),
		unix:      filepath.Join(outer, "net-unix"),
		foreign:   map[string]bool{},
	}
	h.base = filepath.Join(h.tmp, "vh-adlc-"+itoa(os.Getuid()))
	for _, d := range []string{h.tmp, h.proc} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	h.write(h.mountinfo, "22 1 0:21 / / rw - ext4 /dev/sda3 rw\n", 0)
	h.write(h.unix, "Num       RefCount Protocol Flags    Type St Inode Path\n0000000000000000: 00000002 00000000 00010000 0001 01 12345 @abstract\n", 0)
	return h
}

func (h *fakeHost) files() FileHost {
	return FileHost{
		Tmp: h.tmp, Proc: h.proc, MountInfo: h.mountinfo, NetUnix: h.unix,
		UID: os.Getuid(), Now: func() time.Time { return h.now },
		Owner: func(path string, info fs.FileInfo) int {
			if h.foreign[path] {
				return otherUID
			}
			return ownerOf(info)
		},
	}
}

// write creates a file aged by age, creating its parents.
func (h *fakeHost) write(path, content string, age time.Duration) {
	h.t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		h.t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		h.t.Fatal(err)
	}
	h.age(path, age)
}

func (h *fakeHost) age(path string, age time.Duration) {
	h.t.Helper()
	at := h.now.Add(-age)
	if err := os.Chtimes(path, at, at); err != nil {
		h.t.Fatal(err)
	}
}

// entry creates a top-level /tmp directory holding one file, all aged by age.
func (h *fakeHost) entry(name string, age time.Duration) string {
	h.t.Helper()
	dir := filepath.Join(h.tmp, name)
	h.write(filepath.Join(dir, "data"), strings.Repeat("x", 5000), age)
	h.age(dir, age)
	return dir
}

// process adds a fake /proc/<pid> with the given links and maps.
func (h *fakeHost) process(pid string, links map[string]string, maps string) string {
	h.t.Helper()
	dir := filepath.Join(h.proc, pid)
	if err := os.MkdirAll(filepath.Join(dir, "fd"), 0o755); err != nil {
		h.t.Fatal(err)
	}
	for name, target := range links {
		if err := os.MkdirAll(filepath.Dir(filepath.Join(dir, name)), 0o755); err != nil {
			h.t.Fatal(err)
		}
		if err := os.Symlink(target, filepath.Join(dir, name)); err != nil {
			h.t.Fatal(err)
		}
	}
	if maps != "" {
		h.write(filepath.Join(dir, "maps"), maps, 0)
	}
	return dir
}

func itemNames(items []Item) []string {
	var out []string
	for _, it := range items {
		out = append(out, filepath.Base(it.Name)+":"+it.Reason)
	}
	slices.Sort(out)
	return out
}

func exampleRules() []fileRule {
	return append(builtinRules(), fileRule{Glob: "example-run-*", MaxAge: 12 * time.Hour})
}

// layout builds every case the AC-03 file rules name and returns the inputs.
func layout(h *fakeHost) fileInputs {
	h.t.Helper()
	old := 30 * time.Hour
	h.entry("go-build111", old)
	h.entry("go-build222", time.Hour)
	h.entry("gopls-tempmod1", old)
	h.entry("example-run-a", 13*time.Hour)
	nested := h.entry("example-run-nested", old)
	h.write(filepath.Join(nested, "sub", "recent"), "new", time.Hour)
	h.age(filepath.Join(nested, "sub"), old)
	h.age(nested, old)
	h.foreign[h.entry("example-run-foreign", old)] = true
	target := h.entry("example-run-target", old)
	if err := os.Symlink(target, filepath.Join(h.tmp, "example-run-link")); err != nil {
		h.t.Fatal(err)
	}
	mounted := h.entry("example-run-mounted", old)
	h.write(h.mountinfo, "22 1 0:21 / / rw - ext4 /dev/sda3 rw\n36 22 0:40 / "+strings.ReplaceAll(filepath.Join(mounted, "mnt point"), " ", `\040`)+" rw - tmpfs tmpfs rw\n", 0)
	cwd := h.entry("example-run-cwd", old)
	exe := h.entry("example-run-exe", old)
	fd := h.entry("example-run-fd", old)
	mapped := h.entry("example-run-map", old)
	sock := h.entry("example-run-sock", old)
	h.write(h.unix, "Num       RefCount Protocol Flags    Type St Inode Path\n0000000000000000: 00000002 00000000 00010000 0001 01 12345 "+filepath.Join(sock, "s.sock")+"\n", 0)
	bound := h.entry("example-run-bind", old)
	unreadable := h.entry("example-run-unreadable", old)
	h.entry("example-run-exited", old)
	foreignProc := h.entry("example-run-foreignproc", old)
	h.entry("unrelated-thing", old)
	h.foreign[h.entry("unrelated-foreign", old)] = true
	h.write(filepath.Join(h.base, "example", "old-entry", "f"), "x", old)
	h.age(filepath.Join(h.base, "example", "old-entry"), old)
	h.write(filepath.Join(h.base, "example", "new-entry", "f"), "x", time.Hour)
	h.write(filepath.Join(h.base, "other", "f"), "x", old)
	for _, d := range []string{h.base, filepath.Join(h.base, "example")} {
		if err := os.Chmod(d, 0o700); err != nil {
			h.t.Fatal(err)
		}
	}

	h.process("101", map[string]string{"cwd": cwd, "exe": "/usr/bin/sh"}, "")
	h.process("102", map[string]string{"cwd": "/", "exe": filepath.Join(exe, "data")}, "")
	h.process("103", map[string]string{"cwd": "/", "fd/3": filepath.Join(fd, "data") + " (deleted)", "fd/4": "socket:[99]"}, "")
	h.process("104", map[string]string{"cwd": "/"}, "7f00-7f01 r-xp 00000000 08:03 1 "+filepath.Join(mapped, "data")+"\n7f01-7f02 r--p 00000000 00:00 0 [heap]\n")
	locked := h.process("105", map[string]string{"cwd": unreadable}, "")
	if err := os.Chmod(locked, 0); err != nil {
		h.t.Fatal(err)
	}
	h.t.Cleanup(func() { _ = os.Chmod(locked, 0o755) })
	h.process("106", nil, "") // exited during the scan: no links left
	other := h.process("107", map[string]string{"cwd": foreignProc}, "")
	h.foreign[other] = true
	h.write(filepath.Join(h.proc, "self"), "", 0) // not a pid

	return fileInputs{
		Rules: exampleRules(), TempBase: h.base, Project: "example", RootAge: 24 * time.Hour,
		Binds: []string{filepath.Join(bound, "data")},
	}
}

func TestPlanFiles(t *testing.T) {
	h := newFakeHost(t)
	in := layout(h)
	before := snapshot(t, h.outer)

	plan, err := planFiles(h.files(), in)
	if err != nil {
		t.Fatal(err)
	}
	if after := snapshot(t, h.outer); after != before {
		t.Fatal("planning changed the tree")
	}
	wantRemove := []string{
		"example-run-a:abandoned", "example-run-exited:abandoned", "example-run-foreignproc:abandoned",
		"example-run-target:abandoned", "example-run-unreadable:abandoned", "go-build111:abandoned",
		"gopls-tempmod1:abandoned", "old-entry:abandoned",
	}
	if got := itemNames(plan.Remove); !slices.Equal(got, wantRemove) {
		t.Errorf("remove:\n got %q\nwant %q", got, wantRemove)
	}
	wantKeep := []string{
		"example-run-bind:in-use", "example-run-cwd:in-use", "example-run-exe:in-use", "example-run-fd:in-use",
		"example-run-foreign:other-owner", "example-run-link:symlink", "example-run-map:in-use",
		"example-run-mounted:mount-point", "example-run-nested:younger", "example-run-sock:in-use",
		"go-build222:younger", "new-entry:younger",
	}
	if got := itemNames(plan.Keep); !slices.Equal(got, wantKeep) {
		t.Errorf("keep:\n got %q\nwant %q", got, wantKeep)
	}
	if plan.Unmatched.Count != 1 || plan.Unmatched.Bytes <= 0 {
		t.Errorf("unmatched: %+v; want the one user-owned unrelated entry", plan.Unmatched)
	}
	for _, it := range plan.Remove {
		if it.Bytes <= 0 {
			t.Errorf("%s: no size", it.Name)
		}
	}
}

func TestApplyFiles(t *testing.T) {
	h := newFakeHost(t)
	in := layout(h)
	plan, err := planFiles(h.files(), in)
	if err != nil {
		t.Fatal(err)
	}
	removed, kept, failures := applyFiles(plan)
	if len(failures) != 0 || len(kept) != len(plan.Keep) {
		t.Fatalf("failures %v, kept %d of %d", failures, len(kept), len(plan.Keep))
	}
	var freed int64
	for _, it := range removed {
		freed += it.Bytes
		if _, err := os.Lstat(it.Name); !os.IsNotExist(err) {
			t.Errorf("%s is still there: %v", it.Name, err)
		}
	}
	if freed <= 0 {
		t.Errorf("freed %d bytes", freed)
	}
	for _, it := range plan.Keep {
		if _, err := os.Lstat(it.Name); err != nil {
			t.Errorf("kept %s is gone: %v", it.Name, err)
		}
	}
	for _, name := range []string{"unrelated-thing", "unrelated-foreign", "vh-adlc-" + itoa(os.Getuid())} {
		if _, err := os.Lstat(filepath.Join(h.tmp, name)); err != nil {
			t.Errorf("%s is gone: %v", name, err)
		}
	}
	if _, err := os.Lstat(filepath.Join(h.base, "other", "f")); err != nil {
		t.Errorf("another project's root was touched: %v", err)
	}
}

// TestSymlinkTargetIsItsOwnEntry shows a matched symlink is kept while the
// directory it points at is judged on its own.
func TestSymlinkTargetIsItsOwnEntry(t *testing.T) {
	h := newFakeHost(t)
	target := h.entry("example-run-target", 30*time.Hour)
	if err := os.Symlink(target, filepath.Join(h.tmp, "example-run-link")); err != nil {
		t.Fatal(err)
	}
	plan, err := planFiles(h.files(), fileInputs{Rules: exampleRules(), TempBase: h.base, Project: "example"})
	if err != nil {
		t.Fatal(err)
	}
	if got := itemNames(plan.Remove); !slices.Equal(got, []string{"example-run-target:abandoned"}) {
		t.Errorf("remove %q", got)
	}
	if got := itemNames(plan.Keep); !slices.Equal(got, []string{"example-run-link:symlink"}) {
		t.Errorf("keep %q", got)
	}
}

func TestOlderThan(t *testing.T) {
	cases := []struct {
		name      string
		olderThan time.Duration
		remove    []string
	}{
		{"below every rule", time.Hour, []string{"example-run-a:abandoned", "go-build111:abandoned", "old-entry:abandoned"}},
		{"between the rules", 20 * time.Hour, []string{"go-build111:abandoned", "old-entry:abandoned"}},
		{"above every rule, the built-in age included", 48 * time.Hour, nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h := newFakeHost(t)
			h.entry("go-build111", 30*time.Hour)
			h.entry("example-run-a", 13*time.Hour)
			h.write(filepath.Join(h.base, "example", "old-entry", "f"), "x", 30*time.Hour)
			h.age(filepath.Join(h.base, "example", "old-entry"), 30*time.Hour)
			for _, d := range []string{h.base, filepath.Join(h.base, "example")} {
				if err := os.Chmod(d, 0o700); err != nil {
					t.Fatal(err)
				}
			}
			plan, err := planFiles(h.files(), fileInputs{Rules: exampleRules(), TempBase: h.base, Project: "example", RootAge: 24 * time.Hour, OlderThan: c.olderThan})
			if err != nil {
				t.Fatal(err)
			}
			if got := itemNames(plan.Remove); !slices.Equal(got, c.remove) {
				t.Errorf("remove %q, want %q", got, c.remove)
			}
		})
	}
}

// TestBuiltinGlobsWithoutManifest is a repository with no manifest: only the
// built-in globs apply, and no temp root is read.
func TestBuiltinGlobsWithoutManifest(t *testing.T) {
	h := newFakeHost(t)
	h.entry("go-build1", 30*time.Hour)
	h.entry("example-run-a", 30*time.Hour)
	plan, err := planFiles(h.files(), fileInputs{Rules: builtinRules(), TempBase: h.base})
	if err != nil {
		t.Fatal(err)
	}
	if got := itemNames(plan.Remove); !slices.Equal(got, []string{"go-build1:abandoned"}) {
		t.Errorf("remove %q", got)
	}
	if plan.Unmatched.Count != 1 {
		t.Errorf("unmatched %+v", plan.Unmatched)
	}
}

// TestTempBaseIsSkipped shows a glob that matches the base, or a /tmp entry
// holding it, never removes it.
func TestTempBaseIsSkipped(t *testing.T) {
	h := newFakeHost(t)
	h.write(filepath.Join(h.base, "example", "f"), "x", 30*time.Hour)
	h.age(filepath.Join(h.base, "example"), 30*time.Hour)
	h.age(h.base, 30*time.Hour)
	nested := filepath.Join(h.tmp, "vh-nest-dir", "base")
	h.write(filepath.Join(nested, "f"), "x", 30*time.Hour)
	rules := append(builtinRules(), fileRule{Glob: "vh-adlc-*", MaxAge: time.Hour}, fileRule{Glob: "vh-nest-*", MaxAge: time.Hour})
	for _, base := range []string{h.base, nested} {
		plan, err := planFiles(h.files(), fileInputs{Rules: rules, TempBase: base})
		if err != nil {
			t.Fatal(err)
		}
		for _, it := range plan.Remove {
			if within(base, it.Name) {
				t.Errorf("base %s: plans to remove %s, which holds the base", base, it.Name)
			}
		}
	}
}

// TestUnreadableEntryIsKept shows that an entry whose age cannot be read
// counts as live.
func TestUnreadableEntryIsKept(t *testing.T) {
	h := newFakeHost(t)
	dir := h.entry("example-run-locked", 30*time.Hour)
	h.write(filepath.Join(dir, "sub", "f"), "x", 30*time.Hour)
	if err := os.Chmod(filepath.Join(dir, "sub"), 0); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(filepath.Join(dir, "sub"), 0o755) })
	h.age(dir, 30*time.Hour)
	plan, err := planFiles(h.files(), fileInputs{Rules: exampleRules(), TempBase: h.base})
	if err != nil {
		t.Fatal(err)
	}
	if got := itemNames(plan.Keep); !slices.Equal(got, []string{"example-run-locked:unreadable"}) {
		t.Errorf("keep %q", got)
	}
}

// TestUnreadableProcStopsRemoval shows that a /proc that cannot be listed is a
// failed check, so the plan fails rather than removing.
func TestUnreadableProcStopsRemoval(t *testing.T) {
	h := newFakeHost(t)
	h.entry("go-build1", 30*time.Hour)
	f := h.files()
	f.Proc = filepath.Join(h.outer, "absent-proc")
	if _, err := planFiles(f, fileInputs{Rules: builtinRules(), TempBase: h.base}); err == nil {
		t.Fatal("planned with no /proc")
	}
}
