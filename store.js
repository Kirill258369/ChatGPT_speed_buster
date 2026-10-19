/* Shared storage contract; existing settings are migrated by merging defaults. */
const BoosterStore = (() => {
  const KEY = 'chatgptSpeedBoosterSettings';
  const EXTRA = 'chatgptSpeedBoosterTools';
  const defaults = { enabled: true, messageLimit: 10, autoThreshold: 0, collapseCode: false,
    shortcuts: { toggle: 'KeyB', search: 'KeyF', history: 'KeyH' } };
  const limit = value => Math.min(100, Math.max(2, Math.round(Number(value) || 10)));
  async function load() {
    const data = (await chrome.storage.local.get(KEY))[KEY] || {};
    return { ...defaults, ...data, messageLimit: limit(data.messageLimit), shortcuts: { ...defaults.shortcuts, ...data.shortcuts } };
  }
  async function save(patch) { await chrome.storage.local.set({ [KEY]: { ...await load(), ...patch } }); }
  return { KEY, EXTRA, defaults, limit, load, save };
})();
