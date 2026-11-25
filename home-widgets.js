(() => {
  'use strict';
  const Core=window.HomeWidgetsCore,C=window.CalendarCore,$=id=>document.getElementById(id),KEY='workstation-home-widgets-v1';
  let prefs=Core.defaults(),signature='';
  try{prefs=Core.preferences(JSON.parse(localStorage.getItem(KEY)));}catch{}
  const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  function taskApp(){document.querySelector('[data-app="task"]')?.click();}
  function todayCalendar(){taskApp();window.TaskCalendar.openToday();}
  function configure(){
    const list=$('home-widget-options');list.replaceChildren();
    for(const definition of Core.catalog){
      const config=prefs.widgets.find(w=>w.id===definition.id),row=el('div','home-widget-option');
      const label=el('label'),check=el('input');check.type='checkbox';check.checked=config.enabled;check.dataset.widget=definition.id;
      const words=el('span'),title=el('strong','',definition.title),description=el('small','',definition.description);words.append(title,description);label.append(check,words);
      const sizeLabel=el('label','home-widget-size-label','行 × 列'),select=el('select');select.dataset.size=definition.id;select.setAttribute('aria-label',definition.title+'卡片大小');
      for(const [value,name] of [['1x1','1 × 1'],['1x2','1 × 2'],['1x4','1 × 4'],['2x2','2 × 2']]){const option=el('option','',name);option.value=value;option.selected=config.size===value;select.append(option);}
      const change=()=>{
        const next=Core.preferences({version:1,widgets:prefs.widgets.map(w=>w.id===definition.id?{...w,enabled:check.checked,size:select.value}:w)});
        try{localStorage.setItem(KEY,JSON.stringify(next));prefs=next;$('home-widgets-error').textContent='';render(true);}
        catch{$('home-widgets-error').textContent='未能保存卡片设置，请检查浏览器存储空间。';configure();}
      };
      check.onchange=select.onchange=change;sizeLabel.append(select);row.append(label,sizeLabel);list.append(row);
    }
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
    if(!force&&signature===next)return;signature=next;
    const host=$('home-widgets-grid');host.replaceChildren();
    for(const config of prefs.widgets.filter(w=>w.enabled)){
      const def=Core.catalog.find(w=>w.id===config.id),card=el('section','home-widget');card.dataset.widget=config.id;card.dataset.size=config.size;
      card.setAttribute('aria-labelledby','home-widget-title-'+config.id);
      const heading=el('div','home-widget-heading'),name=el('h3','',def.title);name.id='home-widget-title-'+config.id;
      const icon=el('span','home-widget-icon',def.icon);icon.setAttribute('aria-hidden','true');const text=el('div');text.append(name);
      const count=el('span','home-widget-count');heading.append(icon,text,count);card.append(heading);
      const body=el('div','home-widget-body'),limit={'1x1':0,'1x2':1,'1x4':2,'2x2':3}[config.size];
      if(config.size==='1x1'){
        const values={today:[data.today.filter(e=>!e.done).length,'项待办',todayCalendar],tasks:[data.counts.pending,'项待完成',()=>{taskApp();openTaskStat('all');}],reminders:[data.reminders.length,'项近期提醒',()=>{taskApp();window.RemindersWorkspace.show('reminders');}],projects:[data.projects.length,'个项目',()=>{taskApp();setNav('projects');}]};
        const [number,label,action]=values[config.id],button=el('button','home-widget-summary');button.type='button';button.append(el('strong','',String(number)),el('span','',label+' ↗'));button.onclick=action;card.append(button);host.append(card);continue;
      }
      if(config.id==='today'||config.id==='reminders'){
        const items=config.id==='today'?data.today:data.reminders;count.textContent=items.length+' 项';
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
        body.append(stats,el('p','home-widget-note',`${data.counts.pending} 项待完成 · 完成率 ${data.counts.total?Math.round(data.counts.done/data.counts.total*100):0}%`));card.append(body);
      }else{
        text.append(el('p','','一级项目 · 含子项目任务'));count.textContent=data.projects.length+' 个';
        if(!data.projects.length)body.append(el('p','home-widget-empty','还没有项目，创建后将在这里显示进度。'));
        for(const project of data.projects.slice(0,limit)){
          const percent=project.total?Math.round(project.done/project.total*100):0,row=el('button','home-project-row');row.type='button';row.style.setProperty('--widget-accent',project.color);
          const label=el('span','home-project-label');label.append(el('strong','',project.title),el('small','',`${project.done}/${project.total} · ${percent}%`));
          const progress=el('span','home-project-progress'),bar=el('i');bar.style.width=percent+'%';progress.append(bar);row.append(label,progress);row.onclick=()=>{taskApp();filterProject(project.id);};body.append(row);
        }
        const action=el('button','home-widget-link','查看全部项目 →');action.type='button';action.onclick=()=>{taskApp();setNav('projects');};card.append(body,action);
      }
      host.append(card);
    }
    if(!prefs.widgets.some(w=>w.enabled)){const empty=el('p','home-widgets-empty','尚未显示卡片，点击“自定义卡片”选择你关心的内容。');host.append(empty);}
  }
  $('home-widgets-customize').onclick=()=>{const panel=$('home-widget-settings');panel.hidden=!panel.hidden;$('home-widgets-customize').setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)configure();};
  $('home-widgets-close').onclick=()=>{$('home-widget-settings').hidden=true;$('home-widgets-customize').setAttribute('aria-expanded','false');$('home-widgets-customize').focus();};
  window.HomeWidgets={refresh:()=>render()};
  window.addEventListener('workstation-app-changed',()=>render());window.addEventListener('focus',()=>render());
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')render();});
  window.addEventListener('storage',event=>{if(event.key===KEY){try{prefs=Core.preferences(JSON.parse(event.newValue));}catch{prefs=Core.defaults();}configure();render(true);}});
  setInterval(()=>{if(!document.hidden&&!$('bookmarks-workspace').hidden)render();},60000);
  render();
})();
