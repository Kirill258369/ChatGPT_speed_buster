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
  injectTopBanner();
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
  injectTopBanner();
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
    injectTopBanner();
    updateFloatingButton();
    return;
  }

  if (!settings.enabled) {
    stats.renderedCount = sections.length;
    stats.hiddenCount = 0;
    injectTopBanner();
    updateFloatingButton();
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
  injectTopBanner();
  updateFloatingButton();
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
    injectTopBanner();
    updateFloatingButton();

    sendResponse({
      ok: true,
      renderedCount: stats.renderedCount,
      hiddenCount: stats.hiddenCount,
    });
    return true;
  }
});

function mountTopBanner() {
  const banner = document.getElementById('speed-booster-top-banner');
  if (!banner) return;

  const target = getConversationMountTarget();
  if (!target) return;

  if (banner.parentElement !== target) {
    target.prepend(banner);
  }
}

function injectTopBanner() {
  const existing = document.getElementById('chatgpt-speed-booster-top-banner');

  if (!settings.enabled || stats.hiddenCount <= 0) {
    if (existing) existing.remove();
    return;
  }

  const sections = getTurnSections();
  if (!sections.length) {
    if (existing) existing.remove();
    return;
  }

  const firstSection = sections[0];

  let host = firstSection.parentElement;

while (
  host &&
  host.parentElement &&
  host.parentElement.tagName !== 'MAIN'
) {
  host = host.parentElement;
}

if (!host && firstSection.closest('main')) {
  host = firstSection.closest('main');
}

  if (!host) {
    if (existing) existing.remove();
    return;
  }

  if (existing && existing.parentElement !== host) {
    existing.remove();
  }

  const banner = existing || document.createElement('div');
  banner.id = 'chatgpt-speed-booster-top-banner';

  banner.innerHTML = `
  <div class="chatgpt-speed-booster-top-banner__content">
    <div class="chatgpt-speed-booster-top-banner__text">
      <div class="chatgpt-speed-booster-top-banner__title">
        История свернута для ускорения
      </div>
      <div class="chatgpt-speed-booster-top-banner__subtitle">
        Скрыто ${stats.hiddenCount} сообщений
      </div>
    </div>
    <div class="chatgpt-speed-booster-top-banner__actions">
      <button id="chatgpt-speed-booster-show-all-top" type="button">
        Показать всё
      </button>
      <button id="chatgpt-speed-booster-toggle-top" type="button">
        ${settings.enabled ? 'Пауза' : 'Включить'}
      </button>
    </div>
  </div>
`;

  if (!existing) {
    host.insertBefore(banner, host.firstChild);
  } else if (host.firstChild !== banner) {
    host.insertBefore(banner, host.firstChild);
  }

  const showAllBtn = document.getElementById('chatgpt-speed-booster-show-all-top');
  const toggleBtn = document.getElementById('chatgpt-speed-booster-toggle-top');

  if (showAllBtn) {
    showAllBtn.onclick = () => {
      restoreAllHidden();
      applyBooster();
      injectBoosterControls();
    };
  }

  if (toggleBtn) {
    toggleBtn.onclick = async () => {
      settings.enabled = !settings.enabled;

      await chrome.storage.local.set({
        chatgptSpeedBoosterSettings: settings,
      });

      if (!settings.enabled) {
        restoreAllHidden();
      }

      applyBooster();
      injectBoosterControls();
    };
  }
}

function styleBannerButton(button, primary) {
  button.style.border = 'none';
  button.style.cursor = 'pointer';
  button.style.borderRadius = '10px';
  button.style.padding = '7px 11px';
  button.style.fontSize = '12px';
  button.style.fontWeight = '600';
  button.style.whiteSpace = 'nowrap';
  button.style.color = '#ffffff';
  button.style.background = primary ? '#2563eb' : 'rgba(255,255,255,0.10)';
}

