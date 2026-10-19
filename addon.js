/* Optional productivity tools. The original display:none engine remains untouched. */
const BoosterAddon = (() => {
  const KEY = 'sbProductivityV1';
  let state = { notes: {}, drafts: {}, theme: 'graphite' }, host, shadow, visible = false, mode = 'commands', filter = '';
  const $ = s => shadow.querySelector(s);
  const route = () => location.origin + location.pathname;
  const turns = () => BoosterMessages.all();
  const excerpt = el => BoosterTools.text(el).slice(0, 150);
  const nodeId = el => BoosterMessages.id(el);
  const safe = value => String(value ?? '');
  const node = (tag, name, parent, text) => { const n = document.createElement(tag); if (name) n.className = name; if (text !== undefined) n.textContent = text; if (parent) parent.append(n); return n; };
  async function persist() { await chrome.storage.local.set({ [KEY]: state }); }
  async function load() { const saved = (await chrome.storage.local.get(KEY))[KEY]; if (saved && typeof saved === 'object') state = { ...state, ...saved, notes: saved.notes || {}, drafts: saved.drafts || {} }; theme(); }
  function theme() { const chosen = ['graphite','ocean','violet','light'].includes(state.theme) ? state.theme : 'graphite'; document.documentElement.setAttribute('data-sb-theme', chosen); if (host) host.setAttribute('data-theme', chosen); }
  function open(next='commands') { mode=next; visible=true; host.hidden=false; filter=''; render(); $('#find').focus(); }
  function close() { visible=false; host.hidden=true; }
  function action(label, callback, parent, detail='') { const b=node('button','sbp-item',parent); node('span','sbp-name',b,label); if(detail) node('small','',b,detail); b.addEventListener('click',async()=>{ try { await callback(); } catch(error) { $('#feedback').textContent=error.message; } }); return b; }
  function jump(turn) { if (!turn) return; BoosterTools.jump(turn); close(); }
  function codeBlocks() { return turns().flatMap((turn)=>[...turn.querySelectorAll('pre code')].map((code,i)=>({turn,code,i,language:code.className.match(/language-([\w+#.-]+)/)?.[1] || 'Код'}))); }
  function editor() { return document.querySelector('#prompt-textarea'); }
  function readEditor(el) { return el?.tagName==='TEXTAREA' ? el.value : el?.innerText || ''; }
  function writeEditor(el,value) { if (!el) throw new Error('Поле ввода не найдено'); el.focus(); if (el.tagName==='TEXTAREA') { const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; setter.call(el,value); el.dispatchEvent(new Event('input',{bubbles:true})); } else { el.replaceChildren(document.createTextNode(value)); el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value})); } }
  async function saveDraft() { const value=readEditor(editor()); if (!value.trim()) throw new Error('Нет текста для сохранения'); state.drafts[route()]={text:value,updated:Date.now(),title:document.title}; await persist(); $('#feedback').textContent='Черновик сохранён'; }
  async function restoreDraft() { const draft=state.drafts[route()]; if (!draft) throw new Error('Для этого чата черновик не сохранён'); const el=editor(); if(readEditor(el).trim() && !confirm('Заменить текст в поле ввода сохранённым черновиком?')) return; writeEditor(el,draft.text); close(); }
  async function saveNote(turn) { const old=state.notes[route()+'|'+nodeId(turn)]; const value=prompt('Заметка к сообщению:',old?.note || ''); if(value===null) return; const k=route()+'|'+nodeId(turn); if (!value.trim()) delete state.notes[k]; else state.notes[k]={note:value.trim(),excerpt:excerpt(turn),chat:route(),title:document.title,id:nodeId(turn),updated:Date.now()}; await persist(); render(); }
  function section(parent,title) { node('div','sbp-section',parent,title); }
  function render() {
    if(!visible) return;
    $('#heading').textContent={commands:'Быстрые команды',map:'Навигатор диалога',code:'Библиотека кода',notes:'Заметки',drafts:'Черновики',theme:'Оформление',templates:'Шаблоны запросов'}[mode] || 'Инструменты';
    $('#find').value=filter; $('#find').placeholder=mode==='commands'?'Найти действие…':'Поиск в разделе…';
    const list=$('#items'); list.replaceChildren(); $('#feedback').textContent='';
    const match=(a)=>safe(a).toLocaleLowerCase().includes(filter.toLocaleLowerCase());
    if(mode==='commands') {
      const cmds=[['Навигатор диалога','Вопросы и переходы',()=>open('map')],['Библиотека кода','Все доступные блоки кода',()=>open('code')],['Заметки','Сохранённые пометки',()=>open('notes')],['Черновики','Сохранить или восстановить текст',()=>open('drafts')],['Шаблоны запросов','Вставка с переменными',()=>open('templates')],['Оформление','Выбрать тему',()=>open('theme')],['Показать историю','Управление ускорением',()=>{close();BoosterTools.action('show-all');}],['Поиск по чату','Поиск по сообщениям',()=>{close();BoosterPanel.open('search');}],['Рабочая библиотека','Открыть отдельную страницу',()=>window.open(chrome.runtime.getURL('library.html'),'_blank')]];
      cmds.filter(x=>match(x[0]+' '+x[1])).forEach(x=>action(x[0],x[2],list,x[1]));
    } else if(mode==='map') {
      const items=turns().filter(t=>t.querySelector('[data-message-author-role="user"]') || t.getAttribute('data-message-author-role')==='user');
      items.filter(t=>match(excerpt(t))).slice(0,150).forEach((turn,i)=>action((i+1)+'. '+(excerpt(turn)||'Вопрос'),()=>jump(turn),list));
    } else if(mode==='code') {
      codeBlocks().filter(b=>match(b.language+' '+b.code.textContent)).slice(0,120).forEach(block=>{
        const row=node('div','sbp-code',list); node('strong','',row,block.language);node('pre','',row,block.code.textContent.slice(0,1300));const buttons=node('div','sbp-row',row);
        action('Копировать',async()=>{await navigator.clipboard.writeText(block.code.textContent);$('#feedback').textContent='Код скопирован';},buttons);
        action('К сообщению',()=>jump(block.turn),buttons);
        action('Заметка',()=>saveNote(block.turn),buttons);
      });
    } else if(mode==='notes') {
      section(list,'Заметки этого чата');
      const records=Object.entries(state.notes).filter(([,v])=>v.chat===route() && match(v.note+' '+v.excerpt));
      records.forEach(([key,v])=>{const item=node('div','sbp-code',list);node('strong','',item,v.note);node('p','',item,v.excerpt); const buttons=node('div','sbp-row',item);action('Перейти',()=>jump(turns().find(t=>nodeId(t)===v.id)),buttons);action('Удалить',async()=>{if(!confirm('Удалить заметку?'))return;delete state.notes[key];await persist();render();},buttons);});
      if(!records.length) node('p','sbp-empty',list,'Заметок пока нет. Откройте библиотеку кода или навигатор и добавьте заметку к сообщению.');
      section(list,'Добавить к сообщению'); turns().filter(t=>match(excerpt(t))).slice(-30).forEach(t=>action(excerpt(t)||'Сообщение',()=>saveNote(t),list,'Добавить заметку'));
    } else if(mode==='drafts') {
      action('Сохранить текст из поля ввода',saveDraft,list,'Только на этом устройстве');
      if(state.drafts[route()]) action('Восстановить черновик',restoreDraft,list,new Date(state.drafts[route()].updated).toLocaleString('ru-RU'));
      action('Открыть библиотеку черновиков',()=>window.open(chrome.runtime.getURL('library.html'),'_blank'),list);
    } else if(mode==='templates') {
      BoosterTools.templates().filter(t=>match(t.name+' '+t.content)).forEach(t=>action(t.name,async()=>{let content=t.content;const vars=[...new Set([...content.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map(m=>m[1]))];for(const name of vars){const value=prompt('Введите '+name+':');if(value===null)return;content=content.replaceAll(new RegExp('\\{\\{\\s*'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*\\}\\}','g'),value);}BoosterTools.insertTemplate({content});close();},list,t.content.slice(0,70)));
      action('Управление шаблонами',()=>{close();BoosterPanel.open('templates');},list);
    } else if(mode==='theme') {
      for(const [id,name] of [['graphite','Графит'],['ocean','Океан'],['violet','Фиолетовый'],['light','Светлая']]) action((state.theme===id?'✓ ':'')+name,async()=>{state.theme=id;await persist();theme();render();},list);
    }
    if(!list.childNodes.length) node('p','sbp-empty',list,'Ничего не найдено.');
  }
  function init() {
    host=node('div','',document.body);host.id='sb-productivity';host.dataset.sbUi='true';host.hidden=true;shadow=host.attachShadow({mode:'open'});theme();
    shadow.innerHTML=`<style>:host{all:initial;position:fixed;inset:0;z-index:2147483647;font:13px/1.45 system-ui;color:#e7eaf0}*{box-sizing:border-box}[hidden]{display:none!important}.sbp-backdrop{position:absolute;inset:0;background:#10151ca8}.sbp-dialog{position:relative;margin:min(12vh,100px) auto 0;width:min(580px,calc(100vw - 24px));max-height:75vh;display:flex;flex-direction:column;border:1px solid #3a4553;background:#181e27;border-radius:15px;box-shadow:0 20px 70px #0008;overflow:hidden}.sbp-head{padding:17px 18px 10px;display:flex;align-items:center;justify-content:space-between}h2{font-size:17px;font-weight:650;margin:0}button,input{font:inherit}button{color:inherit;cursor:pointer;background:#262f3b;border:1px solid #3a4655;border-radius:9px;padding:8px 11px}button:hover{background:#354252}button:focus-visible,input:focus-visible{outline:2px solid #99b4dc;outline-offset:2px}#find{width:calc(100% - 36px);margin:0 18px 8px;padding:12px;background:#111821;color:#fff;border:1px solid #394757;border-radius:9px}#items{overflow:auto;min-height:100px;padding:8px 14px 18px}.sbp-item{display:flex;flex-direction:column;align-items:start;text-align:left;gap:3px;width:100%;margin:3px 0;padding:11px 12px;border-color:transparent;background:transparent}.sbp-item:hover{background:#293442}.sbp-item small{font-size:11px;color:#9daec1}.sbp-name{font-weight:600}.sbp-code{border:1px solid #364352;background:#202a36;border-radius:10px;padding:12px;margin:8px 4px}.sbp-code pre{font:11px/1.5 ui-monospace,monospace;white-space:pre-wrap;word-break:break-word;max-height:130px;overflow:auto;color:#c5d0de}.sbp-code p{font-size:12px;color:#9faebd}.sbp-row{display:flex;gap:6px;flex-wrap:wrap}.sbp-row .sbp-item{width:auto;border:1px solid #455264;font-size:11px}.sbp-section{color:#98a9bf;font-size:11px;padding:14px 10px 4px}.sbp-empty{color:#9aa8b9;padding:12px}.sbp-foot{border-top:1px solid #394251;display:flex;justify-content:space-between;padding:10px 18px;color:#a3b0be;font-size:11px}#feedback{color:#b7c9e0}:host-context(html[data-sb-theme="light"]) .sbp-dialog{background:#f5f7fa;color:#172131}:host-context(html[data-sb-theme="light"]) #find{background:#fff;color:#172131}
:host([data-theme=graphite]){--sb-back:#181e27;--sb-soft:#262f3b;--sb-hover:#354252;--sb-ink:#e7eaf0;--sb-border:#3a4553;--sb-muted:#9daec1}
:host([data-theme=ocean]){--sb-back:#152934;--sb-soft:#203c48;--sb-hover:#2c505c;--sb-ink:#e1eef2;--sb-border:#456571;--sb-muted:#b1cbd3}
:host([data-theme=violet]){--sb-back:#24212c;--sb-soft:#383142;--sb-hover:#50445a;--sb-ink:#f0e9f1;--sb-border:#625568;--sb-muted:#c0acc6}
:host([data-theme=light]){--sb-back:#fafafa;--sb-soft:#f0f1f3;--sb-hover:#e5e7ea;--sb-ink:#20262c;--sb-border:#d1d6dc;--sb-muted:#626e79}
.sbp-dialog{background:var(--sb-back)!important;color:var(--sb-ink)!important;border-color:var(--sb-border)!important;box-shadow:0 16px 45px #0003!important}
button{background:var(--sb-soft);border-color:var(--sb-border);color:var(--sb-ink)}button:hover,.sbp-item:hover{background:var(--sb-hover)}
#find{background:var(--sb-soft);border-color:var(--sb-border);color:var(--sb-ink)}
.sbp-code{background:var(--sb-soft);border-color:var(--sb-border)}
.sbp-item small,.sbp-empty,.sbp-code p,.sbp-foot{color:var(--sb-muted)}
.sbp-foot{border-color:var(--sb-border)}
</style><div class="sbp-backdrop" id="backdrop"></div><section class="sbp-dialog" role="dialog" aria-modal="true" aria-label="Инструменты Speed Booster"><div class="sbp-head"><h2 id="heading">Быстрые команды</h2><button id="close" aria-label="Закрыть">✕</button></div><input id="find" type="search" placeholder="Найти действие…" autocomplete="off"><div id="items"></div><div class="sbp-foot"><span id="feedback">Данные хранятся в браузере</span><span>Esc — закрыть</span></div></section>`;
    $('#backdrop').onclick=close;$('#close').onclick=close;$('#find').oninput=()=>{filter=$('#find').value;render();$('#find').focus();};
    shadow.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Enter' && e.target===$('#find')){e.preventDefault();$('#items .sbp-item')?.click();}});
    document.addEventListener('keydown',e=>{ if(e.defaultPrevented || e.repeat || e.isComposing)return; if(e.ctrlKey && e.shiftKey && e.code==='KeyK'){e.preventDefault();visible?close():open();} });
    chrome.runtime.onMessage.addListener((msg,_,reply)=>{if(msg.action==='sb-addon-open'){open(msg.mode||'commands');reply({ok:true});}});
    load().catch(console.error);
    chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local' && changes[KEY]?.newValue){state={...state,...changes[KEY].newValue};theme();if(visible)render();}});
  }
  return {init,open};
})();
