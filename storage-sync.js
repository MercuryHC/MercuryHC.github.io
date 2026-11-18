/* Explicit, reviewable multi-provider sync. No background credential transmission. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),core=window.StorageCore,adapters=window.StorageAdapters;
  const providers={
    google:{name:'Google Drive',icon:'G',help:'在 Google Drive 电脑版中设置镜像或将目录保留在本机，然后选择其中一个专用文件夹。云端传输由 Google 客户端完成。'},
    nutstore:{name:'坚果云',icon:'☁',help:'选择坚果云客户端中的同步文件夹。WebDAV 可填写 https://dav.jianguoyun.com/dav/ 下的专用目录、账号及第三方应用密码；若服务不允许跨域，请使用同步文件夹。'},
    icloud:{name:'iCloud Drive',icon:'◌',help:'在 Finder 或 Windows 文件资源管理器中将 iCloud Drive 目录下载并保留在本机，再选择专用文件夹。本模式不需要 Apple ID 密码。'},
    fnos:{name:'飞牛 NAS',icon:'F',help:'先通过 SMB 挂载飞牛共享目录，或使用飞牛同步客户端，再选择文件夹。也可填写管理员已启用的 HTTPS WebDAV 目录地址。FN Connect 网页地址不等于 WebDAV 地址。'},
    zspace:{name:'极空间 NAS',icon:'Z',help:'使用极空间文档同步或客户端盘符挂载，再选择专用文件夹。WebDAV 模式需使用设备实际提供的 HTTPS WebDAV 目录地址，不能填写极空间管理网页地址。'},
    other:{name:'其他 / WebDAV',icon:'↔',help:'支持其他网盘同步目录、系统已挂载的 NAS 文件夹，或允许 HTTPS 跨域访问的 WebDAV 目录。'}
  };
  const hooks={tasks:v=>window.validateTaskspaceData(v),bookmarks:v=>window.BookmarksCore.validate(v),browser:v=>window.BrowserBookmarksCore.validate(v)};
  const database=new Promise((resolve,reject)=>{const r=indexedDB.open('workstation-repositories-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});database.catch(()=>{});
  async function cache(key,value,remove=false){const db=await database;return new Promise((resolve,reject)=>{const tx=db.transaction('state',value!==undefined||remove?'readwrite':'readonly'),st=tx.objectStore('state'),r=remove?st.delete(key):value!==undefined?st.put(value,key):st.get(key);let result;r.onsuccess=()=>result=r.result;tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(tx.error||Error('无法保存本机同步状态。'));});}
  let provider='google',adapter=null,connection=null,busy=false,stage=null,session=0;
  const scopes=()=>[...document.querySelectorAll('[data-storage-scope]:checked')].map(e=>e.dataset.storageScope);
  const context=()=>window.WorkstationGitHub?.context().key||'local';
  const baselineKey=()=> 'baseline:'+connection.id+':'+context()+':'+scopes().sort().join(',');
  function status(message,error=false){$('ds-status').textContent=message;$('ds-status').dataset.error=String(error);}
  function controls(){for(const e of ($('settings-storage-content')?.children.length ? $('settings-storage-content') : $('storage-dialog')).querySelectorAll('button,input,select'))e.disabled=busy;$('ds-apply').disabled=busy||!stage;$('ds-check').disabled=busy||!adapter;$('ds-history').disabled=busy||!adapter;$('ds-disconnect').disabled=busy||!connection;$('ds-progress').hidden=!busy;$('ds-folder').hidden=$('ds-mode').value!=='folder';$('ds-webdav').hidden=$('ds-mode').value!=='webdav';$('ds-mode').querySelector('[value=webdav]').disabled=['google','icloud'].includes(provider);$('ds-mode').disabled=busy;$('ds-direction').disabled=busy||!!stage?.history;$('ds-select-other').hidden=$('ds-mode').value!=='folder';}
  function invalidate(){stage=null;$('ds-review').hidden=true;$('ds-history-list').replaceChildren();controls();}
  async function run(fn){if(busy)return;busy=true;controls();try{await fn();}catch(e){if(e.name!=='AbortError')status(e.message,true);}finally{busy=false;controls();}}
  async function select(id){if(busy)return;const own=++session;provider=id;adapter=null;connection=null;invalidate();document.querySelectorAll('[data-storage-provider]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.storageProvider===id)));$('ds-provider-name').textContent=providers[id].name;$('ds-guide').textContent=providers[id].help;$('ds-mode').value='folder';$('ds-url').value=id==='nutstore'?'https://dav.jianguoyun.com/dav/':'';$('ds-user').value='';$('ds-password').value='';status('尚未连接；请选择本机同步文件夹，或配置 WebDAV。');try{const c=await cache('connection:'+id);if(own!==session)return;if(c){connection=c;$('ds-mode').value=c.mode;$('ds-url').value=c.url||'';$('ds-user').value=c.user||'';if(c.mode==='folder'&&await c.handle.queryPermission({mode:'readwrite'})==='granted'){adapter=adapters.folder(c.handle);status('已恢复目录：'+adapter.label+'。网盘或 NAS 传输由电脑客户端负责。');}else status(c.mode==='folder'?'已记住目录，请点击「授权 / 选择文件夹」重新授权。':'已记住服务器配置；应用密码不保存，请重新填写后连接。');}}catch(e){status('无法恢复目录：'+e.message,true);}controls();}
  async function capture(selected=scopes()){
    const b={};
    if(selected.includes('tasks'))b.tasks=window.WorkstationTaskData.export();
    if(selected.includes('notes'))b.notes=window.NotesWorkspace.storageExport();
    if(selected.includes('bookmarks'))b.bookmarks=window.BookmarksWorkspace.storageExport();
    if(selected.includes('browser'))b.browser=await window.BrowserBookmarksWorkspace.storageExport();
    if(selected.includes('obsidian'))b.obsidian=await window.ObsidianWorkspace.storageExport();
    return core.validate(b,hooks);
  }
  async function persistConnection(c){connection=c;if($('ds-remember').checked)await cache('connection:'+provider,c);else await cache('connection:'+provider,undefined,true);}
  $('ds-folder').onclick=()=>run(async()=>{
    if(!window.showDirectoryPicker)throw Error('此浏览器不支持目录读写，请使用桌面 Chrome / Edge，或选择 WebDAV。');
    let handle;
    if(connection?.handle&&await connection.handle.requestPermission({mode:'readwrite'})==='granted')handle=connection.handle;
    else handle=await window.showDirectoryPicker({mode:'readwrite',id:'workstation-data'});
    const same=connection?.handle&&await handle.isSameEntry(connection.handle);
    await persistConnection({id:same?connection.id:crypto.randomUUID(),mode:'folder',handle});adapter=adapters.folder(handle);invalidate();status('已连接目录：'+handle.name+'。先检查差异，再确认同步。');
  });
  $('ds-select-other').onclick=()=>run(async()=>{if(!window.showDirectoryPicker)throw Error('请使用桌面 Chrome / Edge 选择目录。');const handle=await window.showDirectoryPicker({mode:'readwrite',id:'workstation-data'});await persistConnection({id:crypto.randomUUID(),mode:'folder',handle});adapter=adapters.folder(handle);invalidate();status('已连接目录：'+handle.name);});
  $('ds-connect').onclick=()=>run(async()=>{adapter=null;invalidate();const url=$('ds-url').value.trim(),user=$('ds-user').value.trim(),password=$('ds-password').value;const a=adapters.webdav({url,user,password});await a.read();const same=connection?.url===url&&connection?.user===user;await persistConnection({id:same?connection.id:crypto.randomUUID(),mode:'webdav',url,user});adapter=a;$('ds-password').value='';invalidate();status('WebDAV 读取连接成功。写入时会检查 ETag 与目录权限。');});
  $('ds-disconnect').onclick=()=>run(async()=>{await cache('connection:'+provider,undefined,true);connection=null;adapter=null;$('ds-password').value='';invalidate();status('已断开并清除记住的连接；仓库数据保留。');});
  $('ds-mode').onchange=()=>{adapter=null;invalidate();controls();status('连接方式已切换，请重新连接。');};
  for(const e of document.querySelectorAll('[data-storage-scope]'))e.onchange=()=>invalidate();
  $('ds-remember').onchange=()=>run(async()=>{if(connection){if($('ds-remember').checked)await cache('connection:'+provider,connection);else await cache('connection:'+provider,undefined,true);}invalidate();});
  for(const e of [$('ds-url'),$('ds-user')])e.oninput=()=>{adapter=null;invalidate();};
  function describe(v){return v===undefined?'（此侧已删除 / 不存在）':typeof v==='string'?v:JSON.stringify(v,null,2);}
  function review(){const p=stage.plan,changed=p.rows.filter(r=>!core.equal(r.local,r.remote));const conflicts=p.rows.filter(r=>r.conflict);$('ds-review').hidden=false;$('ds-summary').textContent=`${stage.history?'历史恢复':'同步预览'} · ${changed.length} 条差异 · ${conflicts.length} 条冲突。不同记录自动合并，同一记录请逐条选择。`;
    const box=$('ds-conflicts');box.replaceChildren();
    for(const row of conflicts){const d=document.createElement('details');const sum=document.createElement('summary');sum.textContent=row.local?.title||row.remote?.title||row.local?.path||row.remote?.path||row.key;d.append(sum);const label=document.createElement('p');label.textContent=row.key;d.append(label);const pair=document.createElement('div');pair.className='ds-pair';for(const key of ['local','remote']){const side=document.createElement('div'),caption=document.createElement('strong'),pre=document.createElement('pre');caption.textContent=key==='local'?'本机':'仓库';pre.textContent=describe(row[key]);side.append(caption,pre);pair.append(side);}d.append(pair);const pick=document.createElement('select');pick.setAttribute('aria-label','冲突选择：'+sum.textContent);for(const [value,text]of [['','请选择保留版本'],['local','保留本机'],['remote','保留仓库']]){const o=document.createElement('option');o.value=value;o.textContent=text;pick.append(o);}pick.onchange=()=>row.choice=pick.value;d.append(pick);box.append(d);}
    if(!conflicts.length){const p=document.createElement('p');p.textContent=changed.length?'没有逐条冲突，可执行合并。':'所选数据一致，无需上传。';box.append(p);}
    $('ds-direction').value=stage.history?'read':'sync';$('ds-direction').disabled=stage.history;controls();if(stage.history)$('ds-direction').disabled=true;
  }
  async function check(historyText=null){if(!adapter)throw Error('请先连接数据目录。');const chosen=scopes();if(!chosen.length)throw Error('请至少选择一种数据。');status('正在读取本机和仓库数据…');const local=await capture(chosen),remote=historyText===null?await adapter.read():null;const env=historyText!==null?core.parse(historyText,hooks):remote?core.parse(remote.text,hooks):null;const stored=historyText===null?await cache(baselineKey()):null;const base=remote&&stored?core.validate(stored,hooks):null;stage={local,remote,context:context(),scopes:chosen,history:historyText!==null,plan:core.plan(local,env?.data||{},base,chosen)};review();status(historyText!==null?'历史版本仅合并到本机，确认后生效；不会直接覆盖仓库。':'差异检查完成。操作仅作用于勾选的数据，Obsidian 磁盘文件不会自动删除。');}
  $('ds-check').onclick=()=>run(()=>check());
  async function applyLocal(value,selected,expected){
    if(selected.includes('tasks'))window.WorkstationTaskData.import(value.tasks);
    if(selected.includes('notes'))window.NotesWorkspace.storageImport(value.notes);
    if(selected.includes('bookmarks'))window.BookmarksWorkspace.storageImport(value.bookmarks);
    if(selected.includes('browser'))await window.BrowserBookmarksWorkspace.storageImport(value.browser);
    if(selected.includes('obsidian'))await window.ObsidianWorkspace.storageImport(value.obsidian,expected.obsidian);
  }
  $('ds-apply').onclick=()=>run(async()=>{
    const s=stage;if(!s)throw Error('请先检查差异。');if(context()!==s.context)throw Error('GitHub 笔记空间已切换，请重新检查差异。');
    const now=await capture(s.scopes);if(!core.equal(now,s.local))throw Error('检查后本机内容已变化，请重新检查差异。');
    const next=core.validate(core.build(s.plan),hooks);const direction=$('ds-direction').value;
    await cache('local-undo',{data:now,scopes:s.scopes,context:s.context});
    if(direction==='sync'){
      const remoteNow=await adapter.read();if((remoteNow?.text||null)!==(s.remote?.text||null))throw Error('远端在检查后已有变化，请重新检查。');
      if(remoteNow&&adapter.kind==='webdav'&&(!remoteNow.version||remoteNow.version.startsWith('W/')))throw Error('WebDAV 未提供强 ETag，已停止覆盖。请让服务器暴露 ETag 或使用同步目录。');
      const currentRemote=remoteNow?core.parse(remoteNow.text,hooks).data:{};
      if(!core.equal(next,currentRemote))await adapter.save(JSON.stringify(core.envelope(next),null,2),remoteNow?.version??null,msg=>status(msg));
    }
    if (!core.equal(await capture(s.scopes), now)) throw Error(direction==='sync'?'仓库处理已结束，但本机内容又有变化，已停止本机覆盖；请重新检查。':'本机内容又有变化，已停止覆盖，请重新检查。');
    try{await applyLocal(next,s.scopes,now);}catch(e){throw Error('本机应用未全部完成，撤销入口和原始数据已保留：'+e.message);}
    if(!s.history)await cache(baselineKey(),direction==='sync'?next:(s.remote?core.parse(s.remote.text,hooks).data:{}));
    stage=null;$('ds-review').hidden=true;
    status(direction==='sync'?(adapter.kind==='folder'?'已写入同步目录并更新本机；请在网盘 / NAS 客户端确认上传完成。':'WebDAV 保存与读回确认成功，本机已更新。'):'已合并到本机；仓库未改动。可重新检查后同步。');
  });
  $('ds-undo').onclick=()=>run(async()=>{const b=await cache('local-undo');if(!b)throw Error('暂无可撤销的本机导入。');if(b.context!==context())throw Error('请切回执行导入时的 Notes / GitHub 笔记空间再撤销。');const now=await capture(b.scopes);await applyLocal(core.validate(b.data,hooks),b.scopes,now);await cache('local-undo',{data:now,scopes:b.scopes,context:b.context});invalidate();status('已恢复上次本机状态；仓库内容未改动。');});
  $('ds-history').onclick=()=>run(async()=>{const list=await adapter.history();const box=$('ds-history-list');box.replaceChildren();for(const name of list){const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=name.slice(0,23);b.title=name;b.onclick=()=>run(async()=>{await check(await adapter.readHistory(name));});box.append(b);}status(list.length?'选择历史副本，可预览并合并到本机。':'尚无历史副本。每次保存会保留一份，列表显示最近 30 份。');});
  function closeSettings(){if(window.WorkstationSettings)window.WorkstationSettings.close();else $('storage-dialog').close();}
  window.StorageSettings={initialize:()=>{if(!connection)select(provider);},busy:()=>busy};
  $('storage-toggle').onclick=()=>{if(window.WorkstationSettings)window.WorkstationSettings.open('storage');else {$('storage-dialog').showModal();if(!connection)select(provider);}};
  $('ds-close').onclick=()=>{if(!busy)closeSettings();};$('storage-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  $('ds-github').onclick=()=>{closeSettings();$('gh-connect').click();};
  for(const [id,p]of Object.entries(providers)){const b=document.createElement('button');b.type='button';b.dataset.storageProvider=id;b.setAttribute('aria-pressed',String(id===provider));const icon=document.createElement('span');icon.textContent=p.icon;const title=document.createElement('span');title.textContent=p.name;b.append(icon,title);b.onclick=()=>select(id);$('ds-providers').append(b);}
  controls();
})();
