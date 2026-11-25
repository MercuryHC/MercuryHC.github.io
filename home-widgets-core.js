(function(root){
  'use strict';
  const catalog=[
    {id:'today',title:'今日日程',description:'今天的任务与提醒，支持快速完成。',icon:'◷'},
    {id:'tasks',title:'任务概览',description:'查看待完成、进行中和超时任务。',icon:'☷'},
    {id:'reminders',title:'近期提醒',description:'未来七天及已超时的待办提醒。',icon:'◉'},
    {id:'projects',title:'项目进度',description:'按一级项目汇总任务完成进度。',icon:'▥'}
    ,{id:'month',title:'迷你月历',description:'查看本月日期，打开今日日历。',icon:'▦'},
    {id:'note',title:'快速便签',description:'关联笔记，随手记录并继续编辑。',icon:'▤'},
    {id:'focus',title:'番茄钟',description:'25 分钟专注与 5 分钟休息。',icon:'◴'},
    {id:'countdown',title:'倒数日',description:'记录一个重要日期。',icon:'◷'},
    {id:'quick',title:'快速添加',description:'直接新建任务、提醒或笔记。',icon:'＋'}
  ];
  const defaults=()=>({version:1,widgets:catalog.map(({id})=>({id,enabled:id==='today'||id==='tasks',size:id==='today'?'1x2':'1x1'}))});
  function preferences(value){
    if(!value||value.version!==1||!Array.isArray(value.widgets))return defaults();
    return {version:1,widgets:catalog.map(({id})=>{const item=value.widgets.find(w=>w&&w.id===id);return {id,enabled:typeof item?.enabled==='boolean'?item.enabled:defaults().widgets.find(w=>w.id===id).enabled,size:['1x1','1x2','1x4','2x2'].includes(item?.size)?item.size:({small:'1x1',medium:'1x2',large:'2x2'}[item?.size]||(id==='today'?'1x2':'1x1'))};})};
  }
  function summary(db,now,Calendar){
    const day=Calendar.key(new Date(now)),all=Calendar.events(db),today=Calendar.onDay(all,day).sort((a,b)=>Number(a.done)-Number(b.done)||Number(b.allDay)-Number(a.allDay)||a.start-b.start);
    const tasks=db.tasks||[],pending=tasks.filter(t=>t.status!=='已完成');
    const overdue=all.filter(e=>e.kind==='task'&&!e.done&&e.end<now).length;
    const end=Calendar.date(Calendar.add(day,8));end.setHours(0,0,0,0);
    const reminders=all.filter(e=>e.kind==='reminder'&&!e.done&&e.start<end.getTime()).sort((a,b)=>a.start-b.start);
    const projects=(db.projects||[]).filter(p=>!p.parentId).map(p=>{
      const ids=new Set([p.id,...(db.projects||[]).filter(c=>c.parentId===p.id).map(c=>c.id)]),items=tasks.filter(t=>ids.has(t.project));
      return {id:p.id,title:p.title,color:/^#[0-9a-f]{6}$/i.test(p.color)?p.color:'#8290a5',total:items.length,done:items.filter(t=>t.status==='已完成').length};
    });
    return {day,today,reminders,projects,counts:{total:tasks.length,pending:pending.length,progress:tasks.filter(t=>t.status==='进行中').length,done:tasks.filter(t=>t.status==='已完成').length,overdue}};
  }
  const api={catalog,defaults,preferences,summary};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HomeWidgetsCore=api;
})(typeof window!=='undefined'?window:globalThis);
