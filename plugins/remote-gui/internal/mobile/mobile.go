// Package mobile defines the content-free focus information used by the viewer.
package mobile

import "context"

// Field identifies the sampled editable focus. Coordinates are remote
// framebuffer pixels. Token cannot be used to address the remote field.
type Field struct {
	Token  string `json:"token"`
	Phase  uint64 `json:"phase"`
	Mode   string `json:"mode"`
	X      int    `json:"x"`
	Y      int    `json:"y"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}

// Lookup returns an eligible field covering (x, y), or nil if unavailable.
type Lookup func(context.Context, int, int) (*Field, error)
