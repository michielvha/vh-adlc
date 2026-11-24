#!/usr/bin/env python3
"""Synthetic page for the physical phone checks of remote-gui mobile input.

Serves a page on 127.0.0.1:<port> and a cross-origin frame on 127.0.0.1:<port+1>.
Every input event in the remote Chromium is posted back and appended to
<dir>/events.jsonl. The fields only ever hold text typed during the test.
GET /state prints a per-field summary; POST /cmd queues one page command
(focus:<id>, password:<id>, text:<id>, clear) that the page applies on its next poll.
"""
import http.server
import json
import os
import sys
import threading
import time

PAGE = """<!doctype html><html><head><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>remote-gui physical fixture</title>
<style>body{font:18px sans-serif;margin:16px}label{display:block;margin:14px 0 4px}
input,textarea,[contenteditable]{font:inherit;width:90%;padding:6px;border:1px solid #888}
[contenteditable]{min-height:2em}#spacer{height:140vh;background:#f4f4f4}
#bg{padding:20px;background:#ddeeff}</style></head><body>
<h1>Physical fixture</h1>
<p><button id=later-focus onclick="later('focus:area')">Move focus to Textarea in 6 s</button>
<button id=later-pw onclick="later('password:text')">Make Text a password in 6 s</button>
<button id=later-text onclick="later('text:text')">Make Text plain again</button>
<button id=clear onclick="apply('clear')">Clear fields</button></p>
<div id=bg>Background area (not editable)</div>
<label for=text>Text</label><input id=text type=text autocomplete=off>
<label for=password>Password</label><input id=password type=password>
<label for=area>Textarea</label><textarea id=area rows=3></textarea>
<label>Contenteditable</label><div id=ce contenteditable=true></div>
<label for=ro>Readonly</label><input id=ro type=text readonly value=readonly>
<label for=dis>Disabled</label><input id=dis type=text disabled value=disabled>
<label for=near1>Adjacent A</label><input id=near1 type=text style="margin:0">
<input id=near2 type=text style="margin:0" aria-label="Adjacent B">
<label>Cross-origin frame</label>
<iframe id=frame src="http://127.0.0.1:FRAMEPORT/frame" style="width:92%;height:90px;border:1px solid #888"></iframe>
<div id=spacer></div>
<form onsubmit="send({t:'submit'});return false">
<label for=low>Low field</label><input id=low type=text>
<button id=go>Submit</button></form>
<script>
function cps(s){return s==null?null:Array.from(s).map(c=>c.codePointAt(0).toString(16))}
function send(o){o.at=Date.now();navigator.sendBeacon('/log',JSON.stringify(o))}
function val(el){return el.isContentEditable?el.textContent:el.value}
for(const ev of ['keydown','keyup','beforeinput','input','compositionstart','compositionupdate','compositionend','focus','blur','paste'])
 document.addEventListener(ev,e=>{const el=e.target;if(!el||!el.id)return;
  send({t:ev,id:el.id,key:e.key||null,inputType:e.inputType||null,data:cps(e.data),
   composing:!!e.isComposing,value:(ev==='input'||ev==='compositionend'||ev==='keyup')?cps(val(el)):undefined})},true);
function apply(c){const [op,id]=c.split(':');const el=document.getElementById(id);
 if(op==='focus'&&el)el.focus();if(op==='password'&&el)el.type='password';if(op==='text'&&el)el.type='text';
 if(op==='clear'){for(const f of document.querySelectorAll('input:not([readonly]):not([disabled]),textarea'))f.value='';
  document.getElementById('ce').textContent=''}
 send({t:'cmd',cmd:c})}
function later(c){send({t:'scheduled',cmd:c});setTimeout(()=>apply(c),6000)}
setInterval(async()=>{try{const r=await fetch('/cmd');const c=await r.text();if(c)apply(c)}catch(e){}},300);
</script></body></html>"""

FRAME = """<!doctype html><meta charset=utf-8><body style="margin:4px;font:18px sans-serif">
<input id=framed type=text style="font:inherit;width:90%" aria-label="Framed">
<script>function cps(s){return s==null?null:Array.from(s).map(c=>c.codePointAt(0).toString(16))}
for(const ev of ['keydown','keyup','input','compositionstart','compositionend','focus','blur'])
 document.addEventListener(ev,e=>{if(!e.target.id)return;
  fetch('http://127.0.0.1:PAGEPORT/log',{method:'POST',mode:'no-cors',body:JSON.stringify({t:ev,id:'framed',key:e.key||null,
  inputType:e.inputType||null,data:cps(e.data),composing:!!e.isComposing,value:ev==='input'?cps(e.target.value):undefined,at:Date.now()})})},true)</script>"""


def main():
    out, port = sys.argv[1], int(sys.argv[2])
    log_path = os.path.join(out, "events.jsonl")
    lock = threading.Lock()
    cmds = []

    def summary():
        fields = {}
        with lock, open(log_path, encoding="utf-8") as f:
            for line in f:
                e = json.loads(line)
                s = fields.setdefault(e.get("id") or e["t"], {"keydown": 0, "input": 0, "composition": 0, "last": None})
                if e["t"] == "keydown":
                    s["keydown"] += 1
                if e["t"] == "input":
                    s["input"] += 1
                    s["last"] = "".join(chr(int(c, 16)) for c in e.get("value") or [])
                if e["t"].startswith("composition"):
                    s["composition"] += 1
        return fields

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def reply(self, body, ctype="text/html; charset=utf-8"):
            data = body.encode()
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.server.server_port == port + 1:
                return self.reply(FRAME.replace("PAGEPORT", str(port)))
            if self.path == "/state":
                return self.reply(json.dumps(summary(), ensure_ascii=False, indent=1), "application/json")
            if self.path == "/cmd":
                with lock:
                    c = cmds.pop(0) if cmds else ""
                return self.reply(c, "text/plain")
            return self.reply(PAGE.replace("FRAMEPORT", str(port + 1)))

        def do_POST(self):
            body = self.rfile.read(int(self.headers.get("Content-Length") or 0)).decode()
            if self.path == "/cmd":
                with lock:
                    cmds.append(body.strip())
            elif self.path == "/log":
                rec = json.loads(body)
                rec["recv"] = time.time()
                with lock, open(log_path, "a", encoding="utf-8") as f:
                    f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            self.reply("", "text/plain")

    open(log_path, "a").close()
    servers = [http.server.ThreadingHTTPServer(("127.0.0.1", p), Handler) for p in (port, port + 1)]
    threading.Thread(target=servers[1].serve_forever, daemon=True).start()
    with open(os.path.join(out, "fixture.pid"), "w") as f:
        f.write(str(os.getpid()))
    servers[0].serve_forever()


if __name__ == "__main__":
    main()
