(() => {
  const $=id=>document.getElementById(id),host=$('bookmarks-workspace'),KEY='workstation-desktop-order-v1';let order=[],editing=false,drag=null;
  try{const v=JSON.parse(localStorage.getItem(KEY));if(Array.isArray(v))order=[...new Set(v.filter(x=>typeof x==='string'))];}catch{}
  const toolbar=document.querySelector('.home-widgets-toolbar'),edit=document.createElement('button');edit.type='button';edit.id='home-desktop-edit';edit.textContent='编辑布局';edit.setAttribute('aria-pressed','false');toolbar.append(edit);
  const sync=document.createElement('details');sync.className='desktop-sync';
  const label=document.createElement('summary');label.textContent='布局同步';sync.append(label);const syncMenu=document.createElement('div');syncMenu.className='desktop-sync-menu';sync.append(syncMenu);
  for(const [title,action]of [['保存到 GitHub',()=>window.BookmarksWorkspace.save()],['从 GitHub 读取',()=>window.BookmarksWorkspace.read()],['其他同步方式',()=>window.WorkstationSettings.open('storage')]]){const b=document.createElement('button');b.type='button';b.textContent=title;b.onclick=()=>{sync.open=false;action();};syncMenu.append(b);}toolbar.append(sync);
  const hint=document.createElement('p');hint.className='desktop-hint';hint.hidden=true;hint.textContent='拖动卡片或网站调整顺序；也可用手柄方向键移动。Esc 取消。布局随主页收藏同步。';toolbar.after(hint);
  host.classList.add('desktop-grid');
  const sites=document.createElement('section');sites.className='desktop-sites';sites.setAttribute('aria-label','常用网站');
  const siteHeading=host.querySelector('.bookmark-section-heading');host.append(sites);sites.append(siteHeading,$('bm-grid'),$('bm-status'));

  function tiles(){return [...host.querySelectorAll('.home-widget, #bm-grid .bookmark-card[data-bookmark-id]')];}
  function key(n){return n.dataset.widget?'widget:'+n.dataset.widget:'bookmark:'+n.dataset.bookmarkId;}
  function measureTiles(){
    const grid=$('home-widgets-grid'),width=grid.clientWidth;if(!width)return;
    const gap=12,columns=width>=520?8:4,unit=(width-gap*(columns-1))/columns;
    grid.style.gridTemplateColumns=`repeat(${columns},minmax(0,1fr))`;
    for(const tile of grid.querySelectorAll('.home-widget')){
      const [rows,cols]=tile.dataset.size.split('x').map(Number),span=Math.min(cols,columns),tileWidth=unit*span+gap*(span-1),height=tileWidth*rows/cols;
      tile.style.setProperty('--tile-height',height+'px');tile.style.gridColumn='span '+span;tile.style.gridRow='span '+Math.ceil(height+gap);
    }
  }
  function refresh(){
    const all=tiles();for(const n of all){const id=key(n);n.dataset.desktopId=id;if(!order.includes(id))order.push(id);n.style.order=String(order.indexOf(id));n.draggable=false;
      if(!n.querySelector('.desktop-handle')){const h=document.createElement('button');h.type='button';h.className='desktop-handle';h.textContent='⠿';h.setAttribute('aria-label','移动 '+(n.querySelector('h3,strong')?.textContent||'项目'));h.onpointerdown=e=>begin(e,n,h);h.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const list=tiles().filter(t=>Boolean(t.dataset.widget)===Boolean(n.dataset.widget)).sort((a,b)=>order.indexOf(key(a))-order.indexOf(key(b))),i=list.indexOf(n),target=list[i+(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1)];if(target)move(key(n),key(target),['ArrowRight','ArrowDown'].includes(e.key));};n.append(h);}n.querySelector('.desktop-handle').hidden=!editing;
      if(n.dataset.widget&&!n.querySelector('.desktop-options')){const b=document.createElement('button');b.type='button';b.className='desktop-options';b.textContent='•••';b.setAttribute('aria-label','组件操作');b.onclick=()=>window.HomeContext?.open(n,b.getBoundingClientRect().left,b.getBoundingClientRect().bottom);n.append(b);}if(n.querySelector('.desktop-options'))n.querySelector('.desktop-options').hidden=!editing;
    }
    measureTiles();
  }
  function move(from,to,after){if(from===to||from.split(':')[0]!==to.split(':')[0])return;const next=order.filter(x=>x!==from),i=next.indexOf(to);if(i<0)return;next.splice(i+(after?1:0),0,from);try{localStorage.setItem(KEY,JSON.stringify(next));order=next;window.refreshGithubDock?.();$('home-widgets-error').textContent='';refresh();}catch{$('home-widgets-error').textContent='布局保存失败，已保留原位置。';}}
  function clear(){for(const n of tiles()){delete n.dataset.drop;delete n.dataset.dragging;}drag=null;}
  function begin(e,n,h){if(!editing||e.button!==0)return;e.preventDefault();e.stopPropagation();clear();drag={from:key(n),target:null,after:false,pointer:e.pointerId};n.dataset.dragging='true';h.setPointerCapture(e.pointerId);}
  host.addEventListener('pointerdown',e=>{const tile=e.target.closest('[data-desktop-id]');if(!tile||e.target.closest('.desktop-handle,.desktop-options'))return;begin(e,tile,tile);});
  host.addEventListener('lostpointercapture',clear);
  host.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.pointer)return;const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-desktop-id]');for(const n of tiles())delete n.dataset.drop;if(!target||!host.contains(target)||key(target)===drag.from||key(target).split(':')[0]!==drag.from.split(':')[0]){drag.target=null;return;}const r=target.getBoundingClientRect();drag.target=key(target);drag.after=e.clientX>r.left+r.width/2;target.dataset.drop=drag.after?'after':'before';});
  host.addEventListener('pointerup',e=>{if(!drag||e.pointerId!==drag.pointer)return;const d=drag;clear();if(d.target)move(d.from,d.target,d.after);});
  host.addEventListener('pointercancel',clear);document.addEventListener('keydown',e=>{if(e.key==='Escape')clear();});
  edit.onclick=()=>{editing=!editing;clear();host.dataset.editing=String(editing);edit.textContent=editing?'完成布局':'编辑布局';edit.setAttribute('aria-pressed',String(editing));hint.hidden=!editing;refresh();};
  host.addEventListener('click',e=>{if(editing&&e.target.closest('[data-desktop-id]')&&!e.target.closest('.desktop-handle, .desktop-options')){e.preventDefault();e.stopPropagation();}},true);
  host.addEventListener('dragstart',e=>{if(e.target.closest('[data-desktop-id]'))e.preventDefault();},true);
  window.addEventListener('storage',e=>{if(e.key!==KEY)return;try{const value=JSON.parse(e.newValue);order=Array.isArray(value)?[...new Set(value.filter(x=>typeof x==='string'))]:[];clear();refresh();}catch{}});
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(measureTiles).observe($('home-widgets-grid'));
  function storageExport(){
    let prefs;try{prefs=JSON.parse(localStorage.getItem('workstation-home-widgets-v1'));}catch{}
    return {version:1,order:[...order],widgets:window.HomeWidgetsCore.preferences(prefs).widgets};
  }
  function storageImport(value){
    const clean=window.BookmarksCore.validateLayout(value),widgetKey='workstation-home-widgets-v1';
    const oldOrder=localStorage.getItem(KEY),oldWidgets=localStorage.getItem(widgetKey);
    try{localStorage.setItem(KEY,JSON.stringify(clean.order));localStorage.setItem(widgetKey,JSON.stringify({version:1,widgets:clean.widgets}));}
    catch(e){try{if(oldOrder===null)localStorage.removeItem(KEY);else localStorage.setItem(KEY,oldOrder);if(oldWidgets===null)localStorage.removeItem(widgetKey);else localStorage.setItem(widgetKey,oldWidgets);}catch{}throw e;}
    order=clean.order;clear();window.HomeWidgets?.reload();refresh();
  }
  window.HomeDesktop={refresh,storageExport,storageImport,shift(id,delta){const list=tiles().filter(n=>key(n).split(':')[0]===id.split(':')[0]).sort((a,b)=>order.indexOf(key(a))-order.indexOf(key(b))),i=list.findIndex(n=>key(n)===id),target=list[i+delta];if(target)move(id,key(target),delta>0);}};refresh();
})();
