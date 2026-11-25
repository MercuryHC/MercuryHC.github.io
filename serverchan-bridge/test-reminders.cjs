const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createBridge}=require('./server.cjs'),R=require('../reminders-core');
(async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'self-station-reminder-test-'));
  let now=Date.parse('2026-11-25T12:00:00Z'),calls=0,revision=0,bridge,base;
  const config={sendKey:'SCT_TEST_ONLY',token:'x'.repeat(40),origin:'https://mercuryhc.github.io',dir,dailyLimit:20,clock:()=>now,fetcher:async()=>{calls++;return {ok:true,json:async()=>({code:0})};}};
  async function start(){bridge=createBridge(config);await bridge.ready;await new Promise(resolve=>bridge.server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+bridge.server.address().port;}
  async function upload(reminders){const response=await fetch(base+'/tasks',{method:'PUT',headers:{Authorization:'Bearer '+config.token,'Content-Type':'application/json','If-Match':String(revision)},body:JSON.stringify({tasks:[],reminders,enabled:true})});assert.equal(response.status,200);const value=await response.json();revision=value.revision;assert.equal(value.reminderCount,reminders.length);}
  const close=()=>new Promise(resolve=>bridge.server.close(resolve));
  try {
    await start();let item=R.create('到时提醒',new Date(now+600000).toISOString(),'reminder-a');
    await upload([item]);await bridge.tick();assert.equal(calls,0);
    now+=600000;await bridge.tick();assert.equal(calls,1);now+=600000;await bridge.tick();assert.equal(calls,1);
    await close();await start();await bridge.tick();assert.equal(calls,1,'dedupe survives restart');
    item=R.complete(item,true);await upload([item]);now+=600000;await bridge.tick();assert.equal(calls,1);
    item=R.complete(item,false);await upload([item]);await bridge.tick();assert.equal(calls,1,'restore same reminder time does not duplicate a delivered notification');
    item=R.edit(item,item.title,new Date(now+600000).toISOString());await upload([item]);await bridge.tick();assert.equal(calls,1);now+=600000;await bridge.tick();assert.equal(calls,2);
    await upload([]);now+=600000;await bridge.tick();assert.equal(calls,2,'deleted reminder cannot notify');
    console.log('PASS: Reminder backend due boundary, completion, restore, reschedule, delete and durable dedupe. Push mocked.');
  } finally {if(bridge?.server.listening)await close();await fs.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
