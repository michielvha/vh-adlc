package browser

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/state"
	"github.com/michielvha/vh-adlc/plugins/remote-gui/internal/xclip"
)

// TestNativeViewportProbe inspects only the disposable home selected by the browser fixture.
// It gives the real viewer tests native geometry evidence in human mode without CDP.
func TestNativeViewportProbe(t *testing.T) {
	home, id := os.Getenv("RG_VIEWPORT_PROBE_HOME"), os.Getenv("RG_VIEWPORT_PROBE_ID")
	if home == "" || id == "" {
		t.Skip("browser fixture native probe")
	}
	record, err := state.Load(home, id)
	if err != nil || record.Kind != "browser" || record.Display == nil {
		t.Fatal("owned browser fixture record unavailable")
	}
	var browser state.Identity
	for _, process := range record.Owned {
		if process.Role == "browser" {
			browser = process.Identity
		}
	}
	if !state.Alive(browser) {
		t.Fatal("fixture browser identity changed")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	helper, err := xclip.Open(ctx, xclip.Display{Number: record.Display.Number, Authority: filepath.Join(home, id, "Xauthority")})
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = helper.Close() }()
	windows, err := helper.Windows(ctx, browser.PID)
	if err != nil {
		t.Fatal(err)
	}
	focused, err := helper.Focused(ctx, browser.PID)
	if err != nil {
		t.Fatal(err)
	}
	data, err := json.Marshal(struct {
		Focused bool           `json:"focused"`
		PID     int            `json:"pid"`
		Start   string         `json:"start"`
		Windows []xclip.Window `json:"windows"`
	}{focused, browser.PID, browser.Start, windows})
	if err != nil {
		t.Fatal(err)
	}
	fmt.Printf("native-geometry:%s\n", data)
}
