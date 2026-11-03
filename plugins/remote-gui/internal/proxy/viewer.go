package proxy

import (
	"encoding/json"
	"net/http"
	"path"
	"strings"
)

const viewerPage = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shared browser</title><style>html,body{margin:0;height:100%;background:#15171c;color:#eee;font:14px system-ui}header{height:32px;padding:8px;box-sizing:border-box}#screen{height:calc(100% - 32px);width:100%}</style></head><body><header id="status">Connecting to shared browser</header><div id="screen"></div><script type="module">import RFB from '/core/rfb.js';const status=document.getElementById('status');try{const reply=await fetch('/__remote_gui/viewer-access',{credentials:'same-origin',cache:'no-store'});if(!reply.ok)throw Error('Access expired');const credentials=await reply.json();const remote=new RFB(document.getElementById('screen'),(location.protocol==='https:'?'wss://':'ws://')+location.host+'/websockify',{credentials:{password:credentials.password}});remote.scaleViewport=true;remote.viewOnly=false;remote.addEventListener('connect',()=>{status.textContent='Shared browser connected';remote.focus()});remote.addEventListener('disconnect',()=>{status.textContent='Shared browser disconnected'});remote.addEventListener('securityfailure',()=>{status.textContent='Shared browser authentication failed'});window.addEventListener('resize',()=>remote.focus());}catch(error){status.textContent='Shared browser unavailable. Reopen the session link.'}</script></body></html>`

func (p *Proxy) viewer(w http.ResponseWriter, r *http.Request) bool {
	if p.assets == nil {
		return false
	}
	switch r.URL.Path {
	case "/", "/vnc.html":
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(viewerPage))
		return true
	case "/__remote_gui/viewer-access":
		if r.Method != http.MethodGet {
			w.WriteHeader(405)
			return true
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"password": p.viewerPassword})
		return true
	case "/websockify":
		if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
			http.NotFound(w, r)
			return true
		}
		return false
	default:
		if !strings.HasPrefix(r.URL.Path, "/core/") && !strings.HasPrefix(r.URL.Path, "/vendor/") && !strings.HasPrefix(r.URL.Path, "/app/") {
			http.NotFound(w, r)
			return true
		}
		f, err := p.assets.Open(strings.TrimPrefix(r.URL.Path, "/"))
		if err != nil {
			http.NotFound(w, r)
			return true
		}
		defer func() { _ = f.Close() }()
		info, err := f.Stat()
		if err != nil || !info.Mode().IsRegular() {
			http.NotFound(w, r)
			return true
		}
		http.ServeContent(w, r, path.Base(r.URL.Path), info.ModTime(), f)
		return true
	}
}
