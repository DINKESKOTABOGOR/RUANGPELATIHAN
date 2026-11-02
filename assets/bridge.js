/* GitHub Pages -> Apps Script HtmlService (google.script.run) -> Google Sheets.
   Tidak ada unggah Excel. Filter seluruhnya di browser, satu kali pengambilan data.
   Password tidak disimpan di GitHub, hanya diverifikasi Apps Script. */
(() => {'use strict';
  const BACKEND_URL=String(window.DINKES_CONFIG?.APPS_SCRIPT_URL||'').trim();
  const GAS=/^https:\/\/script\.google\.com\/macros\/s\/[-\w]+\/exec$/.test(BACKEND_URL);
  const CACHE_KEY='dinkes_sdm_live_github_2026_v4';
  const TTL=Number(window.DINKES_CONFIG?.PUBLIC_CACHE_MS)||90000;
  const allowed=new Set(['getPublicData','getAdminData','loginAdmin','logoutAdmin','changeAdminPassword','savePerson','saveProfession','saveTraining','saveCompletion','linkSibangkom']);
  const channel='dinkes-'+(globalThis.crypto?.randomUUID?.()||(''+Date.now()+Math.random()).replace('.',''));
  const outstanding=new Map();
  let peer=null,peerOrigin='',raw=null,loaded=false,bridgeFrame=null,connection=null,serial=0;
  function assertOrigin(origin){
    try{const host=new URL(origin).hostname;return origin.startsWith('https://') && (host==='script.google.com'||host==='script.googleusercontent.com'||host.endsWith('.script.googleusercontent.com')||host.endsWith('.googleusercontent.com'))}
    catch(e){return false}
  }
  function connect(){
    if(connection)return connection;
    connection=new Promise((resolve,reject)=>{
      if(!GAS){reject(new Error('URL Apps Script belum diisi di assets/config.js.'));return}
      const time=setTimeout(()=>{reject(new Error('Apps Script tidak merespons. Cek URL deployment dan izin aksesnya.'))},28000);
      const onReady=()=>{clearTimeout(time);resolve(true)};
      // callback dipasang sebelum iframe dibuat; bridge akan mengirim sinyal ready.
      connectionResolver=onReady;
      bridgeFrame=document.createElement('iframe');
      bridgeFrame.title='Penghubung Google Sheets';bridgeFrame.setAttribute('aria-hidden','true');
      bridgeFrame.style.cssText='position:absolute;width:1px;height:1px;border:0;opacity:0;pointer-events:none;left:-9999px;';
      bridgeFrame.src=BACKEND_URL+'?bridge=1&channel='+encodeURIComponent(channel);
      document.body.appendChild(bridgeFrame);
    });
    return connection;
  }
  let connectionResolver=null;
  window.addEventListener('message',event=>{
    const d=event.data;
    if(!d||d.scope!=='DINKES_BRIDGE_V1'||d.channel!==channel||!assertOrigin(event.origin))return;
    if(d.type==='ready'){
      peer=event.source;peerOrigin=event.origin;
      if(connectionResolver){const done=connectionResolver;connectionResolver=null;done();}
      return;
    }
    if(d.type==='response'){
      const job=outstanding.get(d.id);if(!job)return;
      clearTimeout(job.timeout);outstanding.delete(d.id);
      if(d.ok)job.resolve(d.value);else job.reject(new Error(d.error||'Server gagal memproses permintaan.'));
    }
  });
  async function call(method,...args){
    if(!allowed.has(method))throw new Error('Operasi tidak diizinkan.');
    await connect();
    return new Promise((resolve,reject)=>{
      if(!peer||!peerOrigin){reject(new Error('Penghubung Apps Script belum siap.'));return}
      const id=++serial;
      const timeout=setTimeout(()=>{outstanding.delete(id);reject(new Error('Permintaan terlalu lama. Coba sinkronkan lagi.'))},55000);
      outstanding.set(id,{resolve,reject,timeout});
      peer.postMessage({scope:'DINKES_BRIDGE_V1',channel,type:'request',id,method,args},peerOrigin);
    });
  }
  const norm=s=>String(s||'').toLocaleLowerCase('id').trim().replace(/\s+/g,' ');
  const safeUrl=s=>/^https:\/\//i.test(String(s||'').trim())?String(s).trim():'';
  function project(data){
    const profiles=(data.professions||[]).filter(Boolean);
    const trainings=[],toNum=new Map(),byName=new Map(),roleTraining=Object.fromEntries(profiles.map(p=>[p,[]]));
    for(const t of (data.trainings||[])){
      if(t.type!=='profesi'||!profiles.includes(t.profession))continue;
      const name=String(t.name||'').trim();if(!name)continue;
      const key=norm(name);let entry=byName.get(key);
      if(!entry){entry={id:trainings.length,name,roles:[]};byName.set(key,entry);trainings.push(entry)}
      if(!entry.roles.includes(t.profession))entry.roles.push(t.profession);
      if(!roleTraining[t.profession].includes(entry.id))roleTraining[t.profession].push(entry.id);
      toNum.set(t.id,entry.id);
    }
    const people=[];
    for(const p of (data.people||[])){
      for(const role of (p.professions||[])){
        if(!profiles.includes(role))continue;
        const valid=new Set(roleTraining[role]);
        const yes=[...new Set((p.completed||[]).map(id=>toNum.get(id)).filter(id=>valid.has(id)))];
        const no=[...new Set((p.notCompleted||[]).map(id=>toNum.get(id)).filter(id=>valid.has(id)&&!yes.includes(id)))];
        people.push({id:p.id+'|'+role,sourceId:p.id,name:p.name||'Nama belum diisi',role,unit:p.unit||'Unit belum diisi',employment:p.status||'',program:p.program||'',nip:'',yes,no});
      }
    }
    const names=Object.fromEntries((data.trainings||[]).map(t=>[t.id,t.name]));
    const sibangkom=(data.sibEntries||[]).map(s=>({id:s.key,sourceId:s.personId,name:s.name||'',bidang:s.bidang||'',tim:s.tim||'',done:(s.done||[]).map(id=>names[id]||id),no:(s.no||[]).map(id=>names[id]||id),unknown:(s.unknown||[]).map(id=>names[id]||id)}));
    return {people,trainings,roleTraining,professions:profiles,
      mandatory:(data.trainings||[]).filter(t=>t.type==='wajib').map(t=>({name:t.name,jpl:Number(t.jpl)||0,link:safeUrl(t.link)})),
      reference:(data.references||[]).map(t=>({role:t.profession||'',competency:t.kompetensi||'',skill:t.teknis||'',title:t.pelatihan||'',link:safeUrl(t.link)})),
      sibangkom,source:data.meta?.source||'Google Sheets Dinkes Kota Bogor'};
  }
  function readCache(){try{return JSON.parse(sessionStorage.getItem(CACHE_KEY)||'null')}catch(e){return null}}
  function writeCache(data){try{sessionStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:Date.now(),data}))}catch(e){}}
  function clearCache(){try{sessionStorage.removeItem(CACHE_KEY)}catch(e){}}
  function show(data,kind){
    if(loaded)return;
    raw=data;
    document.getElementById('sourceFilename').textContent='Google Sheets · Rekapitulasi Pemetaan Pelatihan';
    document.getElementById('syncText').textContent=kind==='cached'?'Data tersimpan · bisa disinkronkan':'Google Sheets tersambung';
    startApp(project(data));loaded=true;
    window.PelatihanAdmin?.setData(data);
    document.getElementById('loadingLive')?.remove();
  }
  function showError(message){
    const el=document.getElementById('loadingMessage');if(el)el.textContent=message;
    const bar=document.querySelector('.loading-card-live .loadbar');if(bar)bar.style.display='none';
    const root=document.querySelector('.loading-card-live');
    let btn=document.getElementById('retryLive');if(!btn){btn=document.createElement('button');btn.id='retryLive';btn.className='admin-btn';btn.textContent='Coba lagi';btn.style.marginTop='17px';btn.onclick=()=>window.location.reload();root?.appendChild(btn)}
  }
  async function refresh(){
    const btn=document.getElementById('refreshSheet');btn.disabled=true;btn.classList.add('sync-busy');
    document.getElementById('syncText').textContent='Mengambil perubahan...';
    try{const data=await call('getPublicData',true);writeCache(data);window.location.reload()}
    catch(e){document.getElementById('syncText').textContent='Gagal menyinkronkan';window.PelatihanView?.toast(e.message);btn.disabled=false;btn.classList.remove('sync-busy')}
  }
  window.PelatihanBridge={GAS,call,project,getRaw:()=>raw,clearCache,refresh,writeCache};
  document.getElementById('refreshSheet')?.addEventListener('click',refresh);
  const cached=readCache();
  if(!GAS){showError('Sambungkan URL Apps Script terlebih dahulu di assets/config.js. Tidak perlu upload Excel.');return}
  // Cache langsung ditampilkan untuk menghemat waktu kunjungan ulang.
  if(cached?.data && Date.now()-cached.savedAt<TTL){show(cached.data,'cached');connect().catch(e=>{document.getElementById('syncText').textContent='Koneksi Apps Script gagal';console.warn(e)});}
  else{
    call('getPublicData',false).then(data=>{writeCache(data);show(data,'live')}).catch(e=>showError('Tidak bisa membaca Google Sheets: '+e.message));
  }
})();
