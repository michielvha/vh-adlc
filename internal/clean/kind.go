package clean

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"syscall"

	"github.com/michielvha/vh-adlc/internal/report"
)

// kindClusterLabel is the label kind puts on its node containers; a harness
// puts it on its marks too.
const kindClusterLabel = "io.x-k8s.kind.cluster"

// kindHost holds the host facts the kind step reads. Tests replace them.
type kindHost struct {
	Hostname string
	Kill     func(pid int) error
	LookPath func(file string) (string, error)
	Run      func(ctx context.Context, name string, args ...string) error
}

// markEnded reads one mark. A pid mark has ended only when it names this host
// and kill(pid, 0) returns ESRCH; a path mark only when its absolute path is
// gone. Anything else, a malformed value included, is live.
func markEnded(l Liveness, value string, h kindHost) bool {
	switch l.Kind {
	case LivenessPID:
		host, pidText, ok := strings.Cut(value, "/")
		if !ok || host != h.Hostname {
			return false
		}
		pid, err := strconv.Atoi(pidText)
		if err != nil || pid <= 0 {
			return false
		}
		return errors.Is(h.Kill(pid), syscall.ESRCH)
	case LivenessPath:
		if !filepath.IsAbs(value) {
			return false
		}
		_, err := os.Lstat(value)
		return errors.Is(err, fs.ErrNotExist)
	}
	return false
}

// doKind decides each kind cluster a rule matches. A cluster with no mark, or
// any live mark, stays. One whose marks have all ended is listed without the
// flag, or has its nodes stopped, `kind delete cluster` run and its marks
// removed. A mark whose cluster is gone is left alone.
func doKind(ctx context.Context, e *Engine, state engineState, rules []KindRule, h kindHost, flag, dry bool) engineResult {
	var res engineResult
	if len(rules) == 0 || state.Absent {
		return res
	}
	nodes := map[string][]container{}
	for _, c := range state.Containers {
		if name := c.Labels[kindClusterLabel]; name != "" {
			nodes[name] = append(nodes[name], c)
		}
	}
	names := make([]string, 0, len(nodes))
	for n := range nodes {
		names = append(names, n)
	}
	slices.Sort(names)
	var marks []volume
	if len(names) > 0 {
		var err error
		if marks, err = e.volumes(ctx, kindClusterLabel); err != nil {
			res.Failures = append(res.Failures, report.Finding{Code: report.CodeEngineUnreachable, Message: fmt.Sprintf("listing kind marks: %v", err)})
			return res
		}
	}
	kindPath := ""
	for _, name := range names {
		rule, ok := matchKind(rules, name)
		if !ok {
			continue
		}
		item := Item{Kind: KindKindCluster, Name: name, Rule: rule.Cluster}
		var own []volume
		ended := true
		for _, m := range marks {
			value, has := m.Labels[rule.Liveness.Label]
			if m.Labels[kindClusterLabel] != name || !has {
				continue
			}
			own = append(own, m)
			if !markEnded(rule.Liveness, value, h) {
				ended = false
			}
		}
		switch {
		case len(own) == 0:
			item.Reason = ReasonUnmarked
			res.Kept = append(res.Kept, item)
			continue
		case !ended:
			item.Reason = ReasonLive
			res.Kept = append(res.Kept, item)
			continue
		case !flag:
			item.Reason = ReasonNeedsKind
			res.NeedsFlag = append(res.NeedsFlag, item)
			continue
		}
		if kindPath == "" {
			p, err := h.LookPath("kind")
			if err != nil {
				item.Reason = ReasonKindMissing
				res.Kept = append(res.Kept, item)
				res.Failures = append(res.Failures, report.Finding{Code: report.CodeKindUnavailable, Message: "kind is not on PATH, so the kind step was skipped"})
				continue
			}
			kindPath = p
		}
		res.deleteCluster(ctx, e, h, kindPath, item, nodes[name], own, dry)
	}
	return res
}

func matchKind(rules []KindRule, name string) (KindRule, bool) {
	for _, r := range rules {
		if ok, err := path.Match(r.Cluster, name); err == nil && ok {
			return r, true
		}
	}
	return KindRule{}, false
}

// deleteCluster stops the nodes first, so `kind delete cluster`, which removes
// node containers with force, removes only stopped ones.
func (res *engineResult) deleteCluster(ctx context.Context, e *Engine, h kindHost, kindPath string, item Item, nodes []container, marks []volume, dry bool) {
	if !dry {
		for _, n := range nodes {
			if n.State != "running" && n.State != "restarting" && n.State != "paused" {
				continue
			}
			if err := e.stopContainer(ctx, n.ID); err != nil {
				res.fail(item, fmt.Errorf("stopping node %s: %w", n.ID, err))
				return
			}
		}
		if err := h.Run(ctx, kindPath, "delete", "cluster", "--name", item.Name); err != nil {
			res.fail(item, err)
			return
		}
	}
	item.Reason = ReasonAbandoned
	res.Removed = append(res.Removed, item)
	for _, m := range marks {
		res.change(Item{Kind: KindKindMark, Name: m.Name, Rule: item.Rule}, dry, func() error {
			return e.removeVolume(ctx, m.Name)
		})
	}
}

// realKindHost is this host's kindHost.
func realKindHost() kindHost {
	host, _ := os.Hostname()
	return kindHost{
		Hostname: host,
		Kill:     func(pid int) error { return syscall.Kill(pid, 0) },
		LookPath: exec.LookPath,
		Run: func(ctx context.Context, name string, args ...string) error {
			out, err := exec.CommandContext(ctx, name, args...).CombinedOutput()
			if err != nil {
				return fmt.Errorf("%w: %s", err, strings.TrimSpace(string(out)))
			}
			return nil
		},
	}
}
