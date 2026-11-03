package clean

import (
	"bufio"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/michielvha/vh-adlc/internal/report"
)

// builtinAge is the age of the binary's own Go temp globs.
const builtinAge = 24 * time.Hour

// Item kinds in a report.
const (
	KindTmp              = "tmp"
	KindTempRoot         = "temp_root"
	KindComposeProject   = "compose_project"
	KindComposeContainer = "compose_container"
	KindComposeNetwork   = "compose_network"
	KindComposeVolume    = "compose_volume"
	KindKindCluster      = "kind_cluster"
	KindKindMark         = "kind_mark"
)

// Reasons an item is removed or kept.
const (
	ReasonAbandoned     = "abandoned"
	ReasonYounger       = "younger"
	ReasonOtherOwner    = "other-owner"
	ReasonSymlink       = "symlink"
	ReasonMountPoint    = "mount-point"
	ReasonInUse         = "in-use"
	ReasonUnreadable    = "unreadable"
	ReasonRemovalFailed = "removal-failed"
	ReasonLive          = "live"
	ReasonUnmarked      = "unmarked"
	ReasonNeedsCompose  = "needs --compose"
	ReasonNeedsKind     = "needs --kind"
	ReasonKindMissing   = "kind-unavailable"
)

// Item is one thing a run removed, kept or would remove.
type Item struct {
	Kind   string `json:"kind"`
	Name   string `json:"name"`
	Rule   string `json:"rule"`
	Reason string `json:"reason"`
	Bytes  int64  `json:"bytes"`
}

// Unmatched counts the user-owned top-level /tmp entries no rule matched.
type Unmatched struct {
	Count int   `json:"count"`
	Bytes int64 `json:"bytes"`
}

// FileHost holds the host facts file planning reads. Tests point the paths at
// fakes and replace the clock and the owner lookup.
type FileHost struct {
	Tmp       string // /tmp
	Proc      string // /proc
	MountInfo string // /proc/self/mountinfo
	NetUnix   string // /proc/net/unix
	UID       int
	Now       func() time.Time
	Owner     func(path string, info fs.FileInfo) int
}

// RealFileHost is this host's FileHost.
func RealFileHost(uid int) FileHost {
	return FileHost{
		Tmp: "/tmp", Proc: "/proc", MountInfo: "/proc/self/mountinfo", NetUnix: "/proc/net/unix",
		UID: uid, Now: time.Now,
		Owner: func(_ string, info fs.FileInfo) int { return ownerOf(info) },
	}
}

// fileRule is one /tmp glob and its age. Rule names it in the report.
type fileRule struct {
	Glob   string
	MaxAge time.Duration
}

func builtinRules() []fileRule {
	return []fileRule{{Glob: "go-build*", MaxAge: builtinAge}, {Glob: "gopls-tempmod*", MaxAge: builtinAge}}
}

// fileInputs is what one plan covers. An empty Project or a zero RootAge
// leaves the temp root out.
type fileInputs struct {
	Rules     []fileRule
	TempBase  string
	Project   string
	RootAge   time.Duration
	OlderThan time.Duration
	Binds     []string // container bind-mount sources
}

type filePlan struct {
	Remove    []Item
	Keep      []Item
	Unmatched Unmatched
}

