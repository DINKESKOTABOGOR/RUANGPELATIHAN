/* Panel admin: perubahan disimpan ke APP_* di Google Sheets, tidak menimpa tab profesi. */
(() => {'use strict';
  const $=s=>document.querySelector(s);
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=x=>String(x??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
  const authKey='dinkes_pelatihan_admin_session';
  const readSession=()=>{try{return sessionStorage.getItem(authKey)||''}catch(e){return ''}};
  const storeSession=t=>{try{sessionStorage.setItem(authKey,t)}catch(e){}};
  const dropSession=()=>{try{sessionStorage.removeItem(authKey)}catch(e){}};
  const state={raw:null,token:readSession(),auth:false,identities:{},tab:'pegawai',search:'',limit:25,busy:false,dirty:false,statusBusy:false};
  // SVG ringan, tanpa library ikon tambahan atau request jaringan.
  const eyeIcon=visible=>visible
    ?'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 3 18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.1A10 10 0 0 1 12 5c5 0 8.6 3.4 10 7a11 11 0 0 1-4.2 5.2"/><path d="M6.5 6.6A11 11 0 0 0 2 12c1.4 3.6 5 7 10 7 1.5 0 2.9-.3 4.1-.9"/></svg>'
    :'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  function API(){return window.PelatihanBridge}
  function toast(msg){window.PelatihanView?.toast(msg)}
  function render(){
    const root=$('#adminContent');if(!root)return;
    if(!state.raw){root.innerHTML='<div class="admin-tip">Data sedang disiapkan...</div>';return;}
    if(!state.auth){
      root.innerHTML=`<form class="admin-login" id="adminLogin"><img src="${esc(window.DINKES_LOGO_SRC||'assets/logo-dinkes.webp')}" alt="Logo Dinkes Kota Bogor"><h2>Halo, Admin! 👋</h2><p>Masuk untuk memperbaiki identitas pegawai, menambah profesi, dan mengelola pelatihan.</p><div class="admin-field"><label for="adminUser">Username</label><input id="adminUser" name="username" required autocomplete="username"></div><div class="admin-field"><label for="adminPassword">Password</label><div class="admin-password-wrap"><input id="adminPassword" name="password" type="password" required autocomplete="current-password"><button class="admin-eye" type="button" data-admin-eye="adminPassword" aria-label="Tampilkan password" title="Lihat password" aria-pressed="false">${eyeIcon(false)}</button></div></div><p id="adminLoginError" class="error-live" role="alert"></p><button type="submit" class="admin-btn" style="width:100%">Masuk ke panel admin</button><div class="admin-tip">Identitas NIP/NIK hanya ditampilkan setelah login. Perubahan disimpan ke Sheet tambahan APP_*.</div></form>`;
      if(!API()?.GAS)$('#adminLoginError').textContent='Koneksi Apps Script belum disiapkan. Periksa pengaturan aplikasi.';
      return;
    }
    const p=(state.raw.people||[]).filter(p=>(p.professions||[]).length),sip=(state.raw.sibEntries||[]).filter(s=>!(state.raw.people||[]).some(x=>x.id===s.personId&&(x.professions||[]).length));
    const missing=p.filter(x=>!state.identities[x.id]?.nip&&!state.identities[x.id]?.nik);
    root.innerHTML=`<div class="admin-grid"><div class="admin-kpi"><strong>${p.length.toLocaleString('id-ID')}</strong><span>Pegawai unik terdata</span></div><div class="admin-kpi"><strong>${(state.raw.professions||[]).length}</strong><span>Profesi</span></div><div class="admin-kpi"><strong>${missing.length.toLocaleString('id-ID')}</strong><span>NIP/NIK perlu dilengkapi</span></div><div class="admin-kpi"><strong>${sip.length.toLocaleString('id-ID')}</strong><span>SIBANGKOM belum dipasangkan</span></div></div>
    <div class="admin-tools"><button class="admin-btn" data-admin="add-person">+ Tambah pegawai</button><button class="admin-btn green" data-admin="add-training">+ Tambah pelatihan</button><button class="admin-btn outline" data-admin="add-profession">+ Tambah profesi</button><button class="admin-btn outline" data-admin="password">Ganti password</button><button class="admin-btn red" data-admin="logout">Keluar</button></div>
    <div class="admin-tabs">${[['pegawai','Pegawai'],['pelatihan','Pelatihan'],['sibangkom','Cocokkan SIBANGKOM']].map(([id,name])=>`<button data-admin-tab="${id}" class="${state.tab===id?'active':''}">${name}</button>`).join('')}</div>
    <input class="admin-filter" id="adminQuery" placeholder="${state.tab==='sibangkom'?'Cari peserta SIBANGKOM...':state.tab==='pegawai'?'Cari nama, unit kerja, atau profesi...':'Cari judul pelatihan...'}" value="${esc(state.search)}" autocomplete="off" aria-label="Pencarian admin"><div id="adminListing"></div>`;
    renderListing();
  }
  function renderListing(){const root=$('#adminListing');if(!root||!state.raw)return;
    const q=norm(state.search),people=(state.raw.people||[]).filter(p=>(p.professions||[]).length),train=state.raw.trainings||[],sib=state.raw.sibEntries||[];
    let list=[];
    if(state.tab==='pegawai')list=people.filter(p=>norm([p.name,p.unit,...(p.professions||[])].join(' ')).includes(q)).sort((a,b)=>a.name.localeCompare(b.name,'id'));
    else if(state.tab==='pelatihan')list=train.filter(t=>norm([t.name,t.profession,...(t.professions||[]),t.type].join(' ')).includes(q)).sort((a,b)=>a.name.localeCompare(b.name,'id'));
    else list=sib.filter(s=>norm([s.name,s.bidang,s.tim].join(' ')).includes(q));
    const slice=list.slice(0,state.limit);
    const row=x=>{
      if(state.tab==='pegawai'){
        const identity=state.identities[x.id]||{};
        return `<article class="admin-record"><div><h4>${esc(x.name)}</h4><p>${esc(x.unit)} · ${esc((x.professions||[]).join(', '))}</p><div class="admin-identity ${identity.nip||identity.nik?'':'weak'}">${identity.nip?'NIP: '+esc(identity.nip):identity.nik?'NIK: '+esc(identity.nik):'NIP/NIK belum lengkap'}</div></div><div><button data-admin-edit="${esc(x.id)}">Perbaiki</button> <button data-admin-status="${esc(x.id)}">Kelola pelatihan</button></div></article>`;
      }
      if(state.tab==='pelatihan')return `<article class="admin-record"><div><h4>${esc(x.name)}</h4><p>${esc(x.type==='wajib'||x.type==='sibangkom'?'Wajib · semua profesi':(x.professions||[x.profession]).join(', ')||x.type)} · ${esc(x.jpl||'')} ${x.jpl?'JPL':''}</p></div><span class="admin-identity">${esc(x.type)}</span></article>`;
      return `<article class="admin-record"><div><h4>${esc(x.name)}</h4><p>${esc(x.bidang||'Bidang belum diisi')} · ${esc(x.tim||'Tim belum diisi')}</p><div class="admin-identity">${people.some(p=>p.id===x.personId)?'Sudah cocok':'Perlu dicocokkan'}</div></div><button data-admin-link="${esc(x.key)}">${people.some(p=>p.id===x.personId)?'Ganti pasangan':'Cocokkan'}</button></article>`;
    };
    root.innerHTML=`<div style="color:#8393a7;font-size:12px;margin-bottom:12px">Menampilkan ${Math.min(slice.length,list.length).toLocaleString('id-ID')} dari ${list.length.toLocaleString('id-ID')} data</div><div class="admin-list">${slice.map(row).join('')||'<div class="admin-tip">Tidak ada data yang cocok.</div>'}</div>${list.length>slice.length?'<div class="admin-more"><button class="admin-btn outline" data-admin="more">Tampilkan lebih banyak</button></div>':''}`;
  }
  async function login(form){if(!API()?.GAS){$('#adminLoginError').textContent='Backend belum tersambung. Periksa URL Apps Script di pengaturan.';return;}
    const btn=form.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Memeriksa akun...';
    try{const response=await API().call('loginAdmin',form.elements.username.value,form.elements.password.value);state.token=response.token;storeSession(state.token);if(response.identities){state.identities=response.identities;state.auth=true;}else await fetchAdmin();render();toast('Berhasil masuk. Selamat bekerja!')}
    catch(e){$('#adminLoginError').textContent=e.message;btn.disabled=false;btn.textContent='Masuk ke panel admin'}
  }
  async function fetchAdmin(){try{const detail=await API().call('getAdminData',state.token);state.identities=detail.identities||{};state.auth=true}
    catch(e){state.auth=false;state.token='';state.identities={};dropSession();throw e}}
  async function logout(){try{if(state.token)await API().call('logoutAdmin',state.token)}catch(e){}
    state.auth=false;state.token='';state.identities={};dropSession();render();toast('Berhasil keluar.')}
  function modal(title,content){$('#adminModalTitle').textContent=title;$('#adminModalBody').innerHTML=content;$('#adminModalBg').classList.add('open');document.body.style.overflow='hidden';window.SearchableSelect?.enhance($('#adminModalBody'));}
  function closeModal(){if(state.statusBusy){toast('Status sedang disimpan, coba tutup setelah selesai.');return;}$('#adminModalBg').classList.remove('open');$('#adminModalBody').innerHTML='';document.body.style.overflow='';if(state.dirty){state.dirty=false;refreshAfterSave().catch(e=>toast('Sinkronisasi gagal: '+e.message));}}
  const field=(name,label,value='',extra='')=>`<div class="admin-field"><label for="a_${name}">${esc(label)}</label>${/type="password"/.test(extra)?`<div class="admin-password-wrap"><input id="a_${name}" name="${name}" value="${esc(value)}" ${extra}><button class="admin-eye" type="button" data-admin-eye="a_${name}" aria-label="Tampilkan password" title="Lihat password" aria-pressed="false">${eyeIcon(false)}</button></div>`:`<input id="a_${name}" name="${name}" value="${esc(value)}" ${extra}>`}</div>`;
  const actions=(submit='Simpan')=>`<div class="admin-actions"><button type="button" class="admin-btn outline" data-admin="close">Batal</button><button type="submit" class="admin-btn">${submit}</button></div><p id="adminFormError" class="error-live"></p>`;
  function personForm(id=''){
    const p=(state.raw.people||[]).find(x=>x.id===id)||{},ident=state.identities[id]||{};
    const profs=(state.raw.professions||[]).map(name=>`<label><input type="checkbox" name="profession" value="${esc(name)}" ${(p.professions||[]).includes(name)?'checked':''}> ${esc(name)}</label>`).join('');
    modal(id?'Perbaiki data pegawai':'Tambah pegawai',`<form id="adminPersonForm" data-id="${esc(id)}"><div class="admin-form-grid">${field('name','Nama lengkap',p.name||'','required maxlength="200"')}${field('unit','Unit kerja',p.unit||'','required maxlength="200"')}<div class="admin-field"><label>Status kepegawaian</label><select name="status">${['PNS/CPNS','PPPK','NON-ASN','LAINNYA'].map(x=>`<option ${x===(p.status||'')?'selected':''}>${x}</option>`).join('')}</select></div>${field('program','Program / tanggung jawab',p.program||'')}${field('nip','NIP (18 angka)',ident.nip||'','inputmode="numeric" pattern="[0-9]{18}" maxlength="18"')}${field('nik','NIK (16 angka)',ident.nik||'','inputmode="numeric" pattern="[0-9]{16}" maxlength="16"')}</div><div class="admin-field"><label>Profesi (boleh lebih dari satu)</label><div class="admin-checkboxes">${profs}</div></div><div class="admin-tip">Data sumber tetap aman. Perubahan ini disimpan ke APP_PEGAWAI di Google Sheets.</div>${actions(id?'Simpan perbaikan':'Tambah pegawai')}</form>`);
  }
  function professionForm(){modal('Tambah profesi',`<form id="adminProfessionForm">${field('name','Nama profesi baru','','required maxlength="60"')}${actions('Tambah profesi')}</form>`)}
  function trainingForm(){
    const professions=(state.raw.professions||[]).map(pr=>`<label class="admin-prof-item" data-prof-name="${esc(norm(pr))}"><input type="checkbox" name="professions" value="${esc(pr)}"><span>${esc(pr)}</span></label>`).join('');
    modal('Tambah pelatihan ke katalog',`<form id="adminTrainingForm">
      <div class="admin-form-grid">
        ${field('name','Nama pelatihan','','required maxlength="300"')}
        <div class="admin-field"><label for="adminTrainingScope">Berlaku untuk</label>
          <select id="adminTrainingScope" name="scope"><option value="wajib">Wajib — semua profesi</option><option value="profesi">Hanya profesi yang dipilih</option></select>
        </div>
      </div>
      <div class="admin-field admin-scope-roles" id="adminScopeRoles" hidden>
        <label for="adminProfessionSearch">Pilih profesi (bisa lebih dari satu)</label>
        <input type="search" id="adminProfessionSearch" placeholder="Ketik untuk mencari profesi..." autocomplete="off">
        <div class="admin-checkboxes admin-prof-options">${professions}</div>
      </div>
      <div class="admin-form-grid">
        ${field('jpl','Jumlah JPL','0','type="number" min="0" max="1000"')}
        ${field('link','Link pembelajaran (https://)','','type="url"')}
      </div>
      <p class="admin-tip">Judul pelatihan diperiksa dengan seluruh katalog sebelum disimpan agar tidak dobel. SIBANGKOM dari data sumber berlaku untuk semua profesi.</p>
      ${actions('Tambah pelatihan')}
    </form>`);
  }
  function passwordForm(){modal('Ganti password admin',`<form id="adminPasswordForm">${field('old','Password sekarang','','type="password" required autocomplete="current-password"')}${field('next','Password baru (min. 10 karakter)','','type="password" minlength="10" required autocomplete="new-password"')}${field('confirm','Ulangi password baru','','type="password" required autocomplete="new-password"')}${actions('Ganti password')}</form>`)}
  function statusForm(id){const p=(state.raw.people||[]).find(x=>x.id===id);if(!p)return;
    const applicable=t=>t.type==='wajib'||t.type==='sibangkom'||t.type==='profesi'&&(p.professions||[]).some(role=>(t.professions||[t.profession]).includes(role))||
      t.type==='individu'&&((p.completed||[]).includes(t.id)||(p.notCompleted||[]).includes(t.id));
    const rawMatching=(state.raw.trainings||[]).filter(applicable);
    const status=t=>(p.completed||[]).includes(t.id)?'yes':(p.notCompleted||[]).includes(t.id)?'no':'unknown';
    const rank={yes:3,no:2,unknown:1};
    // Katalog & rincian pegawai tidak menampilkan judul yang sama dua kali.
    const distinct=new Map();
    for(const t of rawMatching){const key=norm(t.name);const old=distinct.get(key);
      if(!old||rank[status(t)]>rank[status(old)])distinct.set(key,t);}
    const matching=[...distinct.values()].sort((a,b)=>a.name.localeCompare(b.name,'id'));
    const label={yes:'Sudah',no:'Belum',unknown:'Belum diisi'};
    const options=matching.map(t=>`<option value="${esc(t.id)}">${esc(t.name)} · ${esc(t.type==='wajib'||t.type==='sibangkom'?'Wajib':(t.professions||[t.profession]).join(', ')||'Tambahan')}</option>`).join('');
    const list=matching.map(t=>{const current=status(t);
      return `<div class="admin-status-row" data-status-name="${esc(norm(t.name))}"><div class="admin-status-label"><strong>${esc(t.name)}</strong><small>${esc(t.type==='wajib'||t.type==='sibangkom'?'Wajib · semua profesi':t.type==='individu'?'Pelatihan lama':(t.professions||[t.profession]).join(', '))}</small></div><select class="admin-status-picker ${current}" data-admin-status-change="${esc(t.id)}" data-admin-person="${esc(p.id)}" data-saved-value="${current}" aria-label="Status ${esc(t.name)}">${Object.entries(label).map(([value,text])=>`<option value="${value}" ${current===value?'selected':''}>${text}</option>`).join('')}</select></div>`;
    }).join('');
    modal('Kelola pelatihan · '+p.name,`<div class="admin-tip">Pilih pelatihan yang tersedia dalam katalog. Perubahan status disimpan ke APP_RIWAYAT, bukan ke sheet profesi asal.</div>
      <div class="admin-add-training"><h3>+ Masukkan pelatihan untuk ${esc(p.name)}</h3>
      <form id="adminAssignTrainingForm" data-id="${esc(p.id)}">
        <div class="admin-field"><label for="adminAssignId">Cari dan pilih pelatihan dari katalog</label><select id="adminAssignId" name="trainingId" data-searchable="true"><option value="">— Ketik atau pilih pelatihan —</option>${options}</select></div>
        <div class="admin-add-bottom"><div class="admin-field"><label for="adminAssignStatus">Status</label><select name="status" id="adminAssignStatus"><option value="yes">Sudah</option><option value="no">Belum</option><option value="unknown">Belum diisi</option></select></div><button type="submit" class="admin-btn green">Simpan status</button></div>
        <p id="adminFormError" class="error-live" role="alert"></p>
      </form><p class="admin-scope-hint">Pelatihan baru ditambahkan lewat tombol <b>+ Tambah pelatihan</b> di Panel Admin.</p></div>
      <div class="admin-record-header"><h3>Riwayat &amp; daftar pelatihan pegawai</h3><span>${matching.length} pelatihan</span></div>
      <input id="adminStatusQuery" class="admin-filter" placeholder="Cari pelatihan pegawai ini..."><div class="admin-training-list" id="adminStatusRows">${list||'<div class="admin-tip">Belum ada pelatihan yang tercatat untuk pegawai ini.</div>'}</div>
      <div class="admin-actions"><button class="admin-btn outline" data-admin="close">Selesai &amp; perbarui tampilan</button></div>`);
  }
  function linkForm(sibKey){const sib=(state.raw.sibEntries||[]).find(s=>s.key===sibKey);if(!sib)return;
    const people=(state.raw.people||[]).filter(p=>(p.professions||[]).length);
    modal('Cocokkan peserta SIBANGKOM',`<form id="adminLinkForm" data-key="${esc(sibKey)}"><div class="admin-warning"><strong>${esc(sib.name)}</strong><div>${esc(sib.bidang||'—')} · ${esc(sib.tim||'—')}</div><p>Pastikan orangnya benar sebelum dihubungkan. Jangan hanya mengandalkan nama yang mirip.</p></div><div class="admin-field"><label>Cari pegawai tujuan</label><input type="search" id="adminLinkQuery" placeholder="Ketik nama atau unit kerja..."></div><div class="admin-field"><label>Pilih pegawai yang cocok</label><select id="adminLinkTarget" name="personId" required><option value="">Cari nama dulu...</option></select></div>${actions('Hubungkan peserta')}</form>`);
    const build=(q)=>{const candidates=people.filter(p=>norm([p.name,p.unit].join(' ')).includes(norm(q))).slice(0,80);$('#adminLinkTarget').innerHTML='<option value="">Pilih pegawai</option>'+candidates.map(p=>`<option value="${esc(p.id)}" ${p.id===sib.personId?'selected':''}>${esc(p.name)} · ${esc(p.unit)}</option>`).join('')};
    $('#adminLinkQuery').value=sib.name;build(sib.name);
    if(!$('#adminLinkTarget').value)build('');window.SearchableSelect?.syncAll();
  }
  async function submitForm(form){if(state.busy)return;
    const error=$('#adminFormError'),button=form.querySelector('button[type=submit]');state.busy=true;if(error)error.textContent='';if(button){button.disabled=true;button.textContent='Menyimpan...'}
    try{
      const data=new FormData(form);let result;
      if(form.id==='adminPersonForm'){
        const prof=[...form.querySelectorAll('input[name="profession"]:checked')].map(n=>n.value);
        result=await API().call('savePerson',state.token,{id:form.dataset.id||'',name:data.get('name'),unit:data.get('unit'),status:data.get('status'),program:data.get('program'),nip:data.get('nip'),nik:data.get('nik'),professions:prof});
      }else if(form.id==='adminProfessionForm')result=await API().call('saveProfession',state.token,{name:data.get('name')});
      else if(form.id==='adminTrainingForm'){
        const name=String(data.get('name')||'').trim(),scope=data.get('scope'),professions=data.getAll('professions');
        if(scope==='profesi'&&!professions.length)throw Error('Pilih minimal satu profesi.');
        const duplicate=(state.raw.trainings||[]).some(t=>norm(t.name)===norm(name));
        if(duplicate)throw Error('Judul pelatihan sudah ada. Pilih pelatihan yang tersedia agar tidak dobel.');
        result=await API().call('saveTraining',state.token,{name,scope,professions,jpl:Number(data.get('jpl')||0),link:data.get('link')||''});
      }
      else if(form.id==='adminAssignTrainingForm'){
        const personId=form.dataset.id,trainingId=data.get('trainingId'),status=data.get('status');
        if(!trainingId)throw Error('Pilih pelatihan dari katalog terlebih dahulu.');
        result=await API().call('setTrainingStatus',state.token,{personId,trainingId,status});
      }
      else if(form.id==='adminLinkForm')result=await API().call('linkSibangkom',state.token,{sibKey:form.dataset.key,personId:data.get('personId')});
      else if(form.id==='adminPasswordForm'){
        if(data.get('next')!==data.get('confirm'))throw Error('Konfirmasi password belum sama.');
        await API().call('changeAdminPassword',state.token,data.get('old'),data.get('next'));closeModal();await logout();toast('Password diganti. Silakan login dengan password baru.');return;
      }
      if(!result?.ok)throw Error('Penyimpanan gagal, coba lagi.');
      state.dirty=false;closeModal();toast('Tersimpan! Data lagi disinkronkan...');await refreshAfterSave();
    }catch(e){if(error)error.textContent=e.message;else toast(e.message);if(button){button.disabled=false;button.textContent='Coba simpan lagi'}}finally{state.busy=false}
  }
  async function refreshAfterSave(){API().clearCache();const data=await API().call('getPublicData',true);API().writeCache(data);window.location.reload()}
  async function toggle(personId,trainingId,button){if(state.busy)return;const p=(state.raw.people||[]).find(x=>x.id===personId),done=!!p?.completed?.includes(trainingId);state.busy=true;button.disabled=true;
    try{await API().call('saveCompletion',state.token,{personId,trainingId,done:!done});button.className='admin-btn '+(!done?'done':'todo');button.textContent=!done?'Sudah':'Belum';
      if(!done){p.completed.push(trainingId);p.notCompleted=p.notCompleted.filter(id=>id!==trainingId)}else{p.completed=p.completed.filter(id=>id!==trainingId);if(!p.notCompleted.includes(trainingId))p.notCompleted.push(trainingId)}
      API().clearCache();toast('Status tersimpan di Sheet.');
    }catch(e){toast(e.message)}finally{state.busy=false;button.disabled=false}
  }
  async function updateTrainingStatus(personId,trainingId,status,select){
    if(state.busy){select.value=select.dataset.savedValue||'unknown';return;}
    const p=(state.raw.people||[]).find(x=>x.id===personId);if(!p)return;
    const previous=select.dataset.savedValue||((p.completed||[]).includes(trainingId)?'yes':(p.notCompleted||[]).includes(trainingId)?'no':'unknown');
    state.busy=true;state.statusBusy=true;select.disabled=true;
    try{
      const result=await API().call('setTrainingStatus',state.token,{personId,trainingId,status});
      if(!result?.ok)throw Error('Status gagal disimpan.');
      p.completed=(p.completed||[]).filter(id=>id!==trainingId);
      p.notCompleted=(p.notCompleted||[]).filter(id=>id!==trainingId);
      if(status==='yes')p.completed.push(trainingId);
      if(status==='no')p.notCompleted.push(trainingId);
      select.classList.remove('yes','no','unknown');select.classList.add(status);
      select.dataset.savedValue=status;
      state.dirty=true;API().clearCache();toast('Status pelatihan tersimpan.');
    }catch(e){select.value=previous;toast('Gagal menyimpan: '+e.message)}
    finally{state.busy=false;state.statusBusy=false;select.disabled=false}
  }
  document.addEventListener('click',async e=>{
    const eye=e.target.closest('[data-admin-eye]');
    if(eye){const input=document.getElementById(eye.dataset.adminEye);if(!input)return;const visible=input.type==='password';input.type=visible?'text':'password';eye.innerHTML=eyeIcon(visible);eye.setAttribute('aria-pressed',String(visible));eye.setAttribute('aria-label',visible?'Sembunyikan password':'Tampilkan password');eye.title=visible?'Sembunyikan password':'Lihat password';return;}
    const tab=e.target.closest('[data-admin-tab]');if(tab){state.tab=tab.dataset.adminTab;state.search='';state.limit=25;render();return}
    const edit=e.target.closest('[data-admin-edit]');if(edit){personForm(edit.dataset.adminEdit);return}
    const mark=e.target.closest('[data-admin-status]');if(mark){statusForm(mark.dataset.adminStatus);return}
    const link=e.target.closest('[data-admin-link]');if(link){linkForm(link.dataset.adminLink);return}
    const toggleBtn=e.target.closest('[data-admin-toggle]');if(toggleBtn){await toggle(toggleBtn.dataset.adminPerson,toggleBtn.dataset.adminToggle,toggleBtn);return}
    const action=e.target.closest('[data-admin]');if(action){const a=action.dataset.admin;if(a==='close')closeModal();if(a==='add-person')personForm();if(a==='add-training')trainingForm();if(a==='add-profession')professionForm();if(a==='password')passwordForm();if(a==='logout')await logout();if(a==='more'){state.limit+=25;renderListing()}}
  });
  document.addEventListener('input',e=>{if(e.target.id==='adminQuery'){state.search=e.target.value;state.limit=25;renderListing()}if(e.target.id==='adminLinkQuery'){const q=norm(e.target.value),people=(state.raw?.people||[]).filter(p=>(p.professions||[]).length&&norm([p.name,p.unit].join(' ')).includes(q)).slice(0,80);$('#adminLinkTarget').innerHTML='<option value="">Pilih pegawai</option>'+people.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${esc(p.unit)}</option>`).join('');window.SearchableSelect?.syncAll()}if(e.target.id==='adminStatusQuery'){const q=norm(e.target.value);document.querySelectorAll('[data-status-name]').forEach(row=>row.hidden=!norm(row.dataset.statusName).includes(q))}if(e.target.id==='adminProfessionSearch'){const q=norm(e.target.value);document.querySelectorAll('.admin-prof-item').forEach(el=>el.hidden=!norm(el.dataset.profName).includes(q));}});
  document.addEventListener('change',e=>{
    if(e.target.id==='adminTrainingScope')$('#adminScopeRoles').hidden=e.target.value!=='profesi';
    if(e.target.matches('[data-admin-status-change]'))updateTrainingStatus(e.target.dataset.adminPerson,e.target.dataset.adminStatusChange,e.target.value,e.target);
  });
  document.addEventListener('submit',e=>{if(!e.target.id.startsWith('admin'))return;e.preventDefault();if(e.target.id==='adminLogin')login(e.target);else submitForm(e.target)});
  $('#adminModalClose').addEventListener('click',closeModal);$('#adminModalBg').addEventListener('click',e=>{if(e.target===$('#adminModalBg'))closeModal()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#adminModalBg').classList.contains('open'))closeModal()});
  async function setData(raw){state.raw=raw;if(state.token&&!state.auth&&API()?.GAS){try{await fetchAdmin()}catch(e){toast('Sesi admin berakhir. Masuk kembali untuk mengedit.')}}if(window.PelatihanView)render()}
  window.PelatihanAdmin={render,setData};
})();
