(() => {
  const host=document.getElementById('bookmarks-workspace'),menu=document.createElement('div');menu.className='home-context-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','组件操作');menu.hidden=true;document.body.append(menu);
  let target=null,timer=null,start=null,suppress=false;
  function close(focus=false){menu.hidden=true;for(const n of host.querySelectorAll('[data-context-open]'))delete n.dataset.contextOpen;if(focus&&target){const n=host.querySelector('[data-widget="'+target+'"]');n?.focus();}target=null;}
  function open(card,x,y){
    if(!card?.dataset.widget)return;close();target=card.dataset.widget;card.tabIndex=0;card.dataset.contextOpen='true';menu.replaceChildren();
    const heading=document.createElement('div');heading.className='context-title';heading.textContent=card.querySelector('h3')?.textContent||'组件';menu.append(heading);
    const label=document.createElement('div');label.className='context-label';label.textContent='布局';menu.append(label);
    const sizes=document.createElement('div');sizes.className='context-sizes';sizes.setAttribute('role','group');sizes.setAttribute('aria-label','卡片尺寸');menu.append(sizes);
    for(const size of ['1x1','1x2','1x4','2x2']){
      const b=document.createElement('button');b.type='button';b.className='context-size';b.setAttribute('role','menuitemradio');b.setAttribute('aria-label',size.replace('x',' × '));b.setAttribute('aria-checked',String(card.dataset.size===size));
      const icon=document.createElement('span');icon.className='context-size-icon';icon.dataset.size=size;icon.setAttribute('aria-hidden','true');const [rows,cols]=size.split('x').map(Number);icon.style.gridTemplateColumns='repeat('+cols+',1fr)';for(let i=0;i<rows*cols;i++)icon.append(document.createElement('i'));
      const text=document.createElement('span');text.textContent=size.replace('x','×');b.append(icon,text);b.onclick=()=>{if(window.HomeWidgets.update(card.dataset.widget,{size})){close(true);const tile=host.querySelector('[data-widget="'+card.dataset.widget+'"]');tile?.animate?.([{opacity:.65,transform:'scale(.98)'},{opacity:1,transform:'scale(1)'}],{duration:170});}};sizes.append(b);
    }
    const line=document.createElement('hr');menu.append(line);
    function item(icon,text,action,cls){const b=document.createElement('button');b.type='button';b.className='context-action '+(cls||'');b.setAttribute('role','menuitem');const symbol=document.createElement('span');symbol.className='context-action-icon';symbol.textContent=icon;symbol.setAttribute('aria-hidden','true');const name=document.createElement('span');name.textContent=text;b.append(symbol,name);b.onclick=()=>{close();action();};menu.append(b);return b;}
    item('⠿','编辑主页',()=>{const edit=document.getElementById('home-desktop-edit');if(edit.getAttribute('aria-pressed')!=='true')edit.click();host.querySelector('[data-widget="'+card.dataset.widget+'"] .desktop-handle')?.focus();});
    item('＋','添加小组件',()=>document.getElementById('home-widgets-customize').click());
    const moves=document.createElement('div');moves.className='context-moves';const moveLabel=document.createElement('span');moveLabel.textContent='移动位置';moves.append(moveLabel);for(const [delta,text] of [[-1,'←'],[1,'→']]){const b=document.createElement('button');b.type='button';b.textContent=text;b.setAttribute('role','menuitem');b.setAttribute('aria-label',delta<0?'向前移动':'向后移动');b.onclick=()=>{window.HomeDesktop.shift('widget:'+card.dataset.widget,delta);close(true);};moves.append(b);}menu.append(moves);
    menu.append(document.createElement('hr'));item('−','移除组件',()=>window.HomeWidgets.update(card.dataset.widget,{enabled:false}),'context-danger');
    menu.hidden=false;menu.style.left=Math.max(8,Math.min(x,window.innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(y,window.innerHeight-menu.offsetHeight-8))+'px';menu.style.transformOrigin=(x>window.innerWidth/2?'right':'left')+' top';menu.querySelector('[aria-checked="true"]').focus({preventScroll:true});
  }
  host.addEventListener('contextmenu',e=>{const card=e.target.closest('.home-widget');if(!card||e.target.closest('input,textarea,select'))return;e.preventDefault();open(card,e.clientX,e.clientY);});
  host.addEventListener('keydown',e=>{if(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10'){const card=e.target.closest('.home-widget');if(card){e.preventDefault();const r=card.getBoundingClientRect();open(card,r.left+12,r.top+30);}}});
  host.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch'||e.target.closest('input,textarea,select,.desktop-handle'))return;const card=e.target.closest('.home-widget');if(!card)return;clearTimeout(timer);start={x:e.clientX,y:e.clientY};timer=setTimeout(()=>{suppress=true;open(card,e.clientX,e.clientY);},550);});
  host.addEventListener('pointermove',e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>10){clearTimeout(timer);start=null;}});
  for(const type of ['pointerup','pointercancel'])host.addEventListener(type,()=>{clearTimeout(timer);start=null;setTimeout(()=>{suppress=false;},400);});
  host.addEventListener('click',e=>{if(suppress){e.preventDefault();e.stopPropagation();suppress=false;}},true);
  document.addEventListener('pointerdown',e=>{if(!menu.hidden&&!menu.contains(e.target))close();});
  document.addEventListener('keydown',e=>{if(menu.hidden)return;if(e.key==='Escape'){e.preventDefault();close(true);}else if(e.key==='Tab')close();else if(['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const items=[...menu.querySelectorAll('button')],i=items.indexOf(document.activeElement);items[e.key==='Home'?0:e.key==='End'?items.length-1:(i+(['ArrowDown','ArrowRight'].includes(e.key)?1:-1)+items.length)%items.length].focus();}});
  window.addEventListener('resize',()=>close());window.HomeContext={open};
})();
