(() => {
  'use strict';
  const notes=window.Notes,todos=window.TaskTodos,$=id=>document.getElementById(id),form=$('task-form'),area=form.elements.note,preview=$('note-preview'),TIME_KEY='workstation-task-timestamp-hints-v1';
  let draft=[],archive='',baseline='',pending=null,enter=false;
  function dismissTime(){pending=null;$('task-note-time-hint').hidden=true;}
  function refresh(){const result=notes.parse(area.value,{timeBadges:true});preview.innerHTML=result.html||'<p class="notes-placeholder">记录任务推进过程，支持 Markdown。</p>';$('note-checklist-progress').textContent=`Markdown 过程记录 · ${area.value.length} 字符`;}
  function hintTime(){if(!$('task-note-time-enabled').checked||area.selectionStart!==area.selectionEnd)return;const pos=area.selectionStart;if(pos===0||area.value[pos-1]!=='\n')return;pending={value:area.value,pos};$('task-note-time-text').textContent=todos.timestamp().trim().slice(1,-1);$('task-note-time-hint').hidden=false;}
  function acceptTime(){if(!pending||area.value!==pending.value||area.selectionStart!==pending.pos||area.selectionEnd!==pending.pos){dismissTime();return false;}const stamp=todos.timestamp();if(area.value.length+stamp.length>50000){dismissTime();toast('备注已达到 50000 字符限制。');return false;}area.setRangeText(stamp,pending.pos,pending.pos,'end');dismissTime();area.focus();refresh();return true;}
  function snapshot(task){return JSON.stringify(todos.fields(task));}
  function syncStatus(){form.elements.status.value=todos.statusFor(draft,form.elements.status.value);}
  function persistTodos(){
    syncStatus();const task=db.tasks.find(t=>t.id===editing);
    if(task){
      const current=todos.migrate(task);
      if(snapshot(current)!==baseline)throw Error('分解事项已由其他操作更新，请重新打开任务后再修改。');
      const next={note:current.note,...todos.fields({todoVersion:1,todos:draft,todoSourceNote:archive||undefined}),status:form.elements.status.value};
      const line=todos.completionLine(task,next),draftNote=todos.appendLog(area.value,line);
      next.note=todos.appendLog(next.note,line);
      Object.assign(task,next);baseline=snapshot(task);save();
      if(line){area.value=draftNote;dismissTime();refresh();}
      $('task-todo-hint').textContent='分解事项与自动完成时间已保存；任务其他字段及过程记录请点击保存任务。';
    }else $('task-todo-hint').textContent='新任务的分解事项将在点击保存任务后保存。';
  }

  function change(fn){const before=draft.map(t=>({...t})),status=form.elements.status.value;try{fn();draft=todos.normalize(draft);persistTodos();}catch(e){draft=before;form.elements.status.value=status;toast(e.message);}drawTodos();}
  function drawTodos(){const box=$('task-todo-list');box.replaceChildren();const done=draft.filter(t=>t.done).length;$('task-todo-progress').textContent=draft.length?`${done} / ${draft.length} 已完成`:'暂无分解事项';$('task-todo-empty').hidden=!!draft.length;
    for(const item of draft){const row=document.createElement('div');row.className='task-todo-row';row.dataset.done=String(item.done);row.dataset.todoId=item.id;const check=document.createElement('input');check.type='checkbox';check.checked=item.done;check.setAttribute('aria-label','完成 TODO：'+item.text);check.onchange=()=>{change(()=>item.done=check.checked);const next=[...$('task-todo-list').children].find(r=>r.dataset.todoId===item.id);next?.firstElementChild?.focus({preventScroll:true});};const text=document.createElement('input');text.type='text';text.value=item.text;text.maxLength=50000;text.className='task-todo-text';text.setAttribute('aria-label','TODO 内容');text.onchange=()=>change(()=>item.text=text.value);text.onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();text.blur();}};const remove=document.createElement('button');remove.type='button';remove.className='task-todo-remove';remove.textContent='×';remove.title='删除此 TODO';remove.setAttribute('aria-label','删除 TODO：'+item.text);remove.onclick=()=>change(()=>draft=draft.filter(t=>t.id!==item.id));row.append(check,text,remove);box.append(row);}
    $('task-todo-archive').hidden=!archive;$('task-todo-source').textContent=archive;
  }
  function add(){const input=$('task-todo-new'),text=input.value.trim();if(!text){input.focus();return;}const previous=draft.length;change(()=>draft.push({id:crypto.randomUUID(),text,done:false}));if(draft.length>previous)input.value='';input.focus();}
  $('task-todo-add').onclick=()=>{$('task-todo-composer').hidden=false;$('task-todo-new').focus();};$('task-todo-confirm').onclick=add;$('task-todo-new').addEventListener('keydown',e=>{if(e.isComposing)return;if(e.key==='Enter'){e.preventDefault();add();}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();$('task-todo-composer').hidden=true;}});
  window.TaskTodoEditor={value:()=>todos.fields({todoVersion:1,todos:draft,todoSourceNote:archive||undefined})};
  window.loadTaskNotes=task=>{const source=todos.migrate(task||db.tasks.find(t=>t.id===editing)||{note:area.value,status:form.elements.status.value});draft=source.todos.map(t=>({...t}));archive=source.todoSourceNote||'';baseline=snapshot(source);area.value=source.note||'';form.elements.status.value=source.status||form.elements.status.value;$('task-todo-new').value='';$('task-todo-composer').hidden=true;$('task-todo-archive').open=false;dismissTime();enter=false;try{$('task-note-time-enabled').checked=localStorage.getItem(TIME_KEY)!=='false';}catch{$('task-note-time-enabled').checked=true;}$('notes-save-hint').textContent='过程记录与任务状态独立；Markdown 清单仅用于记录，不控制主任务完成。修改后点击保存任务。';$('task-todo-hint').textContent=editing?'分解事项会自动保存；全部完成后自动完成主任务，取消任一项会恢复为进行中。':'全部 TODO 完成后自动完成主任务；没有 TODO 时仍手动完成。';drawTodos();refresh();};
  form.elements.status.addEventListener('change',()=>{const selected=form.elements.status.value;syncStatus();if(selected!==form.elements.status.value)toast('主任务完成状态由独立 TODO 的完成情况决定。');});
  area.addEventListener('input',e=>{const newline=!e.isComposing&&(enter||e.inputType==='insertLineBreak'||e.inputType==='insertParagraph');dismissTime();refresh();enter=false;if(newline)hintTime();});
  area.addEventListener('compositionstart',()=>{enter=false;dismissTime();});
  area.addEventListener('click',()=>{if(pending&&(area.selectionStart!==pending.pos||area.selectionEnd!==pending.pos))dismissTime();});
  preview.addEventListener('change',event=>{const c=event.target.closest('[data-note-line]');if(!c)return;try{area.value=notes.toggle(area.value,Number(c.dataset.noteLine),c.checked);dismissTime();refresh();}catch(e){toast(e.message);refresh();}});
  function wrap(before,after=before,placeholder='文字'){dismissTime();const start=area.selectionStart,end=area.selectionEnd;area.setRangeText(before+(area.value.slice(start,end)||placeholder)+after,start,end,'select');area.focus();area.setSelectionRange(start+before.length,start+before.length+(end-start||placeholder.length));refresh();}
  function prefix(value){dismissTime();const start=area.selectionStart,end=area.selectionEnd,text=area.value,left=text.lastIndexOf('\n',start-1)+1;let right=text.indexOf('\n',end);if(right<0)right=text.length;area.setRangeText((text.slice(left,right)||'记录内容').split('\n').map(line=>value+line).join('\n'),left,right,'select');area.focus();refresh();}
  document.querySelectorAll('[data-note-format]').forEach(button=>button.onclick=()=>{const a=button.dataset.noteFormat;if(a==='bold')wrap('**');else if(a==='italic')wrap('*');else if(a==='strike')wrap('~~');else if(a==='code')wrap('`');else if(a==='list')prefix('- ');else if(a==='heading')prefix('### ');else if(a==='link')wrap('[','](https://example.com)','链接文字');});
  $('notes-view').onchange=e=>{const mode=e.target.value;$('note-editor').hidden=mode==='preview';$('note-preview-wrap').hidden=mode==='edit';dismissTime();refresh();};
  $('task-note-time-enabled').onchange=e=>{try{localStorage.setItem(TIME_KEY,String(e.target.checked));}catch{toast('时间提示偏好无法保存。');}dismissTime();};$('task-note-time-accept').onclick=acceptTime;$('task-note-time-dismiss').onclick=()=>{dismissTime();area.focus();};
  area.addEventListener('keydown',e=>{if(e.isComposing||e.keyCode===229)return;if(e.key==='Tab'&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&pending){e.preventDefault();acceptTime();return;}if(e.key==='Escape'&&pending){e.preventDefault();e.stopPropagation();dismissTime();return;}if(e.key==='Enter')enter=true;else if(!['Shift','Control','Meta','Alt'].includes(e.key)){enter=false;dismissTime();}if((e.ctrlKey||e.metaKey)&&['b','i'].includes(e.key.toLowerCase())){e.preventDefault();wrap(e.key.toLowerCase()==='b'?'**':'*');}});
})();
