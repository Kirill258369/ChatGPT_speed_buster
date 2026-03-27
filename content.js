let settings = {
  enabled: true,
  messageLimit: 10,
};

let stats = {
  renderedCount: 0,
  hiddenCount: 0,
};

let applyTimer = null;
let observerStarted = false;
const hiddenElements = new Set();

init();

async function init() {
  await loadSettings();
  startObserver();
  applyBooster();
}

async function loadSettings() {
  const data = await chrome.storage.local.get('chatgptSpeedBoosterSettings');

  settings = {
    enabled: true,
    messageLimit: 10,
    ...(data.chatgptSpeedBoosterSettings || {}),
  };
}

function startObserver() {
  if (observerStarted) return;
  observerStarted = true;

  const observer = new MutationObserver(() => {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(() => {
      applyBooster();
    }, 120);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
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
    return;
  }

  if (!settings.enabled) {
    stats.renderedCount = sections.length;
    stats.hiddenCount = 0;
    return;
  }

  const limit = Math.max(2, Number(settings.messageLimit) || 10);
  const hideUntilIndex = Math.max(0, sections.length - limit);

  sections.forEach((section, index) => {
    if (index < hideUntilIndex) {
      hideBlock(section);
    }
  });

  stats.renderedCount = sections.length - hideUntilIndex;
  stats.hiddenCount = hideUntilIndex;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'chatgpt-speed-booster:apply') {
    loadSettings().then(() => {
      applyBooster();
      sendResponse({
        ok: true,
        renderedCount: stats.renderedCount,
        hiddenCount: stats.hiddenCount,
      });
    });
    return true;
  }

  if (request.action === 'chatgpt-speed-booster:get-stats') {
    applyBooster();
    sendResponse({
      renderedCount: stats.renderedCount,
      hiddenCount: stats.hiddenCount,
    });
    return true;
  }

  if (request.action === 'chatgpt-speed-booster:show-all') {
    restoreAllHidden();

    const sections = getTurnSections();
    stats.renderedCount = sections.length;
    stats.hiddenCount = 0;

    sendResponse({
      ok: true,
      renderedCount: stats.renderedCount,
      hiddenCount: stats.hiddenCount,
    });
    return true;
  }
});

function injectBoosterButton() {
  if (document.getElementById('speed-booster-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'speed-booster-btn';
  btn.innerText = '⚡ Ускорить чат';

  btn.style.position = 'fixed';
  btn.style.bottom = '90px';
  btn.style.right = '20px';
  btn.style.zIndex = '9999';
  btn.style.padding = '10px 14px';
  btn.style.borderRadius = '12px';
  btn.style.border = 'none';
  btn.style.cursor = 'pointer';
  btn.style.background = '#2563eb';
  btn.style.color = '#fff';
  btn.style.fontSize = '13px';
  btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';

  btn.onclick = async () => {
    settings.enabled = !settings.enabled;

    await chrome.storage.local.set({
      chatgptSpeedBoosterSettings: settings,
    });

    applyBooster();

    btn.innerText = settings.enabled
      ? '⚡ Ускорение ВКЛ'
      : '⚡ Ускорение ВЫКЛ';
  };

  document.body.appendChild(btn);
}

// запуск с задержкой (чтобы ChatGPT успел загрузиться)
setTimeout(() => {
  injectBoosterButton();
}, 2000);

document.addEventListener('keydown', async (e) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'x') {
    e.preventDefault();

    settings.enabled = !settings.enabled;

    await chrome.storage.local.set({
      chatgptSpeedBoosterSettings: settings,
    });

    applyBooster();

    const status = settings.enabled
      ? '⚡ Ускорение ВКЛ'
      : '⚡ Ускорение ВЫКЛ';

    showToast(status);
  }
});

function showToast(text) {
  const existing = document.getElementById('speed-booster-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'speed-booster-toast';
  toast.innerText = text;

  toast.style.position = 'fixed';
  toast.style.bottom = '140px';
  toast.style.right = '20px';
  toast.style.zIndex = '9999';
  toast.style.padding = '10px 14px';
  toast.style.borderRadius = '10px';
  toast.style.background = '#111';
  toast.style.color = '#fff';
  toast.style.fontSize = '13px';
  toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
  toast.style.opacity = '0';
  toast.style.transition = 'opacity 0.2s ease';

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 200);
  }, 1500);
}