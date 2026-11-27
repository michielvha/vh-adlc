const {chromium}=require(process.env.REMOTE_GUI_PLAYWRIGHT_MODULE);
const assert=require('node:assert/strict');
async function run(){
    const url=process.argv[2], browser=await chromium.launch({executablePath:process.env.REMOTE_GUI_CHROMIUM,chromiumSandbox:true,args:['--disable-gpu']});
    try{
        const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
        page.on('pageerror',error=>console.error(error.message));
        page.on('response',response=>{if(response.status()>=400)console.error(new URL(response.url()).pathname,response.status());});
        await page.goto(url);
        await page.getByText('Live viewer ready').waitFor({timeout:10000});
        const canvas=await page.getByRole('img',{name:'Synthetic live remote canvas'}).boundingBox();
        const state=await fetch(url+'state').then(r=>r.json());
        assert.ok(canvas&&state.geometry);
        await page.touchscreen.tap(canvas.x+canvas.width/2,canvas.y+canvas.height*.88);
        await page.getByText('Plain area tapped').waitFor({timeout:4000});
        const a=state.geometry.fields.a;
        await page.touchscreen.tap(canvas.x+(a.x+a.width/2)*canvas.width/state.geometry.width,
                                   canvas.y+(a.y+a.height/2)*canvas.height/state.geometry.height);
        await page.getByText('Remote field A focused').waitFor({timeout:5000});
        await page.keyboard.insertText('z');
        await page.getByText('Remote edit applied').waitFor({timeout:4000});
        const positive=(await fetch(url+'state').then(r=>r.json())).editResult;
        assert.deepEqual(positive,{status:'applied',exactA:true,emptyB:true,deliveredA:1,deliveredB:0});
        await fetch(url+'arm',{method:'POST'});
        await page.keyboard.insertText('z');
        await page.getByText('Remote edit cancelled').waitFor({timeout:4000});
        const negative=(await fetch(url+'state').then(r=>r.json())).editResult;
        assert.deepEqual(negative,{status:'cancelled',exactA:true,emptyB:true,deliveredA:1,deliveredB:0});
        console.log('Real canvas, remote focus, accepted typing, and wrong-field cancellation completed on the local probe.');
    } finally {await browser.close();}
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
