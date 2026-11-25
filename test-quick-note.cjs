const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{parseHTML}=require('linkedom');
const {window,document}=parseHTML(fs.readFileSync('index.html','utf8')),store=new Map();let fail=false;
window.WorkstationGitHub={context:()=>({key:'test',connected:false})};window.Notes={parse:()=>({html:''})};
const c={window,document,Event:window.Event,localStorage:{getItem:k=>store.get(k)||null,setItem(k,v){if(fail)throw Error('quota');store.set(k,v)}},setInterval(){},queueMicrotask:fn=>fn(),Date,crypto:require('node:crypto').webcrypto};vm.createContext(c);
for(const f of ['directory-tree.js','workstation.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);
const api=window.NotesWorkspace.quickNote;
assert(api.write('shared'));api.open();assert.equal(document.getElementById('nb-body').value,'shared');
document.getElementById('nb-body').value='from notebook';document.getElementById('nb-body').dispatchEvent(new window.Event('input'));assert.equal(api.read(),'from notebook');
fail=true;assert.equal(api.write('lost'),false);assert.equal(api.read(),'from notebook');fail=false;
store.set('workstation-home-extras-v1',JSON.stringify({note:'legacy'}));vm.runInContext(fs.readFileSync('home-extras.js','utf8'),c);
const body=document.createElement('div');window.HomeExtras.render('note',body,'2x4');assert.equal(api.read(),'from notebook\n\nlegacy');assert.equal(JSON.parse(store.get('workstation-home-extras-v1')).note,undefined);
body.replaceChildren();window.HomeExtras.render('note',body,'2x4');assert.equal(api.read(),'from notebook\n\nlegacy');assert.equal(window.NotesWorkspace.storageExport().notes.length,1);
console.log('PASS: shared note editing, quota rollback, legacy migration without duplicates and normal backup export');

assert(api.create());assert.equal(api.read(),'');assert(api.write('second'));const second=api.selected();assert.equal(api.list().length,2);assert(api.select('quick-note.md'));assert.equal(api.read(),'from notebook\n\nlegacy');assert(api.select(second));assert.equal(api.read(),'second');fail=true;assert.equal(api.create(),false);assert.equal(api.selected(),second);fail=false;
