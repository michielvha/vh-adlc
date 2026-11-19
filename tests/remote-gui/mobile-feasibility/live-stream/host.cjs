const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const work = __dirname;
const password = randomBytes(4).toString('hex');
const children = [];
let geometry = null;
let pending = null, editResult = null, race = false, started = false;
const waitUntil = Date.now() + 15 * 60 * 1000;
const send = (res, value) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(value));
};
function own(binary, args, logname) {
    const fd = fs.openSync(path.join(work, logname), 'w', 0o600);
    const child = spawn(binary,args,{stdio:['ignore',fd,fd]});
    fs.closeSync(fd);
    children.push(child);
    return child;
}
function freePort() {
    return new Promise((resolve, reject) => {
        const socket = net.createServer().once('error',reject);
        socket.listen(0,'127.0.0.1',() => {
            const port = socket.address().port;
            socket.close(() => resolve(port));
        });
    });
}
async function waitPort(port) {
    for (let i=0; i<100; i++) {
        if (await new Promise(resolve => {
            const s = net.createConnection(port,'127.0.0.1');
            s.once('error',() => resolve(false));
            s.once('connect',() => { s.destroy();resolve(true); });
            s.setTimeout(150,() => {s.destroy();resolve(false);});
        })) return;
        await delay(80);
    }
    throw Error('owned stream did not open its port');
}

const server = http.createServer(async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    const route = new URL(req.url,'http://127.0.0.1').pathname;
    const pages = {'/':'viewer.html','/input.html':'input.html','/viewer.js':'viewer.js'};
    if (req.method==='GET' && pages[route]) {
        res.setHeader('Content-Type',route.endsWith('.js')?'text/javascript':'text/html; charset=utf-8');
        return res.end(fs.readFileSync(path.join(work,pages[route])));
    }
    if (req.method==='GET' && /^\/novnc\/(?:core|vendor)\/[a-zA-Z0-9_./-]+\.js$/.test(route) &&
        !route.includes('..')) {
        const file = path.join(process.env.REMOTE_GUI_NOVNC,route.slice('/novnc/'.length));
        if (fs.existsSync(file)) {
            res.setHeader('Content-Type','text/javascript');
            return res.end(fs.readFileSync(file));
        }
    }
    if (req.method==='GET' && route==='/setup') return send(res,{password,started});
    if (req.method==='GET' && route==='/state') return send(res,{geometry,editResult});
    if (req.method==='GET' && route==='/pending') {
        const entry=pending;
        pending=null;
        return send(res,entry);
    }
    if (req.method==='POST') {
        let chunks=[];
        for await (const chunk of req) {
            chunks.push(chunk);
            if (chunks.reduce((length,value)=>length+value.length,0)>8192) {
                res.writeHead(413).end(); return;
            }
        }
        try {
            const payload=JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
            if (route==='/geometry') geometry=payload;
            else if (route==='/result') editResult=payload;
            else if (route==='/arm') { race=true;editResult=null; }
            else if (route==='/edit' && /^[ab]$/.test(payload.id) && Number.isInteger(payload.generation) && payload.text==='z' && !pending) {
                pending={...payload,race};race=false;
            } else return res.writeHead(400).end();
            return send(res,{ok:true});
        } catch {
            return res.writeHead(400).end();
        }
    }
    res.writeHead(404).end();
});
let websocketPort;
server.on('upgrade',(req,socket,head) => {
    if (req.url!=='/websockify' || !websocketPort) return socket.destroy();
    const upstream=net.createConnection(websocketPort,'127.0.0.1');
    upstream.on('error',()=>socket.destroy());
    socket.on('error',()=>upstream.destroy());
    upstream.on('close',()=>socket.destroy());
    socket.on('close',()=>upstream.destroy());
    upstream.once('connect',()=>{
        const raw=[];
        for(let i=0;i<req.rawHeaders.length;i+=2) raw.push(req.rawHeaders[i]+': '+req.rawHeaders[i+1]);
        upstream.write(`GET /websockify HTTP/1.1\r\n${raw.join('\r\n')}\r\n\r\n`);
        if (head.length) upstream.write(head);
        socket.pipe(upstream).pipe(socket);
    });
});

let stopping=false;
async function stop(exitStatus = 0) {
    if (stopping) return;
    stopping=true;
    for (const child of children.reverse()) if (child.exitCode===null) child.kill('SIGTERM');
    for (let loops=0;loops<50 && children.some(c=>c.exitCode===null&&c.signalCode===null);loops++) await delay(50);
    for (const child of children) if (child.exitCode===null&&child.signalCode===null) child.kill('SIGKILL');
    server.closeAllConnections();
    server.close();
    process.exit(exitStatus);
}
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
async function main() {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const port=server.address().port;
    const passfile=path.join(work,'rfbauth');
    const stored=spawnSync(process.env.REMOTE_GUI_X11VNC,['-storepasswd',password,passfile],{stdio:'ignore'});
    if (stored.status!==0) throw Error('failed to create synthetic VNC authentication');
    const vnc=await freePort(), ws=await freePort();
    own(process.env.REMOTE_GUI_CHROMIUM, [
        '--user-data-dir='+path.join(work,'profile'),'--kiosk','--no-first-run','--no-default-browser-check',
        '--force-device-scale-factor=1','--disable-extensions','--disable-background-networking','--disable-sync','--ozone-platform=x11',
        '--disable-gpu','--window-position=0,0','--window-size=960,720',`http://127.0.0.1:${port}/input.html`
    ],'chromium.log');
    own(process.env.REMOTE_GUI_X11VNC,[
        '-display',process.env.DISPLAY,'-localhost','-rfbport',String(vnc),'-rfbauth',passfile,
        '-forever','-shared','-nosel','-noxdamage'
    ],'vnc.log');
    await waitPort(vnc);
    own(process.env.REMOTE_GUI_WEBSOCKIFY,[`127.0.0.1:${ws}`,`127.0.0.1:${vnc}`],'websockify.log');
    await waitPort(ws);
    websocketPort=ws;
    while (!geometry && Date.now()<waitUntil) await delay(60);
    if (!geometry) throw Error('cooperating test page did not start');
    if (geometry.viewport.width<830 || geometry.viewport.height<430) throw Error('cooperating page is too small: '+JSON.stringify(geometry.viewport));
    console.log('Owned browser viewport:',JSON.stringify(geometry.viewport));
    started=true;
    fs.writeFileSync(path.join(work,'port'),String(port));
    fs.writeFileSync(path.join(work,'pid'),String(process.pid));
    console.log('Synthetic stream ready.');
    while (Date.now() < waitUntil) await delay(2000);
    await stop();
}
main().catch(async error=>{console.error(error.message);await stop(1);});
