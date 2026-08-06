(function(global){
'use strict';
const cfg=global.AIT_BACKEND_CONFIG||{};
const storageKey=cfg.tokenStorageKey||'ait_geomine_session_v2';
let loginOverlay=null,loginFrame=null,messageHandlerInstalled=false;
let bridgeFrame=null,bridgeReady=false,bridgePromise=null,bridgeResolve=null,bridgeReject=null;
const pending=new Map();
function state(){try{return JSON.parse(sessionStorage.getItem(storageKey)||'null')}catch(e){return null}}
function save(v){sessionStorage.setItem(storageKey,JSON.stringify(v))}
function clear(){sessionStorage.removeItem(storageKey)}
function requireConfig(){if(!cfg.webAppUrl||cfg.webAppUrl.includes('PASTE_'))throw new Error('ضع رابط Apps Script /exec داخل backend-config.js');}
function requestId(){return 'WEB-'+Date.now()+'-'+Math.random().toString(36).slice(2)}
function isTrustedAppsScriptOrigin(origin){
  try{
    const u=new URL(origin),h=String(u.hostname||'').toLowerCase();
    return u.protocol==='https:'&&(h==='script.google.com'||h==='script.googleusercontent.com'||h.endsWith('-script.googleusercontent.com'));
  }catch(e){return false}
}
function installMessageHandler(){
  if(messageHandlerInstalled)return;
  messageHandlerInstalled=true;
  global.addEventListener('message',function(ev){
    if(!isTrustedAppsScriptOrigin(ev.origin))return;
    const d=ev.data||{};
    if(d.type==='AIT_BRIDGE_READY'&&bridgeFrame&&ev.source===bridgeFrame.contentWindow){
      bridgeReady=true;if(bridgeResolve)bridgeResolve(true);bridgeResolve=null;bridgeReject=null;return;
    }
    if(d.type==='AIT_BRIDGE_RESPONSE'&&pending.has(d.id)){
      const item=pending.get(d.id);pending.delete(d.id);clearTimeout(item.timer);item.resolve(d.payload);return;
    }
    if(d.type==='AIT_AUTH_SUCCESS'){
      save({token:d.token,user:d.user,expiresAt:d.expiresAt,allowedPages:d.allowedPages||[]});
      closeLogin();
      global.dispatchEvent(new CustomEvent('ait:login',{detail:state()}));
    }
  });
}
function ensureBridge(){
  requireConfig();installMessageHandler();
  if(bridgeReady&&bridgeFrame)return Promise.resolve(true);
  if(bridgePromise)return bridgePromise;
  bridgePromise=new Promise((resolve,reject)=>{
    bridgeResolve=resolve;bridgeReject=reject;
    bridgeFrame=document.createElement('iframe');
    bridgeFrame.title='AIT secure data bridge';
    bridgeFrame.setAttribute('aria-hidden','true');
    bridgeFrame.style.cssText='position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;border:0;left:-9999px;top:-9999px';
    bridgeFrame.src=cfg.webAppUrl+'?page=bridge&parent_origin='+encodeURIComponent(cfg.githubOrigin||location.origin)+'&v=43';
    document.body.appendChild(bridgeFrame);
    setTimeout(()=>{if(!bridgeReady){bridgePromise=null;resolve(false)}},15000);
  });
  return bridgePromise;
}
function hiddenInput(form,name,value){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value==null?'':String(value);form.appendChild(input)}
function fallbackFormCall(request){
  return new Promise((resolve,reject)=>{
    const id=requestId(),frame=document.createElement('iframe');
    frame.name='ait_bridge_'+id.replace(/[^a-zA-Z0-9_]/g,'_');
    frame.style.cssText='position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;border:0;left:-9999px;top:-9999px';
    document.body.appendChild(frame);
    const form=document.createElement('form');form.method='POST';form.action=cfg.webAppUrl;form.target=frame.name;form.style.display='none';
    hiddenInput(form,'request_id',id);hiddenInput(form,'parent_origin',cfg.githubOrigin||location.origin);hiddenInput(form,'user_agent',navigator.userAgent||'');hiddenInput(form,'payload',JSON.stringify(request||{}));document.body.appendChild(form);
    const timer=setTimeout(()=>{pending.delete(id);form.remove();frame.remove();reject(new Error('Backend timeout. تأكد من نشر Apps Script كـ Web app بصلاحية Anyone.'))},60000);
    pending.set(id,{resolve:payload=>{frame.remove();resolve(payload)},reject,timer});
    try{form.submit();form.remove()}catch(err){clearTimeout(timer);pending.delete(id);form.remove();frame.remove();reject(err)}
  });
}
async function call(request){
  requireConfig();installMessageHandler();
  const ready=await ensureBridge().catch(()=>false);
  if(!ready||!bridgeFrame||!bridgeFrame.contentWindow)return fallbackFormCall(request);
  return new Promise((resolve,reject)=>{
    const id=requestId();
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Backend timeout. حاول تحديث الصفحة.'))},60000);
    pending.set(id,{resolve,reject,timer});
    try{bridgeFrame.contentWindow.postMessage({type:'AIT_BRIDGE_REQUEST',id:id,request:request||{}},'*')}
    catch(err){clearTimeout(timer);pending.delete(id);reject(err)}
  });
}
function login(){
  requireConfig();installMessageHandler();if(loginOverlay)return;
  loginOverlay=document.createElement('div');
  loginOverlay.style.cssText='position:fixed;inset:0;z-index:2147483647;background:#07111f;display:block';
  loginFrame=document.createElement('iframe');
  loginFrame.style.cssText='position:absolute;inset:0;width:100vw;height:100vh;border:0;background:#0b1727';
  loginFrame.src=cfg.webAppUrl+'?page=login&parent_origin='+encodeURIComponent(cfg.githubOrigin||location.origin)+'&v=43';
  loginOverlay.appendChild(loginFrame);document.body.appendChild(loginOverlay);
}
function closeLogin(){if(loginOverlay){loginOverlay.remove();loginOverlay=null;loginFrame=null}}
function hasUsableSession(){const s=state();if(!s||!s.token||!Array.isArray(s.allowedPages))return false;const expires=Date.parse(s.expiresAt||'');return !Number.isFinite(expires)||expires>Date.now()+30000}
async function verify(){const s=state();if(!s||!s.token)return false;const r=await call({module:'auth',action:'verify',token:s.token});if(!r||!r.ok){clear();return false}save(Object.assign({},s,{user:r.user,allowedPages:r.allowedPages,expiresAt:r.expiresAt}));return true}
async function ensureSession(){return hasUsableSession()?true:verify()}
function canonicalPage(pageKey){const k=String(pageKey||'').toLowerCase();return ({map:'map_layers',data:'data_library'})[k]||k}
function permission(pageKey){const s=state(),key=canonicalPage(pageKey);return s&&Array.isArray(s.allowedPages)?s.allowedPages.find(p=>canonicalPage(p.pageKey)===key):null}
function can(pageKey,capability){const p=permission(pageKey);if(!p||!p.canView)return false;const c=String(capability||'view').toLowerCase();if(c==='view')return true;if(c==='export')return Boolean(p.canExport);if(c==='download')return Boolean(p.canDownload);if(c==='manageusers')return Boolean(p.canManageUsers);if(c==='activity')return Boolean(p.canViewActivity);if(c==='full'||c==='edit')return p.accessLevel==='full';return false}
async function requirePage(pageKey){if(!(await ensureSession())){login();return false}const p=permission(pageKey);if(!p||!p.canView)throw new Error('Permission denied for '+pageKey);return true}
async function listDatasets(){const s=state();if(!s)throw new Error('Not signed in.');const r=await call({module:'data',action:'list',token:s.token});if(!r.ok)throw new Error(r.message||r.error);return r.datasets||[]}
async function dataset(datasetKey,options){const s=state();if(!s)throw new Error('Not signed in.');options=options||{};const r=await call({module:'data',action:'get',token:s.token,dataset:datasetKey,page:options.page||1,pageSize:options.pageSize||500,query:options.query||'',filters:options.filters||{},sortField:options.sortField||'',sortOrder:options.sortOrder||''});if(!r.ok)throw new Error(r.message||r.error);return r}
async function batchDatasets(datasetKeys,options){const s=state();if(!s)throw new Error('Not signed in.');options=options||{};const r=await call({module:'data',action:'batch',token:s.token,datasets:datasetKeys||[],includeOverviewStats:Boolean(options.includeOverviewStats)});if(!r.ok)throw new Error(r.message||r.error);return r}
async function listFiles(options){const s=state();if(!s)throw new Error('Not signed in.');options=options||{};const r=await call({module:'files',action:'list',token:s.token,page:options.page||1,pageSize:options.pageSize||500,query:options.query||'',category:options.category||'',sourceArchive:options.sourceArchive||''});if(!r.ok)throw new Error(r.message||r.error);return r}
async function fileLink(fileId){const s=state();if(!s)throw new Error('Not signed in.');const r=await call({module:'files',action:'link',token:s.token,fileId:fileId});if(!r.ok)throw new Error(r.message||r.error);return r}
async function download(fileId){const r=await fileLink(fileId);global.open(r.url,'_blank','noopener')}
async function mapLayers(){const s=state();if(!s)throw new Error('Not signed in.');const r=await call({module:'maps',action:'list',token:s.token});if(!r.ok)throw new Error(r.message||r.error);return r.rows||[]}
async function mapLayerData(layerId){const s=state();if(!s)throw new Error('Not signed in.');const r=await call({module:'maps',action:'data',token:s.token,layerId:layerId});if(!r.ok)throw new Error(r.message||r.error);return r.layer}
async function logout(){const s=state();if(s&&s.token){try{await call({module:'auth',action:'logout',token:s.token})}catch(e){}}clear();global.dispatchEvent(new CustomEvent('ait:logout'))}
global.AITBackend={login,logout,verify,ensureSession,hasUsableSession,requirePage,listDatasets,dataset,batchDatasets,listFiles,fileLink,download,mapLayers,mapLayerData,state,permission,can,canonicalPage,clearSession:clear,ensureBridge};
})(window);
