const assert=require('assert/strict'),vm=require('vm'),fs=require('fs'),Core=require('./bookmarks-core.js');
class E{constructor(){this.value='';this.textContent='';this.children=[];this.dataset={};this.style={};this.hidden=false;this.classList={add(){},remove(){}};}append(...n){this.children.push(...n)}replaceChildren(...n){this.children=n}setAttribute(k,v){this[k]=v}addEventListener(){}showModal(){this.open=true}close(){this.open=false}reset(){}click(){return this.onclick?.()}}
const els=new Map(),el=id=>{if(!els.has(id))els.set(id,new E());return els.get(id)},storage=new Map(),clone=x=>JSON.parse(JSON.stringify(x));el('bm-form').elements=Object.fromEntries(['title','url','group','color','preset','icon'].map(k=>[k,new E()]));let remote=null,n=0,saveCount=0,hook=null;
const c={console,Date,JSON,Map,Set,URL,Blob,crypto:require('crypto').webcrypto,confirm:()=>true,prompt:()=>null,setInterval(){},setTimeout,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document:{getElementById:el,createElement:()=>new E()},window:{addEventListener(){},refreshGithubDock(){},BookmarksCore:Core,WorkstationGitHub:{context:()=>({key:'repo-1',connected:true})},BookmarksGitHub:{path:()=> 'taskspace.bookmarks.json',read:async()=>remote?clone(remote):null,save:async(data,sha)=>{assert.equal(sha,remote?.sha||null);saveCount++;if(hook){const f=hook;hook=null;f();}remote={sha:'sha'+(++n),data:clone(data)};return clone(remote);}}}};
vm.createContext(c);vm.runInContext(fs.readFileSync('project-sync/bookmarks.js','utf8').replace(/\}\)\(\);\s*$/,'window.testBookmarks={get:()=>data,set:commit,session:()=>syncSession};})();'),c);

const t=c.window.testBookmarks, initial=clone(t.get()), ids=initial.items.map(x=>x.id), grid=el('bm-grid');
function drag(source,target,after){
 const tiles=grid.children.filter(x=>x.dataset.bookmarkId);
 tiles.forEach((x,i)=>x.getBoundingClientRect=()=>({left:i*160,top:0,width:140,height:140}));
 const from=tiles.find(x=>x.dataset.bookmarkId===source),to=tiles.find(x=>x.dataset.bookmarkId===target),rect=to.getBoundingClientRect();
 const transfer={setData(){}};
 from.ondragstart({dataTransfer:transfer,preventDefault(){}});
 grid.ondragover({clientX:rect.left+(after?110:30),clientY:70,dataTransfer:transfer,preventDefault(){}});
 assert.equal(to.dataset.dropSide,after?'after':'before');
 grid.ondrop({preventDefault(){}});
 assert(!grid.children.some(x=>x.dataset.dropSide));
}
drag(ids[0],ids[2],true);
assert.deepEqual(t.get().items.slice(0,3).map(x=>x.id),[ids[1],ids[2],ids[0]]);
drag(ids[0],ids[1],false);
assert.deepEqual(t.get().items.map(x=>x.id),ids);
assert.deepEqual(JSON.parse(storage.get('workstation-bookmarks-v1')).items.map(x=>x.id),ids);
assert.deepEqual(t.get().items.map(x=>x.group),initial.items.map(x=>x.group));
const before=JSON.stringify(t.get());grid.ondrop({preventDefault(){throw Error('external drag should be ignored')}});assert.equal(JSON.stringify(t.get()),before);
console.log('PASS: actual drag handlers reorder before/after, preserve groups, persist order, clear indicators and ignore external drops.');
