package proxy

import (
	"encoding/json"
	"net/http"
	"path"
	"strings"
)

const viewerPage = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shared browser</title><style>
html,body{margin:0;height:100%;background:#15171c;color:#eee;font:14px system-ui}
header{height:32px;padding:3px 8px;box-sizing:border-box;display:flex;align-items:center;gap:12px}
#status{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#screen{height:calc(100% - 32px);width:100%}
button{font:inherit;color:#eee;background:#2b303b;border:1px solid #4a5160;border-radius:4px;padding:2px 10px;min-height:26px;cursor:pointer}
button:focus-visible,textarea:focus-visible,#clipboard-remote:focus-visible{outline:2px solid #7aa7ff;outline-offset:1px}
#clipboard{position:absolute;top:36px;right:8px;z-index:1;width:min(30rem,calc(100% - 16px));max-height:calc(100% - 48px);overflow:auto;box-sizing:border-box;padding:12px;background:#1f232b;border:1px solid #4a5160;border-radius:6px;display:flex;flex-direction:column;gap:8px}
#clipboard[hidden]{display:none}
#clipboard p{margin:0}
#clipboard-warning{color:#ffcf70}
textarea{font:inherit;color:#eee;background:#15171c;border:1px solid #4a5160;border-radius:4px;min-height:5em;resize:vertical}
#clipboard-remote{margin:0;min-height:3em;max-height:12em;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:#15171c;border:1px solid #4a5160;border-radius:4px;padding:4px;font:13px ui-monospace,monospace}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
</style></head><body>
<header><span id="status">Connecting to shared browser</span><button id="clipboard-toggle" type="button" aria-expanded="false" aria-controls="clipboard">Clipboard</button></header>
<section id="clipboard" aria-label="Clipboard panel" hidden>
<p id="clipboard-mode">Opening the panel shows who controls the shared browser.</p>
<p id="clipboard-warning" hidden>Text you send now is readable by the agent.</p>
<label for="clipboard-send">Text for the remote browser</label>
<textarea id="clipboard-send" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea>
<div class="row"><button id="clipboard-send-button" type="button">Send to remote browser</button></div>
<div class="row"><span id="clipboard-remote-label">Copied in the remote browser</span><span id="clipboard-count"></span></div>
<pre id="clipboard-remote" tabindex="0" aria-labelledby="clipboard-remote-label"></pre>
<div class="row"><button id="clipboard-copy" type="button">Copy to this device</button><button id="clipboard-refresh" type="button">Refresh</button><button id="clipboard-clear" type="button">Clear</button></div>
<p id="clipboard-message" role="status" aria-live="polite"></p>
</section>
<div id="screen"></div>
<script type="module">
import RFB from '/core/rfb.js';
const $=id=>document.getElementById(id);
const status=$('status'),panel=$('clipboard'),toggle=$('clipboard-toggle'),field=$('clipboard-send'),area=$('clipboard-remote'),count=$('clipboard-count'),note=$('clipboard-message'),modeLine=$('clipboard-mode'),warning=$('clipboard-warning');
// Clipboard text lives only in these page variables and elements, never in storage.
let remote=null,mode='',remoteText='';
const inPanel=()=>panel.contains(document.activeElement);
const focusRemote=()=>{if(remote&&!inPanel())remote.focus()};
function showMode(next){
 if(next!=='human'&&next!=='agent')return;
 mode=next;
 modeLine.textContent=next==='agent'?'The agent controls the shared browser.':'The human controls the shared browser.';
 warning.hidden=next!=='agent';
}
// Remote text is set only as text, so markup in it is shown, never run.
function showRemote(text){remoteText=text;area.textContent=text;count.textContent=text?'('+[...text].length+' characters)':''}
function forget(){remoteText='';field.value='';area.textContent='';count.textContent=''}
async function call(method,body){
 const options={method,credentials:'same-origin',cache:'no-store',headers:{'X-Remote-GUI-Clipboard':'1'}};
 let url='/__remote_gui/clipboard';
 if(method==='POST'){options.headers['Content-Type']='text/plain;charset=utf-8';options.body=body;url+='?expected_mode='+encodeURIComponent(mode)}
 const reply=await fetch(url,options);
 let data={};
 try{data=await reply.json()}catch{data={}}
 if(data&&typeof data.browser_mode==='string')showMode(data.browser_mode);
 return {ok:reply.ok,status:reply.status,data:data||{}};
}
function failure(result,action){
 if(result.status===410||result.status===401){forget();note.textContent='The shared browser session ended. Clipboard text was cleared.';return}
 const code=result.data.error;
 if(code==='clipboard-too-large')note.textContent=action==='send'?'The text is over 64 KiB and was not sent.':'The text copied in the remote browser is over 64 KiB and cannot be shown.';
 else if(code==='clipboard-busy')note.textContent='The shared browser is switching or changed control. Check who controls it, then send again.';
 else note.textContent={send:'Sending',clear:'Clearing the remote clipboard',read:'Reading the remote clipboard'}[action]+' failed. Try again.';
}
async function refresh(){
 note.textContent='';
 let result;
 try{result=await call('GET')}catch{note.textContent='Reading the remote clipboard failed. Try again.';return}
 if(!result.ok){showRemote('');failure(result,'read');return}
 showRemote(typeof result.data.text==='string'?result.data.text:'');
}
async function send(){
 const text=field.value;
 if(!text){note.textContent='Paste the text to send first.';return}
 if(!mode){await refresh();if(!mode)return}
 let result;
 try{result=await call('POST',text)}catch{note.textContent='Sending failed. Try again.';return}
 if(!result.ok){failure(result,'send');return}
 field.value='';showRemote('');
 note.textContent='Sent while '+(mode==='agent'?'the agent':'the human')+' controls the shared browser. Press Ctrl+V in the remote page.';
}
// writeText runs inside the click handler; nothing reads the local clipboard.
function copy(){
 if(!remoteText){note.textContent='Nothing to copy. Press Refresh after copying in the remote browser.';return}
 let pending;
 try{pending=navigator.clipboard.writeText(remoteText)}catch{pending=Promise.reject(new Error('unavailable'))}
 pending.then(()=>{note.textContent='Copied to this device.'},()=>{
  const range=document.createRange();range.selectNodeContents(area);
  const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
  note.textContent="This browser blocked the copy. The text is selected; copy it with your device's shortcut.";
 });
}
async function clearAll(){
 forget();note.textContent='';
 let result;
 try{result=await call('DELETE')}catch{note.textContent='Clearing the remote clipboard failed. Try again.';return}
 if(!result.ok){failure(result,'clear');return}
 note.textContent='Cleared here and in the remote browser.';
}
function setOpen(open){
 panel.hidden=!open;toggle.setAttribute('aria-expanded',String(open));
 if(open){field.focus();void refresh()}else{note.textContent='';if(remote)remote.focus()}
}
toggle.addEventListener('click',()=>setOpen(panel.hidden));
panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();setOpen(false)}});
$('clipboard-send-button').addEventListener('click',()=>{void send()});
$('clipboard-copy').addEventListener('click',copy);
$('clipboard-refresh').addEventListener('click',()=>{void refresh()});
$('clipboard-clear').addEventListener('click',()=>{void clearAll()});
window.addEventListener('pagehide',forget);
try{
 const reply=await fetch('/__remote_gui/viewer-access',{credentials:'same-origin',cache:'no-store'});
 if(!reply.ok)throw Error('Access expired');
 const credentials=await reply.json();
 remote=new RFB($('screen'),(location.protocol==='https:'?'wss://':'ws://')+location.host+'/websockify',{credentials:{password:credentials.password}});
 remote.scaleViewport=true;remote.viewOnly=false;
 remote.addEventListener('connect',()=>{status.textContent='Shared browser connected';focusRemote()});
 remote.addEventListener('disconnect',()=>{status.textContent='Shared browser disconnected';forget()});
 remote.addEventListener('securityfailure',()=>{status.textContent='Shared browser authentication failed';forget()});
 // A phone keyboard resizes the viewport; typing in the panel must stay there.
 window.addEventListener('resize',focusRemote);
}catch(error){status.textContent='Shared browser unavailable. Reopen the session link.'}
</script></body></html>`

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