function injectBoosterButton() {
  if (document.getElementById('speed-booster-floating')) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'speed-booster-floating';
  wrapper.style.position = 'fixed';
  wrapper.style.right = '20px';
  wrapper.style.top = '130px';
  wrapper.style.zIndex = '9999';
  wrapper.style.fontFamily = 'Arial, sans-serif';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.id = 'speed-booster-btn';
  trigger.style.display = 'flex';
  trigger.style.alignItems = 'center';
  trigger.style.gap = '8px';
  trigger.style.padding = '10px 14px';
  trigger.style.borderRadius = '14px';
  trigger.style.border = 'none';
  trigger.style.cursor = 'pointer';
  trigger.style.background = '#2563eb';
  trigger.style.color = '#fff';
  trigger.style.fontSize = '13px';
  trigger.style.fontWeight = '600';
  trigger.style.boxShadow = '0 6px 16px rgba(0,0,0,0.24)';

  const label = document.createElement('span');
  label.id = 'speed-booster-btn-label';

  const caret = document.createElement('span');
  caret.textContent = '▾';
  caret.style.fontSize = '12px';
  caret.style.opacity = '0.95';

  trigger.append('⚡', label, caret);

  const menu = document.createElement('div');
  menu.id = 'speed-booster-btn-menu';
  menu.style.position = 'absolute';
  menu.style.right = '0';
  menu.style.top = 'calc(100% + 10px)';
  menu.style.minWidth = '220px';
  menu.style.padding = '8px';
  menu.style.display = 'none';
  menu.style.flexDirection = 'column';
  menu.style.gap = '6px';
  menu.style.borderRadius = '14px';
  menu.style.background = 'rgba(15, 23, 42, 0.96)';
  menu.style.border = '1px solid rgba(59, 130, 246, 0.24)';
  menu.style.boxShadow = '0 12px 30px rgba(0, 0, 0, 0.28)';
  menu.style.backdropFilter = 'blur(10px)';

  const toggleItem = document.createElement('button');
  toggleItem.type = 'button';
  toggleItem.id = 'speed-booster-menu-toggle';
  styleMenuButton(toggleItem);
  toggleItem.addEventListener('click', async () => {
    settings.enabled = !settings.enabled;
    await chrome.storage.local.set({
      chatgptSpeedBoosterSettings: settings,
    });
    applyBooster();
    menu.style.display = 'none';
  });

  const showAllItem = document.createElement('button');
  showAllItem.type = 'button';
  showAllItem.textContent = 'Показать всё';
  styleMenuButton(showAllItem);
  showAllItem.addEventListener('click', async () => {
    settings.enabled = false;
    await chrome.storage.local.set({
      chatgptSpeedBoosterSettings: settings,
    });
    restoreAllHidden();
    const sections = getTurnSections();
    stats.renderedCount = sections.length;
    stats.hiddenCount = 0;
    injectTopBanner();
    updateFloatingButton();
    menu.style.display = 'none';
  });

  menu.appendChild(toggleItem);
  menu.appendChild(showAllItem);

  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex';
  });

  document.addEventListener('click', (event) => {
    if (!wrapper.contains(event.target)) {
      menu.style.display = 'none';
    }
  });

  wrapper.appendChild(menu);
  wrapper.appendChild(trigger);
  document.body.appendChild(wrapper);
  updateFloatingButton();
}

function styleMenuButton(button) {
  button.style.width = '100%';
  button.style.border = 'none';
  button.style.cursor = 'pointer';
  button.style.borderRadius = '10px';
  button.style.padding = '10px 12px';
  button.style.fontSize = '13px';
  button.style.fontWeight = '600';
  button.style.textAlign = 'left';
  button.style.color = '#ffffff';
  button.style.background = 'rgba(255,255,255,0.08)';
}

function updateFloatingButton() {
  const label = document.getElementById('speed-booster-btn-label');
  const toggleItem = document.getElementById('speed-booster-menu-toggle');
  if (label) {
    label.textContent = settings.enabled ? 'Ускорение ВКЛ' : 'Ускорение ВЫКЛ';
  }
  if (toggleItem) {
    toggleItem.textContent = settings.enabled ? 'Выключить ускорение' : 'Включить ускорение';
  }
}

setTimeout(() => {
  injectBoosterButton();
  injectTopBanner();
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

    updateFloatingButton();
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
