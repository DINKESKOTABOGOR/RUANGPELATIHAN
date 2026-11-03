/* GitHub Pages -> Apps Script HtmlService (google.script.run) -> Google Sheets.
   Tidak ada unggah Excel. Filter seluruhnya di browser, satu kali pengambilan data.
   Password tidak disimpan di GitHub, hanya diverifikasi Apps Script. */
(() => {'use strict';
  const BACKEND_URL=String(window.DINKES_CONFIG?.APPS_SCRIPT_URL||'').trim();
  const GAS=/^https:\/\/script\.google\.com\/macros\/s\/[-\w]+\/exec$/.test(BACKEND_URL);
  const CACHE_KEY='dinkes_sdm_live_github_2026_v7';
  const TTL=Number(window.DINKES_CONFIG?.PUBLIC_CACHE_MS)||180000;
  const allowed=new Set(['getPublicData','getAdminData','loginAdmin','logoutAdmin','changeAdminPassword','savePerson','saveProfession','saveTraining','saveCompletion','linkSibangkom']);
  // Read-only public endpoint via ContentService JSONP (tanpa iframe / CORS).
  // Permintaan admin tetap memakai google.script.run dalam iframe terproteksi.
  let callbackSerial=0;
  function publicFetch(timeoutMs=30000,forceFresh=false){
    if(!GAS)return Promise.reject(new Error('Alamat Apps Script belum diisi. Buka assets/config.js.'));
    return new Promise((resolve,reject)=>{
      const cb='DINKES_CB_'+Date.now()+'_'+(++callbackSerial)+'_'+Math.random().toString(36).slice(2,10);
      const script=document.createElement('script');
      let settled=false;
      const finish=(err,value)=>{if(settled)return;settled=true;clearTimeout(timeout);delete window[cb];script.remove();if(err)reject(err);else resolve(value)};
      window[cb]=result=>{
        if(!result||result.ok!==true||!result.data)return finish(new Error(result?.error||'Google Sheets belum bisa dibaca.'));
        finish(null,result.data);
      };
      script.async=true;
      script.src=BACKEND_URL+'?mode=public&callback='+encodeURIComponent(cb)+(forceFresh?'&fresh=1':'');
      script.onerror=()=>finish(new Error('Endpoint Apps Script tidak dapat dibuka. Periksa URL, akses Anyone, dan deployment terbaru.'));
      const timeout=setTimeout(()=>finish(new Error('Pembacaan data Google Sheets belum selesai setelah '+Math.ceil(timeoutMs/1000)+' detik. Coba halaman cek-koneksi.html untuk memeriksa server.')),timeoutMs);
      document.head.appendChild(script);
    });
  }

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
      const time=setTimeout(()=>{connection=null;connectionResolver=null;bridgeFrame?.remove();bridgeFrame=null;reject(new Error('Penghubung admin tidak terbuka. Periksa FRONTEND_ORIGIN di Code.gs dan izin iframe browser.'))},12000);
      const onReady=()=>{clearTimeout(time);resolve(true)};
      // callback dipasang sebelum iframe dibuat; bridge akan mengirim sinyal ready.
      connectionResolver=onReady;
      bridgeFrame=document.createElement('iframe');
      bridgeFrame.title='Penghubung Google Sheets';bridgeFrame.setAttribute('aria-hidden','true');
      bridgeFrame.style.cssText='position:absolute;width:1px;height:1px;border:0;opacity:0;pointer-events:none;left:-9999px;';
      bridgeFrame.src=BACKEND_URL+'?bridge=1&channel='+encodeURIComponent(channel);
      bridgeFrame.onerror=()=>{clearTimeout(time);connection=null;reject(new Error('Halaman penghubung admin diblokir browser.'))};
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
    if(method==='getPublicData')return publicFetch(30000,args[0]===true);
    await connect();
    return new Promise((resolve,reject)=>{
      if(!peer||!peerOrigin){reject(new Error('Penghubung Apps Script belum siap.'));return}
      const id=++serial;
      const timeout=setTimeout(()=>{outstanding.delete(id);reject(new Error('Permintaan admin terlalu lama. Buka Apps Script → Executions untuk melihat error.'))},30000);
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
  // Public-only data cache survives closing the tab, with sessionStorage fallback.
  // Tokens, NIP and NIK are never included in this browser cache.
  function readCache(){
    for(const store of [localStorage,sessionStorage]){
      try{const value=JSON.parse(store.getItem(CACHE_KEY)||'null');if(value?.data?.people&&value?.data?.professions)return value;}catch(e){}
    }
    return null;
  }
  function writeCache(data){
    const packed=JSON.stringify({savedAt:Date.now(),data});
    try{localStorage.setItem(CACHE_KEY,packed);sessionStorage.removeItem(CACHE_KEY);return;}catch(e){}
    try{sessionStorage.setItem(CACHE_KEY,packed)}catch(e){}
  }
  function clearCache(){for(const store of [localStorage,sessionStorage])try{store.removeItem(CACHE_KEY)}catch(e){}}
  function show(data,kind){
    if(loaded)return;
    raw=data;
    document.getElementById('sourceFilename').textContent='Google Sheets · Rekapitulasi Pemetaan Pelatihan';
    document.getElementById('syncText').textContent=kind==='cached'?'Data tersimpan · sinkronisasi berjalan':'Google Sheets tersambung';
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
  function status(msg){const el=document.getElementById('syncText');if(el)el.textContent=msg;}
  async function refresh(){
    const btn=document.getElementById('refreshSheet');btn.disabled=true;btn.classList.add('sync-busy');
    status('Mengambil perubahan...');
    try{const data=await publicFetch(30000,true);writeCache(data);window.location.reload()}
    catch(e){status('Sinkronisasi gagal');window.PelatihanView?.toast(e.message);btn.disabled=false;btn.classList.remove('sync-busy')}
  }
  window.PelatihanBridge={GAS,call,project,getRaw:()=>raw,clearCache,refresh,writeCache,warmAdmin:()=>connect().catch(e=>console.warn('Penghubung admin:',e.message))};
  document.getElementById('refreshSheet')?.addEventListener('click',refresh);
  const cached=readCache();
  if(!GAS){showError('Alamat Apps Script belum diisi. Isi assets/config.js dengan URL deployment /exec.');return}
  if(cached?.data){
    // Stale-while-revalidate: data terakhir tampil seketika meskipun cache kadaluarsa.
    show(cached.data,'cached');
    if(Date.now()-cached.savedAt<TTL){status('Data tersimpan · klik Sinkronkan untuk memperbarui')}
    else publicFetch().then(data=>{writeCache(data);raw=data;window.PelatihanAdmin?.setData(data);status('Data dari Google Sheets diperbarui');})
      .catch(e=>{status('Menampilkan data tersimpan · koneksi gagal');console.warn('Sinkronisasi gagal:',e.message)});
  }else{
    publicFetch().then(data=>{writeCache(data);show(data,'live')}).catch(e=>showError('Google Sheets gagal dimuat: '+e.message));
  }
})();
