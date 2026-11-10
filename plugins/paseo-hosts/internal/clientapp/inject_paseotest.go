//go:build paseotest

package clientapp

import (
	"encoding/json"
	"os"
)

// With PASEO_HOSTS_TEST_REJECT_ENTRY=1, a paseotest build adds a key the
// app's strict schema rejects, so the app drops its registry and the
// rollback runs.
func init() {
	inject = func(entry json.RawMessage) json.RawMessage {
		if os.Getenv("PASEO_HOSTS_TEST_REJECT_ENTRY") != "1" {
			return entry
		}
		var m map[string]any
		if json.Unmarshal(entry, &m) != nil {
			return entry
		}
		m["paseoHostsTestReject"] = true
		data, err := json.Marshal(m)
		if err != nil {
			return entry
		}
		return data
	}
}
