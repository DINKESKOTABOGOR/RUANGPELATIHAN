/* Filter ketik/pilih. Menjaga select asli agar FormData dan event change lama tetap dipakai.
   Tanpa paket eksternal, tanpa request server. Daftar dibuat hanya saat dropdown dibuka. */
(() => {'use strict';
  const ids=new Set(['roleFilter','unitFilter','statusFilter','trainingRole','refRoleFilter','adminAssignId','adminLinkTarget']);
  const widgets=new WeakMap();
  const norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('id').trim();
  let active=null;
  function close(w){if(!w)return;w.wrap.classList.remove('search-open');w.input.setAttribute('aria-expanded','false');if(active===w)active=null;}
  function sync(w){const option=w.select.selectedOptions[0];w.input.value=option?.textContent?.trim()||'';w.input.placeholder=w.select.options[0]?.textContent?.trim()||'Cari dan pilih...';}
  function optionsFor(w,q){const filter=norm(q);return [...w.select.options].filter(opt=>!opt.disabled&&(!filter||norm(opt.textContent).includes(filter)));}
  function menu(w,query=''){
    const items=optionsFor(w,query),list=w.list;
    list.replaceChildren();
    const fragment=document.createDocumentFragment();
    for(const opt of items.slice(0,65)){
      const button=document.createElement('button');button.type='button';button.className='search-select-option';
      if(opt.value===w.select.value)button.classList.add('selected');
      button.dataset.value=opt.value;button.textContent=opt.textContent.trim();
      button.setAttribute('role','option');button.setAttribute('aria-selected',String(opt.value===w.select.value));
      button.addEventListener('mousedown',e=>e.preventDefault());
      button.addEventListener('click',()=>{w.select.value=opt.value;sync(w);close(w);w.select.dispatchEvent(new Event('change',{bubbles:true}));});
      fragment.appendChild(button);
    }
    if(!items.length){const empty=document.createElement('div');empty.className='search-select-empty';empty.textContent='Tidak ada pilihan yang cocok';fragment.appendChild(empty);}
    else if(items.length>65){const hint=document.createElement('div');hint.className='search-select-empty';hint.textContent='Ketik lebih spesifik untuk melihat pilihan lain';fragment.appendChild(hint);}
    list.appendChild(fragment);
  }
  function open(w){if(active&&active!==w)close(active);active=w;w.wrap.classList.add('search-open');w.input.setAttribute('aria-expanded','true');menu(w,'');}
  function enhance(root=document){
    if(!root)return;
    const selects=root.matches?.('select')?[root]:[...root.querySelectorAll('select')];
    for(const select of selects){if(!ids.has(select.id)&&select.dataset.searchable!=='true'||widgets.has(select))continue;
      const wrap=document.createElement('div');wrap.className='search-select';
      const input=document.createElement('input');input.type='text';input.className='search-select-input';input.autocomplete='off';input.spellcheck=false;
      input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');
      input.setAttribute('aria-label',document.querySelector(`label[for="${select.id}"]`)?.textContent?.trim()||select.getAttribute('aria-label')||'Cari pilihan');
      const arrow=document.createElement('span');arrow.className='search-select-caret';arrow.textContent='⌄';arrow.setAttribute('aria-hidden','true');
      const list=document.createElement('div');list.className='search-select-menu';list.setAttribute('role','listbox');
      select.before(wrap);wrap.append(input,arrow,list,select);select.classList.add('search-select-original');
      const w={select,wrap,input,list};widgets.set(select,w);sync(w);
      input.addEventListener('focus',()=>{open(w);input.select();});
      input.addEventListener('click',()=>{if(active!==w)open(w);});
      input.addEventListener('input',()=>{if(active!==w)open(w);menu(w,input.value);});
      input.addEventListener('keydown',e=>{
        if(e.key==='Escape'){close(w);sync(w);input.blur();e.preventDefault();}
        if(e.key==='ArrowDown'||e.key==='ArrowUp'){
          e.preventDefault();if(active!==w)open(w);
          const buttons=[...list.querySelectorAll('button')];if(!buttons.length)return;
          let ix=buttons.findIndex(x=>x.classList.contains('highlight'));if(ix<0)ix=e.key==='ArrowDown'?-1:0;
          const next=(ix+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
          buttons.forEach(x=>x.classList.remove('highlight'));buttons[next].classList.add('highlight');buttons[next].scrollIntoView({block:'nearest'});
        }
        if(e.key==='Enter'&&active===w){const choice=list.querySelector('button.highlight')||list.querySelector('button');if(choice){e.preventDefault();choice.click();}}
        if(e.key==='Tab'){close(w);sync(w);}
      });
      select.addEventListener('change',()=>sync(w));
    }
  }
  function syncAll(){document.querySelectorAll('select.search-select-original').forEach(s=>{const w=widgets.get(s);if(w&&active!==w)sync(w);});}
  document.addEventListener('pointerdown',e=>{if(active&&!active.wrap.contains(e.target)) {close(active);syncAll();}});
  window.SearchableSelect={enhance,syncAll};
})();
