package browser

import "testing"

func TestMobileGeometryRequiresOneExplicitUnitScale(t *testing.T) {
	for _, args := range [][]string{
		nil,
		{"--force-device-scale-factor=2"},
		{"--force-device-scale-factor=1", "--force-device-scale-factor=2"},
		{"--force-device-scale-factor", "1"},
	} {
		if usesUnitDeviceScale(args) {
			t.Fatalf("accepted unverifiable scale: %q", args)
		}
	}
	if !usesUnitDeviceScale([]string{"--force-device-scale-factor=1"}) {
		t.Fatal("rejected owned unit scale")
	}
}
