  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function waitFor(doc, selector, timeout = 12000) {
    const start = Date.now();
    while (Date.now() - start < timeout) { const found = doc.querySelector(selector); if (found) return found; await wait(200); }
    throw new Error(`Timed out waiting for ${selector}`);
  }
  async function withPage(path, selector, task) {
    const frame = document.createElement('iframe');
    frame.className = 'iw-sync-frame';
    frame.src = path;
    document.body.appendChild(frame);
    try {
      await new Promise((resolve, reject) => { frame.onload = resolve; setTimeout(() => reject(new Error(`Could not load ${path}`)), 15000); });
      await waitFor(frame.contentDocument, selector);
      return await task(frame.contentDocument, frame.contentWindow);
    } finally { frame.remove(); }
  }
