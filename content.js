// Stable display:none engine. Optional features live in tools.js and panel.js.
let settings = { enabled: true, messageLimit: 10 };
let stats = { renderedCount: 0, hiddenCount: 0 };
const hiddenElements = new Set();
let applyTimer;
async function loadSettings() { settings = await BoosterStore.load(); }
function updateUI() { BoosterPanel.update({ ...stats, settings, policy: BoosterTools.policy(settings, stats.renderedCount + stats.hiddenCount) }); }
function scheduleApply() {
  if (applyTimer) return;
  applyTimer = setTimeout(() => { applyTimer = null; applyBooster(); }, 120);
}
// Preserve the last N complete turns. Hide whole message containers only.
// Reconcile changes incrementally to prevent viewport jumps while typing.
function getTurnSections() {
  return BoosterMessages.all().filter(el => el.isConnected && !el.closest('[data-sb-ui]'));
}
function hideBlock(element) {
  if (hiddenElements.has(element)) return;
  if (!element.hasAttribute('data-speed-booster-original-display')) {
    element.setAttribute('data-speed-booster-original-display', element.style.getPropertyValue('display'));
    element.setAttribute('data-speed-booster-original-priority', element.style.getPropertyPriority('display'));
  }
  element.setAttribute('data-speed-booster-hidden', 'true');
  element.style.setProperty('display', 'none', 'important');
  hiddenElements.add(element);
}
function showBlock(element) {
  if (!hiddenElements.has(element)) return;
  element.removeAttribute('data-speed-booster-hidden');
  const original = element.getAttribute('data-speed-booster-original-display') || '';
  const priority = element.getAttribute('data-speed-booster-original-priority') || '';
  if (original) element.style.setProperty('display', original, priority);
  else element.style.removeProperty('display');
  hiddenElements.delete(element);
}
function restoreAllHidden() { for (const element of [...hiddenElements]) showBlock(element); }
function applyBooster() {
  const sections = getTurnSections();
  const policy = BoosterTools.policy(settings, sections.length);
  const limit = Math.max(2, Number(policy.messageLimit) || 10);
  const hiddenBefore = Math.max(0, sections.length - limit);
  const target = new Set(policy.enabled ? sections.slice(0, hiddenBefore).filter(el => !BoosterTools.isRevealed(el)) : []);
  for (const element of [...hiddenElements]) if (!element.isConnected || !target.has(element)) showBlock(element);
  for (const element of target) hideBlock(element);
  stats.hiddenCount = [...hiddenElements].filter(el => el.isConnected).length;
  stats.renderedCount = sections.length - stats.hiddenCount;
  updateUI();
}

async function initialize() {
  await loadSettings();
  await BoosterTools.init({ apply: applyBooster, settings: () => settings, refresh: async () => { await loadSettings(); applyBooster(); } });
  BoosterPanel.init();
  BoosterAddon.init();
  applyBooster();
  // Ignore our UI mutations, which otherwise cause an endless apply loop.
  new MutationObserver(records => {
    if (records.some(r => !r.target.closest?.('[data-sb-ui]') &&
      (r.type === 'characterData' ? false : [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1 && !n.closest?.('[data-sb-ui]') && !n.matches?.('[data-sb-ui]'))))) scheduleApply();
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    if (changes[BoosterStore.KEY]) {
      const change = changes[BoosterStore.KEY];
      if (change.oldValue?.messageLimit !== change.newValue?.messageLimit) BoosterTools.resetTemporary();
      await loadSettings(); applyBooster();
    }
    if (changes[BoosterStore.EXTRA]) { await BoosterTools.reload(); applyBooster(); }
  });
  chrome.runtime.onMessage.addListener((request, sender, respond) => {
    if (!request.action?.startsWith('chatgpt-speed-booster:')) return;
    (async () => {
      const action = request.action.split(':')[1];
      if (action === 'apply') { if (request.value?.reset) BoosterTools.resetTemporary(); await loadSettings(); applyBooster(); }
      else if (action !== 'get-stats') await BoosterTools.action(action, request.value);
      respond({ ok: true, ...stats, settings, policy: BoosterTools.policy(settings, stats.renderedCount + stats.hiddenCount) });
    })().catch(error => respond({ ok: false, error: error.message }));
    return true;
  });
}
initialize().catch(console.error);
