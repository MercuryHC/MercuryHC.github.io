/* Provider-independent three-way record merge; snapshots never carry credentials. */
(function(root){
  'use strict';
  const MAX=20*1024*1024;
  const stable=v=>JSON.stringify(sort(v));
  function sort(v){if(Array.isArray(v))return v.map(sort);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])]));return v;}
  const equal=(a,b)=>stable(a)===stable(b);
  const path=p=>typeof p==='string'&&p.length<1000&&!p.split('/').some(x=>!x||x.startsWith('.')||/[<>:"\\|?*\x00-\x1f]/.test(x)||/[. ]$/.test(x));
  const domains=['tasks','notes','bookmarks','browser','obsidian'];
  function validate(bundle,hooks){
    if(!bundle||typeof bundle!=='object')throw Error('同步数据格式无效。');
    const out={};
    if(bundle.tasks!==undefined)out.tasks=hooks.tasks(bundle.tasks);
    if(bundle.notes!==undefined){
      const n=bundle.notes;
      if(!Array.isArray(n.notes)||n.notes.length>10000||!Array.isArray(n.folders)||n.folders.length>10000)throw Error('笔记数据无效。');
      const seen=new Set();out.notes={notes:n.notes.map(v=>{if(!path(v.id)||!v.id.endsWith('.md')||seen.has(v.id)||typeof v.title!=='string'||v.title.length>500||typeof v.body!=='string'||v.body.length>900000)throw Error('笔记路径、标题或正文无效。');seen.add(v.id);return {id:v.id,title:v.title,body:v.body};}),folders:[...new Set(n.folders.map(v=>{if(!path(v))throw Error('笔记目录无效。');return v;}))]};
    }
    if(bundle.bookmarks!==undefined)out.bookmarks=hooks.bookmarks(bundle.bookmarks);
    if(bundle.browser!==undefined){if(!Array.isArray(bundle.browser)||bundle.browser.length>100)throw Error('浏览器书签来源无效。');const ids=new Set();out.browser=bundle.browser.map(v=>{const b=hooks.browser(v);if(ids.has(b.id))throw Error('书签来源重复。');ids.add(b.id);return b;});}
    if(bundle.obsidian!==undefined){if(!Array.isArray(bundle.obsidian)||bundle.obsidian.length>1000)throw Error('Obsidian 文件数量无效。');const ids=new Set();out.obsidian=bundle.obsidian.map(v=>{if(!path(v.path)||!v.path.endsWith('.md')||ids.has(v.path)||typeof v.text!=='string'||v.text.length>900000)throw Error('Obsidian 文件无效。');ids.add(v.path);return {path:v.path,text:v.text};});}
    if(new TextEncoder().encode(JSON.stringify(out)).length>MAX)throw Error('同步内容超过 20 MiB，请减少本次选择范围。');
    return out;
  }
  function flatten(b){const m=new Map();const add=(prefix,items,key)=>items?.forEach(v=>m.set(prefix+'/'+v[key],v));if(b.tasks)for(const k of ['projects','tasks','schedules','reminders'])add('tasks/'+k,b.tasks[k]||[],'id');if(b.notes){add('notes/files',b.notes.notes,'id');b.notes.folders.forEach(p=>m.set('notes/folders/'+p,p));}if(b.bookmarks){if(b.bookmarks.layout)m.set('bookmarks/layout',b.bookmarks.layout);add('bookmarks/items',b.bookmarks.items,'id');b.bookmarks.groups.forEach(p=>m.set('bookmarks/groups/'+p,p));}add('browser/source',b.browser,'id');add('obsidian/file',b.obsidian,'path');return m;}
  function plan(local,remote,base,scopes){const l=flatten(local),r=flatten(remote||{}),b=flatten(base||{}),out=new Map(r),rows=[];for(const key of new Set([...l.keys(),...r.keys(),...b.keys()])){if(!scopes.includes(key.split('/')[0]))continue;const lv=l.get(key),rv=r.get(key),bv=b.get(key);let value,conflict=false;if(equal(lv,rv))value=lv;else if(base&&equal(lv,bv))value=rv;else if(base&&equal(rv,bv))value=lv;else if(!base&&lv===undefined)value=rv;else if(!base&&rv===undefined)value=lv;else conflict=true;const row={key,local:lv,remote:rv,base:bv,value,conflict,choice:conflict?'':null};rows.push(row);if(!conflict){if(value===undefined)out.delete(key);else out.set(key,value);}}
    return {rows,out,scopes};}
  function build(p){const m=new Map(p.out);for(const row of p.rows)if(row.conflict){if(!['local','remote'].includes(row.choice))throw Error('请先处理所有冲突。');const v=row[row.choice];if(v===undefined)m.delete(row.key);else m.set(row.key,v);}const b={};for(const d of new Set([...p.scopes,...[...m.keys()].map(k=>k.split('/')[0])]))if(d==='tasks')b.tasks={projects:[],tasks:[],schedules:[],reminders:[]};else if(d==='notes')b.notes={notes:[],folders:[]};else if(d==='bookmarks')b.bookmarks={groups:[],items:[]};else b[d]=[];for(const [k,v] of m){const [d,t]=k.split('/');if(d==='tasks')b.tasks[t].push(v);else if(d==='notes')b.notes[t==='files'?'notes':'folders'].push(v);else if(d==='bookmarks'){if(t==='layout')b.bookmarks.layout=v;else b.bookmarks[t].push(v);}else b[d].push(v);}return b;}
  async function hash(text){const bytes=new TextEncoder().encode(text);return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
  function envelope(bundle){return {format:'personal-workstation',version:1,id:crypto.randomUUID(),savedAt:new Date().toISOString(),data:bundle};}
  function parse(text,hooks){if(new TextEncoder().encode(text).length>MAX+20000)throw Error('远端同步文件过大。');const e=JSON.parse(text);if(e.format!=='personal-workstation'||e.version!==1)throw Error('这不是受支持的个人工作站同步文件。');return {...e,data:validate(e.data,hooks)};}
  const api={MAX,domains,stable,equal,path,validate,plan,build,hash,envelope,parse};if(typeof module!=='undefined')module.exports=api;else root.StorageCore=api;
})(typeof window!=='undefined'?window:globalThis);
