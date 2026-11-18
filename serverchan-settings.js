/* Browser stores only the service address. Access token stays in this tab. */
(()=>{
  'use strict';
  const $=id=>document.getElementById(id),Core=window.TaskNotifications;
  let endpoint='',token='',revision=null,active=false,busy=false,last='',timer;
  try{$('sc-url').value=localStorage.getItem('workstation-reminder-endpoint')||'';}catch{}
  function status(text,error=false){$('sc-status').textContent=text;$('sc-status').dataset.error=String(error);}
  function controls(){for(const id of ['sc-connect','sc-enable','sc-test','sc-pause','sc-url','sc-token'])$(id).disabled=busy;}
  function config(){
    const url=new URL($('sc-url').value.trim());
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('请填写后台 HTTPS 来源地址，例如 https://remind.example.com');
    const key=$('sc-token').value.trim();if(key.length<32)throw Error('后台访问密钥至少 32 字符；这里不是 Server酱 SendKey');
    const next=url.origin;if(next!==endpoint||key!==token){active=false;revision=null;last='';}endpoint=next;token=key;
    try{localStorage.setItem('workstation-reminder-endpoint',endpoint);}catch{}
  }
  async function request(route,method='GET',body){
    const headers={Authorization:'Bearer '+token};if(body){headers['Content-Type']='application/json';headers['If-Match']=String(revision);}
    let res;try{res=await fetch(endpoint+route,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000),credentials:'omit',redirect:'error'});}catch{throw Error('无法访问提醒后台，请检查 HTTPS、跨域配置与网络；后台原有提醒状态不受此连接失败影响。');}
    const value=await res.json();if(!res.ok)throw Error(value.error||'提醒后台请求失败');return value;
  }
  async function run(fn){if(busy)return;busy=true;controls();try{config();await fn();}catch(e){active=false;status(e.message,true);}finally{busy=false;controls();}}
  function snapshot(){return Core.validate(Core.snapshot(db));}
  async function upload(){
    const value=snapshot(),fingerprint=JSON.stringify(value);if(active&&fingerprint===last)return;
    const result=await request('/tasks','PUT',{...value,enabled:true});revision=result.revision;last=fingerprint;active=true;
    status('已启用：后台保存 '+result.taskCount+' 项任务的提醒快照。后续本页任务变更自动同步；网页关闭后由后台继续检查。');
  }
  $('sc-connect').onclick=()=>run(async()=>{
    const result=await request('/health');revision=result.revision;active=false;last='';
    status('后台已连接，提醒'+(result.enabled?'已启用':'未启用')+'，快照 '+result.taskCount+' 项；最近同步：'+(result.updatedAt?new Date(result.updatedAt).toLocaleString():'无')+'。'+(result.lastError?'最近推送提示：'+result.lastError+'。':'')+'点击“启用并同步本机任务”后才会覆盖后台快照。');
  });
  $('sc-enable').onclick=()=>run(async()=>{if(revision===null)throw Error('请先连接后台，查看当前快照状态。');last='';await upload();});
  $('sc-test').onclick=()=>run(async()=>{await request('/test','POST');status('Server酱已接受测试消息，请在微信中确认收到；此结果不等于手机已送达。');});
  $('sc-pause').onclick=()=>run(async()=>{const result=await request('/pause','POST');revision=result.revision;active=false;last='';status('后台推送已暂停。测试消息仍可手动发送。');});
  for(const id of ['sc-url','sc-token'])$(id).addEventListener('input',()=>{active=false;revision=null;status('配置已修改，请重新连接。后台原有推送不会自动暂停。');});
  timer=setInterval(()=>{if(active&&!busy)run(upload);},10000);
  window.addEventListener('online',()=>{if(active&&!busy)run(upload);});
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
})();
