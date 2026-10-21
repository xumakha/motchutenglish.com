// Read-only visual/responsive checks against the actual PHP site.
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const base=process.env.DESIGN_BASE||'http://127.0.0.1:8080',port=9331;
const browser=process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const child=spawn(browser,['--headless=new','--disable-gpu','--no-sandbox','--disable-gpu-sandbox','--disable-software-rasterizer','--disable-background-networking','--disable-extensions','--no-first-run','--no-default-browser-check','--remote-debugging-port='+port,'--user-data-dir='+path.resolve('writable/design-browser-'+Date.now()),'about:blank'],{windowsHide:true,stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws;
try {
  let targets;for(let i=0;i<60;i++){try{targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();break;}catch{await sleep(100);}}
  if(!targets)throw Error('Chrome unavailable');
  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  let sequence=0;const pending=new Map(),errors=[],external=[];
  ws.addEventListener('message',event=>{const x=JSON.parse(event.data);if(x.id){const p=pending.get(x.id);if(p){pending.delete(x.id);x.error?p.reject(Error(JSON.stringify(x.error))):p.resolve(x.result);}}else if(x.method==='Runtime.exceptionThrown')errors.push(x.params.exceptionDetails.text);else if(x.method==='Network.requestWillBeSent'&&/^https?:/.test(x.params.request.url)&&!x.params.request.url.startsWith(base+'/'))external.push(x.params.request.url);});
  const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timeout=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},15000);pending.set(id,{resolve:v=>{clearTimeout(timeout);resolve(v);},reject:e=>{clearTimeout(timeout);reject(e);}});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const wait=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(80);}throw Error('Timeout '+expression);};
  const assert=(value,message)=>{if(!value)throw Error(message);};
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');
  const navigate=async route=>{await cdp('Page.navigate',{url:base+route});await wait('document.readyState!=="loading"&&window.mceProductReady&&[...document.querySelectorAll(\'link[rel="stylesheet"]\')].every(x=>x.sheet)');await evaluate('document.fonts.ready.then(()=>true)');await sleep(100);};
  const folder='docs/artifacts/redesign';await mkdir(folder,{recursive:true});const checks=[],screenshots=[];
  for(const width of [360,390,768,1440]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
    await navigate('/');
    const intro=await evaluate('document.querySelector(".design-sample").getAttribute("href")');
    const pathRoute=await evaluate('document.querySelector(".design-path-card").getAttribute("href")');
    const routes=[['home','/'],['paths','/lo-trinh'],['path',pathRoute],['intro',intro],['words','/tu-vung'],['knowledge','/kien-thuc'],['placement','/kiem-tra-dau-vao'],['about','/gioi-thieu'],['contact','/lien-he'],['login','/login'],['register','/register']];
    for(const [name,route] of routes){
      await navigate(route);
      const layout=await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth,h1:document.querySelector("h1")?.textContent})');
      assert(layout.scroll<=layout.width+1,'Overflow '+width+' '+route+' '+JSON.stringify(layout));assert(layout.h1,'Missing heading '+route);
      checks.push({route,width,overflow:false});
      if([360,1440].includes(width)&&['home','paths','path','intro','words','knowledge'].includes(name)){
        const metrics=await cdp('Page.getLayoutMetrics');const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:Math.min(6000,metrics.cssContentSize.height),scale:1}});
        const file=folder+'/'+name+'-'+width+'.png';await writeFile(file,Buffer.from(shot.data,'base64'));screenshots.push(file);
      }
    }
    if(width<600){await evaluate('document.querySelector(".menu").click()');assert(await evaluate('document.querySelector("#navigation").classList.contains("open")'),'Mobile menu failed');assert(await evaluate('document.querySelector(".menu").getAttribute("aria-expanded")==="true"'),'Menu ARIA failed');assert(await evaluate('document.querySelector("#navigation .mobile-auth a[href$=login]").getBoundingClientRect().height>=44'),'Mobile sign-in inaccessible');await evaluate('document.querySelector(".menu").click()');}
  }
  const fonts=await evaluate('[...document.fonts].filter(x=>x.status==="loaded").map(x=>x.family)');
  assert(fonts.some(x=>x.includes('Baloo'))&&fonts.some(x=>x.includes('Be Vietnam')),'Design fonts unavailable');assert(errors.length===0,'JavaScript errors '+errors.join(','));assert(external.length===0,'Unexpected external assets '+external.join(','));
  await writeFile(folder+'/report.json',JSON.stringify({timestamp:new Date().toISOString(),base,checks,screenshots,fonts,exceptions:errors,externalRequests:external},null,2));
  console.log('PASS: Lovable redesign, '+checks.length+' responsive page checks, mobile menu, local design fonts, no external requests or JS exceptions');
}finally{if(ws)ws.close();child.kill();}
