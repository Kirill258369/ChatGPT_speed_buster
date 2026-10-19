// One shared message adapter for hiding, search, bookmarks and export.
const BoosterMessages = (() => {
  const selector = 'section[data-turn-id], article[data-turn-id], [data-testid^="conversation-turn-"]';
  const ids = new WeakMap(); let serial = 0;
  function all() {
    const scope = document.querySelector('main') || document.body;
    const known = [...scope.querySelectorAll(selector)].filter(node => !node.closest('[data-sb-ui]'));
    const candidates = known.length ? known : [...scope.querySelectorAll('[data-message-author-role="user"], [data-message-author-role="assistant"]')].map(node => node.closest('[data-message-id]') || node);
    const unique = new Set(candidates);
    return [...unique].filter(node => { for (let parent = node.parentElement; parent && parent !== scope; parent = parent.parentElement) { if (unique.has(parent)) return false; } return true; });
  }
  function id(node) {
    const persistent = node.getAttribute('data-turn-id') || node.getAttribute('data-message-id') || node.querySelector('[data-message-id]')?.getAttribute('data-message-id') || node.getAttribute('data-testid');
    if (persistent) return persistent;
    if (!ids.has(node)) ids.set(node, 'session-' + (++serial));
    return ids.get(node);
  }
  return { all, id };
})();
