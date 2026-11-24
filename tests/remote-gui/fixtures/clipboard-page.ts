// A remote test page for the clipboard fixture. It keeps every pasted value and
// a count of key presses in sessionStorage, which survives a browser handoff.
const page=`<!doctype html><title>Clipboard fixture</title>
<label>Paste target <input id="paste" autofocus></label>
<label>Copy source <input id="source"></label>
<script>
const pasted=()=>JSON.parse(sessionStorage.getItem('pasted')||'[]');
document.getElementById('paste').addEventListener('paste',event=>{
 sessionStorage.setItem('pasted',JSON.stringify([...pasted(),event.clipboardData.getData('text/plain')]));
});
addEventListener('keydown',()=>{sessionStorage.setItem('keys',String(Number(sessionStorage.getItem('keys')||'0')+1))},true);
</script>`;

export function startClipboardPage(){
 const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
  if(new URL(request.url).pathname!=='/')return new Response('absent',{status:404});
  return new Response(page,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
 }});
 return {url:server.url.href,stop:()=>server.stop(true)};
}
