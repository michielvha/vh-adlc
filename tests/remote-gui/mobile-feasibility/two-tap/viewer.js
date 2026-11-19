import RFB from '/novnc/core/rfb.js';
import keysyms from '/novnc/core/input/keysymdef.js';
const screen=document.getElementById('screen');
const editor=document.getElementById('editor');
const status=document.getElementById('status');
const prompt=document.getElementById('prompt');
const setup=await fetch('/setup').then(r=>r.json());
const protocol=location.protocol==='https:'?'wss://':'ws://';
const rfb=new RFB(screen,protocol+location.host+'/websockify',{credentials:{password:setup.password}});
rfb.focusOnClick=false;
rfb.scaleViewport=true;
const canvas=screen.querySelector('canvas');
canvas.setAttribute('role','img');
canvas.setAttribute('aria-label','Synthetic live remote canvas');

let tapGeneration=0, candidate=null, composing=false;
function clearPrompt(){
    tapGeneration++;
    candidate=null;
    prompt.hidden=true;
}
rfb.addEventListener('connect',()=>{status.textContent='Live viewer ready'});
rfb.addEventListener('disconnect',()=>{clearPrompt();editor.blur()});
canvas.addEventListener('gesturestart',event=>{
    const {type,clientX,clientY}=event.detail;
    clearPrompt();
    if(type!=='onetap')return;
    editor.blur();
    const generation=tapGeneration;
    const box=canvas.getBoundingClientRect();
    const x=Math.round((clientX-box.left)*canvas.width/box.width);
    const y=Math.round((clientY-box.top)*canvas.height/box.height);
    status.textContent='Checking remote focus';
    void (async()=>{
        for(let tries=0;tries<4;tries++){
            await new Promise(resolve=>setTimeout(resolve,tries===0?100:75));
            if(generation!==tapGeneration)return;
            const reply=await fetch('/editable?x='+x+'&y='+y,{cache:'no-store'}).then(r=>r.json());
            if(generation!==tapGeneration)return;
            if(!reply)continue;
            if(!Array.isArray(reply.bounds)||reply.bounds.length!==4)return;
            candidate=reply;
            const [left,top,w,h]=reply.bounds;
            const cx=box.left+(left+w/2)*box.width/canvas.width;
            const cy=box.top+(top+h/2)*box.height/canvas.height;
            prompt.style.left=Math.max(4,Math.min(innerWidth-102,cx-48))+'px';
            prompt.style.top=Math.max(4,cy-22)+'px';
            prompt.hidden=false;
            status.textContent='Remote field focused';
            return;
        }
        if(generation===tapGeneration)status.textContent='Plain area tapped';
    })().catch(()=>{if(generation===tapGeneration)clearPrompt()});
});
prompt.addEventListener('click',event=>{
    if(!event.isTrusted||!candidate)return;
    editor.type=candidate.mode==='password'?'password':'text';
    editor.inputMode=candidate.mode==='number'?'numeric':candidate.mode==='password'?'text':candidate.mode;
    clearPrompt();
    rfb.blur();
    editor.focus({preventScroll:true});
    status.textContent='Typing in the shared browser';
});
editor.addEventListener('blur',()=>{composing=false;editor.value=''});
function sendText(value){
    for(const character of value) rfb.sendKey(keysyms.lookup(character.codePointAt(0)));
    editor.value='';
}
editor.addEventListener('compositionstart',()=>{composing=true});
editor.addEventListener('compositionend',()=>{composing=false;sendText(editor.value)});
editor.addEventListener('input',event=>{
    if(composing||event.isComposing)return;
    if(event.inputType==='deleteContentBackward')rfb.sendKey(0xff08,'Backspace');
    else if(editor.value)sendText(editor.value);
});