// planFiles decides every matched /tmp entry and every temp-root entry. It
// changes nothing. An error is a failed check, and the caller removes no file
// entry then.
func planFiles(h FileHost, in fileInputs) (filePlan, error) {
	var plan filePlan
	use, err := scanUsage(h)
	if err != nil {
		return plan, err
	}
	use.paths = append(use.paths, in.Binds...)

	entries, err := os.ReadDir(h.Tmp)
	if err != nil {
		return plan, fmt.Errorf("listing %s: %w", h.Tmp, err)
	}
	for _, e := range entries {
		full := filepath.Join(h.Tmp, e.Name())
		if within(in.TempBase, full) {
			continue
		}
		info, err := os.Lstat(full)
		if err != nil {
			continue // gone since the listing
		}
		rule, matched := matchRule(in.Rules, e.Name())
		if !matched {
			if h.Owner(full, info) == h.UID {
				plan.Unmatched.Count++
				_, size, _ := entryStats(full)
				plan.Unmatched.Bytes += size
			}
			continue
		}
		it := Item{Kind: KindTmp, Name: full, Rule: rule.Glob}
		plan.decide(h, use, it, info, max(rule.MaxAge, in.OlderThan))
	}

	if in.Project == "" || in.RootAge == 0 {
		return plan, nil
	}
	root := filepath.Join(in.TempBase, in.Project)
	info, err := os.Lstat(root)
	switch {
	case errors.Is(err, fs.ErrNotExist):
		return plan, nil
	case err != nil:
		return plan, coded(report.CodeTempBaseRefused, "temp root %s: %v", root, err)
	}
	if err := ownedDir(info, h.UID); err != nil || h.Owner(root, info) != h.UID {
		return plan, coded(report.CodeTempBaseRefused, "temp root %s is not a directory only the user can write", root)
	}
	inner, err := os.ReadDir(root)
	if err != nil {
		return plan, fmt.Errorf("listing %s: %w", root, err)
	}
	for _, e := range inner {
		full := filepath.Join(root, e.Name())
		info, err := os.Lstat(full)
		if err != nil {
			continue
		}
		it := Item{Kind: KindTempRoot, Name: full, Rule: "temp_root"}
		plan.decide(h, use, it, info, max(in.RootAge, in.OlderThan))
	}
	return plan, nil
}

func matchRule(rules []fileRule, name string) (fileRule, bool) {
	for _, r := range rules {
		if ok, err := path.Match(r.Glob, name); err == nil && ok {
			return r, true
		}
	}
	return fileRule{}, false
}

// decide keeps an entry unless every check says it may go.
func (p *filePlan) decide(h FileHost, use usage, it Item, info fs.FileInfo, age time.Duration) {
	keep := func(reason string) {
		it.Reason = reason
		p.Keep = append(p.Keep, it)
	}
	switch {
	case info.Mode()&fs.ModeSymlink != 0:
		keep(ReasonSymlink)
		return
	case h.Owner(it.Name, info) != h.UID:
		keep(ReasonOtherOwner)
		return
	case use.mountedIn(it.Name):
		keep(ReasonMountPoint)
		return
	case use.holds(it.Name):
		keep(ReasonInUse)
		return
	}
	newest, size, err := entryStats(it.Name)
	if err != nil {
		keep(ReasonUnreadable)
		return
	}
	it.Bytes = size
	if h.Now().Sub(newest) < age {
		keep(ReasonYounger)
		return
	}
	it.Reason = ReasonAbandoned
	p.Remove = append(p.Remove, it)
}

// entryStats walks an entry without following symlinks and returns its newest
// modification time and the space its files take. Any unreadable part is an
// error, so the entry's age is unknown: WalkDir calls back a second time with
// the error of a directory it could not read.
func entryStats(top string) (time.Time, int64, error) {
	var newest time.Time
	var size int64
	err := filepath.WalkDir(top, func(_ string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		if info.ModTime().After(newest) {
			newest = info.ModTime()
		}
		size += diskSize(info)
		return nil
	})
	return newest, size, err
}

func diskSize(info fs.FileInfo) int64 {
	if st, ok := info.Sys().(*syscall.Stat_t); ok {
		return st.Blocks * 512
	}
	return info.Size()
}

// applyFiles removes the planned entries through os.Root, so a name cannot
// lead outside the directory that holds it.
func applyFiles(p filePlan) (removed, kept []Item, failures []report.Finding) {
	kept = append(kept, p.Keep...)
	for _, it := range p.Remove {
		root, err := os.OpenRoot(filepath.Dir(it.Name))
		if err == nil {
			err = root.RemoveAll(filepath.Base(it.Name))
			_ = root.Close()
		}
		if err != nil {
			it.Reason = ReasonRemovalFailed
			kept = append(kept, it)
			failures = append(failures, report.Finding{Code: report.CodeRemovalFailed, Message: fmt.Sprintf("removing %s: %v", it.Name, err)})
			continue
		}
		removed = append(removed, it)
	}
	return removed, kept, failures
}

// usage is what processes, sockets and mounts hold.
type usage struct {
	paths  []string // files and directories a process or container uses
	mounts []string // mount points
}

func (u usage) holds(entry string) bool {
	for _, p := range u.paths {
		if within(p, entry) {
			return true
		}
	}
	return false
}

func (u usage) mountedIn(entry string) bool {
	for _, m := range u.mounts {
		if within(m, entry) {
			return true
		}
	}
	return false
}

