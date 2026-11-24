export type Box={x:number;y:number;width:number;height:number};
export type ViewportMetrics={tab:string;instance:string;width:number;height:number;outerWidth:number;outerHeight:number;overflow:boolean;columns:number;value:string;nonce:string;visible:boolean;dialog:boolean;field:Box;open:Box;showDialog:Box;closeDialog:Box;closeWindow:Box;ack:Box;acknowledged:boolean;at:number};

// An inert page reports its own viewport and form state. In human mode the fixture
// observes ordinary app requests; it neither attaches debugging nor reads a profile.
export function startViewportPage(){
 const metrics=new Map<string,ViewportMetrics>();
 const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(request){
  const url=new URL(request.url);
  if(url.pathname==='/proof'&&request.method==='POST'){
   const value=await request.json() as Omit<ViewportMetrics,'at'>;
   if(['a','b','popup'].includes(value.tab))metrics.set(value.tab,{...value,at:Date.now()});
   return new Response('ok');
  }
  return new Response(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Responsive browser fixture</title><style>
*{box-sizing:border-box}body{margin:0;padding:12px;font:16px system-ui;color:#18243a;background:#f4f7fc}h1{font-size:22px;margin:0 0 8px}p{margin:8px 0}label{display:block}input,button{font:inherit;max-width:100%;padding:8px;border:1px solid #8193ad;border-radius:4px}input{width:100%;background:white}button{background:#e0eaff;margin:4px 4px 4px 0}.cards{display:grid;gap:12px;grid-template-columns:1fr}.card{background:white;padding:12px;border-radius:6px;min-width:0}@media(min-width:600px){.cards{grid-template-columns:1fr 1fr}}dialog{position:fixed;inset:auto 8px 8px auto;margin:0;padding:12px;width:280px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);border:1px solid #8193ad;border-radius:6px}dialog::backdrop{background:#18243a44}
</style></head><body><h1>Browser sizing fixture</h1><p>Resizing keeps this form and its open tabs.</p><div class="cards"><section class="card"><label for="name">Saved text</label><input id="name" value="kept"><button id="open">Open a window</button><button id="show-dialog">Open dialog</button><button id="close-window" hidden>Close this window</button><button id="ack">Confirm input</button><p id="ack-state">Waiting for input.</p></section><section class="card"><p>Synthetic test content</p><p>Controls should remain readable in portrait and landscape.</p></section></div><dialog id="dialog"><p>Dialog near the viewport edge</p><button id="close-dialog">Close dialog</button></dialog><script>
const tab=new URL(location.href).searchParams.get('tab')||'a',field=document.querySelector('#name'),dialog=document.querySelector('#dialog');
let acknowledged=false;const instance=crypto.randomUUID();
if(!sessionStorage.getItem('fixture-nonce'))sessionStorage.setItem('fixture-nonce',crypto.randomUUID());
const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
function report(){fetch('/proof',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tab,instance,width:innerWidth,height:innerHeight,outerWidth,outerHeight,overflow:document.documentElement.scrollWidth>innerWidth,columns:getComputedStyle(document.querySelector('.cards')).gridTemplateColumns.split(' ').length,value:field.value,nonce:sessionStorage.getItem('fixture-nonce'),visible:document.visibilityState==='visible',dialog:dialog.open,field:rect('name'),open:rect('open'),showDialog:rect('show-dialog'),closeDialog:rect('close-dialog'),closeWindow:rect('close-window'),ack:rect('ack'),acknowledged})}).catch(()=>{})}
document.querySelector('#open').onclick=()=>window.open('/?tab=popup','fixture-normal','width=900,height=600');
document.querySelector('#show-dialog').onclick=()=>{dialog.showModal();report()};document.querySelector('#close-dialog').onclick=()=>{dialog.close();report()};
document.querySelector('#ack').onclick=()=>{acknowledged=true;document.querySelector('#ack-state').textContent='Input received.';report()};
if(window.opener)document.querySelector('#close-window').hidden=false;document.querySelector('#close-window').onclick=()=>window.close();
field.oninput=report;window.addEventListener('resize',report);document.addEventListener('visibilitychange',report);setInterval(report,250);report();
</script></body></html>`,{headers:{'Content-Type':'text/html','Cache-Control':'no-store'}});
 }});
 return {url:server.url.href,metrics,close:()=>server.stop(true)};
}
