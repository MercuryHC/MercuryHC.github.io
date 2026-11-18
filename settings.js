/* One settings surface for appearance, wallpaper and repository configuration. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),KEY='workstation-appearance-v1';
  const defaults={density:'comfortable',reader:14,clock:true,date:true,motto:true,iconGap:16,homeSidebar:'collapsed'};
  const clean=v=>({density:v?.density==='compact'?'compact':'comfortable',reader:[14,16,18].includes(Number(v?.reader))?Number(v.reader):14,clock:v?.clock!==false,date:v?.date!==false,motto:v?.motto!==false,iconGap:Number.isFinite(Number(v?.iconGap))?Math.max(8,Math.min(64,Math.round(Number(v.iconGap)))):16,homeSidebar:v?.homeSidebar==='expanded'?'expanded':'collapsed'});
  let prefs={...defaults},section='appearance';
  try{prefs=clean(JSON.parse(localStorage.getItem(KEY)));}catch{}
  const labels={appearance:'界面设置',background:'桌面背景',storage:'数据与同步',notifications:'微信提醒',help:'帮助说明'};
  // Relocate the live controls, preserving event handlers and in-progress state.
  for(const [from,to]of [['background-dialog','settings-background-content'],['storage-dialog','settings-storage-content']]){
    const source=$(from),target=$(to);while(source.firstChild)target.append(source.firstChild);
  }
  function message(text,error=false){$('settings-status').textContent=text;$('settings-status').dataset.error=String(error);}
  function apply(){const body=document.body;body.dataset.dockDensity=prefs.density;body.dataset.readerSize=String(prefs.reader);body.style.setProperty('--bookmark-gap',prefs.iconGap+'px');for(const key of ['clock','date','motto'])body.dataset['show'+key[0].toUpperCase()+key.slice(1)]=String(prefs[key]);}
  function paint(){$('setting-iconGap').value=String(prefs.iconGap);$('setting-iconGap-value').textContent=prefs.iconGap+' px';for(const key of ['density','reader','homeSidebar'])$('setting-'+key).value=String(prefs[key]);for(const key of ['clock','date','motto'])$('setting-'+key).checked=prefs[key];const mode=window.WorkstationTheme.mode();document.querySelectorAll('[data-setting-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.settingTheme===mode)));}
  function save(next){const previous=localStorage.getItem(KEY),sidebar=localStorage.getItem('workstation-home-sidebar-default');try{localStorage.setItem(KEY,JSON.stringify(next));localStorage.setItem('workstation-home-sidebar-default',next.homeSidebar);}catch{try{if(previous===null)localStorage.removeItem(KEY);else localStorage.setItem(KEY,previous);if(sidebar===null)localStorage.removeItem('workstation-home-sidebar-default');else localStorage.setItem('workstation-home-sidebar-default',sidebar);}catch{}paint();message('无法保存界面设置，请检查浏览器存储空间。',true);return false;}const changed=next.homeSidebar!==prefs.homeSidebar;prefs=next;apply();paint();if(changed){const collapsed=next.homeSidebar!=='expanded';localStorage.setItem('workstation-sidebar:bookmarks',String(collapsed));if(document.body.dataset.workspace==='bookmarks'&&document.body.classList.contains('sidebar-collapsed')!==collapsed)$('workspace-collapse').click();}message('界面设置已保存，即时生效。');return true;}
  function canClose(){return !window.StorageSettings?.busy();}
  function open(name='appearance'){
    if(!Object.hasOwn(labels,name))name='appearance';
    if(!canClose()&&name!==section){message('数据同步进行中，请等待当前操作完成。',true);return;}
    if(section==='background')window.BackgroundSettings.discard();
    section=name;
    document.querySelector('.settings-main').scrollTop=0;
    document.querySelectorAll('[data-settings-section]').forEach(b=>{const active=b.dataset.settingsSection===name;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
    document.querySelectorAll('[data-settings-panel]').forEach(p=>p.hidden=p.dataset.settingsPanel!==name);
    $('settings-section-title').textContent=labels[name];
    if(name==='background')window.BackgroundSettings.initialize();
    if(name==='storage')window.StorageSettings.initialize();
    paint();message(name==='appearance'?'设置保存在此浏览器，修改后立即生效。':'');
    if(!$('settings-dialog').open)$('settings-dialog').showModal();
    document.querySelector('[data-settings-section="'+name+'"]')?.focus?.({preventScroll:true});
    document.querySelector('.settings-main').scrollTop=0;
  }
  function close(){if(!canClose()){message('数据同步进行中，请等待当前操作完成。',true);return;}window.BackgroundSettings.discard();$('settings-dialog').close();}
  window.WorkstationSettings={open,close};
  $('settings-toggle').onclick=()=>open();$('settings-close').onclick=close;
  $('settings-dialog').addEventListener('cancel',e=>{if(!canClose()){e.preventDefault();message('数据同步进行中，请等待当前操作完成。',true);}else window.BackgroundSettings.discard();});
  for(const b of document.querySelectorAll('[data-settings-section]')){
    b.onclick=()=>open(b.dataset.settingsSection);
    b.addEventListener('keydown',e=>{const tabs=[...document.querySelectorAll('[data-settings-section]')];let i=tabs.indexOf(b);if(['ArrowDown','ArrowRight'].includes(e.key))i=(i+1)%tabs.length;else if(['ArrowUp','ArrowLeft'].includes(e.key))i=(i+tabs.length-1)%tabs.length;else if(e.key==='Home')i=0;else if(e.key==='End')i=tabs.length-1;else return;e.preventDefault();open(tabs[i].dataset.settingsSection);if(canClose())tabs[i].focus();});
  }
  for(const b of document.querySelectorAll('[data-setting-theme]'))b.onclick=()=>{if(window.WorkstationTheme.set(b.dataset.settingTheme)){paint();message('主题已保存。');}else message('无法保存主题，请检查浏览器存储空间。',true);};
  for(const key of ['density','reader','homeSidebar'])$('setting-'+key).onchange=e=>save(clean({...prefs,[key]:key==='reader'?Number(e.target.value):e.target.value}));
  for(const key of ['clock','date','motto'])$('setting-'+key).onchange=e=>save({...prefs,[key]:e.target.checked});
  $('setting-iconGap').oninput=e=>save(clean({...prefs,iconGap:Number(e.target.value)}));
  $('settings-reset').onclick=()=>{if(save({...defaults})){if(!window.WorkstationTheme.set('light'))message('布局已恢复，但无法保存主题。',true);paint();}};
  $('settings-github').onclick=()=>{close();$('gh-connect').click();};
  window.addEventListener('workstation-theme-changed',paint);
  window.addEventListener('storage',e=>{if(e.key===KEY){try{prefs=clean(JSON.parse(e.newValue));apply();paint();}catch{}}});
  apply();paint();
})();