// scanUsage reads /proc for the user's own processes, /proc/net/unix for bound
// sockets and the mount table. A process of another user, one whose entries
// cannot be read and one that exits during the scan are skipped: age is the
// only protection against them. A /proc, socket table or mount table that
// cannot be read is a failed check.
func scanUsage(h FileHost) (usage, error) {
	var u usage
	pids, err := os.ReadDir(h.Proc)
	if err != nil {
		return u, fmt.Errorf("listing %s: %w", h.Proc, err)
	}
	for _, e := range pids {
		if _, err := strconv.Atoi(e.Name()); err != nil {
			continue
		}
		dir := filepath.Join(h.Proc, e.Name())
		info, err := os.Lstat(dir)
		if err != nil || !info.IsDir() || h.Owner(dir, info) != h.UID {
			continue
		}
		u.paths = append(u.paths, processPaths(dir)...)
	}
	sockets, err := unixSockets(h.NetUnix)
	if err != nil {
		return u, err
	}
	u.paths = append(u.paths, sockets...)
	mounts, err := mountPoints(h.MountInfo)
	if err != nil {
		return u, err
	}
	u.mounts = mounts
	return u, nil
}

// processPaths returns the paths one process holds, or none when its entries
// cannot be read.
func processPaths(dir string) []string {
	var out []string
	for _, link := range []string{"cwd", "exe", "root"} {
		if p, ok := readLinkPath(filepath.Join(dir, link)); ok {
			out = append(out, p)
		}
	}
	if fds, err := os.ReadDir(filepath.Join(dir, "fd")); err == nil {
		for _, fd := range fds {
			if p, ok := readLinkPath(filepath.Join(dir, "fd", fd.Name())); ok {
				out = append(out, p)
			}
		}
	}
	if b, err := os.ReadFile(filepath.Join(dir, "maps")); err == nil {
		for line := range strings.SplitSeq(string(b), "\n") {
			if m := mapsLine.FindStringSubmatch(line); m != nil && strings.HasPrefix(m[1], "/") {
				out = append(out, strings.TrimSuffix(m[1], " (deleted)"))
			}
		}
	}
	return out
}

// The path of a /proc/<pid>/maps line is everything after the fifth field.
var mapsLine = regexp.MustCompile(`^\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+(.+)$`)

// readLinkPath reads a /proc link that names a file, dropping a deleted
// file's suffix. Sockets, pipes and anonymous inodes are not paths.
func readLinkPath(link string) (string, bool) {
	target, err := os.Readlink(link)
	if err != nil || !strings.HasPrefix(target, "/") {
		return "", false
	}
	return strings.TrimSuffix(target, " (deleted)"), true
}

// unixSockets reads the bound paths in /proc/net/unix. Abstract sockets,
// which start with @, are not files.
func unixSockets(file string) ([]string, error) {
	f, err := os.Open(file)
	if err != nil {
		return nil, fmt.Errorf("reading %s: %w", file, err)
	}
	defer func() { _ = f.Close() }()
	var out []string
	sc := bufio.NewScanner(f)
	first := true
	for sc.Scan() {
		if first {
			first = false
			continue
		}
		fields := strings.Fields(sc.Text())
		if len(fields) >= 8 && strings.HasPrefix(fields[7], "/") {
			out = append(out, strings.Join(fields[7:], " "))
		}
	}
	if err := sc.Err(); err != nil {
		return nil, fmt.Errorf("reading %s: %w", file, err)
	}
	return out, nil
}

// mountPoints reads the fifth field of each mountinfo line, which escapes
// space, tab, newline and backslash as octal.
func mountPoints(file string) ([]string, error) {
	b, err := os.ReadFile(file)
	if err != nil {
		return nil, fmt.Errorf("reading %s: %w", file, err)
	}
	var out []string
	for line := range strings.SplitSeq(string(b), "\n") {
		fields := strings.Fields(line)
		if len(fields) >= 5 {
			out = append(out, unescapeOctal(fields[4]))
		}
	}
	return out, nil
}

var octal = regexp.MustCompile(`\\[0-7]{3}`)

func unescapeOctal(s string) string {
	return octal.ReplaceAllStringFunc(s, func(m string) string {
		n, _ := strconv.ParseUint(m[1:], 8, 8)
		return string(rune(n))
	})
}
