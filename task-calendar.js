(() => {
  'use strict';
  const C=window.CalendarCore,$=id=>document.getElementById(id);
  let selected=C.key(new Date()),mode='month',timelineDay=null;
  function element(tag, cls, text) {const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
  function paint(node,event) {node.style.setProperty('--calendar-color',event.color);node.style.setProperty('--calendar-tint',event.color+'20');}
  function open(event) {if(event.kind==='reminder')window.RemindersWorkspace.open(event.id);else openTask(event.id);}
  function render() {
    const host=$('calendar-workspace');if(!host||host.hidden)return;
    const today=C.key(new Date()),dates=C.days(selected,mode),items=C.events(db,{tasks:$('calendar-tasks').checked,reminders:$('calendar-reminders').checked,completed:$('calendar-completed').checked});
    $('calendar-period').textContent=C.date(selected).toLocaleDateString('zh-CN',{year:'numeric',month:'long'});
    $('calendar-grid').dataset.mode=mode;
    document.querySelectorAll('[data-calendar-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.calendarMode===mode);b.setAttribute('aria-pressed',String(b.dataset.calendarMode===mode));});
    const legend=$('calendar-project-legend');legend.replaceChildren();
    const first=C.date(dates[0]);first.setHours(0,0,0,0);const last=C.date(C.add(dates.at(-1),1));last.setHours(0,0,0,0);
    const groups=new Map(items.filter(e=>e.start<last.getTime()&&e.end>=first.getTime()).map(e=>[e.group,e]));
    for(const event of groups.values()){const entry=element('span','calendar-project-key'),dot=element('i');paint(dot,event);entry.append(dot,element('span','',event.projectName));legend.append(entry);}
    legend.hidden=!groups.size;
    const grid=$('calendar-grid');grid.replaceChildren();
    for(const day of dates) {
      const entries=C.onDay(items,day),cell=element('div','calendar-day');
      cell.dataset.outside=String(day.slice(0,7)!==selected.slice(0,7));cell.dataset.selected=String(day===selected);
      const button=element('button','calendar-date',String(C.date(day).getDate()));button.type='button';button.dataset.day=day;
      button.setAttribute('aria-label',`${C.date(day).toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'})}，${entries.length} 项`);
      button.setAttribute('aria-pressed',String(day===selected));button.tabIndex=day===selected?0:-1;
      if(day===today)button.setAttribute('aria-current','date');
      button.onclick=()=>{selected=day;render();focusDate();};
      button.onkeydown=e=>{
        const moves={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};
        if(e.key in moves)selected=C.add(day,moves[e.key]);
        else if(e.key==='Home')selected=C.weekStart(day);
        else if(e.key==='End')selected=C.add(C.weekStart(day),6);
        else if(e.key==='PageUp'||e.key==='PageDown')selected=C.shiftMonth(day,e.key==='PageUp'?-1:1);
        else return;e.preventDefault();render();focusDate();
      };
      cell.append(button);
      const dots=element('span','calendar-dots');dots.setAttribute('aria-hidden','true');
      for(const event of new Map(entries.map(e=>[e.group,e])).values()){const dot=element('i');paint(dot,event);dots.append(dot);}cell.append(dots);
      for(const event of entries.slice(0,mode==='month'?3:8)) {
        const chip=element('button','calendar-event',event.title);chip.type='button';chip.dataset.kind=event.kind;chip.dataset.done=String(event.done);
        paint(chip,event);
        chip.title=`${event.projectName} · ${event.title} · ${C.label(event,day)}`;chip.setAttribute('aria-label',`${event.kind==='task'?'任务':'提醒事项'}：${chip.title}`);
        chip.onclick=()=>open(event);cell.append(chip);
      }
      const limit=mode==='month'?3:8;
      if(entries.length>limit){const more=element('button','calendar-more',`还有 ${entries.length-limit} 项`);more.type='button';more.onclick=()=>{selected=day;render();$('calendar-agenda-heading').focus();};cell.append(more);}
      grid.append(cell);
    }
    renderAgenda(items);
  }
  function eventButton(event) {
    const row=element('button','calendar-agenda-item');row.type='button';row.dataset.kind=event.kind;row.dataset.done=String(event.done);paint(row,event);
    const time=element('span','calendar-agenda-time',C.label(event,selected));
    const content=element('span','calendar-agenda-content'),title=element('strong','',event.title);
    const late=!event.done&&event.end<Date.now();
    const meta=element('small','',`${event.kind==='task'?'任务 · '+event.projectName:'提醒事项'}${event.done?' · 已完成':late?' · 已超时':''}`);
    meta.dataset.overdue=String(late);content.append(title,meta);row.append(time,content);row.onclick=()=>open(event);
    row.ondblclick=e=>e.stopPropagation();
    const shell=element('div','calendar-event-shell');shell.dataset.kind=event.kind;shell.dataset.done=String(event.done);paint(shell,event);
    const circle=element('button','calendar-complete',event.done?'✓':'');circle.type='button';
    circle.setAttribute('aria-label',`${event.done?'恢复':'完成'}：${event.title}`);circle.setAttribute('aria-pressed',String(event.done));
    circle.title=event.done?'恢复为待完成':'标记完成';
    circle.onclick=e=>{e.stopPropagation();try{if(event.kind==='reminder')window.RemindersWorkspace.toggle(event.id);else toggle(event.id);}catch(error){toast(error.message);}};
    circle.ondblclick=e=>e.stopPropagation();shell.append(circle,row);return shell;
  }
  function chooseTime(minutes) {
    $('calendar-create-time').value=selected+'T'+String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
    $('calendar-create-error').textContent='';$('calendar-create-dialog').showModal();
  }
  function renderAgenda(items) {
    const agenda=$('calendar-agenda'),previous=agenda.querySelector('.calendar-time-scroll');
    const scroll=timelineDay===selected?previous?.scrollTop:null;
    agenda.replaceChildren();const entries=C.onDay(items,selected);
    $('calendar-agenda-heading').textContent=C.date(selected).toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'});
    $('calendar-day-count').textContent=`${entries.length} 项安排`;
    const toolbar=element('div','calendar-time-toolbar'),hint=element('span','','双击空白时间添加');
    const add=element('button','secondary','＋ 添加');add.type='button';add.onclick=()=>chooseTime(9*60);toolbar.append(hint,add);agenda.append(toolbar);
    const allDay=entries.filter(e=>e.allDay);
    if(allDay.length){const group=element('div','calendar-all-day');group.append(element('span','calendar-all-day-label','全天'));for(const event of allDay)group.append(eventButton(event));agenda.append(group);}
    if(!entries.length)agenda.append(element('p','calendar-empty','这一天还没有安排，双击下方时间开始添加。'));
    const scroller=element('div','calendar-time-scroll'),track=element('div','calendar-time-track');
    scroller.setAttribute('aria-label','每日时间线，可滚动查看 0 至 24 时');scroller.tabIndex=0;
    for(let minute=0;minute<1440;minute+=30){
      const slot=element('button','calendar-time-slot');slot.type='button';slot.dataset.minute=String(minute);
      const stamp=String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');
      slot.setAttribute('aria-label',`${selected} ${stamp}，双击或按 Enter 添加安排`);
      if(minute%60===0)slot.append(element('span','calendar-hour-label',stamp));
      slot.ondblclick=()=>chooseTime(minute);
      slot.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseTime(minute);}};
      track.append(slot);
    }
    const layer=element('div','calendar-time-events');
    const blocks=C.timeline(items,selected);
    for(const block of blocks){const row=eventButton(block.event);row.classList.add('calendar-time-event');
      row.style.top=(block.start*1.2)+'px';row.style.height=((block.end-block.start)*1.2)+'px';
      row.style.left=(block.column*100/block.columns)+'%';row.style.width=(100/block.columns)+'%';
      row.title=`${block.event.title} · ${C.label(block.event,selected)} · ${block.event.projectName}`;layer.append(row);
    }
    track.append(layer);
    if(selected===C.key(new Date())){const now=new Date(),line=element('div','calendar-now-line');line.style.top=((now.getHours()*60+now.getMinutes())*1.2)+'px';line.setAttribute('aria-label','当前时间');track.append(line);}
    scroller.append(track);agenda.append(scroller);
    scroller.scrollTop=scroll??Math.max(0,(blocks.length?Math.min(480,blocks[0].start):480)*1.2-18);timelineDay=selected;
  }
  function create(kind) {
    const input=$('calendar-create-time');
    try {
      const at=window.ReminderCore.fromLocal(input.value),start=new Date(at),end=new Date(start.getTime()+3600000);
      $('calendar-create-dialog').close();
      if(kind==='reminder')window.RemindersWorkspace.createAt(input.value);
      else openTask(null,{start:C.key(start),due:C.key(end),startTime:window.ReminderCore.toLocal(at).slice(11),dueTime:window.ReminderCore.toLocal(end.toISOString()).slice(11)});
    } catch(error){$('calendar-create-error').textContent=error.message;}
  }
  $('calendar-create-task').onclick=()=>create('task');
  $('calendar-create-reminder').onclick=()=>create('reminder');

  function focusDate() {$('calendar-grid').querySelector(`[data-day="${selected}"]`)?.focus();}
  $('task-mode-calendar').onclick=()=>window.RemindersWorkspace.show('calendar');
  $('calendar-prev').onclick=()=>{selected=mode==='month'?C.shiftMonth(selected,-1):C.add(selected,-7);render();};
  $('calendar-next').onclick=()=>{selected=mode==='month'?C.shiftMonth(selected,1):C.add(selected,7);render();};
  $('calendar-today').onclick=()=>{selected=C.key(new Date());render();};
  document.querySelectorAll('[data-calendar-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.calendarMode;render();});
  for(const id of ['calendar-tasks','calendar-reminders','calendar-completed'])$(id).onchange=render;
  window.TaskCalendar={render,openToday(){selected=C.key(new Date());window.RemindersWorkspace.show('calendar');}};
  window.RemindersWorkspace.show('calendar');
  window.addEventListener('focus',render);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')render();});
})();
