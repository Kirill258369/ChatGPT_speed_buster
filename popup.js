const DEFAULT_SETTINGS = {
  enabled: true,
  messageLimit: 10,
};

const enabledInput = document.getElementById('enabled');
const messageLimitInput = document.getElementById('messageLimit');
const saveBtn = document.getElementById('saveBtn');
const refreshBtn = document.getElementById('refreshBtn');
const showAllBtn = document.getElementById('showAllBtn');
const statusBox = document.getElementById('status');
const statsBox = document.getElementById('statsBox');

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadStats();
});

saveBtn.addEventListener('click', async () => {
  const enabled = enabledInput.checked;
  const messageLimit = normalizeLimit(messageLimitInput.value);

  await chrome.storage.local.set({
    chatgptSpeedBoosterSettings: {
      enabled,
      messageLimit,
    },
  });

  messageLimitInput.value = String(messageLimit);
  showStatus('Настройки сохранены');

  await sendActionToActiveTab('chatgpt-speed-booster:apply');
  await loadStats();
});

refreshBtn.addEventListener('click', async () => {
  await loadStats();
  showStatus('Статистика обновлена');
});

showAllBtn.addEventListener('click', async () => {
  enabledInput.checked = false;

  await chrome.storage.local.set({
    chatgptSpeedBoosterSettings: {
      enabled: false,
      messageLimit: normalizeLimit(messageLimitInput.value),
    },
  });

  await sendActionToActiveTab('chatgpt-speed-booster:apply');
  await loadStats();
  showStatus('Все сообщения показаны');
});

function normalizeLimit(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_SETTINGS.messageLimit;
  }

  return Math.min(100, Math.max(2, Math.round(parsed)));
}

async function loadSettings() {
  const data = await chrome.storage.local.get('chatgptSpeedBoosterSettings');
  const settings = {
    ...DEFAULT_SETTINGS,
    ...(data.chatgptSpeedBoosterSettings || {}),
  };

  enabledInput.checked = settings.enabled;
  messageLimitInput.value = String(settings.messageLimit);
}

async function loadStats() {
  const response = await sendActionToActiveTab('chatgpt-speed-booster:get-stats');

  if (!response) {
    statsBox.innerHTML = 'Отображено: —<br />Скрыто: —';
    return;
  }

  const rendered = Number(response.renderedCount || 0);
  const hidden = Number(response.hiddenCount || 0);

  statsBox.innerHTML = `Отображено: ${rendered}<br />Скрыто: ${hidden}`;
}

function showStatus(text) {
  statusBox.textContent = text;

  clearTimeout(showStatus._timer);
  showStatus._timer = setTimeout(() => {
    statusBox.textContent = '';
  }, 2000);
}

async function sendActionToActiveTab(action) {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab?.id) {
    return null;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action });
    return response || null;
  } catch (error) {
    return null;
  }
}