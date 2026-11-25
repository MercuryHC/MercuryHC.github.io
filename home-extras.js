(() => {
  const KEY='workstation-home-extras-v1',C=window.CalendarCore;
  let state={};try{state=JSON.parse(localStorage.getItem(KEY))||{};}catch{}
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  function save(next){try{localStorage.setItem(KEY,JSON.stringify(next));state=next;document.getElementById('home-widgets-error').textContent='';return true;}catch{document.getElementById('home-widgets-error').textContent='保存失败，请检查浏览器存储空间。';return false;}}
  const button=(text,fn)=>{const n=node('button',text);n.type='button';n.onclick=fn;return n;};
  function task(){document.querySelector('[data-app="task"]')?.click();}
  function render(id,body,size){
    if(!['month','note','focus','countdown','quick'].includes(id))return false;
    body.classList.add('home-extra',`extra-${id}`);
    if(id==='month'){
      const now=new Date(),day=C.key(now),head=node('div',now.toLocaleDateString('zh-CN',{year:'numeric',month:'long'}),'extra-month-title');body.append(head);
      if(size==='1x1'){body.append(button(String(now.getDate()),()=>{task();window.TaskCalendar.openToday();}),node('small',now.toLocaleDateString('zh-CN',{weekday:'long'})));}
      else{const grid=node('div',undefined,'extra-month-grid');for(const d of ['一','二','三','四','五','六','日'])grid.append(node('small',d));for(const d of C.days(day).filter(d=>d.slice(0,7)===day.slice(0,7))){if(d.endsWith('01'))for(let i=0;i<(C.date(d).getDay()+6)%7;i++)grid.append(node('span'));const b=button(String(Number(d.slice(-2))),()=>{task();window.TaskCalendar.openDay?.(d);});if(d===day)b.setAttribute('aria-current','date');grid.append(b);}body.append(grid);}
    }
    if(id==='note'){
      const api=window.NotesWorkspace?.quickNote,input=node('textarea'),status=node('small');
      // Only retire the legacy draft after the shared notebook has persisted it.
      if(api && typeof state.note==='string' && state.note){
        const current=api.read(),legacy=state.note;
        if(current===legacy || current.endsWith('\n\n'+legacy) || api.write(current?current+'\n\n'+legacy:legacy)){
          const next={...state};delete next.note;save(next);
        }
      }
      input.value=api?api.read():(state.note||'');input.placeholder='记下此刻的想法…';
      input.setAttribute('aria-label','快速便签');input.disabled=!api;
      status.textContent=api?'关联笔记 · 自动保存到本机':'笔记暂不可用';
      input.oninput=()=>{status.textContent=api.write(input.value)?'已保存到笔记':'保存失败，请保留当前内容后重试';};
      body.append(input,status,button('在笔记中打开 ↗',()=>api?.open()));
    }
    if(id==='focus'){
      const clock=node('strong','','extra-timer');clock.dataset.focusClock='true';const actions=node('div',undefined,'extra-actions');
      const start=button('',()=>{const t=state.timer||{};if(t.end>Date.now())save({...state,timer:{remaining:t.end-Date.now(),mode:t.mode}});else save({...state,timer:{end:Date.now()+(t.remaining||(t.mode==='rest'?300000:1500000)),mode:t.mode||'focus'}});tick();});start.dataset.focusStart='true';
      const rest=button('休息',()=>{save({...state,timer:{remaining:300000,mode:'rest'}});tick();});const reset=button('重置',()=>{save({...state,timer:{remaining:1500000,mode:'focus'}});tick();});actions.append(start,rest,reset);body.append(clock,actions,node('small','页面关闭时不发送通知'));queueMicrotask(tick);
    }
    if(id==='countdown'){
      const title=node('input');title.placeholder='重要日子';title.value=state.countdown?.title||'';title.maxLength=80;title.setAttribute('aria-label','倒数日名称');const date=node('input');date.type='date';date.value=state.countdown?.date||'';date.setAttribute('aria-label','倒数日日期');const value=node('strong','','countdown-value');
      const update=()=>{const d=date.value;if(!/^\d{4}-\d{2}-\d{2}$/.test(d)){value.textContent='选择日期';return;}const today=C.key(new Date()),days=Math.round((Date.parse(d+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);value.textContent=days===0?'就是今天':days>0?`${days} 天后`:`已过 ${-days} 天`;};
      const change=()=>{save({...state,countdown:{title:title.value,date:date.value}});update();};title.onchange=date.onchange=change;body.append(title,value,date);update();
    }
    if(id==='quick'){body.append(button('＋ 任务',()=>{task();openTask(null);}),button('＋ 提醒',()=>{task();const d=new Date();d.setMinutes(d.getMinutes()+30);window.RemindersWorkspace.createAt(C.key(d)+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'));}),button('＋ 笔记',()=>{document.querySelector('[data-app="notion"]')?.click();document.getElementById('nb-new')?.click();}));}
    return true;
  }
  function tick(){const t=state.timer||{},remaining=t.end?Math.max(0,t.end-Date.now()):(t.remaining??1500000),seconds=Math.ceil(remaining/1000);for(const n of document.querySelectorAll('[data-focus-clock]'))n.textContent=remaining===0?'计时结束':`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;for(const n of document.querySelectorAll('[data-focus-start]'))n.textContent=t.end>Date.now()?'暂停':remaining===0?'再来一次':'开始';}
  setInterval(tick,1000);window.HomeExtras={render};
})();
