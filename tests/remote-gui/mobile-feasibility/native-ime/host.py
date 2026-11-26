from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import subprocess
import sys
import time
p=Path(sys.argv[1])
display_init=Path(sys.argv[2])
html=b'''<!doctype html><meta charset="utf-8"><title>Synthetic IME probe</title>
<label>A <input id="a"></label><label>B <input id="b"></label>
<script>
const a=document.querySelector("#a"), b=document.querySelector("#b");
let sequence=0;
const events=[];
for(const field of [a,b]){
  for(const kind of ["focus","beforeinput","input"]){
    field.addEventListener(kind, event=>{
      events.push([kind,field.id,event.isTrusted]);
    });
  }
}
let race=false;
a.addEventListener("beforeinput",()=>{if(race) b.focus();});
a.focus();
setInterval(async()=>{
 const command=await fetch("/state").then(r=>r.json());
 if(command.seq!==sequence){
   sequence=command.seq;
   a.value="";b.value="";
   a.focus();
   race=command.kind==="during";
   if(command.kind==="before") b.focus();
   events.length=0;
 }
 const result={seq:sequence,ready:document.hasFocus(),
               active:document.activeElement.id, exactA:a.value==="z",
               exactB:b.value==="z",emptyA:a.value==="",emptyB:b.value==="",events};
 await fetch("/observed",{method:"POST",body:JSON.stringify(result)});
},120);
</script>'''
state={'seq':0,'kind':'control'}
observed={}
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_GET(self):
        self.send_response(200)
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Type','application/json' if self.path=='/state' else 'text/html')
        self.end_headers()
        self.wfile.write(json.dumps(state).encode() if self.path=='/state' else html)
    def do_POST(self):
        global observed
        n=int(self.headers.get('Content-Length','0'))
        assert 0<n<8192
        observed=json.loads(self.rfile.read(n))
        self.send_response(204)
        self.end_headers()
from threading import Thread
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
with (p/'chromium.log').open('w') as log:
    browser=subprocess.Popen([str(display_init),'--no-first-run','--disable-default-apps','--disable-sync','--disable-gpu','--no-default-browser-check','--gtk-version=3','--ozone-platform=x11','--user-data-dir='+str(p/'profile'),'--kiosk',f'http://127.0.0.1:{server.server_port}/'],stdout=log,stderr=log)
def wait(test,message):
    for _ in range(120):
        if test(): return
        time.sleep(.1)
    raise RuntimeError(message+': '+repr(observed))
try:
    results = {}
    wait(lambda: observed.get('ready') and observed.get('active')=='a','browser and initial focus')
    assert subprocess.run(['ibus','engine','remote-gui-probe'],check=True).returncode==0
    wait(lambda:'focus in' in (p/'engine.log').read_text(),'engine focus')
    for sequence,kind,initial in [(0,'control','a'),(1,'before','b'),(2,'during','a')]:
        state={'seq':sequence,'kind':kind}
        wait(lambda:observed.get('seq')==sequence and observed.get('active')==initial and observed.get('emptyA') and observed.get('emptyB'),'fixture reset')
        time.sleep(.5)
        (p/'commit').touch()
        wait(lambda:observed.get('exactA') or observed.get('exactB') or any(x[0]=='beforeinput' for x in observed.get('events',[])),'native edit')
        time.sleep(.4)
        result = observed.copy()
        results[kind] = result
        print(kind, result, flush=True)
    assert results['control']['exactA'] and results['control']['emptyB'], 'the native control did not edit A'
    assert [kind for kind, field, _ in results['during']['events'] if field == 'b'] == ['focus'], (
        'the during-edit fixture failed to change focus, or B received an edit'
    )
    labels = [
        line.rsplit(' ', 1)[1]
        for line in (p/'engine.log').read_text().splitlines()
        if line.startswith('current native input context ')
    ]
    assert len(labels) == 3 and len(set(labels)) == 1, 'same two-field test did not retain one native context'
    if results['before']['exactB'] and results['before']['emptyA']:
        raise SystemExit('F1: native IBus commit reached B in the same context after A lost focus')
finally:
    browser.terminate()
    browser.wait(timeout=8)
    server.shutdown()
