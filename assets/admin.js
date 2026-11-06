/* Panel admin: perubahan disimpan ke APP_* di Google Sheets, tidak menimpa tab profesi. */
(() => {'use strict';
  const $=s=>document.querySelector(s);
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=x=>String(x??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
  const authKey='dinkes_pelatihan_admin_session';
  const readSession=()=>{try{return sessionStorage.getItem(authKey)||''}catch(e){return ''}};
  const storeSession=t=>{try{sessionStorage.setItem(authKey,t)}catch(e){}};
  const dropSession=()=>{try{sessionStorage.removeItem(authKey)}catch(e){}};
  const state={raw:null,token:readSession(),auth:false,identities:{},manualPeople:[],tab:'pegawai',search:'',limit:25,busy:false,deletedRecords:[],deletedLoaded:false};
  let statusSession=null; // Pilihan status disimpan sementara; server hanya dipanggil saat Simpan.
  // SVG ringan, tanpa library ikon tambahan atau request jaringan.
  const eyeIcon=visible=>visible
    ?'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 3 18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.1A10 10 0 0 1 12 5c5 0 8.6 3.4 10 7a11 11 0 0 1-4.2 5.2"/><path d="M6.5 6.6A11 11 0 0 0 2 12c1.4 3.6 5 7 10 7 1.5 0 2.9-.3 4.1-.9"/></svg>'
    :'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  /** Gabungkan pegawai dari APP_PEGAWAI ke snapshot admin. Cache publik boleh tertinggal,
   * tetapi calon pasangan SIBANGKOM harus selalu mengenali pegawai yang baru disimpan. */
  function mergeManualPeople(){
    if(!state.raw||!Array.isArray(state.manualPeople))return;
    if(!Array.isArray(state.raw.people))state.raw.people=[];
    const existing=new Map(state.raw.people.map(p=>[String(p.id||''),p]));
    for(const person of state.manualPeople){
      if(!person?.id||!person.name)continue;
      let p=existing.get(String(person.id));
      if(!p){
        p={id:person.id,name:'',unit:'',status:'',professions:[],program:'',completed:[],notCompleted:[],sources:[],sib:null,unmatchedSib:false};
        state.raw.people.push(p);existing.set(String(person.id),p);
      }
      Object.assign(p,{name:person.name,unit:person.unit||'',status:person.status||'',
        program:person.program||'',professions:person.professions||[]});
    }
  }
  /** Nama depan/awal kata diprioritaskan. 'ima' tidak lagi menempatkan Nurhalimah di atas Ima. */
  function matchScore(p,input){
    const clean=s=>norm(s).replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
    const q=clean(input);if(!q)return 7;
    const name=clean(p.name),unit=clean(p.unit),words=name.split(' '),tokens=q.split(' ').filter(t=>t.length>1);
    if(name===q)return 0;
    if(name.startsWith(q))return 1;
    if(tokens.length&&tokens.every(t=>words.some(w=>w.startsWith(t))))return 2;
    if(unit.split(' ').some(w=>w.startsWith(q)))return 4;
    if(q.length>=4&&name.includes(q))return 5;
    if(q.length>=4&&unit.includes(q))return 6;
    return Infinity;
  }
  function renderLinkCandidates(){
    const select=$('#adminLinkTarget'),search=$('#adminLinkQuery');if(!select||!search)return;
    const sib=(state.raw?.sibEntries||[]).find(s=>s.key===$('#adminLinkForm')?.dataset.key);
    const current=select.value;
    const candidates=(state.raw?.people||[])
      .filter(p=>(p.professions||[]).length)
      .map(p=>({p,rank:matchScore(p,search.value)}))
      .filter(x=>Number.isFinite(x.rank))
      .sort((a,b)=>a.rank-b.rank||a.p.name.localeCompare(b.p.name,'id'));
    const shown=candidates.slice(0,60);
    select.innerHTML='<option value="">'+(candidates.length?'Pilih pegawai yang benar':'Pegawai belum ditemukan')+'</option>'+shown.map(({p})=>
      `<option value="${esc(p.id)}">${esc(p.name)} · ${esc(p.unit)} · ${esc((p.professions||[]).join(', '))}</option>`).join('');
    if(current&&shown.some(x=>x.p.id===current))select.value=current;
    else if(sib?.personId&&shown.some(x=>x.p.id===sib.personId))select.value=sib.personId;
    const helper=$('#adminLinkHint');
    if(helper)helper.textContent=candidates.length
      ?`${candidates.length} pegawai ditemukan. Pilih nama yang benar, lalu hubungkan.`
      :'Belum ada pegawai yang cocok. Cek nama atau tekan Perbarui daftar.';
  }
  async function refreshLinkCandidates(){
    const hint=$('#adminLinkHint');if(hint)hint.textContent='Memeriksa pegawai terbaru di Google Sheets...';
    try{
      const detail=await API().call('getAdminData',state.token);
      if(detail?.identities)state.identities=detail.identities;
      state.manualPeople=detail?.manualPeople||[];
      mergeManualPeople();renderLinkCandidates();
    }catch(e){if(hint)hint.textContent='Gagal memperbarui daftar: '+e.message;}
  }
  function API(){return window.PelatihanBridge}
  function toast(msg){window.PelatihanView?.toast(msg)}
  function render(){
    const root=$('#adminContent');if(!root)return;
    if(!state.raw){root.innerHTML='<div class="admin-tip">Data sedang disiapkan...</div>';return;}
    if(!state.auth){
      root.innerHTML=`<form class="admin-login" id="adminLogin"><img src="${esc(window.DINKES_LOGO_SRC||'assets/logo-dinkes.webp')}" alt="Logo Dinkes Kota Bogor"><h2>Halo, Admin! 👋</h2><p>Masuk untuk memperbaiki identitas pegawai, menambah profesi, dan mengelola pelatihan.</p><div class="admin-field"><label for="adminUser">Username</label><input id="adminUser" name="username" required autocomplete="username"></div><div class="admin-field"><label for="adminPassword">Password</label><div class="admin-password-wrap"><input id="adminPassword" name="password" type="password" required autocomplete="current-password"><button class="admin-eye" type="button" data-admin-eye="adminPassword" aria-label="Tampilkan password" title="Lihat password" aria-pressed="false">${eyeIcon(false)}</button></div></div><p id="adminLoginError" class="error-live" role="alert"></p><button type="submit" class="admin-btn" style="width:100%">Masuk ke panel admin</button><div class="admin-tip">Nomor NIP/NIK lengkap hanya bisa dilihat admin. Perubahan disimpan ke Sheet tambahan APP_*.</div></form>`;
      if(!API()?.GAS)$('#adminLoginError').textContent='Koneksi Apps Script belum disiapkan. Periksa pengaturan aplikasi.';
      return;
    }
    const p=(state.raw.people||[]).filter(p=>(p.professions||[]).length),sip=(state.raw.sibEntries||[]).filter(s=>!(state.raw.people||[]).some(x=>x.id===s.personId&&(x.professions||[]).length));
    const missing=p.filter(x=>!state.identities[x.id]?.nip&&!state.identities[x.id]?.nik);
    root.innerHTML=`<div class="admin-grid"><div class="admin-kpi"><strong>${p.length.toLocaleString('id-ID')}</strong><span>Pegawai unik terdata</span></div><div class="admin-kpi"><strong>${(state.raw.professions||[]).length}</strong><span>Profesi</span></div><div class="admin-kpi"><strong>${missing.length.toLocaleString('id-ID')}</strong><span>NIP/NIK perlu dilengkapi</span></div><div class="admin-kpi"><strong>${sip.length.toLocaleString('id-ID')}</strong><span>SIBANGKOM belum dipasangkan</span></div></div>
    <div class="admin-tools"><button class="admin-btn" data-admin="add-person">+ Tambah pegawai</button><button class="admin-btn green" data-admin="add-training">+ Tambah pelatihan</button><button class="admin-btn outline" data-admin="add-profession">+ Tambah profesi</button><button class="admin-btn outline" data-admin="password">Ganti password</button><button class="admin-btn red" data-admin="logout">Keluar</button></div>
    <div class="admin-tabs">${[['pegawai','Pegawai'],['pelatihan','Pelatihan'],['sibangkom','Cocokkan SIBANGKOM'],['dihapus','Data Terhapus']].map(([id,name])=>`<button data-admin-tab="${id}" class="${state.tab===id?'active':''}">${name}</button>`).join('')}</div>
    <input class="admin-filter" id="adminQuery" placeholder="${state.tab==='sibangkom'?'Cari peserta SIBANGKOM...':state.tab==='pegawai'?'Cari nama, unit kerja, atau profesi...':state.tab==='dihapus'?'Cari data terhapus...':'Cari judul pelatihan...'}" value="${esc(state.search)}" autocomplete="off" aria-label="Pencarian admin"><div id="adminListing"></div>`;
    renderListing();
  }
  function renderListing(){const root=$('#adminListing');if(!root||!state.raw)return;
    const q=norm(state.search),people=(state.raw.people||[]).filter(p=>(p.professions||[]).length),train=state.raw.trainings||[],sib=state.raw.sibEntries||[];
    let list=[];
    if(state.tab==='pegawai')list=people.filter(p=>norm([p.name,p.unit,...(p.professions||[])].join(' ')).includes(q)).sort((a,b)=>a.name.localeCompare(b.name,'id'));
    else if(state.tab==='pelatihan')list=train.filter(t=>norm([t.name,t.profession,t.type].join(' ')).includes(q)).sort((a,b)=>a.name.localeCompare(b.name,'id'));
    else if(state.tab==='dihapus')list=(state.deletedRecords||[]).filter(x=>norm([x.name,x.type].join(' ')).includes(q));
    else list=sib.filter(s=>norm([s.name,s.bidang,s.tim].join(' ')).includes(q));
    const slice=list.slice(0,state.limit);
    const row=x=>{
      if(state.tab==='dihapus')return `<article class="admin-record"><div><h4>${esc(x.name)}</h4><p>${esc(x.type==='pegawai'?'Pegawai':'Pelatihan')} · ${esc(x.deletedAt||'')}</p></div><button class="admin-btn outline" data-admin-restore="${esc(x.type)}" data-record-id="${esc(x.id)}">Pulihkan</button></article>`;
      if(state.tab==='pegawai'){
        const identity=state.identities[x.id]||{};
        return `<article class="admin-record"><div><h4>${esc(x.name)}</h4><p>${esc(x.unit)} · ${esc((x.professions||[]).join(', '))}</p><div class="admin-identity ${identity.nip||identity.nik?'':'weak'}">${identity.nip?'NIP: '+esc(identity.nip):identity.nik?'NIK: '+esc(identity.nik):'NIP/NIK belum lengkap'}</div></div><div><button data-admin-edit="${esc(x.id)}">Perbaiki</button> <button data-admin-status="${esc(x.id)}">Status pelatihan</button> <button class="admin-delete-btn" data-admin-delete="pegawai" data-record-id="${esc(x.id)}">Hapus</button></div></article>`;
      }
      if(state.tab==='pelatihan')return `<article class="admin-record"><div><h4>${esc(x.name)}</h4><p>${esc(x.profession||x.type)} · ${esc(x.jpl||'')} ${x.jpl?'JPL':''}</p></div><div class="admin-record-actions"><span class="admin-identity">${esc(x.type)}</span><button class="admin-delete-btn" data-admin-delete="pelatihan" data-record-id="${esc(x.id)}">Hapus</button></div></article>`;
      return `<article class="admin-record"><div><h4>${esc(x.name)}</h4><p>${esc(x.bidang||'Bidang belum diisi')} · ${esc(x.tim||'Tim belum diisi')}</p><div class="admin-identity">${people.some(p=>p.id===x.personId)?'Sudah cocok':'Perlu dicocokkan'}</div></div><button data-admin-link="${esc(x.key)}">${people.some(p=>p.id===x.personId)?'Ganti pasangan':'Cocokkan'}</button></article>`;
    };
    root.innerHTML=`<div style="color:#8393a7;font-size:12px;margin-bottom:12px">Menampilkan ${Math.min(slice.length,list.length).toLocaleString('id-ID')} dari ${list.length.toLocaleString('id-ID')} data</div><div class="admin-list">${slice.map(row).join('')||'<div class="admin-tip">Tidak ada data yang cocok.</div>'}</div>${list.length>slice.length?'<div class="admin-more"><button class="admin-btn outline" data-admin="more">Tampilkan lebih banyak</button></div>':''}`;
  }
  async function login(form){if(!API()?.GAS){$('#adminLoginError').textContent='Backend belum tersambung. Periksa URL Apps Script di pengaturan.';return;}
    const btn=form.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Memeriksa akun...';
    try{const response=await API().call('loginAdmin',form.elements.username.value,form.elements.password.value);state.token=response.token;storeSession(state.token);if(response.identities){state.identities=response.identities;state.manualPeople=response.manualPeople||[];mergeManualPeople();state.auth=true;}else await fetchAdmin();render();toast('Berhasil masuk. Selamat bekerja!')}
    catch(e){$('#adminLoginError').textContent=e.message;btn.disabled=false;btn.textContent='Masuk ke panel admin'}
  }
  async function fetchAdmin(){try{const detail=await API().call('getAdminData',state.token);state.identities=detail.identities||{};state.manualPeople=detail.manualPeople||[];mergeManualPeople();state.auth=true}
    catch(e){state.auth=false;state.token='';state.identities={};dropSession();throw e}}
  async function logout(){try{if(state.token)await API().call('logoutAdmin',state.token)}catch(e){}
    state.auth=false;state.token='';state.identities={};dropSession();render();toast('Berhasil keluar.')}
  function modal(title,content){$('#adminModalTitle').textContent=title;$('#adminModalBody').innerHTML=content;$('#adminModalBg').classList.add('open');document.body.style.overflow='hidden';}
  function closeModal(){
    if(statusSession?.saving)return; // Jangan tutup saat permintaan simpan berlangsung.
    const discarded=!!statusSession?.changes.size;
    statusSession=null;
    $('#adminModalBg').classList.remove('open');$('#adminModalBody').innerHTML='';document.body.style.overflow='';
    if(discarded)toast('Perubahan yang belum disimpan dibatalkan.');
  }
  const field=(name,label,value='',extra='')=>`<div class="admin-field"><label for="a_${name}">${esc(label)}</label>${/type="password"/.test(extra)?`<div class="admin-password-wrap"><input id="a_${name}" name="${name}" value="${esc(value)}" ${extra}><button class="admin-eye" type="button" data-admin-eye="a_${name}" aria-label="Tampilkan password" title="Lihat password" aria-pressed="false">${eyeIcon(false)}</button></div>`:`<input id="a_${name}" name="${name}" value="${esc(value)}" ${extra}>`}</div>`;
  const actions=(submit='Simpan')=>`<div class="admin-actions"><button type="button" class="admin-btn outline" data-admin="close">Batal</button><button type="submit" class="admin-btn">${submit}</button></div><p id="adminFormError" class="error-live"></p>`;
  function personForm(id=''){
    const p=(state.raw.people||[]).find(x=>x.id===id)||{},ident=state.identities[id]||{};
    const profs=(state.raw.professions||[]).map(name=>`<label><input type="checkbox" name="profession" value="${esc(name)}" ${(p.professions||[]).includes(name)?'checked':''}> ${esc(name)}</label>`).join('');
    modal(id?'Perbaiki data pegawai':'Tambah pegawai',`<form id="adminPersonForm" data-id="${esc(id)}"><div class="admin-form-grid">${field('name','Nama lengkap',p.name||'','required maxlength="200"')}${field('unit','Unit kerja',p.unit||'','required maxlength="200"')}<div class="admin-field"><label>Status kepegawaian</label><select name="status">${['PNS/CPNS','PPPK','NON-ASN','LAINNYA'].map(x=>`<option ${x===(p.status||'')?'selected':''}>${x}</option>`).join('')}</select></div>${field('program','Program / tanggung jawab',p.program||'')}${field('nip','NIP (18 angka)',ident.nip||'','inputmode="numeric" pattern="[0-9]{18}" maxlength="18"')}${field('nik','NIK (16 angka)',ident.nik||'','inputmode="numeric" pattern="[0-9]{16}" maxlength="16"')}</div><div class="admin-field"><label>Profesi (boleh lebih dari satu)</label><div class="admin-checkboxes">${profs}</div></div><div class="admin-tip">Data sumber tetap aman. Perubahan ini disimpan ke APP_PEGAWAI di Google Sheets.</div>${actions(id?'Simpan perbaikan':'Tambah pegawai')}</form>`);
  }
  function professionForm(){modal('Tambah profesi',`<form id="adminProfessionForm">${field('name','Nama profesi baru','','required maxlength="60"')}${actions('Tambah profesi')}</form>`)}
  function trainingForm(){modal('Tambah pelatihan',`<form id="adminTrainingForm"><div class="admin-form-grid">${field('name','Nama pelatihan','','required maxlength="300"')}<div class="admin-field"><label>Jenis data</label><select name="type" id="adminTrainingType"><option value="profesi">Pelatihan profesi</option><option value="sibangkom">SIBANGKOM</option><option value="wajib">Pembelajaran wajib</option></select></div><div class="admin-field"><label>Profesi</label><select name="profession" id="adminTrainingProfession">${(state.raw.professions||[]).map(pr=>`<option value="${esc(pr)}">${esc(pr)}</option>`).join('')}</select></div><div class="admin-tip admin-form-note">Pelatihan profesi akan muncul sesuai profesi yang dipilih. SIBANGKOM tersedia untuk seluruh pegawai.</div>${field('jpl','Jumlah JPL','0','type="number" min="0" max="1000"')}${field('link','Link pembelajaran (https://)','','type="url"')}</div>${actions('Tambah pelatihan')}</form>`)}

  /** Konfirmasi hapus bukan pop-up browser biasa. Wajib mengetik HAPUS. */
  function deleteForm(type,id){
    if(!state.auth||state.busy||!['pegawai','pelatihan'].includes(type))return;
    const record=(type==='pegawai'?state.raw?.people:state.raw?.trainings||[]).find(x=>x.id===id);
    if(!record)return toast('Data tidak ditemukan. Klik Sinkronkan dulu.');
    const label=type==='pegawai'?'pegawai':'pelatihan';
    modal('Hapus '+label,`<form id="adminDeleteForm" data-type="${esc(type)}" data-id="${esc(id)}"><div class="admin-warning delete-warning"><strong>Yakin mau hapus ${esc(record.name)}?</strong><p>${type==='pegawai'?'Pegawai tidak lagi muncul di daftar, pencarian, dan pilihan SIBANGKOM.':'Pelatihan akan hilang dari daftar dan perhitungan status pegawai.'} Data sumber asli tetap aman. Riwayat penghapusan disimpan di APP_HAPUS.</p></div><div class="admin-field"><label for="adminDeleteConfirm">Ketik <strong>HAPUS</strong> untuk melanjutkan</label><input id="adminDeleteConfirm" name="confirmation" autocomplete="off" spellcheck="false" placeholder="HAPUS" required aria-describedby="adminDeleteHint"><small id="adminDeleteHint" class="help">Tombol hapus baru aktif setelah kata HAPUS diketik.</small></div><div class="admin-actions"><button type="button" class="admin-btn outline" data-admin="close">Batal</button><button type="submit" class="admin-btn red" id="adminDeleteSubmit" disabled>Ya, hapus</button></div><p id="adminFormError" class="error-live" role="alert"></p></form>`);
    $('#adminDeleteConfirm')?.focus();
  }
  async function submitDelete(form){
    if(state.busy)return;
    const type=form.dataset.type,id=form.dataset.id;
    const confirmation=$('#adminDeleteConfirm')?.value||'';
    if(confirmation!=='HAPUS')return;
    state.busy=true;
    const button=$('#adminDeleteSubmit'),error=$('#adminFormError');
    if(button){button.disabled=true;button.textContent='Menghapus...';}
    if(error)error.textContent='';
    try{
      const result=await API().call('deleteRecord',state.token,{type,id,confirmation});
      if(!result?.ok)throw Error('Penghapusan gagal.');
      const raw=state.raw;
      if(state.deletedLoaded){const removed=(type==='pegawai'?raw.people:raw.trainings).find(x=>x.id===id);
        if(removed)state.deletedRecords.unshift({type,id,name:removed.name,deletedAt:'Baru saja'});
      }
      if(type==='pegawai'){
        raw.people=(raw.people||[]).filter(p=>p.id!==id);
        state.manualPeople=state.manualPeople.filter(p=>p.id!==id);
        delete state.identities[id];
        (raw.sibEntries||[]).forEach(row=>{if(row.personId===id)row.personId=row.key;});
      }else{
        raw.trainings=(raw.trainings||[]).filter(t=>t.id!==id);
        (raw.people||[]).forEach(p=>{
          p.completed=(p.completed||[]).filter(t=>t!==id);
          p.notCompleted=(p.notCompleted||[]).filter(t=>t!==id);
        });
        (raw.sibEntries||[]).forEach(row=>{
          ['done','no','unknown'].forEach(key=>{row[key]=(row[key]||[]).filter(t=>t!==id);});
        });
      }
      API()?.commitLocal?.(raw);
      window.PelatihanView?.syncFromRaw?.(raw);
      closeModal();render();toast(type==='pegawai'?'Pegawai sudah dihapus dari aplikasi.':'Pelatihan sudah dihapus dari aplikasi.');
    }catch(e){if(error)error.textContent=e.message||String(e);if(button){button.textContent='Ya, hapus';button.disabled=false;}}
    finally{state.busy=false;}
  }
  async function loadDeletedRecords(){
    if(!state.auth)return;
    const target=$('#adminListing');if(target)target.innerHTML='<div class="admin-tip">Membaca daftar terhapus...</div>';
    try{const records=await API().call('getDeletedRecords',state.token);state.deletedRecords=Array.isArray(records)?records:[];state.deletedLoaded=true;if(state.tab==='dihapus')renderListing();}
    catch(e){if(state.tab==='dihapus'&&target)target.innerHTML='<div class="admin-tip">Tidak bisa membuka riwayat hapus: '+esc(e.message)+'</div>';}
  }
  function restoreForm(type,id){
    const record=state.deletedRecords.find(r=>r.id===id&&r.type===type);
    if(!record||state.busy)return;
    modal('Pulihkan '+(type==='pegawai'?'pegawai':'pelatihan'),`<form id="adminRestoreForm" data-type="${esc(type)}" data-id="${esc(id)}"><div class="admin-tip"><b>${esc(record.name)}</b><p>Data akan muncul kembali di aplikasi. Riwayat hapus tetap tersimpan.</p></div><div class="admin-field"><label for="adminRestoreConfirm">Ketik <b>PULIHKAN</b> untuk melanjutkan</label><input name="confirmation" id="adminRestoreConfirm" placeholder="PULIHKAN" spellcheck="false" autocomplete="off" required></div><div class="admin-actions"><button type="button" class="admin-btn outline" data-admin="close">Batal</button><button type="submit" class="admin-btn" id="adminRestoreSubmit" disabled>Pulihkan data</button></div><p id="adminFormError" class="error-live" role="alert"></p></form>`);
    $('#adminRestoreConfirm')?.focus();
  }
  async function submitRestore(form){
    if(state.busy||$('#adminRestoreConfirm')?.value!=='PULIHKAN')return;
    state.busy=true;
    const btn=$('#adminRestoreSubmit'),error=$('#adminFormError'),type=form.dataset.type,id=form.dataset.id;
    if(btn){btn.disabled=true;btn.textContent='Memulihkan...'}
    try{
      const result=await API().call('restoreRecord',state.token,{type,id,confirmation:'PULIHKAN'});
      if(!result?.ok)throw Error('Pemulihan gagal.');
      state.deletedRecords=state.deletedRecords.filter(x=>!(x.id===id&&x.type===type));
      const raw=state.raw;
      if(type==='pegawai'&&result.person){
        let person=raw.people.find(p=>p.id===id);
        if(!person){person=result.person;raw.people.push(person)}
        else Object.assign(person,result.person);
        const statuses=result.statuses||[];
        for(const r of statuses){
          person.completed=person.completed.filter(x=>x!==r.trainingId);
          person.notCompleted=person.notCompleted.filter(x=>x!==r.trainingId);
          (r.done?person.completed:person.notCompleted).push(r.trainingId);
        }
        for(const key of result.sibKeys||[]){
          const sib=(raw.sibEntries||[]).find(x=>x.key===key);
          if(!sib)continue;
          sib.personId=id;
          person.sib={key,bidang:sib.bidang,tim:sib.tim,progress:sib.progress,jpl:sib.jpl};
          person.completed=[...new Set([...(person.completed||[]),...(sib.done||[])])];
          person.notCompleted=[...new Set([...(person.notCompleted||[]),...(sib.no||[])])].filter(x=>!person.completed.includes(x));
          raw.people=raw.people.filter(p=>p.id!==key);
        }
        state.identities[id]=result.identity||{};
        person.nipMasked=maskProfileId(state.identities[id].nip);
        person.nikMasked=maskProfileId(state.identities[id].nik);
        if(id.startsWith('USR:')){
          state.manualPeople=state.manualPeople.filter(p=>p.id!==id);
          state.manualPeople.push({id,name:person.name,unit:person.unit,status:person.status,professions:person.professions,program:person.program});
        }
      }
      if(type==='pelatihan'&&result.training&&!raw.trainings.some(t=>t.id===id))raw.trainings.push(result.training);
      API()?.commitLocal?.(raw);
      window.PelatihanView?.syncFromRaw?.(raw);
      closeModal();render();toast('Data '+(type==='pegawai'?'pegawai':'pelatihan')+' sudah dipulihkan.');
    }catch(e){if(error)error.textContent=e.message||String(e);if(btn){btn.disabled=false;btn.textContent='Pulihkan data'}}
    finally{state.busy=false;}
  }
  function passwordForm(){modal('Ganti password admin',`<form id="adminPasswordForm">${field('old','Password sekarang','','type="password" required autocomplete="current-password"')}${field('next','Password baru (min. 10 karakter)','','type="password" minlength="10" required autocomplete="new-password"')}${field('confirm','Ulangi password baru','','type="password" required autocomplete="new-password"')}${actions('Ganti password')}</form>`)}
  // Perubahan hanya dicatat sementara sampai admin menekan Simpan.
  // Daftar: profesi pegawai + SIBANGKOM (wajib untuk semua), tidak mencampur profesi lain.
  function statusForm(id){
    if(statusSession?.saving)return;
    const p=(state.raw?.people||[]).find(x=>x.id===id);if(!p)return;
    const roles=new Set((p.professions||[]).map(x=>String(x).trim().toUpperCase()));
    const applicable=(state.raw.trainings||[])
      .filter(t=>t.type==='sibangkom'||(t.type==='profesi'&&roles.has(String(t.profession||'').trim().toUpperCase())))
      .sort((a,b)=>Number(a.type==='sibangkom')-Number(b.type==='sibangkom')||a.name.localeCompare(b.name,'id'));
    const original=new Map(applicable.map(t=>[t.id, (p.completed||[]).includes(t.id)?'yes':(p.notCompleted||[]).includes(t.id)?'no':'unknown']));
    statusSession={personId:id,original,changes:new Map(),saving:false};
    const profCount=applicable.filter(t=>t.type==='profesi').length,sibCount=applicable.filter(t=>t.type==='sibangkom').length;
    const professionText=(p.professions||[]).join(' / ')||'profesi pegawai';
    modal('Status pelatihan · '+p.name,`<div class="admin-tip">${profCount} pelatihan ${esc(professionText)} · ${sibCount} SIBANGKOM. Pilih status yang ingin diubah, lalu klik <b>Simpan</b>. Kolom kosong dihitung Belum. Pelatihan profesi tetap bukan pelatihan wajib.</div><input id="adminStatusQuery" type="search" class="admin-filter" placeholder="Cari pelatihan..." autocomplete="off" aria-label="Cari pelatihan pegawai"><div class="admin-training-list" id="adminStatusRows">${applicable.map(t=>`<div class="admin-status-row" data-status-name="${esc(norm(t.name+' '+(t.profession||t.type)))}"><div>${esc(t.name)} <small style="color:#9aa9b7">· ${esc(t.profession||t.type)}</small></div><button type="button" class="admin-btn ${original.get(t.id)==='yes'?'done':'todo'}" data-admin-toggle="${esc(t.id)}" data-admin-person="${esc(p.id)}" aria-label="Ubah status ${esc(t.name)}">${original.get(t.id)==='yes'?'Sudah':'Belum'}</button></div>`).join('')||'<div class="admin-tip">Belum ada pelatihan untuk profesi ini.</div>'}</div><div id="adminStatusNoResult" class="admin-tip" hidden>Pelatihan tidak ditemukan.</div><div class="admin-actions admin-status-actions"><button type="button" class="admin-btn outline" data-admin="close">Tutup</button><button type="button" class="admin-btn admin-status-save" id="adminStatusSave" data-admin="save-status" hidden>Simpan</button></div><p class="error-live" id="adminStatusError" role="alert"></p>`);
  }
  function filterStatusRows(query){
    const q=norm(query),rows=document.querySelectorAll('#adminStatusRows [data-status-name]');
    let visible=0;
    rows.forEach(row=>{const matches=!q||row.dataset.statusName.includes(q);row.hidden=!matches;if(matches)visible++});
    const empty=$('#adminStatusNoResult');if(empty)empty.hidden=visible!==0||rows.length===0;
  }
  function statusPaint(button,status,dirty=false){
    if(!button)return;
    button.className='admin-btn '+(status==='yes'?'done':'todo');
    button.textContent=status==='yes'?'Sudah':'Belum';
    button.dataset.dirty=String(dirty);
    button.title=dirty?'Belum disimpan':'Klik untuk mengubah';
  }
  function updateStatusSaveButton(){
    const button=$('#adminStatusSave'),draft=statusSession;if(!button||!draft)return;
    const count=draft.changes.size;
    button.hidden=count===0;button.disabled=draft.saving;
    if(!draft.saving)button.textContent=count>1?`Simpan (${count})`:'Simpan';
  }
  function stageStatus(personId,trainingId,button){
    const draft=statusSession;
    if(!draft||draft.saving||draft.personId!==personId||!draft.original.has(trainingId))return;
    const before=draft.original.get(trainingId),current=draft.changes.get(trainingId)||before;
    // Status awal kosong dapat kembali ke kosong sebelum disimpan. Status tersimpan
    // beralih antara Sudah dan Belum (backend tidak mendukung penghapusan status).
    const next=current==='unknown'?'yes':current==='yes'?'no':before==='unknown'?'unknown':'yes';
    if(next===before)draft.changes.delete(trainingId);else draft.changes.set(trainingId,next);
    statusPaint(button,next,draft.changes.has(trainingId));
    updateStatusSaveButton();
  }
  async function saveStatusDraft(){
    const draft=statusSession;if(!draft||draft.saving||!draft.changes.size||!state.auth)return;
    const button=$('#adminStatusSave'),error=$('#adminStatusError');
    draft.saving=true;
    if(error)error.textContent='';
    if(button){button.disabled=true;button.textContent='Menyimpan...';button.classList.add('status-saving');button.setAttribute('aria-busy','true')}
    document.querySelectorAll('#adminStatusRows [data-admin-toggle]').forEach(b=>b.disabled=true);
    API()?.markLocalEdit?.(); // Cegah refresh latar belakang menimpa data sampai simpan selesai.
    let saved=0;
    try{
      while(draft.changes.size){
        const entries=[...draft.changes.entries()].slice(0,30);
        const payload=entries.map(([trainingId,status])=>({personId:draft.personId,trainingId,done:status==='yes'}));
        const result=await API().call('saveCompletionsBatch',state.token,payload);
        if(!result?.ok)throw Error('Google Sheets belum mengonfirmasi penyimpanan.');
        for(const [trainingId,status] of entries){
          assignStatus(draft.personId,trainingId,status==='yes');
          draft.original.set(trainingId,status);draft.changes.delete(trainingId);
          const b=[...document.querySelectorAll('#adminStatusRows [data-admin-toggle]')].find(x=>x.dataset.adminToggle===trainingId);
          statusPaint(b,status,false);
        }
        saved+=entries.length;
        // Satu penyimpanan cache browser per kelompok, bukan per klik status.
        API().commitLocal?.(state.raw);
      }
      toast(`${saved} status pelatihan tersimpan.`);
    }catch(e){
      if(error)error.textContent='Belum berhasil menyimpan: '+(e.message||e)+' Pilihan yang belum tersimpan tetap ada. Klik Simpan lagi.';
      else toast('Gagal menyimpan status: '+(e.message||e));
      if(saved)toast(`${saved} status sudah tersimpan. Sisanya bisa dicoba lagi.`);
    }finally{
      draft.saving=false;
      if(button){button.classList.remove('status-saving');button.removeAttribute('aria-busy')}
      document.querySelectorAll('#adminStatusRows [data-admin-toggle]').forEach(b=>b.disabled=false);
      updateStatusSaveButton();
    }
  }
  function linkForm(sibKey){const sib=(state.raw.sibEntries||[]).find(s=>s.key===sibKey);if(!sib)return;
    modal('Cocokkan peserta SIBANGKOM',`<form id="adminLinkForm" data-key="${esc(sibKey)}"><div class="admin-warning"><strong>${esc(sib.name)}</strong><div>${esc(sib.bidang||'—')} · ${esc(sib.tim||'—')}</div><p>Pastikan orangnya benar sebelum dihubungkan. Jangan hanya mengandalkan nama yang mirip.</p></div><div class="admin-field"><label for="adminLinkQuery">Cari pegawai tujuan</label><input type="search" id="adminLinkQuery" placeholder="Ketik nama atau unit kerja..." autocomplete="off"></div><div class="admin-field"><label for="adminLinkTarget">Pilih pegawai yang cocok</label><select id="adminLinkTarget" name="personId" required><option value="">Mencari pegawai...</option></select><small id="adminLinkHint" class="help" aria-live="polite"></small></div><div class="admin-actions" style="justify-content:flex-start"><button class="admin-btn outline" type="button" data-admin="refresh-link">Perbarui daftar pegawai</button></div>${actions('Hubungkan peserta')}</form>`);
    // Cari dua kata pertama dulu; gelar pada SIBANGKOM tidak menghalangi kecocokan.
    $('#adminLinkQuery').value=String(sib.name||'').trim().split(/\s+/).slice(0,2).join(' ');
    renderLinkCandidates();
    // Data terbaru sudah diambil saat login atau saat terakhir menyimpan pegawai.
    // Jangan membuat request tambahan setiap kali modal dibuka.
    // Tombol Perbarui daftar tersedia bila admin lain baru saja menambah pegawai.
  }
  // Terapkan perubahan kecil ke memori dan cache setelah backend menyatakan BERHASIL.
  // Hindari getPublicData(true) + reload seluruh website setiap kali admin menyimpan satu baris.
  // Data untuk profil publik cukup 4 angka pertama. Nomor lengkap tetap di identitas admin.
  function maskProfileId(value){
    const digits=String(value||'').replace(/\D/g,'');
    return (digits.length===16||digits.length===18)?digits.slice(0,4)+'*'.repeat(digits.length-4):'';
  }
  function localSaved(form,payload,result){
    const raw=state.raw;if(!raw)return;
    if(form.id==='adminLinkForm'){
      const sib=(raw.sibEntries||[]).find(x=>x.key===payload.sibKey);
      const target=(raw.people||[]).find(x=>x.id===payload.personId);
      if(!sib||!target)return;
      const previous=(raw.people||[]).find(x=>x.id===sib.personId);
      if(previous?.sib?.key===sib.key){
        previous.sib=null;
        previous.completed=(previous.completed||[]).filter(id=>!(sib.done||[]).includes(id));
        previous.notCompleted=(previous.notCompleted||[]).filter(id=>!(sib.no||[]).includes(id));
      }
      sib.personId=payload.personId;
      target.sib={key:sib.key,bidang:sib.bidang,tim:sib.tim,progress:sib.progress,jpl:sib.jpl};
      target.unmatchedSib=false;
      target.completed=[...new Set([...(target.completed||[]),...(sib.done||[])])];
      target.notCompleted=[...new Set([...(target.notCompleted||[]),...(sib.no||[])])].filter(id=>!target.completed.includes(id));
      raw.people=(raw.people||[]).filter(p=>p.id!==sib.key);
      window.PelatihanView?.patchSibangkom?.(sib.key,payload.personId);
    }else if(form.id==='adminPersonForm'){
      const id=result.id||payload.id;if(!id)return;
      let person=(raw.people||[]).find(x=>x.id===id);
      if(!person){person={id,completed:[],notCompleted:[],sources:[],sib:null,unmatchedSib:false};raw.people.push(person)}
      Object.assign(person,{name:payload.name,unit:payload.unit,status:payload.status,program:payload.program,professions:payload.professions,nipMasked:maskProfileId(payload.nip),nikMasked:maskProfileId(payload.nik)});
      state.identities[id]={nip:payload.nip||'',nik:payload.nik||''};
      const index=state.manualPeople.findIndex(x=>x.id===id);
      const publicPerson={id,name:payload.name,unit:payload.unit,status:payload.status,program:payload.program,professions:payload.professions};
      if(index<0)state.manualPeople.push(publicPerson);else state.manualPeople[index]=publicPerson;
    }else if(form.id==='adminProfessionForm'){
      const name=String(payload.name||'').trim().toUpperCase();
      if(name&&!(raw.professions||[]).includes(name))raw.professions.push(name);
    }else if(form.id==='adminTrainingForm'){
      if(result.id)raw.trainings.push({id:result.id,name:payload.name,profession:payload.type==='profesi'?payload.profession:'',type:payload.type,jpl:payload.jpl,link:payload.link||''});
    }
    // Snapshot publik tidak berisi token, NIP, maupun NIK.
    API()?.commitLocal?.(raw);
    // Perbarui profil dan angka di memori langsung setelah cocokkan/tambah data. Tanpa reload/GET seluruh sheet.
    window.PelatihanView?.syncFromRaw?.(raw);
  }
  async function submitForm(form){if(state.busy)return;
    const error=$('#adminFormError'),button=form.querySelector('button[type=submit]');state.busy=true;if(error)error.textContent='';if(button){button.disabled=true;button.textContent='Menyimpan...'}
    try{
      const data=new FormData(form);let result,payload;
      if(form.id==='adminPersonForm'){
        const prof=[...form.querySelectorAll('input[name="profession"]:checked')].map(n=>n.value);
        payload={id:form.dataset.id||'',name:data.get('name'),unit:data.get('unit'),status:data.get('status'),program:data.get('program'),nip:data.get('nip'),nik:data.get('nik'),professions:prof};
        result=await API().call('savePerson',state.token,payload);
      }else if(form.id==='adminProfessionForm'){
        payload={name:data.get('name')};result=await API().call('saveProfession',state.token,payload);
      }else if(form.id==='adminTrainingForm'){
        payload={name:data.get('name'),type:data.get('type'),profession:data.get('profession'),jpl:Number(data.get('jpl')||0),link:data.get('link')||''};
        result=await API().call('saveTraining',state.token,payload);
      }else if(form.id==='adminLinkForm'){
        payload={sibKey:form.dataset.key,personId:data.get('personId')};
        result=await API().call('linkSibangkom',state.token,payload);
      }
      else if(form.id==='adminPasswordForm'){
        if(data.get('next')!==data.get('confirm'))throw Error('Konfirmasi password belum sama.');
        await API().call('changeAdminPassword',state.token,data.get('old'),data.get('next'));closeModal();await logout();toast('Password diganti. Silakan login dengan password baru.');return;
      }
      if(!result?.ok)throw Error('Penyimpanan gagal, coba lagi.');
      localSaved(form,payload,result);closeModal();render();toast('Tersimpan di Google Sheets.');
    }catch(e){if(error)error.textContent=e.message;else toast(e.message);if(button){button.disabled=false;button.textContent='Coba simpan lagi'}}finally{state.busy=false}
  }
  // Mengubah UI setelah backend menyatakan sukses, tanpa reload halaman.
  function assignStatus(personId,trainingId,yes){
    const p=(state.raw?.people||[]).find(x=>x.id===personId);if(!p)return;
    p.completed=(p.completed||[]).filter(x=>x!==trainingId);
    p.notCompleted=(p.notCompleted||[]).filter(x=>x!==trainingId);
    if(yes!==null)(yes?p.completed:p.notCompleted).push(trainingId);
    if(trainingId.startsWith('S:')){
      const sib=(state.raw.sibEntries||[]).find(x=>x.personId===personId);
      if(sib){sib.done=(sib.done||[]).filter(x=>x!==trainingId);sib.no=(sib.no||[]).filter(x=>x!==trainingId);sib.unknown=(sib.unknown||[]).filter(x=>x!==trainingId);if(yes!==null)(yes?sib.done:sib.no).push(trainingId)}
    }
    window.PelatihanView?.patchCompletion?.(personId,trainingId,yes);
  }
  document.addEventListener('click',async e=>{
    const eye=e.target.closest('[data-admin-eye]');
    if(eye){const input=document.getElementById(eye.dataset.adminEye);if(!input)return;const visible=input.type==='password';input.type=visible?'text':'password';eye.innerHTML=eyeIcon(visible);eye.setAttribute('aria-pressed',String(visible));eye.setAttribute('aria-label',visible?'Sembunyikan password':'Tampilkan password');eye.title=visible?'Sembunyikan password':'Lihat password';return;}
    const tab=e.target.closest('[data-admin-tab]');if(tab){state.tab=tab.dataset.adminTab;state.search='';state.limit=25;render();if(state.tab==='dihapus'&&!state.deletedLoaded)loadDeletedRecords();return}
    const restore=e.target.closest('[data-admin-restore]');if(restore){restoreForm(restore.dataset.adminRestore,restore.dataset.recordId);return}
    const remove=e.target.closest('[data-admin-delete]');if(remove){deleteForm(remove.dataset.adminDelete,remove.dataset.recordId);return}
    const edit=e.target.closest('[data-admin-edit]');if(edit){personForm(edit.dataset.adminEdit);return}
    const mark=e.target.closest('[data-admin-status]');if(mark){statusForm(mark.dataset.adminStatus);return}
    const link=e.target.closest('[data-admin-link]');if(link){linkForm(link.dataset.adminLink);return}
    const toggleBtn=e.target.closest('[data-admin-toggle]');if(toggleBtn){stageStatus(toggleBtn.dataset.adminPerson,toggleBtn.dataset.adminToggle,toggleBtn);return}
    const action=e.target.closest('[data-admin]');if(action){const a=action.dataset.admin;if(a==='close')closeModal();if(a==='add-person')personForm();if(a==='add-training')trainingForm();if(a==='add-profession')professionForm();if(a==='password')passwordForm();if(a==='logout')await logout();if(a==='more'){state.limit+=25;renderListing()}if(a==='refresh-link')refreshLinkCandidates();if(a==='save-status')await saveStatusDraft()}
  });
  document.addEventListener('input',e=>{if(e.target.id==='adminQuery'){state.search=e.target.value;state.limit=25;renderListing()}if(e.target.id==='adminLinkQuery')renderLinkCandidates();if(e.target.id==='adminRestoreConfirm'){const btn=$('#adminRestoreSubmit');if(btn)btn.disabled=e.target.value!=='PULIHKAN'||state.busy;}if(e.target.id==='adminDeleteConfirm'){const btn=$('#adminDeleteSubmit');if(btn)btn.disabled=e.target.value!=='HAPUS'||state.busy;}if(e.target.id==='adminStatusQuery')filterStatusRows(e.target.value)});
  document.addEventListener('change',e=>{if(e.target.id==='adminTrainingType')$('#adminTrainingProfession').disabled=e.target.value!=='profesi'});
  document.addEventListener('submit',e=>{if(!e.target.id.startsWith('admin'))return;e.preventDefault();if(e.target.id==='adminLogin')login(e.target);else if(e.target.id==='adminDeleteForm')submitDelete(e.target);else if(e.target.id==='adminRestoreForm')submitRestore(e.target);else submitForm(e.target)});
  $('#adminModalClose').addEventListener('click',closeModal);$('#adminModalBg').addEventListener('click',e=>{if(e.target===$('#adminModalBg'))closeModal()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#adminModalBg').classList.contains('open'))closeModal()});
  async function setData(raw){state.raw=raw;mergeManualPeople();if(state.token&&!state.auth&&API()?.GAS){try{await fetchAdmin()}catch(e){toast('Sesi admin berakhir. Masuk kembali untuk mengedit.')}}if(window.PelatihanView)render()}
  window.PelatihanAdmin={render,setData};
})();
