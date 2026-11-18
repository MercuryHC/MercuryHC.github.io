const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const Core=require('../notification-core.js'),{createBridge}=require('./server.cjs');
(async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'workstation-reminders-'));
  let now=Date.UTC(2026,10,18,1),calls=[];
  const token='x'.repeat(40),origin='https://mercuryhc.github.io';
  const config={sendKey:'SCT_TEST_ONLY',token,origin,dir,dailyLimit:5,clock:()=>now,fetcher:async(url,opts)=>{calls.push({url,opts});return{ok:true,json:async()=>({code:0})};}};
  let bridge=createBridge(config);await bridge.ready;await new Promise(r=>bridge.server.listen(0,'127.0.0.1',r));
  let base='http://127.0.0.1:'+bridge.server.address().port;
  async function req(route,method='GET',body,rev){const r=await fetch(base+route,{method,headers:{Authorization:'Bearer '+token,Origin:origin,...(body?{'Content-Type':'application/json','If-Match':String(rev)}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
  assert.equal((await fetch(base+'/health')).status,401);
  assert.equal((await fetch(base+'/health',{headers:{Origin:'https://other.example',Authorization:'Bearer '+token}})).status,403);
  const urgent={id:'u1',title:'加急测试',status:'进行中',priority:'加急⚡',dueAt:now+864000000,greenAt:null};
  const high={id:'h1',title:'高优先级测试',status:'待开始',priority:'高',dueAt:now+18000000,greenAt:null};
  assert.equal(Core.level(urgent,now),'red');assert.equal(Core.level({...urgent,status:'已完成'},now),null);
  assert.equal(Core.level({...high,priority:'中'},now),null);
  assert.equal(Core.level({...high,dueAt:now+36000000,greenAt:now-1},now),'green');
  const body={tasks:[urgent,high],enabled:true};
  assert.equal((await req('/tasks','PUT',body,9)).status,409);
  assert.equal((await req('/tasks','PUT',{...body,tasks:[{...urgent,dueAt:'bad'}]},0)).status,400);
  assert.equal((await req('/tasks','PUT',body,0)).data.revision,1);
  await bridge.tick();assert.equal(calls.length,1);assert.equal(calls[0].opts.body.get('title'),'个人工作站：2 项任务提醒');
  assert(!calls[0].opts.body.get('desp').includes(config.sendKey));
  await bridge.tick();assert.equal(calls.length,1);
  // A later stage sends once; completed tasks never enter the digest.
  now+=15000000;await bridge.tick();assert.equal(calls.length,2);
  await req('/tasks','PUT',{tasks:[{...urgent,status:'已完成'},{...high,status:'已完成'}],enabled:true},1);
  now+=600000;await bridge.tick();assert.equal(calls.length,2);
  await new Promise(r=>bridge.server.close(r));
  bridge=createBridge(config);await bridge.ready;await new Promise(r=>bridge.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+bridge.server.address().port;
  assert.equal((await req('/health')).data.taskCount,2);
  await req('/tasks','PUT',body,2);await bridge.tick();assert.equal(calls.length,2,'dedupe survives restart');
  assert.equal((await req('/pause','POST')).data.enabled,false);now+=600000;await bridge.tick();assert.equal(calls.length,2);
  assert.equal((await req('/test','POST')).status,200);assert.equal((await req('/test','POST')).status,429);
  for(let i=0;i<2;i++){now+=61000;assert.equal((await req('/test','POST')).status,200);}
  now+=61000;assert.equal((await req('/test','POST')).status,503);assert.equal(calls.length,5,'daily cap counts all send attempts');
  const saved=await fs.readFile(path.join(dir,'state.json'),'utf8');assert(!saved.includes(config.sendKey));assert(!saved.includes(token));
  await new Promise(r=>bridge.server.close(r));await fs.rm(dir,{recursive:true,force:true});
  console.log('PASS: authenticated/CORS API, CAS conflicts, schema validation, urgent/time stages, completion, durable dedupe, pause, test cooldown, daily cap and secret exclusion. No real push sent.');
})().catch(e=>{console.error(e);process.exitCode=1;});
