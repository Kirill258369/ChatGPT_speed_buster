const $ = selector => document.querySelector(selector);
let settings, activeTabId;
const status = text => { $('#status').textContent = text; };
async function send(action, value) {
  if (!activeTabId) throw new Error('Откройте вкладку ChatGPT');
  let response;
  try { response = await chrome.tabs.sendMessage(activeTabId, { action: 'chatgpt-speed-booster:' + action, value }); }
  catch { throw new Error('Откройте ChatGPT и обновите страницу после установки расширения.'); }
  if (!response?.ok) throw new Error(response?.error || 'Нет связи с чатом'); return response;
}
function renderStats(response) {
  const total = response.renderedCount + response.hiddenCount;
  $('#total').textContent = total; $('#hidden').textContent = response.hiddenCount;
  const percent = total ? Math.round(response.hiddenCount / total * 100) : 0;
  $('#percent').textContent = percent + '%'; $('#ring').style.setProperty('--progress', percent + '%');
  $('#mode').textContent = response.policy.excluded ? 'Этот чат исключён' : response.policy.history ? 'История раскрыта' : response.policy.enabled ? 'Активно · лимит ' + response.policy.messageLimit : settings.enabled ? 'Ожидание порога' : 'Выключено';
  $('[data-action=more]').disabled = response.hiddenCount === 0; $('[data-action=show-all]').textContent = response.policy.history ? 'Свернуть историю' : 'Показать историю';
}
async function save(patch) {
  await BoosterStore.save(patch); settings = await BoosterStore.load();
  try { renderStats(await send('apply')); status('Сохранено'); } catch (error) { status('Настройки сохранены. ' + error.message); }
}
async function start() {
  settings = await BoosterStore.load(); [activeTabId] = (await chrome.tabs.query({ active: true, currentWindow: true })).map(tab => tab.id);
  $('#enabled').checked = settings.enabled; $('#messageLimit').value = settings.messageLimit; $('#limitValue').textContent = settings.messageLimit; $('#autoThreshold').value = settings.autoThreshold; $('#collapseCode').checked = settings.collapseCode;
  for (const [key,label] of [['toggle','Ускорение'],['search','Поиск'],['history','История']]) {
    const row = document.createElement('label'); row.textContent = label; const select = document.createElement('select'); select.setAttribute('aria-label',label);
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') { const option = document.createElement('option'); option.value = 'Key' + letter; option.textContent = letter; select.append(option); }
    select.value = settings.shortcuts[key]; select.onchange = async () => {
      if (Object.entries(settings.shortcuts).some(([other,code]) => other !== key && code === select.value)) { select.value = settings.shortcuts[key]; status('Эта клавиша уже используется'); return; }
      await save({ shortcuts: { ...settings.shortcuts, [key]: select.value } });
    }; row.append(select); $('#shortcuts').append(row);
  }
  try { const response = await send('get-stats'); renderStats(response); $('#chatLimit').value = response.policy.customLimit ?? ''; $('#excluded').checked = response.policy.excluded; }
  catch (error) { status(error.message); $('#mode').textContent = settings.enabled ? 'Включено · чат не подключён' : 'Выключено'; $('#saveChat').disabled = true; document.querySelectorAll('[data-action]').forEach(button => { button.disabled = true; }); }
}
document.querySelectorAll('[data-tab]').forEach(button => { button.onclick = () => { document.querySelectorAll('main>section').forEach(section => { section.hidden = section.id !== button.dataset.tab; }); document.querySelectorAll('[data-tab]').forEach(tab => tab.setAttribute('aria-pressed',String(tab === button))); }; });
$('#enabled').onchange = () => save({ enabled: $('#enabled').checked }).catch(error => status(error.message));
$('#messageLimit').oninput = () => { $('#limitValue').textContent = $('#messageLimit').value; };
$('#messageLimit').onchange = () => save({ messageLimit: BoosterStore.limit($('#messageLimit').value) }).catch(error => status(error.message));
document.querySelectorAll('[data-limit]').forEach(button => { button.onclick = () => { $('#messageLimit').value = button.dataset.limit; $('#limitValue').textContent = button.dataset.limit; save({ messageLimit: +button.dataset.limit }).catch(error => status(error.message)); }; });
$('#autoThreshold').onchange = () => { const value = Math.min(10000,Math.max(0,Math.round(Number($('#autoThreshold').value) || 0))); $('#autoThreshold').value = value; save({ autoThreshold: value }).catch(error => status(error.message)); };
$('#collapseCode').onchange = () => save({ collapseCode: $('#collapseCode').checked }).catch(error => status(error.message));
document.querySelectorAll('[data-action]').forEach(button => { button.onclick = async () => { try { renderStats(await send(button.dataset.action)); if (['search','bookmarks','navigator','templates'].includes(button.dataset.action)) window.close(); else status('Готово'); } catch (error) { status(error.message); } }; });
$('#saveChat').onclick = async () => { try { renderStats(await send('chat-settings', { messageLimit: $('#chatLimit').value || null, excluded: $('#excluded').checked })); status('Настройки этого чата сохранены'); } catch (error) { status(error.message); } };
start().catch(error => status(error.message));
