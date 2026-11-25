const assert=require('node:assert/strict');
const Store=require('./project-store'),R=require('./reminders-core');
(async()=>{
  const files=new Map();let head='h0',tree=[],counter=0,race=false;
  const record=R.create('独立保存','2026-11-26T00:00:00.000Z','reminder-a','2026-11-25T00:00:00.000Z');
  const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64'),decode=x=>JSON.parse(Buffer.from(x,'base64'));
  const validate=x=>({...x,projects:x.projects||[],tasks:x.tasks||[],schedules:x.schedules||[],reminders:R.normalize(x.reminders)});
  const request=async(url,opts={})=>{
    const route=url.replace('https://test','').split('?')[0];
    if(route==='/git/ref/heads/main')return {object:{sha:head}};
    if(route==='/contents/data.projects')return files.size?[...files].map(([name,f])=>({name,path:'data.projects/'+name,sha:f.sha})):null;
    if(route.startsWith('/contents/data.projects/')){const f=files.get(route.split('/').pop());return f?{...f,encoding:'base64',size:100}:null;}
    if(route==='/contents/data.json')return null;
    if(route.startsWith('/git/commits/'))return {tree:{sha:'tree'}};
    if(route==='/git/trees'){tree=JSON.parse(opts.body).tree;return {sha:'newtree'};}
    if(route==='/git/commits')return {sha:'h'+(++counter)};
    if(route==='/git/refs/heads/main'){
      if(race){race=false;head='concurrent';files.set('reminders.json',{sha:'changed',content:encode(validate({reminders:[{...record,title:'另一台设备'}]}))});throw Error('race');}
      head=JSON.parse(opts.body).sha;
      for(const f of tree)files.set(f.path.split('/').pop(),{sha:'file-'+(++counter),content:Buffer.from(f.content).toString('base64')});
      return {};
    }
    throw Error('unexpected '+route);
  };
  const create=()=>Store.create({request,baseUrl:()=> 'https://test',config:()=>({path:'data.json',branch:'main'}),validate,encode,decode});
  let store=create();assert.equal(await store.read(),null);
  let result=await store.write({content:encode(validate({reminders:[record]}))});
  assert(files.has('reminders.json'));assert(files.has('_storage.json'));assert(!files.has('unassigned.json'));
  assert.deepEqual(result.data.reminders,[record]);
  const first=await store.read();assert.deepEqual(decode(first.content).reminders,[record]);
  result=await store.write({sha:first.sha,content:encode(validate({reminders:[]}))});
  assert.deepEqual(decode(files.get('reminders.json').content).reminders,[],'empty tombstone represents deletion');
  assert.deepEqual(result.data.reminders,[]);
  let read=await store.read();result=await store.write({sha:read.sha,content:encode(validate({reminders:[record]}))});
  read=await store.read();race=true;
  await assert.rejects(()=>store.write({sha:read.sha,content:encode(validate({reminders:[R.complete(record,true)]}))}),/远端版本有更新/);
  assert.equal(decode(files.get('reminders.json').content).reminders[0].title,'另一台设备');
  // Legacy project files without reminders still read alongside the new collection.
  files.set('project-p.json',{sha:'old',content:encode({projects:[{id:'p'}],tasks:[],schedules:[]})});
  read=await create().read();assert.equal(decode(read.content).projects[0].id,'p');assert.equal(decode(read.content).reminders.length,1);
  console.log('PASS: atomic reminder file create/read/update/delete tombstone, legacy project partitions and optimistic concurrency rejection. All GitHub requests mocked.');
})().catch(e=>{console.error(e);process.exitCode=1;});
