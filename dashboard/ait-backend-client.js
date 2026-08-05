(function(global){
'use strict';
const cfg=global.AIT_BACKEND_CONFIG||{};
const storageKey=cfg.tokenStorageKey||'ait_geomine_session_v2';
let loginOverlay=null,bridgeFrame=null,bridgeReady=false,bridgePromise=null;
const pending=new Map();
function state(){try{return JSON.parse(sessionStorage.getItem(storageKey)||'null')}catch(e){return null}}
function save(v){sessionStorage.setItem(storageKey,JSON.stringify(v))}
function clear(){sessionStorage.removeItem(storageKey)}
function requireConfig(){if(!cfg.webAppUrl||cfg.webAppUrl.includes('PASTE_'))throw new Error('ضع رابط Apps Script /exec داخل backend-config.js');}
function requestId(){return 'WEB-'+Date.now()+'-'+Math.random().toString(36).slice(2)}
function ensureBridge(){
  requireConfig();
  if(bridgePromise)return bridgePromise;
  bridgePromise=new Promise((resolve,reject)=>{
    bridgeFrame=document.createElement('iframe');
    bridgeFrame.style.cssText='position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;border:0;left:-9999px;top:-9999px';
    bridgeFrame.src=cfg.webAppUrl+'?page=bridge&parent_origin='+encodeURIComponent(cfg.githubOrigin||location.origin);
    document.body.appendChild(bridgeFrame);
    const timer=setTimeout(()=>reject(new Error('تعذر تشغيل قناة Apps Script.')),30000);
    function ready(){clearTimeout(timer);bridgeReady=true;resolve(true)}
    const handler=ev=>{
      if(ev.origin!=='https://script.google.com'&&ev.origin!=='https://script.googleusercontent.com')return;
      const d=ev.data||{};
      if(d.type==='AIT_BRIDGE_READY')ready();
      if(d.type==='AIT_BRIDGE_RESPONSE'&&pending.has(d.id)){
        const item=pending.get(d.id);pending.delete(d.id);clearTimeout(item.timer);item.resolve(d.payload);
      }
      if(d.type==='AIT_AUTH_SUCCESS'){
        save({token:d.token,user:d.user,expiresAt:d.expiresAt,allowedPages:d.allowedPages||[]});closeLogin();
        global.dispatchEvent(new CustomEvent('ait:login',{detail:state()}));
      }
    };
    global.addEventListener('message',handler);
  });
  return bridgePromise;
}
async function call(request){
  await ensureBridge();
  return new Promise((resolve,reject)=>{
    const id=requestId();
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Backend timeout.'));},60000);
    pending.set(id,{resolve,reject,timer});
    bridgeFrame.contentWindow.postMessage({type:'AIT_BRIDGE_REQUEST',id:id,request:request},'*');
  });
}
function login(){
  requireConfig();if(loginOverlay)return;
  loginOverlay=document.createElement('div');
  loginOverlay.style.cssText='position:fixed;inset:0;z-index:2147483647;background:rgba(4,10,18,.86);display:grid;place-items:center;padding:18px;backdrop-filter:blur(8px)';
  const frame=document.createElement('iframe');
  frame.style.cssText='width:min('+(cfg.loginWidth||480)+'px,96vw);height:min('+(cfg.loginHeight||640)+'px,94vh);border:0;border-radius:20px;background:#0b1727;box-shadow:0 30px 90px rgba(0,0,0,.5)';
  frame.src=cfg.webAppUrl+'?page=login&parent_origin='+encodeURIComponent(cfg.githubOrigin||location.origin);
  loginOverlay.appendChild(frame);document.body.appendChild(loginOverlay);
}
function closeLogin(){if(loginOverlay){loginOverlay.remove();loginOverlay=null}}
async function verify(){const s=state();if(!s||!s.token)return false;const r=await call({module:'auth',action:'verify',token:s.token});if(!r||!r.ok){clear();return false}save(Object.assign({},s,{user:r.user,allowedPages:r.allowedPages,expiresAt:r.expiresAt}));return true}
function permission(pageKey){const s=state();return s&&Array.isArray(s.allowedPages)?s.allowedPages.find(p=>p.pageKey===pageKey):null}
async function requirePage(pageKey){if(!(await verify())){login();return false}const p=permission(pageKey);if(!p||!p.canView)throw new Error('Permission denied for '+pageKey);return true}
async function listDatasets(){const s=state();if(!s)throw new Error('Not signed in.');const r=await call({module:'data',action:'list',token:s.token});if(!r.ok)throw new Error(r.message||r.error);return r.datasets||[]}
async function dataset(datasetKey,options){const s=state();if(!s)throw new Error('Not signed in.');options=options||{};const r=await call({module:'data',action:'get',token:s.token,dataset:datasetKey,page:options.page||1,pageSize:options.pageSize||500,query:options.query||'',filters:options.filters||{},sortField:options.sortField||'',sortOrder:options.sortOrder||''});if(!r.ok)throw new Error(r.message||r.error);return r}
async function listFiles(options){const s=state();if(!s)throw new Error('Not signed in.');options=options||{};const r=await call({module:'files',action:'list',token:s.token,page:options.page||1,pageSize:options.pageSize||500,query:options.query||'',category:options.category||'',sourceArchive:options.sourceArchive||''});if(!r.ok)throw new Error(r.message||r.error);return r}
async function fileLink(fileId){const s=state();if(!s)throw new Error('Not signed in.');const r=await call({module:'files',action:'link',token:s.token,fileId:fileId});if(!r.ok)throw new Error(r.message||r.error);return r}
async function download(fileId){const r=await fileLink(fileId);global.open(r.url,'_blank','noopener')}
async function mapLayers(){const s=state();if(!s)throw new Error('Not signed in.');const r=await call({module:'maps',action:'list',token:s.token});if(!r.ok)throw new Error(r.message||r.error);return r.rows||[]}
async function mapLayerData(layerId){const s=state();if(!s)throw new Error('Not signed in.');const r=await call({module:'maps',action:'data',token:s.token,layerId:layerId});if(!r.ok)throw new Error(r.message||r.error);return r.layer}
async function logout(){const s=state();if(s&&s.token){try{await call({module:'auth',action:'logout',token:s.token})}catch(e){}}clear();global.dispatchEvent(new CustomEvent('ait:logout'))}
global.AITBackend={login,logout,verify,requirePage,listDatasets,dataset,listFiles,fileLink,download,mapLayers,mapLayerData,state,permission,clearSession:clear,ensureBridge};
})(window);