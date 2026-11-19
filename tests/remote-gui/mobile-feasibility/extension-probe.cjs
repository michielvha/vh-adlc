const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createServer } = require('node:http');
const { join } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { chromium } = require(process.env.REMOTE_GUI_PLAYWRIGHT_MODULE);

const work = process.argv[2];
const results = [];
let pending = null, loaded = false;
const template = `<!doctype html><title>Private ordinary web fixture</title>
<label>First field <input id="a" type="password"></label>
<label>Second field <input id="b"></label>
<script>
for(const field of document.querySelectorAll("input"))field.addEventListener('input',event=>{
    fetch('/effect',{method:'POST',body:JSON.stringify({target:field.id, exact:field.value==='z', trusted:event.isTrusted})});
});
</script>`;

const server = createServer(async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    const route = req.url;
    if (req.method === 'GET' && route === '/') {
        res.setHeader('Content-Type','text/html; charset=utf-8');
        return res.end(template);
    }
    if (req.method === 'GET' && route === '/command') {
        const command=pending;
        pending=null;
        res.setHeader('Content-Type','application/json');
        return res.end(JSON.stringify(command));
    }
    if (req.method === 'POST' && route === '/companion-ready') {
        loaded=true;
        return res.end('ok');
    }
    if (req.method === 'POST' && ['/effect','/receipt'].includes(route)) {
        let chunks=[];
        let size=0;
        for await(const chunk of req) {
            chunks.push(chunk); size+=chunk.length;
            if(size>1024) return res.writeHead(413).end();
        }
        try { results.push({route,payload:JSON.parse(Buffer.concat(chunks))}); }
        catch { return res.writeHead(400).end(); }
        return res.end('ok');
    }
    res.writeHead(404).end();
});
async function until(predicate) {
    for(let i=0;i<120;i++){
        const value=predicate();
        if(value)return value;
        await delay(60);
    }
    throw Error('the fixture missed its expected signal');
}
async function run() {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin='http://127.0.0.1:'+server.address().port;
    const extension=join(work,'extension');
    fs.mkdirSync(extension);
    fs.writeFileSync(join(extension,'manifest.json'),JSON.stringify({
        manifest_version:3,
        name:'Disposable fixture edit companion',
        version:'0.0.1',
        content_scripts:[{matches:['http://127.0.0.1/*'],js:['actor.js'],run_at:'document_idle'}],
    }));
    fs.writeFileSync(join(extension,'actor.js'),`(() => {
        if (location.origin !== ${JSON.stringify(origin)} || location.pathname !== '/') return;
        const a = document.getElementById('a');
        const post=(path,data)=>fetch(path,{method:'POST',body:JSON.stringify(data)});
        let previous=0;
        let polling=false;
        void post('/companion-ready',{});
        setInterval(async()=>{
            if(polling)return;
            polling=true;
            try{
                const command=await fetch('/command').then(r=>r.json());
                if(!command||command.id<=previous||command.text!=='z')return;
                previous=command.id;
                const exact=a.isConnected&&document.activeElement===a;
                const status=!exact?'cancelled':document.execCommand('insertText',false,command.text)?'edited':'failed';
                await post('/receipt',{id:command.id,status});
            }finally{polling=false;}
        },50);
    })();`);
    let profile;
    try {
        profile=await chromium.launchPersistentContext(join(work,'profile'),{
            executablePath: process.env.REMOTE_GUI_CHROMIUM,
            chromiumSandbox:true,
            headless:true,
            ignoreDefaultArgs:['--disable-extensions'],
            args:['--disable-gpu','--disable-extensions-except='+extension,'--load-extension='+extension],
        });
        const page=profile.pages()[0];
        await page.goto(origin);
        await until(()=>loaded);
        await page.locator('#a').focus();
        pending={id:1,text:'z'};
        await until(()=>results.some(x=>x.route==='/receipt'&&x.payload.id===1));
        const effect=await until(()=>results.find(x=>x.route==='/effect'));
        assert.deepEqual(effect.payload,{target:'a',exact:true,trusted:true});
        assert.equal(results.find(x=>x.route==='/receipt'&&x.payload.id===1).payload.status,'edited');
        await page.locator('#b').focus();
        pending={id:2,text:'z'};
        await until(()=>results.some(x=>x.route==='/receipt'&&x.payload.id===2));
        assert.equal(results.find(x=>x.route==='/receipt'&&x.payload.id===2).payload.status,'cancelled');
        const safe=await page.evaluate(()=>({
            aPreserved:document.getElementById('a').value==='z',
            bEmpty:document.getElementById('b').value==='',
        }));
        assert.deepEqual(safe,{aPreserved:true,bEmpty:true});
        assert.equal(results.filter(x=>x.route==='/effect').length,1);
        console.log(JSON.stringify({ordinaryPageEdit:effect.payload, staleEdit:'cancelled',...safe}));
    } finally {
        if(profile)await profile.close();
        server.closeAllConnections();
        await new Promise(resolve=>server.close(resolve));
    }
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
