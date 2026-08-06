(function(){
'use strict';
const PAGE_ORDER=['overview','map_layers','geology','samples','mines','documents','data_library','downloads'];
const PAGE_DATASETS={
  overview:['summary','file_inventory','pdf_documents','excel_reports','gdb_ore_points','mines','au_cu_samples','key_findings'],
  map_layers:['summary'],
  geology:['summary','excel_reports','gdb_ore_points','excel_occurrences','gdb_ore_boundaries'],
  samples:['summary','au_cu_samples','talc_xrf','talc_sites','key_findings'],
  mines:['summary','mines','blocks'],
  documents:['summary','pdf_documents','excel_reports'],
  data_library:['summary','file_inventory'],
  downloads:['summary']
};
const MAP_PAGES=new Set(['overview','map_layers','documents']);
const D={summary:{counts:{}},geological_layers:[]};
const loadedDatasets=new Set(),loadingPages=new Map();
let mapsLoaded=false;
function overlay(){let el=document.getElementById('aitBootOverlay');if(el)return el;el=document.createElement('div');el.id='aitBootOverlay';el.innerHTML='<div><img src="assets/branding/ait_logo.svg" alt="AIT"><h2>AIT GeoMine 360</h2><p id="aitBootMessage">جاري الاتصال السريع بالنظام...</p><div class="ait-loader"></div></div>';document.body.appendChild(el);return el}
function message(t){overlay();const p=document.getElementById('aitBootMessage');if(p)p.textContent=t}
function fail(err){message('تعذر تشغيل النظام: '+(err&&err.message?err.message:String(err)));document.getElementById('aitBootOverlay')?.classList.add('error')}
function waitLogin(){return new Promise(resolve=>window.addEventListener('ait:login',()=>resolve(true),{once:true}))}
function loadScript(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src+'?v=43';s.onload=resolve;s.onerror=()=>reject(new Error('تعذر تحميل '+src));document.body.appendChild(s)})}
function parseJson(v,fallback){if(Array.isArray(v)||(v&&typeof v==='object'))return v;try{return JSON.parse(v)}catch(e){return fallback}}
function applyAliases(){D.summary.archives=D.archives||[];D.html_mines=D.mines||[];D.html_blocks=D.blocks||[];D.assays=D.au_cu_samples||[];D.key_results=D.key_findings||[]}
function applyBatch(result){
  const datasets=result?.datasets||{};
  Object.entries(datasets).forEach(([key,value])=>{
    if(key==='summary')D.summary=value.object||{counts:{}};
    else D[key]=value.rows||[];
    loadedDatasets.add(key);
  });
  if(result?.overviewStats)D.overviewStats=result.overviewStats;
  applyAliases();
}
function canPage(page){return Boolean(AITBackend.can(page,'view'))}
function firstAllowedPage(){return PAGE_ORDER.find(canPage)||null}
async function ensureMapMetadata(){
  if(mapsLoaded)return;
  const layers=await AITBackend.mapLayers();
  for(const layer of layers){
    layer.bounds=parseJson(layer.bounds,null);
    if(layer.layer_type==='raster')layer.asset=layer.asset_url||'';
    else layer.asset='';
  }
  D.geological_layers=layers;mapsLoaded=true;
}
async function loadPageData(page,options){
  page=AITBackend.canonicalPage(page);options=options||{};
  if(loadingPages.has(page))return loadingPages.get(page);
  const promise=(async()=>{
    const wanted=PAGE_DATASETS[page]||[];
    const missing=wanted.filter(key=>!loadedDatasets.has(key));
    const tasks=[];
    if(missing.length)tasks.push(AITBackend.batchDatasets(missing,{includeOverviewStats:page==='overview'&&!D.overviewStats}).then(applyBatch));
    if(MAP_PAGES.has(page)&&!mapsLoaded)tasks.push(ensureMapMetadata());
    if(tasks.length)await Promise.all(tasks);
    applyAliases();
    window.dispatchEvent(new CustomEvent('ait:page-data-ready',{detail:{page:page}}));
    return D;
  })().finally(()=>loadingPages.delete(page));
  loadingPages.set(page,promise);return promise;
}
window.AITPageData={ensurePage:loadPageData,isLoaded:page=>{const wanted=PAGE_DATASETS[AITBackend.canonicalPage(page)]||[];return wanted.every(k=>loadedDatasets.has(k))&&(!MAP_PAGES.has(AITBackend.canonicalPage(page))||mapsLoaded)},data:D};
async function boot(){
  try{
    overlay();message('جاري إنشاء اتصال آمن...');await AITBackend.ensureBridge();
    if(!(await AITBackend.ensureSession())){message('سجّل الدخول للمتابعة');AITBackend.login();await waitLogin()}
    const first=firstAllowedPage();if(!first)throw new Error('لا توجد صفحات متاحة لهذا المستخدم.');
    message('جاري تحميل الصفحة الرئيسية...');
    try{await loadPageData(first,{initial:true})}
    catch(loadErr){
      const text=String(loadErr?.message||loadErr||'');
      if(/session|authentication|auth_required|session_invalid|session_expired/i.test(text)){
        AITBackend.clearSession();message('انتهت الجلسة، سجّل الدخول مرة أخرى');AITBackend.login();await waitLogin();await loadPageData(first,{initial:true});
      }else throw loadErr;
    }
    window.GEOMINE_DATA=D;
    message('جاري فتح الداش بورد...');
    await loadScript('i18n-theme.js');await loadScript('app.js');await loadScript('downloads.js');
    document.getElementById('aitBootOverlay')?.remove();
  }catch(err){console.error(err);fail(err)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
