/* Node 22+, no dependencies. SendKey stays in the server environment. */
const http=require('node:http'),crypto=require('node:crypto'),fs=require('node:fs/promises'),path=require('node:path');
const Core=require('../notification-core.js');
function createBridge({sendKey,token,origin,dir,site='https://mercuryhc.github.io/',dailyLimit=5,fetcher=fetch,clock=Date.now}){
  if(!/^SCT[a-zA-Z0-9_-]+$/.test(sendKey||''))throw Error('需要 Turbo SCT SendKey 环境变量');
  if(typeof token!=='string'||token.length<32)throw Error('BRIDGE_TOKEN 至少 32 字符');
  if(new URL(origin).origin!==origin||!origin.startsWith('https://'))throw Error('ALLOWED_ORIGIN 必须是 HTTPS 来源');
  if(new URL(site).origin!==origin)throw Error('SITE_URL 必须属于 ALLOWED_ORIGIN');
  if(!Number.isInteger(dailyLimit)||dailyLimit<1||dailyLimit>1000)throw Error('每日限额无效');
  let state,chain=Promise.resolve();
  const serial=fn=>{const p=chain.then(fn);chain=p.catch(()=>{});return p;};
  const file=path.join(dir,'state.json');
  const persist=async()=>{await fs.writeFile(file+'.tmp',JSON.stringify(state),{mode:0o600});await fs.rename(file+'.tmp',file);};
  const ready=(async()=>{
    await fs.mkdir(dir,{recursive:true,mode:0o700});
    try{state=JSON.parse(await fs.readFile(file,'utf8'));Core.validate(state);if(!Number.isInteger(state.revision)||!state.sent||typeof state.sent!=='object'||!Array.isArray(state.attempts))throw Error('state');}
    catch(e){if(e.code!=='ENOENT')throw Error('提醒状态文件损坏，请从备份恢复；未启动发送');state={tasks:[],enabled:false,revision:0,sent:{},attempts:[],updatedAt:null,lastSuccess:null,lastError:null};await persist();}
  })();
  function day(now){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
  async function send(title,desp){
    const now=clock();state.attempts=state.attempts.filter(x=>now-x<172800000);
    if(state.attempts.filter(x=>day(x)===day(now)).length>=dailyLimit)throw Error('已达到后台每日发送限额');
    // Count attempts, including ambiguous network failures, to prevent retry storms.
    state.attempts.push(now);await persist();
    let response,result;
    try{response=await fetcher('https://sctapi.ftqq.com/'+sendKey+'.send',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({title,desp}),signal:AbortSignal.timeout(15000),redirect:'error'});result=await response.json();}
    catch{throw Error('推送网络失败，接收结果未知；稍后受限重试');}
    if(!response.ok||result.code!==0)throw Error('Server酱未接受消息，请检查后台 SendKey、通道和额度');
    state.lastSuccess=clock();state.lastError=null;
  }
  async function tick(){await ready;return serial(async()=>{
    if(!state.enabled)return;
    const now=clock();if(state.lastAttempt&&now-state.lastAttempt<300000)return;
    const items=Core.pending(state.tasks,state.sent,now).slice(0,20);if(!items.length)return;
    state.lastAttempt=now;await persist();
    const clean=s=>s.replace(/[\\`*_{}\[\]()<>!#|]/g,'').replace(/[\r\n]+/g,' ');
    const stamp=ms=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'short',timeStyle:'medium',hour12:false}).format(ms);
    const body=items.map(x=>`- ${clean(x.task.title)} · ${x.task.priority} · ${{red:'红色',yellow:'黄色',green:'绿色'}[x.level]}提醒${x.task.dueAt===null?'':' · 截止 '+stamp(x.task.dueAt)}`).join('\n')+'\n\n[打开个人工作站]('+site+')\n\n时间显示为北京时间；依据最近同步的提醒快照。';
    try{await send('个人工作站：'+items.length+' 项任务提醒',body);for(const x of items)state.sent[x.key]=Core.levels[x.level];}
    catch(e){state.lastError=e.message;}
    await persist();
  });}
  const server=http.createServer(async(req,res)=>{
    const reply=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    if(req.headers.origin&&req.headers.origin!==origin)return reply(403,{error:'来源不允许'});
    res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
    res.setHeader('Access-Control-Allow-Methods','GET, PUT, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, If-Match');
    if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
    const expected=Buffer.from('Bearer '+token),actual=Buffer.from(req.headers.authorization||'');
    if(expected.length!==actual.length||!crypto.timingSafeEqual(expected,actual))return reply(401,{error:'后台访问密钥无效'});
    try{
      await ready;
      await serial(async()=>{
        if(req.method==='GET'&&req.url==='/health')return reply(200,{revision:state.revision,enabled:state.enabled,taskCount:state.tasks.length,updatedAt:state.updatedAt,lastSuccess:state.lastSuccess,lastError:state.lastError,dailyLimit});
        if(req.method==='POST'&&req.url==='/pause'){state.enabled=false;state.revision++;await persist();return reply(200,{enabled:false,revision:state.revision});}
        if(req.method==='POST'&&req.url==='/test'){
          if(state.lastTest&&clock()-state.lastTest<60000)return reply(429,{error:'测试消息请间隔一分钟'});
          state.lastTest=clock();await persist();await send('个人工作站：微信推送测试','Server酱 Turbo 通道已接受此测试请求。请在微信中确认是否收到。');await persist();return reply(200,{accepted:true});
        }
        if(req.method==='PUT'&&req.url==='/tasks'){
          if(req.headers['if-match']!==String(state.revision))return reply(409,{error:'后台快照已更新，请重新连接确认后再同步'});
          let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>2*1024*1024){reply(413,{error:'提醒快照过大'});req.resume();return;}chunks.push(chunk);}
          let value;try{value=JSON.parse(Buffer.concat(chunks).toString());}catch{return reply(400,{error:'JSON 无效'});}
          let clean;try{clean=Core.validate(value);}catch(e){return reply(400,{error:e.message});}
          if(typeof value.enabled!=='boolean')return reply(400,{error:'启用状态无效'});
          state.tasks=clean.tasks;state.enabled=value.enabled;state.revision++;state.updatedAt=clock();
          const keys=new Set(state.tasks.map(Core.signature));state.sent=Object.fromEntries(Object.entries(state.sent).filter(([k])=>keys.has(k)));
          await persist();return reply(200,{revision:state.revision,enabled:state.enabled,taskCount:state.tasks.length,updatedAt:state.updatedAt});
        }
        reply(404,{error:'接口不存在'});
      });
    }catch(e){reply(503,{error:e.message.startsWith('Server酱')||e.message.startsWith('已达到')||e.message.startsWith('推送网络')?e.message:'后台暂不可用，请检查服务状态'});}
  });
  server.requestTimeout=30000;server.headersTimeout=15000;
  return {server,ready,tick};
}
if(require.main===module){
  try{
    const bridge=createBridge({sendKey:process.env.SERVERCHAN_SENDKEY,token:process.env.BRIDGE_TOKEN,origin:process.env.ALLOWED_ORIGIN||'https://mercuryhc.github.io',dir:process.env.DATA_DIR||'/data',site:process.env.SITE_URL||'https://mercuryhc.github.io/',dailyLimit:Number(process.env.DAILY_LIMIT||5)});
    bridge.ready.then(()=>{bridge.server.listen(Number(process.env.PORT||8787),'0.0.0.0',()=>console.log('Server酱提醒后台已启动'));setInterval(()=>bridge.tick().catch(()=>console.error('后台状态写入失败，请检查持久化目录')),60000);return bridge.tick();}).catch(()=>{console.error('后台初始化失败，请检查配置与持久化状态');process.exitCode=1;});
  }catch{console.error('后台配置无效，请检查环境变量');process.exitCode=1;}
}
module.exports={createBridge};
