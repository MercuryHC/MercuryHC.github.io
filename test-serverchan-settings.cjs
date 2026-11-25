const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
  const elements=new Map(),store=new Map(),el=id=>{if(!elements.has(id))elements.set(id,{value:'',dataset:{},addEventListener(){}});return elements.get(id);};
  let interval,revision=0,requests=[],rejectNext=false;
  const c={URL,AbortSignal,JSON,Date,Number,String,setInterval(fn){interval=fn;return 1;},clearInterval(){},document:{getElementById:el},window:{addEventListener(){}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},db:{tasks:[{id:'test',title:'测试任务',priority:'加急⚡',status:'进行中',start:'2026-11-18',due:'2026-11-19',note:'PRIVATE_NOTE',todos:[{text:'PRIVATE_TODO'}]}]},fetch:async(url,opts)=>{
    requests.push({url,opts});if(rejectNext){rejectNext=false;return{ok:false,json:async()=>({error:'后台快照已更新'})};}
    if(url.endsWith('/health'))return{ok:true,json:async()=>({revision,enabled:false,taskCount:0})};
    if(url.endsWith('/tasks')){assert.equal(opts.headers['If-Match'],String(revision));return{ok:true,json:async()=>({revision:++revision,taskCount:1})};}
    if(url.endsWith('/pause'))return{ok:true,json:async()=>({revision:++revision})};
    return{ok:true,json:async()=>({accepted:true})};
  }};
  vm.createContext(c);for(const file of ['task-time.js','reminders-core.js','notification-core.js','serverchan-settings.js'])vm.runInContext(fs.readFileSync(__dirname+'/'+file,'utf8'),c);
  el('sc-url').value='https://remind.example.com';el('sc-token').value='t'.repeat(40);
  await el('sc-enable').onclick();assert.equal(requests.length,0,'connect before replacing snapshot');
  await el('sc-connect').onclick();await el('sc-enable').onclick();
  const body=JSON.parse(requests.at(-1).opts.body);assert.equal(body.enabled,true);assert.equal(body.tasks[0].title,'测试任务');assert(!JSON.stringify(body).includes('PRIVATE_'));
  assert.equal(store.size,1);assert.equal(store.get('workstation-reminder-endpoint'),'https://remind.example.com');
  let count=requests.length;interval();await new Promise(r=>setImmediate(r));assert.equal(requests.length,count,'unchanged snapshot does not upload');
  c.db.tasks[0].status='已完成';interval();await new Promise(r=>setImmediate(r));assert.equal(JSON.parse(requests.at(-1).opts.body).tasks[0].status,'已完成');
  c.db.reminders=[require('./reminders-core').create('单次提醒','2026-11-26T12:00:00Z','reminder-bridge')];interval();await new Promise(r=>setImmediate(r));assert.equal(JSON.parse(requests.at(-1).opts.body).reminders.length,1);
  c.db.reminders=[];interval();await new Promise(r=>setImmediate(r));assert.equal(JSON.parse(requests.at(-1).opts.body).reminders.length,0);
  c.db.tasks[0].title='changed';rejectNext=true;interval();await new Promise(r=>setImmediate(r));count=requests.length;interval();await new Promise(r=>setImmediate(r));assert.equal(requests.length,count,'conflict stops auto sync');
  await el('sc-pause').onclick();assert(requests.at(-1).url.endsWith('/pause'));
  await el('sc-test').onclick();assert(requests.at(-1).url.endsWith('/test'));assert(!requests.at(-1).opts.body);
  el('sc-url').value='http://bad.example';count=requests.length;await el('sc-connect').onclick();assert.equal(requests.length,count,'reject HTTP endpoints');
  console.log('PASS: frontend connect/enable workflow, private-field exclusion, in-memory credential, change sync, conflict stop, pause/test and HTTPS validation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
