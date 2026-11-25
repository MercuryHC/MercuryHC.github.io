const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const {document}=parseHTML(fs.readFileSync('index.html','utf8'));const $=id=>document.getElementById(id),saved=new Map();let fail=false;
$('home-widgets-grid').innerHTML='<section class="home-widget" data-widget="today"><h3>Today</h3></section><section class="home-widget" data-widget="tasks"><h3>Tasks</h3></section>';
$('bm-grid').innerHTML='<div class="bookmark-card" data-bookmark-id="b"><strong>Book</strong></div><div class="bookmark-card" data-bookmark-id="c"><strong>Second</strong></div>';
const context={document,window:{addEventListener(){}},localStorage:{getItem:k=>saved.get(k),setItem(k,v){if(fail)throw Error('quota');saved.set(k,v)}}};vm.createContext(context);vm.runInContext(fs.readFileSync('home-desktop.js','utf8'),context);
$('home-desktop-edit').onclick();const tile=document.querySelector('[data-desktop-id="bookmark:c"]'),handle=tile.querySelector('button');handle.onkeydown({key:'ArrowLeft',preventDefault(){}});assert.deepEqual(JSON.parse(saved.get('workstation-desktop-order-v1')),['widget:today','widget:tasks','bookmark:c','bookmark:b']);
const before=tile.style.order;fail=true;handle.onkeydown({key:'ArrowRight',preventDefault(){}});assert.equal(tile.style.order,before);assert($('home-widgets-error').textContent);fail=false;
context.window.HomeDesktop.refresh();assert.equal(tile.querySelectorAll('.desktop-handle').length,1);
let clockFn;context.Date=Date;context.queueMicrotask=fn=>fn();context.setInterval=fn=>clockFn=fn;context.window.CalendarCore=require('./calendar-core');vm.runInContext(fs.readFileSync('home-extras.js','utf8'),context);
let quickBody='';context.window.NotesWorkspace={quickNote:{read:()=>quickBody,write:value=>{quickBody=value;return true;},open(){}}};
const body=document.createElement('div');$('home-widgets-grid').append(body);context.window.HomeExtras.render('note',body,'2x4');const note=body.querySelector('textarea');note.value='<b>note</b>';note.oninput();assert.equal(quickBody,'<b>note</b>');assert.equal(body.querySelector('b'),null);
body.replaceChildren();context.window.HomeExtras.render('focus',body,'2x4');body.querySelector('[data-focus-start]').onclick();assert(JSON.parse(saved.get('workstation-home-extras-v1')).timer.end>Date.now());body.querySelector('[data-focus-start]').onclick();assert(JSON.parse(saved.get('workstation-home-extras-v1')).timer.remaining>0);
body.replaceChildren();context.window.HomeExtras.render('countdown',body,'2x4');const date=body.querySelector('input[type=date]');date.value=context.window.CalendarCore.key(new Date());date.onchange();assert.equal(body.querySelector('strong').textContent,'就是今天');
body.replaceChildren();context.window.HomeExtras.render('month',body,'2x2');assert(body.querySelector('[aria-current=date]'));
console.log('PASS: separate column ordering, quota rollback, stable controls, note persistence, timer start/pause, date countdown and month calendar');

body.replaceChildren();context.window.HomeExtras.render('focus',body,'1x1');assert(body.querySelector('.extra-compact'));assert.equal(body.querySelector('.extra-actions'),null);
context.window.HomeWidgetsCore=require('./home-widgets-core');context.window.BookmarksCore=require('./bookmarks-core');
const layout=context.window.HomeDesktop.storageExport();assert.equal(layout.widgets.length,9);
const reversed={version:1,order:['widget:tasks','widget:today','bookmark:b','bookmark:c'],widgets:layout.widgets.map(w=>({...w,size:w.id==='today'?'4x4':w.size}))};
context.window.HomeDesktop.storageImport(reversed);assert.equal(JSON.parse(saved.get('workstation-home-widgets-v1')).widgets[0].size,'4x4');assert.equal(document.querySelector('[data-widget="tasks"]').style.order,'0');
fail=true;assert.throws(()=>context.window.HomeDesktop.storageImport({...reversed,order:[]}));fail=false;assert.equal(context.window.HomeDesktop.storageExport().order[0],'widget:tasks');
const source=document.querySelector('[data-widget="tasks"]'),target=document.querySelector('[data-widget="today"]');source.setPointerCapture=()=>{};target.getBoundingClientRect=()=>({left:0,width:100});document.elementFromPoint=()=>target;
function pointer(type){const e=new document.defaultView.Event(type,{bubbles:true,cancelable:true});Object.assign(e,{button:0,pointerId:7,clientX:90,clientY:10});source.dispatchEvent(e);}
pointer('pointerdown');assert.equal(source.dataset.dragging,'true');pointer('pointermove');pointer('pointerup');assert.equal(context.window.HomeDesktop.storageExport().order[0],'widget:today');
console.log('PASS: whole-card pointer drag and layout import/export including sizes and quota rollback');
