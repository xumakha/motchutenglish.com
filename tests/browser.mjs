import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const browser=process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port=9321,base='http://127.0.0.1:8089';
const child=spawn(browser,['--headless=new','--disable-gpu','--no-sandbox','--disable-gpu-sandbox','--disable-software-rasterizer','--disable-background-networking','--disable-extensions','--no-first-run','--no-default-browser-check','--remote-debugging-port='+port,'--user-data-dir='+path.resolve('writable/browser-test-'+Date.now()),'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let browserLog='';child.stderr.on('data',chunk=>browserLog+=chunk.toString().slice(0,2000));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws;
try {
  let targets;for(let i=0;i<50;i++){try{targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();break;}catch{await sleep(100);}}
  if(!targets)throw new Error('Chrome debugging endpoint did not start');
  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  let nextId=1;const pending=new Map(),errors=[];
  ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const p=pending.get(message.id);if(p){pending.delete(message.id);message.error?p.reject(new Error(JSON.stringify(message.error))):p.resolve(message.result);}}if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);});
  ws.addEventListener('close',event=>{for(const p of pending.values())p.reject(new Error('Chrome socket closed: '+event.code+' '+event.reason));pending.clear();});
  const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=nextId++;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},10000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params}));});
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');await cdp('Network.setCacheDisabled',{cacheDisabled:true});
  const evaluate=async expression=>{const result=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
  const waitFor=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(80);}throw new Error('Timeout: '+expression);};
  const navigate=async route=>{await cdp('Page.navigate',{url:base+route});try{await waitFor('location.href === '+JSON.stringify(base+route)+' && document.readyState !== "loading" && window.mceProductReady && typeof window.sync === "function" && [...document.querySelectorAll(\'link[rel="stylesheet"]\')].every(link=>link.sheet)');}catch(error){throw new Error(error.message+' '+JSON.stringify(await evaluate('({url:location.href,state:document.readyState,title:document.title,resources:performance.getEntriesByType("resource").map(x=>x.name)})')));}await sleep(100);};
  const assert=(v,m)=>{if(!v)throw new Error(m);};
  await mkdir('docs/artifacts',{recursive:true});
  const screenshots=[];
  for(const width of [360,390,768,1440]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
    for(const route of ['/','/lo-trinh','/tu-vung','/kien-thuc','/tim-kiem?q=hello']){
      await navigate(route);
      assert(await evaluate('document.documentElement.scrollWidth <= window.innerWidth+1'),'Horizontal overflow '+route+' at '+width);
      assert(await evaluate('!!document.querySelector("h1")'),'Missing heading');
    }
    const image=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});const file='docs/artifacts/catalog-'+width+'.png';await writeFile(file,Buffer.from(image.data,'base64'));screenshots.push(file);
  }
  await cdp('Emulation.setDeviceMetricsOverride',{width:360,height:900,deviceScaleFactor:1,mobile:true});
  await navigate('/bai-hoc/chao-hoi-tung-buoc');
  await evaluate('document.querySelector(\'input[name="command"][value="attempts/start"]\').form.requestSubmit()');
  await waitFor('!!document.querySelector("#study-state")');await sleep(200);
  assert(await evaluate('!!document.querySelector("#study-player input[type=radio]")'),'Guest player did not render: '+JSON.stringify(errors)+' '+await evaluate('document.querySelector("#study-player")?.innerText'));
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Player overflow at 360px');
  const before=await evaluate('document.querySelector("#study-player").innerText');assert(!before.includes('Đáp án:'),'Answer shown before submit');
  await evaluate('document.querySelector(\'#study-player input[value="greeting"]\').focus()');
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32,text:' '});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
  assert(await evaluate('document.querySelector(\'#study-player input[value="greeting"]\').checked'),'Keyboard choice selection failed');
  await evaluate('[...document.querySelectorAll("#study-player button")].find(b=>b.textContent==="Nộp câu trả lời").focus()');
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32,text:' '});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
  try{await waitFor('document.querySelector("#study-player").textContent.includes("Chính xác")');}catch(error){throw new Error(error.message+' '+await evaluate('document.querySelector(".save-status")?.textContent')+' '+await evaluate('document.querySelector("#study-player")?.innerText'));}
  const screenshot=await cdp('Page.captureScreenshot',{format:'png'});await writeFile('docs/artifacts/player-360.png',Buffer.from(screenshot.data,'base64'));
  // Finish the real guest attempt, using the public contract and responses known from the test content.
  await evaluate(`(async()=>{
    let s=JSON.parse(document.querySelector('#study-state').textContent);const csrf=document.querySelector('meta[name="csrf-token"]').content;
    const get=async()=>s=(await(await fetch('/api/v1/attempts/'+s.id)).json()).data;
    const post=async(action,data)=>{const r=await fetch('/api/v1/attempts/'+s.id+'/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({...data,revision:s.revision})});const j=await r.json();if(!r.ok)throw Error(j.error.message);s=j.data;};
    await get();for(const b of s.blocks)if(!s.viewed.includes(b.id))await post('view',{block:b.id});
    for(const i of [...s.items]){if(i.state==='submitted')continue;const e=i.exercise;let response={name:true,am:{verb:'am'},order:['my','name','is','linh']}[e.id];if(e.type==='match'){response={};for(const [id,text] of Object.entries(e.payload.left))response[id]=Object.entries(e.payload.right).find(([k,v])=>v===({hello:'Xin chào',thanks:'Cảm ơn'}[id]))[0];}await post('submit',{exerciseId:e.id,response});}
    await post('finish',{});return s.status==='finished';
  })()`);
  await cdp('Page.reload');await waitFor('document.querySelector("#study-player")?.textContent.includes("Bạn đã hoàn thành")');
  assert(await evaluate('document.querySelector("#study-player").textContent.includes("Đăng ký để lưu")'),'Guest result/registration CTA missing');
  await navigate('/register');
  await evaluate(`(()=>{document.querySelector('#name').value='Browser learner';document.querySelector('#email').value='browser-'+Date.now()+'@example.com';document.querySelector('#password').value='Browser-test-123!';document.querySelector('#password_confirm').value='Browser-test-123!';document.querySelector('.auth-form').requestSubmit();})()`);
  await waitFor('location.pathname === "/account" && document.readyState === "complete"');
  await navigate('/hoc');
  assert(await evaluate('!!document.querySelector(\'input[name="command"][value="guest/claim"]\')'),'Explicit guest import consent missing');
  assert(await evaluate('(async()=> (await(await fetch("/api/v1/progress")).json()).data.length === 0)()'),'Guest progress merged without consent');
  await evaluate('document.querySelector(\'input[name="command"][value="guest/claim"]\').form.requestSubmit()');
  await waitFor('location.pathname.startsWith("/hoc/luot/") && !!document.querySelector("#study-state")');
  await waitFor('!![...document.querySelectorAll("#study-player button")].find(b=>b.textContent==="Hoàn thành bài học")');
  await evaluate('[...document.querySelectorAll("#study-player button")].find(b=>b.textContent==="Hoàn thành bài học").click()');
  await waitFor('document.querySelector("#study-player").textContent.includes("Bạn đã hoàn thành")');
  assert(await evaluate('(async()=> (await(await fetch("/api/v1/progress")).json()).data.length === 1)()'),'Confirmed guest progress not persisted');
  assert(errors.length===0,'Browser JavaScript exceptions: '+errors.join(','));
  await writeFile('docs/artifacts/browser-report.json',JSON.stringify({date:new Date().toISOString(),browser:'Chromium headless (sandbox disabled only for isolated local test process)',widths:[360,390,768,1440],routes:['/','/lo-trinh','/tu-vung','/kien-thuc','/tim-kiem'],guestPlayer:true,serverGradedSubmission:true,keyboardSubmission:true,guestResults:true,registrationAndExplicitImport:true,overflow:false,exceptions:errors,screenshots},null,2));
  console.log('PASS: Chrome at 360/390/768/1440px, no overflow, guest lesson renders and submits to real server, no JavaScript exceptions');
} catch(error){await writeFile('writable/browser-launch.log',browserLog);throw error;} finally {if(ws)ws.close();child.kill();}
