(() => {
  'use strict';
  const Core=window.HomeWidgetsCore,C=window.CalendarCore,$=id=>document.getElementById(id),KEY='workstation-home-widgets-v1';
  let prefs=Core.defaults(),signature='';
  try{prefs=Core.preferences(JSON.parse(localStorage.getItem(KEY)));}catch{}
  const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  function taskApp(){document.querySelector('[data-app="task"]')?.click();}
  function todayCalendar(){taskApp();window.TaskCalendar.openToday();}
  let category='all';
  const groups={today:'schedule',tasks:'work',reminders:'schedule',projects:'work',month:'schedule',note:'tools',focus:'tools',countdown:'schedule',quick:'tools'};
  const samples={today:['09:00  整理今日计划','14:30  项目讨论','17:00  阅读与回顾'],tasks:['12  待完成','3  进行中    8  已完成'],reminders:['◯  记得喝水','◯  整理周报','◯  预约会议'],projects:['设计项目   ━━━━━  75%','学习计划   ━━━  40%'],month:['一  二  三  四  五  六  日',' 1   2   3   4   5   6   7',' 8   9  10  11  12  13  14'],note:['灵感备忘','把值得记住的小事','留在桌面上。'],focus:['25:00','专注当下  ·  开始'],countdown:['距离下一次旅行','30 天'],quick:['＋ 新建任务','＋ 添加提醒','＋ 记录笔记']};
  function filterLibrary(){
    const q=$('home-widget-search').value.trim().toLowerCase();let visible=0;
    for(const row of $('home-widget-options').children){const id=row.dataset.libraryId,def=Core.catalog.find(d=>d.id===id),config=prefs.widgets.find(w=>w.id===id);row.hidden=!((category==='all'||category==='added'&&config.enabled||groups[id]===category)&&(!q||(def.title+def.description).toLowerCase().includes(q)));if(!row.hidden)visible++;}
    $('widget-library-count').textContent=visible+' 个组件';$('widget-library-empty').hidden=visible>0;
    for(const b of $('widget-library-categories').children)b.setAttribute('aria-pressed',String(b.dataset.category===category));
  }
  function configure(){
    const list=$('home-widget-options');list.replaceChildren();
    const cats=$('widget-library-categories');cats.replaceChildren();
    for(const [id,name] of [['all','▦  全部组件'],['added','✓  已添加'],['schedule','◷  日程与日期'],['work','▥  任务与项目'],['tools','✧  效率工具']]){const button=el('button','',name);button.type='button';button.dataset.category=id;button.onclick=()=>{category=id;filterLibrary();};cats.append(button);}
    for(const definition of Core.catalog){
      const config=prefs.widgets.find(w=>w.id===definition.id),row=el('article','home-widget-option');row.dataset.libraryId=definition.id;
      const head=el('div','library-card-heading'),icon=el('span','library-icon',definition.icon),words=el('div');words.append(el('h3','',definition.title),el('p','',definition.description));head.append(icon,words);
      const check=el('input');check.type='checkbox';check.checked=config.enabled;check.dataset.widget=definition.id;check.hidden=true;
      const preview=el('div','library-stage'),tile=el('div','library-preview-tile');tile.dataset.kind=definition.id;tile.setAttribute('aria-hidden','true');preview.append(tile);
      const select=el('select');select.dataset.size=definition.id;select.setAttribute('aria-label',definition.title+'卡片大小');
      for(const value of ['1x1','1x2','1x4','2x2','2x4','4x4']){const option=el('option','',value.replace('x',' × '));option.value=value;option.selected=config.size===value;select.append(option);}
      function draw(){tile.dataset.size=select.value||config.size;tile.replaceChildren();tile.append(el('b','',definition.title));for(const line of samples[definition.id]||[])tile.append(el('span','',line));}
      const action=el('button','library-add'),badge=el('span','library-added');action.type='button';
      function state(){action.textContent=check.checked?'移除':'＋ 添加';action.dataset.added=String(check.checked);action.setAttribute('aria-label',(check.checked?'移除':'添加')+definition.title);badge.textContent=check.checked?'✓ 已在桌面':'可添加';row.dataset.added=String(check.checked);}
      const change=()=>{
        const previous=prefs.widgets.find(w=>w.id===definition.id),next=Core.preferences({version:1,widgets:prefs.widgets.map(w=>w.id===definition.id?{...w,enabled:check.checked,size:select.value}:w)});
        try{localStorage.setItem(KEY,JSON.stringify(next));prefs=next;$('home-widgets-error').textContent='';$('widget-library-message').textContent=definition.title+(check.checked?'已添加到桌面，尺寸 '+select.value.replace('x',' × '):'已从桌面移除，内容保留');state();draw();render(true);filterLibrary();}
        catch{check.checked=previous.enabled;select.value=previous.size;state();draw();$('widget-library-message').textContent='保存失败，已保留原设置。请检查浏览器存储空间。';$('home-widgets-error').textContent='未能保存卡片设置。';}
      };
      check.onchange=select.onchange=change;action.onclick=()=>{check.checked=!check.checked;change();};
      const footer=el('div','library-card-footer'),sizeLabel=el('label','', '尺寸 ');sizeLabel.append(select);footer.append(sizeLabel,action);row.append(preview,head,badge,footer,check);list.append(row);draw();state();
    }
    filterLibrary();
  }
  function record(event,day,now){
    const row=el('div','home-schedule-row');row.style.setProperty('--widget-accent',event.color);row.dataset.done=String(event.done);
    const circle=el('button','home-widget-check',event.done?'✓':'');circle.type='button';circle.setAttribute('aria-pressed',String(event.done));circle.setAttribute('aria-label',`${event.done?'恢复':'完成'}：${event.title}`);
    circle.onclick=()=>{try{if(event.kind==='reminder')window.RemindersWorkspace.toggle(event.id);else toggle(event.id);render(true);}catch(error){$('home-widgets-error').textContent=error.message;}};
    const link=el('button','home-schedule-detail');link.type='button';
    const title=el('strong','',event.title),time=el('span','home-schedule-time',C.label(event,day));
    const metadata=el('small','',`${event.projectName}${event.done?' · 已完成':event.end<now?' · 已超时':''}`);metadata.dataset.overdue=String(!event.done&&event.end<now);
    link.append(title,metadata,time);link.onclick=()=>{taskApp();if(event.kind==='reminder')window.RemindersWorkspace.open(event.id);else openTask(event.id);};row.append(circle,link);return row;
  }
  function render(force=false){
    const now=Date.now(),data=Core.summary(db,now,C),next=JSON.stringify([prefs,data,Math.floor(now/60000)]);
    if(!force&&(signature===next||$('home-widgets-grid').contains(document.activeElement)))return;signature=next;
    const host=$('home-widgets-grid');host.replaceChildren();
    for(const config of prefs.widgets.filter(w=>w.enabled)){
      const def=Core.catalog.find(w=>w.id===config.id),card=el('section','home-widget');card.dataset.widget=config.id;card.dataset.size=config.size;
      card.setAttribute('aria-labelledby','home-widget-title-'+config.id);
      const heading=el('div','home-widget-heading'),name=el('h3','',def.title);name.id='home-widget-title-'+config.id;
      const icon=el('span','home-widget-icon',def.icon);icon.setAttribute('aria-hidden','true');const text=el('div');text.append(name);
      const count=el('span','home-widget-count');heading.append(icon,text,count);card.append(heading);
      const body=el('div','home-widget-body'),limit=Infinity,large=['2x4','4x4'].includes(config.size);
      if(window.HomeExtras?.render(config.id,body,config.size,data)){card.append(body);host.append(card);continue;}
      if(config.size==='1x1'){
        const values={today:[data.today.filter(e=>!e.done).length,'项待办',todayCalendar],tasks:[data.counts.pending,'项待完成',()=>{taskApp();openTaskStat('all');}],reminders:[data.reminders.length,'项近期提醒',()=>{taskApp();window.RemindersWorkspace.show('reminders');}],projects:[data.projects.length,'个项目',()=>{taskApp();setNav('projects');}]};
        const [number,label,action]=values[config.id],button=el('button','home-widget-summary');button.type='button';button.append(el('strong','',String(number)),el('span','',label+' ↗'));button.onclick=action;
        const nextEvent=(config.id==='today'?data.today:data.reminders).find(e=>!e.done);
        const detail=config.id==='tasks'?`${data.counts.progress} 进行中 · ${data.counts.overdue} 超时`:config.id==='projects'?`${data.projects.reduce((n,p)=>n+p.done,0)} / ${data.projects.reduce((n,p)=>n+p.total,0)} 任务完成`:nextEvent?nextEvent.title:'暂无待办';
        const detailNode=el('small','home-widget-summary-detail',detail);detailNode.title=detail;button.append(detailNode);
        if(nextEvent&&(config.id==='today'||config.id==='reminders'))button.append(el('small','home-widget-summary-time',C.label(nextEvent,C.key(new Date(nextEvent.start)))));
        card.append(button);host.append(card);continue;
      }
      if(config.id==='today'||config.id==='reminders'){
        const items=config.id==='today'?data.today:data.reminders;count.textContent=items.length+' 项';
        if(large){const info=el('div','widget-insights');info.append(el('span','',items.filter(e=>!e.done).length+' 待完成'),el('span','',items.filter(e=>e.done).length+' 已完成'),el('span','',items.filter(e=>!e.done&&(e.kind==='reminder'?e.start:e.end)<now).length+' 超时'));card.append(info);}
        text.append(el('p','',config.id==='today'?new Date(now).toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'}):'未来七天 · 含超时未完成'));
        if(!items.length)body.append(el('p','home-widget-empty',config.id==='today'?'今天没有安排，给自己留一点空间。':'暂时没有近期提醒。'));
        for(const item of items.slice(0,limit)){
          const row=record(item,config.id==='today'?data.day:C.key(new Date(item.start)),now);
          if(config.id==='reminders')row.querySelector('.home-schedule-time').textContent=new Date(item.start).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
          body.append(row);
        }
        const action=el('button','home-widget-link',config.id==='today'?`查看今日日历${items.length>limit?' · 全部 '+items.length+' 项':''} →`:'查看提醒清单 →');action.type='button';
        action.onclick=config.id==='today'?todayCalendar:()=>{taskApp();window.RemindersWorkspace.show('reminders');};card.append(body,action);
      }else if(config.id==='tasks'){
        text.append(el('p','','任务状态一览'));count.textContent=data.counts.total+' 项';
        const stats=el('div','home-widget-stats');
        for(const [key,label,filter] of [['total','全部任务','all'],['progress','进行中','progress'],['overdue','已超时','overdue'],['done','已完成','done']]){
          const stat=el('button','home-widget-stat');stat.type='button';stat.dataset.kind=key;stat.append(el('strong','',String(data.counts[key])),el('span','',label));stat.onclick=()=>{taskApp();openTaskStat(filter);};stats.append(stat);
        }
        body.append(stats,el('p','home-widget-note',`${data.counts.pending} 项待完成 · 完成率 ${data.counts.total?Math.round(data.counts.done/data.counts.total*100):0}%`));
        if(large){body.append(el('div','widget-section-label','待完成 · 按截止时间'));for(const item of data.pendingTasks)body.append(record(item,data.day,now));if(!data.pendingTasks.length)body.append(el('p','home-widget-empty','所有任务已完成'));}
        card.append(body);
      }else{
        text.append(el('p','','一级项目 · 含子项目任务'));count.textContent=data.projects.length+' 个';
        if(!data.projects.length)body.append(el('p','home-widget-empty','还没有项目，创建后将在这里显示进度。'));
        for(const project of data.projects.slice(0,limit)){
          const percent=project.total?Math.round(project.done/project.total*100):0,row=el('button','home-project-row');row.type='button';row.style.setProperty('--widget-accent',project.color);
          const label=el('span','home-project-label');label.append(el('strong','',project.title),el('small','',`${project.done}/${project.total} · ${percent}%`));
          const progress=el('span','home-project-progress'),bar=el('i');bar.style.width=percent+'%';progress.append(bar);row.append(label,progress);if(large){row.append(el('small','project-detail',`${project.total-project.done} 项待完成 · ${project.done} 项已完成`));}if(config.size==='4x4'){const ids=new Set([project.id,...(db.projects||[]).filter(p=>p.parentId===project.id).map(p=>p.id)]);for(const task of data.pendingTasks.filter(e=>ids.has(e.record.project)).slice(0,3))row.append(el('span','project-task-preview','○ '+task.title));}row.onclick=()=>{taskApp();filterProject(project.id);};body.append(row);
        }
        const action=el('button','home-widget-link','查看全部项目 →');action.type='button';action.onclick=()=>{taskApp();setNav('projects');};card.append(body,action);
      }
      const more=card.querySelector('.home-widget-link');
      if(more){more.textContent='↗';more.setAttribute('aria-label','打开'+def.title);heading.append(more);}
      if(body.children.length){body.tabIndex=0;body.setAttribute('aria-label',def.title+'内容，可滚动查看');}
      host.append(card);
    }
    window.HomeDesktop?.refresh();
    if(!prefs.widgets.some(w=>w.enabled)){const empty=el('p','home-widgets-empty','尚未显示卡片，点击“自定义卡片”选择你关心的内容。');host.append(empty);}
  }
  const library=$('home-widget-settings');document.body.append(library);
  function closeLibrary(){library.close?.();library.hidden=true;$('home-widgets-customize').setAttribute('aria-expanded','false');$('home-widgets-customize').focus();}
  $('home-widgets-customize').onclick=()=>{library.hidden=false;$('home-widgets-customize').setAttribute('aria-expanded','true');$('widget-library-message').textContent='';configure();library.showModal?.();$('home-widget-search').focus();};
  $('home-widgets-close').onclick=closeLibrary;library.addEventListener('cancel',e=>{e.preventDefault();closeLibrary();});
  $('home-widget-search').oninput=filterLibrary;
  window.HomeWidgets={refresh:()=>render(),update(id,patch){
    if(!prefs.widgets.some(w=>w.id===id))return false;
    const next=Core.preferences({version:1,widgets:prefs.widgets.map(w=>w.id===id?{...w,...patch}:w)});
    try{localStorage.setItem(KEY,JSON.stringify(next));prefs=next;$('home-widgets-error').textContent='';render(true);return true;}catch{$('home-widgets-error').textContent='设置保存失败，已保留原设置。';return false;}
  }};
  window.addEventListener('workstation-app-changed',()=>render());window.addEventListener('focus',()=>render());
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')render();});
  window.addEventListener('storage',event=>{if(event.key===KEY){try{prefs=Core.preferences(JSON.parse(event.newValue));}catch{prefs=Core.defaults();}configure();render(true);}});
  setInterval(()=>{if(!document.hidden&&!$('bookmarks-workspace').hidden)render();},60000);
  render();
})();
