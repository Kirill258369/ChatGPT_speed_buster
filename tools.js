/* Optional tools. No message removal, cloning or virtualized message rendering. */
const BoosterTools = (() => {
  let api, data = {}, route = location.pathname, extra = 0, history = false, revealed = null;
  let focus = false;
  const listeners = new Set();
  const notify = () => listeners.forEach(fn => fn());
  const turns = () => BoosterMessages.all();
  const text = element => { const clone = (element.querySelector('[data-message-author-role]') || element).cloneNode(true); clone.querySelectorAll('[data-sb-ui]').forEach(node => node.remove()); return clone.textContent.trim(); };
  const id = element => BoosterMessages.id(element);
  const chatKey = () => location.pathname;
  const chat = () => data['chat:' + chatKey()] || {};
  async function reload() { data = (await chrome.storage.local.get(BoosterStore.EXTRA))[BoosterStore.EXTRA] || {}; notify(); }
  async function saveChat(patch) {
    const key = 'chat:' + chatKey();
    await reload();
    data[key] = { ...data[key], ...patch };
    await chrome.storage.local.set({ [BoosterStore.EXTRA]: data });
    api.apply(); notify();
  }
  function policy(settings, count) {
    if (route !== location.pathname) { route = location.pathname; extra = 0; history = false; revealed?.classList.remove('sb-selected'); revealed = null; queueMicrotask(notify); }
    return { enabled: settings.enabled && !chat().excluded && !history && (!settings.autoThreshold || count >= settings.autoThreshold),
      messageLimit: BoosterStore.limit(chat().messageLimit ?? settings.messageLimit) + extra,
      excluded: !!chat().excluded, history, customLimit: chat().messageLimit ?? null };
  }
  function jump(element) {
    if (!element?.isConnected) { BoosterPanel.toast('Сообщение сейчас недоступно на странице'); return; }
    revealed?.classList.remove('sb-selected');
    revealed = element; api.apply();
    element.classList.add('sb-selected');
    element.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
  }
  function release() { revealed?.classList.remove('sb-selected'); revealed = null; api.apply(); }
  function resetTemporary() { history = false; extra = 0; revealed?.classList.remove('sb-selected'); revealed = null; }
  function search(query, codeOnly = false) {
    const q = query.trim().toLocaleLowerCase();
    return turns().filter(el => (!codeOnly || el.querySelector('pre code')) && (!q || text(el).toLocaleLowerCase().includes(q)));
  }
  async function bookmark(element) {
    const bookmarks = { ...chat().bookmarks };
    if (bookmarks[id(element)]) delete bookmarks[id(element)];
    else bookmarks[id(element)] = { excerpt: text(element).slice(0, 160) };
    await saveChat({ bookmarks });
  }
  async function removeBookmark(key) { const bookmarks = { ...chat().bookmarks }; delete bookmarks[key]; await saveChat({ bookmarks }); }
  async function copyCode(element, withNames) {
    const blocks = [...element.querySelectorAll('pre code')];
    if (!blocks.length) throw new Error('В этом сообщении нет кодовых блоков');
    const output = blocks.map((code, index) => {
      const lang = code.className.match(/language-([\w+-]+)/)?.[1] || '';
      // Never guess a filename: explicitly labeled metadata or a neutral block name.
      const name = code.closest('pre').getAttribute('data-filename') || `block-${index + 1}${lang ? '.' + lang : '.txt'}`;
      return withNames ? `### ${name}\n\n\x60\x60\x60${lang}\n${code.textContent}\n\x60\x60\x60` : code.textContent;
    }).join('\n\n');
    await navigator.clipboard.writeText(output); BoosterPanel.toast('Код скопирован');
  }
  function exportChat(format) {
    const messages = turns();
    if (!messages.length) throw new Error('На странице нет доступных сообщений');
    const escape = value => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const markdown = messages.map(el => {
      const clone = (el.querySelector('[data-message-author-role]') || el).cloneNode(true);
      clone.querySelectorAll('[data-sb-ui]').forEach(node => node.remove());
      clone.querySelectorAll('pre').forEach(pre => { const code = pre.querySelector('code'); pre.replaceWith(document.createTextNode('\n\n```\n' + (code?.textContent || pre.textContent) + '\n```\n\n')); });
      clone.querySelectorAll('p,li,h1,h2,h3,blockquote').forEach(node => node.append(document.createTextNode('\n\n')));
      const role = el.querySelector('[data-message-author-role]')?.getAttribute('data-message-author-role') || 'message';
      return `## ${role}\n\n${clone.textContent.trim()}`;
    }).join('\n\n---\n\n');
    const title = document.title;
    const note = 'Экспорт только сообщений, доступных на странице. История может быть неполной.';
    const body = format === 'html' ? `<!doctype html><html lang="ru"><meta charset="utf-8"><title>${escape(title)}</title><style>body{max-width:900px;margin:40px auto;padding:20px;font:16px system-ui;line-height:1.6}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>${escape(title)}</h1><p>${escape(note)}</p><pre>${escape(markdown)}</pre></html>` : `# ${title}\n\n${note}\n\n${markdown}`;
    const url = URL.createObjectURL(new Blob([body], { type: format === 'html' ? 'text/html;charset=utf-8' : 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'chatgpt-chat.' + (format === 'html' ? 'html' : 'md'); link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function saveTemplate(name, content) {
    if (!name.trim() || !content.trim()) throw new Error('Введите название и текст шаблона');
    await reload();
    data.templates = [...(data.templates || []), { id: crypto.randomUUID(), name: name.trim(), content }];
    await chrome.storage.local.set({ [BoosterStore.EXTRA]: data }); notify();
  }
  async function deleteTemplate(key) { await reload(); data.templates = (data.templates || []).filter(t => t.id !== key); await chrome.storage.local.set({ [BoosterStore.EXTRA]: data }); notify(); }
  function insertTemplate(template) {
    const editor = document.querySelector('#prompt-textarea');
    if (!editor) throw new Error('Поле ввода ChatGPT не найдено');
    editor.focus();
    if (editor.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(editor, editor.value + template.content); editor.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      const selection = window.getSelection(); const range = document.createRange(); range.selectNodeContents(editor); range.collapse(false); selection.removeAllRanges(); selection.addRange(range);
      if (!document.execCommand('insertText', false, template.content)) throw new Error('Не удалось вставить шаблон; скопируйте его кнопкой рядом');
    }
    BoosterPanel.toast('Шаблон вставлен в черновик');
  }
  async function action(action, value) {
    switch (action) {
      case 'toggle': history = false; extra = 0; await BoosterStore.save({ enabled: !api.settings().enabled }); await api.refresh(); break;
      case 'show-all': history = !history; release(); break;
      case 'more': extra += 10; api.apply(); break;
      case 'reset': history = false; extra = 0; release(); break;
      case 'search': case 'bookmarks': case 'navigator': case 'templates': BoosterPanel.open(action); break;
      case 'focus': focus = !focus; document.documentElement.classList.toggle('sb-focus', focus); BoosterPanel.toast(focus ? 'Фокус: боковая панель скрыта' : 'Фокус выключен'); break;
      case 'export-md': exportChat('md'); break;
      case 'export-html': exportChat('html'); break;
      case 'chat-settings': resetTemporary(); await saveChat({ messageLimit: value.messageLimit == null ? null : BoosterStore.limit(value.messageLimit), excluded: !!value.excluded }); break;
      default: throw new Error('Неизвестное действие');
    }
    notify();
  }
  async function init(bridge) {
    api = bridge; await reload();
    document.addEventListener('keydown', event => {
      if (event.defaultPrevented || event.repeat || event.isComposing || !event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return;
      const entry = Object.entries(api.settings().shortcuts).find(([, code]) => code === event.code);
      if (!entry) return;
      event.preventDefault(); action({ toggle: 'toggle', search: 'search', history: 'show-all' }[entry[0]]).catch(error => BoosterPanel.toast(error.message));
    });
    // Covers ChatGPT SPA navigation without intercepting application history APIs.
    setInterval(() => { if (route !== location.pathname) api.apply(); }, 700);
  }
  return { init, reload, policy, resetTemporary, isRevealed: element => element === revealed, action, turns, text, id, chat, search, jump, release, bookmark, removeBookmark, copyCode, saveTemplate, deleteTemplate, insertTemplate,
    templates: () => data.templates || [], subscribe: fn => listeners.add(fn) };
})();
