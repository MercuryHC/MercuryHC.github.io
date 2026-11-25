/* Calendar projection only: source records and synchronization schemas stay unchanged. */
(function(root) {
  'use strict';
  const Time = typeof module !== 'undefined' && module.exports ? require('./task-time') : root.TaskTime;
  const pad = n => String(n).padStart(2, '0');
  const key = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  function date(value) { const [y,m,d] = value.split('-').map(Number); const result=new Date(0); result.setFullYear(y,m-1,d); result.setHours(12,0,0,0); return result; }
  function add(value, days) { const d=date(value);d.setDate(d.getDate()+days);return key(d); }
  function shiftMonth(value, delta) { const d=date(value), day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+delta);const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,last));return key(d); }
  function weekStart(value) { return add(value,-((date(value).getDay()+6)%7)); }
  function days(value, mode='month') {
    const first=mode==='week'?weekStart(value):weekStart(value.slice(0,8)+'01');
    return Array.from({length:mode==='week'?7:42},(_,i)=>add(first,i));
  }
  function events(data, {tasks=true,reminders=true,completed=true}={}) {
    const result=[],projects=new Map((data.projects||[]).map(p=>[p.id,p]));
    if(tasks) for(const t of data.tasks||[]) {
      const start=Time.startAt(t),end=Time.endAt(t),done=t.status==='已完成';
      if(!Number.isFinite(start)||!Number.isFinite(end)||start>end||(!completed&&done))continue;
      const project=projects.get(t.project),parent=projects.get(project?.parentId);
      const color=/^#[0-9a-f]{6}$/i.test(project?.color||'')?project.color:'#8290a5';
      const projectName=project?(parent?parent.title+' / ':'')+project.title:'未分类';
      result.push({color,projectName,group:project?'project:'+project.id:'unassigned',id:t.id,kind:'task',title:t.title,start,end,done,allDay:!t.startTime&&!t.dueTime,record:t});
    }
    if(reminders)for(const r of data.reminders||[]) {
      const start=Date.parse(r.remindAt);if(!Number.isFinite(start)||(!completed&&r.completed))continue;
      result.push({color:'#db6e40',projectName:'提醒事项',group:'reminders',id:r.id,kind:'reminder',title:r.title,start,end:start,done:r.completed,allDay:false,record:r});
    }
    return result.sort((a,b)=>a.start-b.start||a.end-b.end||a.id.localeCompare(b.id));
  }
  function onDay(events,value) {
    const start=date(value);start.setHours(0,0,0,0);const end=date(add(value,1));end.setHours(0,0,0,0);
    return events.filter(e=>e.start<end.getTime()&&e.end>=start.getTime()).sort((a,b)=>Number(b.allDay)-Number(a.allDay)||Math.max(a.start,start.getTime())-Math.max(b.start,start.getTime())||a.end-b.end);
  }
  const clock = ms => new Date(ms).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
  function label(event,day) {
    if(event.kind==='reminder')return clock(event.start);
    const first=key(new Date(event.start)),last=key(new Date(event.end));
    if(event.allDay)return first===last?'全天':'跨日 · 全天';
    return `${first<day?'延续':clock(event.start)} – ${last>day?'次日继续':clock(event.end)}`;
  }
  function timeline(events,day) {
    const minute=ms=>{const d=new Date(ms);return d.getHours()*60+d.getMinutes();};
    const blocks=onDay(events,day).filter(e=>!e.allDay).map(event=>{
      const start=key(new Date(event.start))<day?0:minute(event.start);
      const finish=key(new Date(event.end))>day?1440:minute(event.end);
      return {event,start,end:Math.min(1440,Math.max(start+30,finish))};
    }).sort((a,b)=>a.start-b.start||b.end-a.end);
    let group=[],until=-1;
    function layout(){const lanes=[];for(const b of group){let col=lanes.findIndex(end=>end<=b.start);if(col<0)col=lanes.length;lanes[col]=b.end;b.column=col;}for(const b of group)b.columns=lanes.length;group=[];}
    for(const b of blocks){if(b.start>=until){layout();until=-1;}group.push(b);until=Math.max(until,b.end);}layout();return blocks;
  }
  const api={key,date,add,shiftMonth,weekStart,days,events,onDay,label,timeline};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CalendarCore=api;
})(typeof window!=='undefined'?window:globalThis);
