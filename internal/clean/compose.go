package clean

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"slices"

	"github.com/michielvha/vh-adlc/internal/report"
)

// The Compose labels clean reads.
const (
	composeProjectLabel = "com.docker.compose.project"
	composeWorkDirLabel = "com.docker.compose.project.working_dir"
)

// engineResult is what one engine step removed, kept, left for its flag and
// failed to do. In a dry run, Removed holds what would go.
type engineResult struct {
	Removed   []Item
	Kept      []Item
	NeedsFlag []Item
	Failures  []report.Finding
}

// doCompose decides each Compose project a rule matches. A project is
// abandoned only when the working directory of every one of its containers is
// gone. Without the flag it is only listed; in a dry run its objects are
// listed; otherwise its containers are stopped and removed, then its networks,
// then its volumes when the rule says so.
func doCompose(ctx context.Context, e *Engine, state engineState, rules []ComposeRule, flag, dry bool) engineResult {
	var res engineResult
	if len(rules) == 0 || state.Absent {
		return res
	}
	projects := map[string][]container{}
	for _, c := range state.Containers {
		if p := c.Labels[composeProjectLabel]; p != "" {
			projects[p] = append(projects[p], c)
		}
	}
	names := make([]string, 0, len(projects))
	for p := range projects {
		names = append(names, p)
	}
	slices.Sort(names)
	for _, name := range names {
		rule, ok := matchCompose(rules, name)
		if !ok {
			continue
		}
		item := Item{Kind: KindComposeProject, Name: name, Rule: rule.Project}
		if !composeAbandoned(projects[name]) {
			item.Reason = ReasonLive
			res.Kept = append(res.Kept, item)
			continue
		}
		if !flag {
			item.Reason = ReasonNeedsCompose
			res.NeedsFlag = append(res.NeedsFlag, item)
			continue
		}
		item.Reason = ReasonAbandoned
		res.Removed = append(res.Removed, item)
		res.removeProject(ctx, e, name, rule, projects[name], dry)
	}
	return res
}

func matchCompose(rules []ComposeRule, name string) (ComposeRule, bool) {
	for _, r := range rules {
		if ok, err := path.Match(r.Project, name); err == nil && ok {
			return r, true
		}
	}
	return ComposeRule{}, false
}

// composeAbandoned holds only when every container names a working directory
// and every one is gone. A missing label or a path that cannot be checked
// counts as live.
func composeAbandoned(cs []container) bool {
	for _, c := range cs {
		dir := c.Labels[composeWorkDirLabel]
		if dir == "" {
			return false
		}
		if _, err := os.Lstat(dir); !errors.Is(err, fs.ErrNotExist) {
			return false
		}
	}
	return len(cs) > 0
}

func (res *engineResult) removeProject(ctx context.Context, e *Engine, name string, rule ComposeRule, cs []container, dry bool) {
	label := composeProjectLabel + "=" + name
	stuck := false
	for _, c := range cs {
		it := Item{Kind: KindComposeContainer, Name: c.ID, Rule: rule.Project}
		if !res.change(it, dry, func() error {
			if c.State == "running" || c.State == "restarting" || c.State == "paused" {
				if err := e.stopContainer(ctx, c.ID); err != nil {
					return err
				}
			}
			return e.removeContainer(ctx, c.ID)
		}) {
			stuck = true
		}
	}
	if stuck {
		return
	}
	nets, err := e.networks(ctx, label)
	if err != nil {
		res.fail(Item{Kind: KindComposeNetwork, Name: name, Rule: rule.Project}, err)
		return
	}
	for _, n := range nets {
		res.change(Item{Kind: KindComposeNetwork, Name: n.Name, Rule: rule.Project}, dry, func() error {
			return e.removeNetwork(ctx, n.ID)
		})
	}
	if !rule.Volumes {
		return
	}
	vols, err := e.volumes(ctx, label)
	if err != nil {
		res.fail(Item{Kind: KindComposeVolume, Name: name, Rule: rule.Project}, err)
		return
	}
	for _, v := range vols {
		res.change(Item{Kind: KindComposeVolume, Name: v.Name, Rule: rule.Project}, dry, func() error {
			return e.removeVolume(ctx, v.Name)
		})
	}
}

// change runs one removal, or only records it in a dry run. It reports whether
// the object is gone or would go.
func (res *engineResult) change(it Item, dry bool, do func() error) bool {
	if !dry {
		switch err := do(); {
		case errors.Is(err, errInUse):
			it.Reason = ReasonInUse
			res.Kept = append(res.Kept, it)
			return false
		case err != nil:
			res.fail(it, err)
			return false
		}
	}
	it.Reason = ReasonAbandoned
	res.Removed = append(res.Removed, it)
	return true
}

func (res *engineResult) fail(it Item, err error) {
	it.Reason = ReasonRemovalFailed
	res.Kept = append(res.Kept, it)
	res.Failures = append(res.Failures, report.Finding{Code: report.CodeRemovalFailed, Message: fmt.Sprintf("%s %s: %v", it.Kind, it.Name, err)})
}
