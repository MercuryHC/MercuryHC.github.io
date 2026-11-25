(function(root){
  'use strict';
  const Reminders=typeof module!=='undefined'&&module.exports?require('./reminders-core.js'):root.ReminderCore;
  const levels={green:1,yellow:2,red:3};
  function snapshot(db){
    return {tasks:db.tasks.map(t=>{
      const dueAt=root.TaskTime.endAt(t),startAt=root.TaskTime.startAt(t);
      let greenAt=null;
      if(Number.isFinite(dueAt)&&Number.isFinite(startAt)&&dueAt-startAt>86400000){
        const [y,m,d]=t.due.split('-').map(Number);greenAt=new Date(y,m-1,d-1,12).getTime();
      }
      return {id:t.id,title:t.title,status:t.status,priority:t.priority,dueAt:Number.isFinite(dueAt)?dueAt:null,greenAt};
    }),reminders:Reminders.normalize(db.reminders)};
  }
  function validate(value){
    if(!value||!Array.isArray(value.tasks)||value.tasks.length>10000)throw Error('提醒快照无效');
    const ids=new Set();
    return {tasks:value.tasks.map(t=>{
      if(!t||typeof t.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(t.id)||ids.has(t.id)||typeof t.title!=='string'||!t.title.trim()||t.title.length>500||!['待开始','进行中','已完成'].includes(t.status)||!['低','中','高','加急⚡'].includes(t.priority))throw Error('任务提醒字段无效');
      for(const k of ['dueAt','greenAt'])if(t[k]!==null&&(!Number.isSafeInteger(t[k])||Math.abs(t[k])>8640000000000000))throw Error('任务时间无效');
      ids.add(t.id);return {id:t.id,title:t.title,status:t.status,priority:t.priority,dueAt:t.dueAt,greenAt:t.greenAt};
    }),reminders:Reminders.normalize(value.reminders)};
  }
  function level(t,now){
    if(t.status==='已完成')return null;
    if(t.priority==='加急⚡')return 'red';
    if(t.priority!=='高'||t.dueAt===null)return null;
    if(t.dueAt-now<3600000)return 'red';
    if(t.dueAt-now<21600000)return 'yellow';
    return t.greenAt!==null&&now>=t.greenAt?'green':null;
  }
  function signature(t){return JSON.stringify([t.id,t.priority,t.priority==='加急⚡'?null:t.dueAt]);}
  function pending(tasks,sent,now){return tasks.map(t=>({task:t,level:level(t,now),key:signature(t)})).filter(x=>x.level&&(sent[x.key]||0)<levels[x.level]).sort((a,b)=>levels[b.level]-levels[a.level]);}
  function reminderSignature(r){return JSON.stringify(['reminder',r.id,r.remindAt]);}
  function pendingReminders(reminders,sent,now){return (reminders||[]).filter(r=>!r.completed&&Date.parse(r.remindAt)<=now&&!sent[reminderSignature(r)]).map(r=>({task:{...r,kind:'reminder',priority:'提醒事项',dueAt:Date.parse(r.remindAt)},level:'red',key:reminderSignature(r)}));}
  function pendingAll(value,sent,now){return [...pendingReminders(value.reminders,sent,now),...pending(value.tasks,sent,now)];}
  const api={snapshot,validate,level,signature,pending,levels,reminderSignature,pendingReminders,pendingAll};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TaskNotifications=api;
})(typeof window!=='undefined'?window:globalThis);
