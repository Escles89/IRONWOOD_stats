  const clean = (text) => (text || '').replace(/\s+/g, ' ').trim();
  const numberFrom = (text) => Number(clean(text).replace(/[^\d.-]/g, '')) || 0;
  const formatNumber = (value) => new Intl.NumberFormat().format(value);
  const formatCompact = (value) => value >= 1000
    ? `${(value / 1000).toFixed(value >= 100000 ? 0 : 1).replace(/\.0$/, '')}K`
    : formatNumber(Math.round(value));
  const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
  const skillIcon = (skill) => `/assets/misc/${String(skill).trim().toLowerCase().replace(/\s+/g, '-')}.png`;

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return 'Calculating…';
    const totalMinutes = Math.ceil(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return [hours && `${hours}h`, (minutes || !hours) && `${minutes}m`].filter(Boolean).join(' ');
  }

  const withoutSeconds = (value) => clean(String(value || '').replace(/\s*\d+(?:\.\d+)?s\b/gi, ' '));
  const formatReviveTime = (milliseconds) => {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  };

  const dayKey = (time = Date.now()) => new Date(time - 3600000).toISOString().slice(0, 10);
  function nextDailyReset(time = Date.now()) {
    const now = new Date(time);
    let reset = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 1);
    if (reset <= time) reset += 24 * 3600000;
    return reset;
  }
  function humanAge(time) {
    if (!time) return 'Never checked';
    const minutes = Math.floor((Date.now() - time) / 60000);
    return minutes < 1 ? 'Just checked' : minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
  }
  function titleFromSlug(slug) {
    return slug.replace(/^potion-(?:divine|super)-/, '').split('-').map((part) => part.toLowerCase() === 'xp' ? 'XP' : part[0].toUpperCase() + part.slice(1)).join(' ');
  }
  function parseCompact(text) {
    const match = clean(text).match(/[\d,.]+\s*[KMB]?/i);
    if (!match) return 0;
    const raw = match[0].replace(/,/g, '');
    const multiplier = /K/i.test(raw) ? 1e3 : /M/i.test(raw) ? 1e6 : /B/i.test(raw) ? 1e9 : 1;
    return Math.round(parseFloat(raw) * multiplier);
  }
  function durationMs(text) {
    const units = { d: 86400000, h: 3600000, m: 60000, s: 1000 };
    return [...clean(text).matchAll(/([\d.]+)\s*([dhms])/gi)].reduce((sum, match) => sum + Number(match[1]) * units[match[2].toLowerCase()], 0);
  }
