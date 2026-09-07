  function greasyForkUpdateSource(info = typeof GM_info === 'undefined' ? null : GM_info) {
    for (const address of [info?.scriptUpdateURL, info?.script?.updateURL, info?.script?.downloadURL, info?.script?.fileURL]) {
      if (!address) continue;
      try {
        const url = new URL(address);
        if (url.protocol !== 'https:' || url.hostname !== 'update.greasyfork.org' || url.port || url.username || url.password) continue;
        const match = url.pathname.match(/^\/scripts\/(\d+)\/[^/]+\.(?:meta|user)\.js$/);
        if (!match) continue;
        // Ignore pinned installation versions when checking the current publication.
        url.search = ''; url.hash = '';
        url.pathname = url.pathname.replace(/\.user\.js$/, '.meta.js');
        return { updateUrl: url.href, pageUrl: `https://greasyfork.org/scripts/${match[1]}` };
      } catch (_) { /* Missing or unsupported install sources have no update indicator. */ }
    }
    return null;
  }
  const SCRIPT_UPDATE_SOURCE = greasyForkUpdateSource() || greasyForkUpdateSource({
    scriptUpdateURL: 'https://update.greasyfork.org/scripts/594029/Ironwood%20RPG%20-%20Status%20Page.meta.js'
  });
  const UPDATE_CHECK_KEY = 'iw-status-update-check-v1';
  const UPDATE_CHECK_INTERVAL = 6 * 60 * 60 * 1000;
  const UPDATE_RETRY_INTERVAL = 15 * 60 * 1000;
  const scriptUpdate = { loaded: false, latestVersion: '', nextCheckAt: 0, pending: null };

  function isNewerScriptVersion(candidate, installed = USERSCRIPT_VERSION) {
    const valid = value => typeof value === 'string' && /^\d+(?:\.\d+)*$/.test(value)
      && value.split('.').every(part => Number.isSafeInteger(Number(part)));
    if (!valid(candidate) || !valid(installed)) return false;
    const a = candidate.split('.').map(Number), b = installed.split('.').map(Number);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
    }
    return false;
  }

  function publishedScriptVersion(source) {
    const metadata = source.match(/^\/\/ ==UserScript==\r?\n([\s\S]*?)^\/\/ ==\/UserScript==/m)?.[1];
    // Earlier public releases used a different namespace; the listing and script name identify them.
    if (!metadata || !/^\/\/ @name\s+Ironwood RPG - Status Page\s*$/m.test(metadata)) return '';
    const version = metadata.match(/^\/\/ @version\s+(\S+)\s*$/m)?.[1] || '';
    return isNewerScriptVersion(version, '0') ? version : '';
  }

  function loadScriptUpdate() {
    if (scriptUpdate.loaded) return;
    scriptUpdate.loaded = true;
    try {
      const cached = JSON.parse(localStorage.getItem(UPDATE_CHECK_KEY));
      if (!SCRIPT_UPDATE_SOURCE || cached?.url !== SCRIPT_UPDATE_SOURCE.updateUrl) return;
      scriptUpdate.latestVersion = typeof cached.latestVersion === 'string' ? cached.latestVersion : '';
      if (Number.isFinite(cached.nextCheckAt) && cached.nextCheckAt <= Date.now() + UPDATE_CHECK_INTERVAL) {
        scriptUpdate.nextCheckAt = cached.nextCheckAt;
      }
    } catch (_) { /* Storage may be unavailable or contain an old record. */ }
  }

  function installUpdateIndicator() {
    const heading = document.querySelector('header-component .title.iw-status-heading');
    const versionLabel = statusVersionLabel();
    if (heading && heading.dataset.iwVersion !== versionLabel) heading.dataset.iwVersion = versionLabel;
    const existing = document.getElementById('iw-script-update');
    if (!SCRIPT_UPDATE_SOURCE || !isNewerScriptVersion(scriptUpdate.latestVersion)) {
      existing?.remove();
      return;
    }
    const coins = document.querySelector('header-component .header .coins');
    if (!coins) return;
    const label = `Ironwood Status v${scriptUpdate.latestVersion} available (installed v${USERSCRIPT_VERSION}). View on Greasy Fork`;
    const indicator = existing || document.createElement('a');
    if (!existing) {
      indicator.id = 'iw-script-update';
      indicator.href = SCRIPT_UPDATE_SOURCE.pageUrl;
      indicator.target = '_blank';
      indicator.rel = 'noopener noreferrer';
      indicator.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V4m-7 7 7-7 7 7"/></svg>';
    }
    if (indicator.title !== label) {
      indicator.title = label;
      indicator.setAttribute('aria-label', label);
    }
    if (coins.nextElementSibling !== indicator) coins.after(indicator);
  }

  function statusVersionLabel() {
    const publicVersion = scriptUpdate.latestVersion;
    return `v${USERSCRIPT_VERSION}${isNewerScriptVersion(USERSCRIPT_VERSION, publicVersion)
      ? ` · Public v${publicVersion}` : ''}`;
  }

  async function checkScriptUpdate() {
    loadScriptUpdate();
    installUpdateIndicator();
    if (!SCRIPT_UPDATE_SOURCE || document.hidden || Date.now() < scriptUpdate.nextCheckAt) return;
    if (scriptUpdate.pending) return scriptUpdate.pending;
    scriptUpdate.pending = (async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(SCRIPT_UPDATE_SOURCE.updateUrl, { signal: controller.signal, credentials: 'omit', cache: 'no-cache' });
        if (!response.ok) throw new Error('Update source unavailable');
        const version = publishedScriptVersion(await response.text());
        if (!version) throw new Error('Invalid update metadata');
        scriptUpdate.latestVersion = version;
        scriptUpdate.nextCheckAt = Date.now() + UPDATE_CHECK_INTERVAL;
      } catch (_) {
        // An offline check must never interrupt the dashboard or erase a known update.
        scriptUpdate.nextCheckAt = Date.now() + UPDATE_RETRY_INTERVAL;
      } finally {
        window.clearTimeout(timeout);
        try {
          localStorage.setItem(UPDATE_CHECK_KEY, JSON.stringify({ url: SCRIPT_UPDATE_SOURCE.updateUrl,
            latestVersion: scriptUpdate.latestVersion, nextCheckAt: scriptUpdate.nextCheckAt }));
        } catch (_) { /* The in-memory schedule still works without storage. */ }
        installUpdateIndicator();
      }
    })();
    try { await scriptUpdate.pending; }
    finally { scriptUpdate.pending = null; }
  }
