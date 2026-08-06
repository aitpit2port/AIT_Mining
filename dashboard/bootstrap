(function(){
'use strict';
const keys=['archives','file_inventory','pdf_documents','excel_reports','excel_occurrences','gdb_ore_boundaries','gdb_ore_points','mines','blocks','au_cu_samples','talc_xrf','talc_sites','key_findings'];
function overlay(){let el=document.getElementById('aitBootOverlay');if(el)return el;el=document.createElement('div');el.id='aitBootOverlay';el.innerHTML='<div><img src="assets/branding/ait_logo.svg" alt="AIT"><h2>AIT GeoMine 360</h2><p id="aitBootMessage">جاري الاتصال بالنظام...</p><div class="ait-loader"></div></div>';document.body.appendChild(el);return el}
function message(t){overlay();const p=document.getElementById('aitBootMessage');if(p)p.textContent=t}
function fail(err){message('تعذر تشغيل النظام: '+(err&&err.message?err.message:String(err)));document.getElementById('aitBootOverlay')?.classList.add('error')}
function waitLogin(){return new Promise(resolve=>window.addEventListener('ait:login',()=>resolve(true),{once:true}))}
async function allRows(key){let page=1,rows=[],result;do{result=await AITBackend.dataset(key,{page:page,pageSize:500});rows=rows.concat(result.rows||[]);page++}while(page<=Number(result.totalPages||1));return rows}
function loadScript(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error('تعذر تحميل '+src));document.body.appendChild(s)})}
function parseJson(v,fallback){if(Array.isArray(v)||v&&typeof v==='object')return v;try{return JSON.parse(v)}catch(e){return fallback}}
function requirePasswordChange(){
  const state=AITBackend.state()||{};
  if(!state.user?.mustChangePassword)return Promise.resolve(true);
  return new Promise((resolve,reject)=>{
    const modal=document.getElementById('passwordChangeModal'),form=document.getElementById('passwordChangeForm'),msg=document.getElementById('passwordChangeMessage'),btn=document.getElementById('passwordChangeSubmit');
    if(!modal||!form)return reject(new Error('واجهة تغيير كلمة المرور غير موجودة.'));
    const bootOverlay=document.getElementById('aitBootOverlay');if(bootOverlay)bootOverlay.style.display='none';
    modal.classList.add('open');modal.setAttribute('aria-hidden','false');
    const handler=async ev=>{
      ev.preventDefault();
      const current=document.getElementById('currentPasswordInput').value,newPass=document.getElementById('newPasswordInput').value,confirm=document.getElementById('confirmPasswordInput').value;
      msg.textContent='';msg.className='form-message';
      if(newPass.length<3){msg.textContent='كلمة المرور يجب ألا تقل عن 3 أرقام أو أحرف.';msg.className='form-message error';return}
      if(newPass!==confirm){msg.textContent='كلمتا المرور غير متطابقتين.';msg.className='form-message error';return}
      btn.disabled=true;msg.textContent='جارٍ حفظ كلمة المرور...';
      try{await AITBackend.changePassword(current,newPass);modal.classList.remove('open');modal.setAttribute('aria-hidden','true');if(bootOverlay)bootOverlay.style.display='grid';form.removeEventListener('submit',handler);resolve(true)}
      catch(err){msg.textContent=err?.message||String(err);msg.className='form-message error';btn.disabled=false}
    };
    form.addEventListener('submit',handler);
  });
}
async function boot(){
  try{
    overlay();await AITBackend.ensureBridge();
    if(!(await AITBackend.verify())){message('سجّل الدخول للمتابعة');AITBackend.login();await waitLogin()}
    await requirePasswordChange();
    message('جاري قراءة الصلاحيات...');
    const datasets=await AITBackend.listDatasets();
    const allowed=new Set((datasets||[]).map(x=>String(x.datasetKey)));
    const D={summary:{counts:{}}};
    if(allowed.has('summary')){message('جاري تحميل ملخص البيانات...');const summaryRes=await AITBackend.dataset('summary',{pageSize:200});D.summary=summaryRes.object||{counts:{}}}
    for(let i=0;i<keys.length;i++){
      const k=keys[i];
      if(!allowed.has(k)){D[k]=[];continue}
      message('جاري تحميل البيانات المصرح بها '+(i+1)+' من '+keys.length+'...');D[k]=await allRows(k)
    }
    D.summary.archives=D.archives||[];
    D.html_mines=D.mines||[];D.html_blocks=D.blocks||[];D.assays=D.au_cu_samples||[];D.key_results=D.key_findings||[];
    D.geological_layers=[];
    if(AITBackend.can('map_layers','view')||AITBackend.can('documents','view')||AITBackend.can('overview','view')){
      message('جاري تجهيز طبقات الخريطة...');
      const layers=await AITBackend.mapLayers();
      for(const layer of layers){layer.bounds=parseJson(layer.bounds,null);if(layer.layer_type==='raster')layer.asset=layer.asset_url||''}
      const vectors=AITBackend.can('map_layers','view')?layers.filter(x=>x.layer_type==='vector'):[];
      for(let i=0;i<vectors.length;i++){
        message('جاري تحميل طبقة Vector '+(i+1)+' من '+vectors.length+'...');
        const detail=await AITBackend.mapLayerData(vectors[i].layer_id);
        const url=URL.createObjectURL(new Blob([JSON.stringify(detail.geojson)],{type:'application/geo+json'}));
        vectors[i].asset=url;vectors[i].drive_file_id=detail.drive_file_id||'';
      }
      D.geological_layers=layers;
    }
    window.GEOMINE_DATA=D;
    message('جاري تشغيل الداشبورد...');
    await loadScript('i18n-theme.js');await loadScript('app.js');await loadScript('downloads.js');
    document.getElementById('aitBootOverlay')?.remove();
  }catch(err){console.error(err);fail(err)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
