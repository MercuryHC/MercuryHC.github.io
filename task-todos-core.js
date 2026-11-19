/* Structured task decomposition; Markdown remains an independent progress log. */
(function(root){
  'use strict';
  const notes=()=>root.Notes||(typeof module!=='undefined'?require('./notes-core'):null);
  function normalize(items){if(!Array.isArray(items)||items.length>1000)throw Error('TODO 分解数量或格式无效。');const ids=new Set();let size=0;return items.map(t=>{if(!t||typeof t.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(t.id)||ids.has(t.id)||typeof t.text!=='string'||!t.text.trim()||typeof t.done!=='boolean')throw Error('TODO 内容或 ID 无效。');ids.add(t.id);const text=t.text.trim();size+=text.length;if(size>50000)throw Error('TODO 总内容超过 50000 字符。');return {id:t.id,text,done:t.done};});}
  function statusFor(items,status='待开始'){if(!items.length)return status;return items.every(t=>t.done)?'已完成':status==='已完成'?'进行中':status;}
  function migrate(task){let out={...task};if(task.todoVersion!=null&&task.todoVersion!==1)throw Error('不支持的 TODO 数据版本。');if(task.todoVersion===1||task.todos!==undefined){out.todos=normalize(task.todos===undefined?[]:task.todos);}else{const source=typeof task.note==='string'?task.note:'',lines=source.split('\n'),parsed=notes().parse(source).todos;out.todos=parsed.map(t=>({id:'legacy_'+t.line,text:lines[t.line].replace(/^\s*(?:[-+*]|\d+[.)])\s+\[[ xX]\]\s*/,'').trim()||'未命名事项',done:t.checked}));out.todos=normalize(out.todos);if(out.todos.length){out.todoSourceNote=source;const removed=new Set(parsed.map(t=>t.line));out.note=lines.filter((line,index)=>!removed.has(index)).join('\n').replace(/^\s*\n|\n\s*$/g,'');}}
    if(out.todoSourceNote!==undefined&&(typeof out.todoSourceNote!=='string'||out.todoSourceNote.length>50000))throw Error('TODO 迁移留档格式无效。');out.todoVersion=1;out.status=statusFor(out.todos,out.status);return out;}
  function fields(task,reset=false){const t=migrate(task);return {todoVersion:1,todos:t.todos.map(v=>({...v,done:reset?false:v.done})),...(t.todoSourceNote!==undefined?{todoSourceNote:t.todoSourceNote}:{})};}
  function migrateData(data){return {...data,tasks:(data.tasks||[]).map(migrate),...(data.schedules?{schedules:data.schedules.map(s=>{const {status,...template}=migrate(s.template);return {...s,template};})}:{})};}
  const pad=n=>String(n).padStart(2,'0');
  const timestamp=(date=new Date())=>`[${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}] `;
  function completionLine(previous,next,date=new Date()){return next.status==='已完成'&&previous?.status!=='已完成'?timestamp(date)+'任务已完成':'';}
  function appendLog(note,line){const source=typeof note==='string'?note:'';if(!line)return source;const result=source+(source?(source.endsWith('\n\n')?'':source.endsWith('\n')?'\n':'\n\n'):'')+line;if(result.length>50000)throw Error('过程记录已接近 50000 字符，无法追加完成时间；请先整理记录再完成任务。');return result;}
  const api={normalize,statusFor,migrate,fields,migrateData,timestamp,completionLine,appendLog};if(typeof module!=='undefined')module.exports=api;else root.TaskTodos=api;
})(typeof window!=='undefined'?window:globalThis);
