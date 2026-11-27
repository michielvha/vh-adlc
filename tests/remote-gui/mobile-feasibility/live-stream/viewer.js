import RFB from '/novnc/core/rfb.js';

const screen=document.getElementById('screen');
const editor=document.getElementById('editor');
const status=document.getElementById('status');
const setup=await fetch('/setup').then(r=>r.json());
const protocol=location.protocol==='https:'?'wss://':'ws://';
const rfb=new RFB(screen,protocol+location.host+'/websockify',{credentials:{password:setup.password}});
rfb.focusOnClick=false;
rfb.scaleViewport=true;
rfb.resizeSession=false;
const canvas=screen.querySelector('canvas');
canvas.setAttribute('role','img');
canvas.setAttribute('aria-label','Synthetic live remote canvas');

const load=()=>fetch('/state').then(r=>r.json());
let state=await load(), connected=false, target=null, binding=null, lastResult=null, polling=false;
rfb.addEventListener('connect',()=>{
    connected=true;
    status.textContent='Live viewer ready';
});
canvas.addEventListener('gesturestart', event=>{
    const {type,clientX,clientY}=event.detail;
    if(type!=='onetap'||!state.geometry) return;
    const bounds=canvas.getBoundingClientRect();
    const x=(clientX-bounds.left)/bounds.width*state.geometry.width;
    const y=(clientY-bounds.top)/bounds.height*state.geometry.height;
    const selected=Object.entries(state.geometry.fields).find(([,box])=>x>=box.x&&x<box.x+box.width&&y>=box.y&&y<box.y+box.height);
    binding=null;
    target=selected?.[0] || null;
    if(!target){
        editor.blur();
        status.textContent='Plain area tapped';
        return;
    }
    editor.focus({preventScroll:true});
    status.textContent='Awaiting remote focus';
},true);
editor.addEventListener('input',()=>{
    const text=editor.value;
    editor.value='';
    if(!binding || text!=='z') {status.textContent='No binding';return;}
    void fetch('/edit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...binding,text})});
});
setInterval(async()=>{
    if(polling)return;
    polling=true;
    try{
        state=await load();
        if(connected && target && !binding && state.geometry?.focused===target){
            binding={id:target,generation:state.geometry.generation};
            status.textContent='Remote field '+target.toUpperCase()+' focused';
        }
        if(state.editResult && JSON.stringify(state.editResult)!==lastResult){
            lastResult=JSON.stringify(state.editResult);
            status.textContent=state.editResult.status==='applied'?'Remote edit applied':'Remote edit cancelled';
        }
    }finally{polling=false;}
},70);
