package clientapp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/coder/websocket"
)

// page is a DevTools session with the app window.
type page struct {
	c  *websocket.Conn
	id int
}

// tryPages connects to the page that holds the app's client id.
func tryPages(ctx context.Context, addr string) (*page, error) {
	reqCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, "http://"+addr+"/json/list", nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	var targets []struct {
		Type string `json:"type"`
		WS   string `json:"webSocketDebuggerUrl"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&targets); err != nil {
		return nil, err
	}
	for _, t := range targets {
		if t.Type != "page" || t.WS == "" {
			continue
		}
		u, err := url.Parse(t.WS)
		if err != nil {
			continue
		}
		// The target names the client's port; reach it through the forward.
		u.Host = addr
		p, err := dial(ctx, u.String())
		if err != nil {
			continue
		}
		if _, ok, err := p.getItem(ctx, clientIDKey); err == nil && ok {
			return p, nil
		}
		p.close()
	}
	return nil, errors.New("no window holds the Paseo client id")
}

func dial(ctx context.Context, wsURL string) (*page, error) {
	dialCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	c, _, err := websocket.Dial(dialCtx, wsURL, nil)
	if err != nil {
		return nil, err
	}
	c.SetReadLimit(64 << 20)
	return &page{c: c}, nil
}

func (p *page) close() { _ = p.c.CloseNow() }

// call sends one DevTools command and returns its result.
func (p *page) call(ctx context.Context, method string, params any) (json.RawMessage, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	p.id++
	req, err := json.Marshal(map[string]any{"id": p.id, "method": method, "params": params})
	if err != nil {
		return nil, err
	}
	if err := p.c.Write(ctx, websocket.MessageText, req); err != nil {
		return nil, fmt.Errorf("%s: %w", method, err)
	}
	for {
		_, data, err := p.c.Read(ctx)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", method, err)
		}
		var resp struct {
			ID     int             `json:"id"`
			Result json.RawMessage `json:"result"`
			Error  *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if json.Unmarshal(data, &resp) != nil || resp.ID != p.id {
			continue
		}
		if resp.Error != nil {
			return nil, fmt.Errorf("%s: %s", method, resp.Error.Message)
		}
		return resp.Result, nil
	}
}

// eval evaluates expr in the page and returns its value, or ok false for
// null.
func (p *page) eval(ctx context.Context, expr string) (string, bool, error) {
	res, err := p.call(ctx, "Runtime.evaluate", map[string]any{"expression": expr, "returnByValue": true})
	if err != nil {
		return "", false, err
	}
	var r struct {
		Result struct {
			Value *string `json:"value"`
		} `json:"result"`
		Exception *struct {
			Text string `json:"text"`
		} `json:"exceptionDetails"`
	}
	if err := json.Unmarshal(res, &r); err != nil {
		return "", false, err
	}
	if r.Exception != nil {
		return "", false, fmt.Errorf("the app window raised: %s", r.Exception.Text)
	}
	if r.Result.Value == nil {
		return "", false, nil
	}
	return *r.Result.Value, true, nil
}

func jsString(s string) string {
	data, _ := json.Marshal(s)
	return string(data)
}

func (p *page) getItem(ctx context.Context, key string) (string, bool, error) {
	return p.eval(ctx, "localStorage.getItem("+jsString(key)+")")
}

func (p *page) setItem(ctx context.Context, key, value string) error {
	_, _, err := p.eval(ctx, "localStorage.setItem("+jsString(key)+", "+jsString(value)+")")
	return err
}

func (p *page) removeItem(ctx context.Context, key string) error {
	_, _, err := p.eval(ctx, "localStorage.removeItem("+jsString(key)+")")
	return err
}

// closeWindow asks the app window to close; the Windows app quits when its
// last window closes.
func closeWindow(ctx context.Context, addr string) {
	p, err := tryPages(ctx, addr)
	if err != nil {
		return
	}
	defer p.close()
	callCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	_, _, _ = p.eval(callCtx, "window.close()")
}
