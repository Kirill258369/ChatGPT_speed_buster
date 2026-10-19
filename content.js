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
function isVisibleElement(element) {
  if (!element) return false;

  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    rect.height > 0
  );
}

function getTurnSections() {
  return Array.from(document.querySelectorAll('section[data-turn-id]')).filter(isVisibleElement);
}

function rememberOriginalStyles(element) {
  if (!element.dataset.speedBoosterOriginalDisplay) {
    element.dataset.speedBoosterOriginalDisplay = element.style.display || '';
  }
}

function hideBlock(element) {
  rememberOriginalStyles(element);
  element.setAttribute('data-speed-booster-hidden', 'true');
  element.style.display = 'none';
  hiddenElements.add(element);
}

function showBlock(element) {
  element.removeAttribute('data-speed-booster-hidden');
  element.style.display = element.dataset.speedBoosterOriginalDisplay || '';
  hiddenElements.delete(element);
}

function restoreAllHidden() {
  Array.from(hiddenElements).forEach(showBlock);
}

function applyBooster() {
  restoreAllHidden();

  const sections = getTurnSections();

  if (!sections.length) {
    stats.renderedCount = 0;
    stats.hiddenCount = 0;
    updateUI();
    return;
  }

  const policy = BoosterTools.policy(settings, sections.length);
  if (!policy.enabled) {
    stats.renderedCount = sections.length;
    stats.hiddenCount = 0;
    updateUI();
    return;
  }

  const limit = Math.max(2, Number(policy.messageLimit) || 10);
  const hideUntilIndex = Math.max(0, sections.length - limit);

  sections.forEach((section, index) => {
    if (index < hideUntilIndex && !BoosterTools.isRevealed(section)) {
      hideBlock(section);
    }
  });

  stats.hiddenCount = hiddenElements.size;
  stats.renderedCount = sections.length - stats.hiddenCount;
  updateUI();
}


async function initialize() {
  await loadSettings();
  await BoosterTools.init({ apply: applyBooster, settings: () => settings, refresh: async () => { await loadSettings(); applyBooster(); } });
  BoosterPanel.init();
  applyBooster();
  // Ignore our UI mutations, which otherwise cause an endless apply loop.
  new MutationObserver(records => {
    if (records.some(r => !r.target.closest?.('[data-sb-ui]') &&
      (r.type === 'characterData' || [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType !== 1 || !n.matches('[data-sb-ui]'))))) scheduleApply();
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    if (changes[BoosterStore.KEY]) { await loadSettings(); applyBooster(); }
    if (changes[BoosterStore.EXTRA]) { await BoosterTools.reload(); applyBooster(); }
  });
  chrome.runtime.onMessage.addListener((request, sender, respond) => {
    if (!request.action?.startsWith('chatgpt-speed-booster:')) return;
    (async () => {
      const action = request.action.split(':')[1];
      if (action === 'apply') { await loadSettings(); applyBooster(); }
      else if (action !== 'get-stats') await BoosterTools.action(action, request.value);
      respond({ ok: true, ...stats, settings, policy: BoosterTools.policy(settings, stats.renderedCount + stats.hiddenCount) });
    })().catch(error => respond({ ok: false, error: error.message }));
    return true;
  });
}
initialize().catch(console.error);
