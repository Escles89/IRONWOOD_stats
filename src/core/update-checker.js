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
  const scriptUpdate = { loaded: false, latestVersion: '', nextCheckAt: 0, pending: null, manual: false, settingsResult: '' };

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
    document.getElementById('iw-script-update')?.remove();
    const button = document.querySelector('[data-check-script-update]');
    if (button) {
      const label = scriptUpdateButtonLabel();
      if (button.textContent !== label) button.textContent = label;
      button.disabled = scriptUpdate.manual;
      button.setAttribute('aria-busy', String(scriptUpdate.manual));
    }
  }

  function scriptUpdateButtonLabel() {
    if (scriptUpdate.manual) return 'Checking…';
    if (scriptUpdate.settingsResult === 'error') return 'Check failed · Retry';
    if (isNewerScriptVersion(scriptUpdate.latestVersion)) return `Update available · v${scriptUpdate.latestVersion}`;
    return scriptUpdate.settingsResult === 'success' ? 'Up to date' : 'Check for updates';
  }

  async function checkSettingsUpdate() {
    if (scriptUpdate.manual) return;
    scriptUpdate.manual = true;
    scriptUpdate.settingsResult = '';
    installUpdateIndicator();
    try {
      scriptUpdate.settingsResult = await checkScriptUpdate({ force: true }) ? 'success' : 'error';
    } finally {
      scriptUpdate.manual = false;
      installUpdateIndicator();
    }
  }

  function renderScriptUpdateButton() {
    return `<button type="button" class="iw-update-check-button" data-check-script-update ${scriptUpdate.manual ? 'disabled' : ''}>${escapeHtml(scriptUpdateButtonLabel())}</button>`;
  }

  async function checkAndInstallScriptUpdate() {
    if (scriptUpdate.manual) return;
    scriptUpdate.manual = true;
    installUpdateIndicator();
    try {
      const success = await checkScriptUpdate({ force: true });
      scriptUpdate.settingsResult = success ? 'success' : 'error';
      if (!success) {
        showActionToast({ kind: 'warning', title: 'Update check failed', detail: 'Please try again.' });
      } else if (isNewerScriptVersion(scriptUpdate.latestVersion)) {
        location.assign(SCRIPT_UPDATE_SOURCE.updateUrl.replace(/\.meta\.js$/, '.user.js'));
      } else {
        showActionToast({ kind: 'success', title: 'No update available', detail: `Installed: v${USERSCRIPT_VERSION}.` });
      }
    } finally {
      scriptUpdate.manual = false;
      installUpdateIndicator();
    }
  }

  function statusVersionLabel() {
    const publicVersion = scriptUpdate.latestVersion;
    return `v${USERSCRIPT_VERSION}${isNewerScriptVersion(USERSCRIPT_VERSION, publicVersion)
      ? ` · Public v${publicVersion}` : ''}`;
  }

  async function checkScriptUpdate({ force = false } = {}) {
    loadScriptUpdate();
    installUpdateIndicator();
    if (scriptUpdate.pending) return scriptUpdate.pending;
    if (!SCRIPT_UPDATE_SOURCE || (!force && (document.hidden || Date.now() < scriptUpdate.nextCheckAt))) return false;
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
        return true;
      } catch (_) {
        // An offline check must never interrupt the dashboard or erase a known update.
        scriptUpdate.nextCheckAt = Date.now() + UPDATE_RETRY_INTERVAL;
        return false;
      } finally {
        window.clearTimeout(timeout);
        try {
          localStorage.setItem(UPDATE_CHECK_KEY, JSON.stringify({ url: SCRIPT_UPDATE_SOURCE.updateUrl,
            latestVersion: scriptUpdate.latestVersion, nextCheckAt: scriptUpdate.nextCheckAt }));
        } catch (_) { /* The in-memory schedule still works without storage. */ }
        installUpdateIndicator();
      }
    })();
    try { return await scriptUpdate.pending; }
    finally { scriptUpdate.pending = null; }
  }
