// Run against a built plugin in an explicitly supplied disposable native vault.
// node scripts/workspace-ui-native.mjs http://127.0.0.1:9252 /tmp/.../vault
import assert from 'node:assert/strict';

const [endpoint, vault] = process.argv.slice(2);
assert(endpoint && vault?.startsWith('/tmp/'), 'Supply a local CDP endpoint and disposable /tmp vault');
assert(['127.0.0.1', 'localhost'].includes(new URL(endpoint).hostname));
const pages = await (await fetch(`${endpoint}/json/list`)).json();
const page = pages.find(p => p.url.startsWith('app://obsidian.md/'));
assert(page, 'Native Obsidian page required');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let id = 0;
const pending = new Map();
socket.onmessage = event => {
  const message = JSON.parse(event.data), request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(message.error); else request.resolve(message.result);
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const next = ++id; pending.set(next, { resolve, reject });
  socket.send(JSON.stringify({ id: next, method, params }));
});
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const key = async (key, code, number) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: number, ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: number });
};
const reports = [];
try {
  assert.equal(await evaluate('app.vault.adapter.getBasePath()'), vault);
  await send('Page.bringToFront');
  for (const width of [390, 768, 1280]) for (const theme of ['dark', 'light', 'yellow']) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: false });
    await evaluate(`document.body.classList.toggle('theme-dark', ${theme !== 'light'});
      document.body.classList.toggle('theme-light', ${theme === 'light'});
      document.body.style.setProperty('--interactive-accent', ${JSON.stringify(theme === 'yellow' ? 'rgb(224, 182, 30)' : '')});`);
    for (const input of ['pointer', 'keyboard']) {
      await evaluate(`(async () => {
        await app.plugins.disablePlugin('ai-knowledge-hub');
        for (const leaf of app.workspace.getLeavesOfType('veynrel-health')) leaf.detach();
        await app.plugins.enablePlugin('ai-knowledge-hub');
        for (let i = 0; i < 200 && !app.commands.commands['ai-knowledge-hub:veynrel-open-health']; i++) await new Promise(r => setTimeout(r, 25));
        await new Promise(resolve => app.workspace.onLayoutReady(resolve));
        app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-health');
        for (let i = 0; i < 200 && !app.workspace.getLeavesOfType('veynrel-health')[0]?.view.body; i++) await new Promise(r => setTimeout(r, 25));
        window.polishView = app.workspace.getLeavesOfType('veynrel-health')[0].view;
        await polishView.controller.getHealthService();
        await new Promise(resolve => setTimeout(resolve, 200)); // Let the existing 160ms page entrance finish.
      })()`);
      for (const operation of ['load', 'refresh', 'stale']) {
        const before = await evaluate(`(() => {
          const view = polishView, root = view.contentEl, topology = view.topology;
          if (${JSON.stringify(operation)} === 'stale') topology.markStale();
          const original = topology.source.captureMetadata;
          const barrier = new Promise(resolve => window.polishRelease = resolve);
          topology.source.captureMetadata = async function(signal) { await barrier; return original.call(this, signal); };
          window.polishRestore = () => { topology.source.captureMetadata = original; };
          const section = root.querySelector('.veynrel-topology-preview');
          root.scrollTop += section.getBoundingClientRect().top - root.getBoundingClientRect().top - 180;
          const button = root.querySelector('[data-health-action=topology-refresh]');
          button.focus({ preventScroll: true });
          const rect = button.getBoundingClientRect();
          return { scroll: root.scrollTop, section: section.getBoundingClientRect().top, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, hit: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.outerHTML.slice(0,180) };
        })()`);
        assert(before.scroll > 200, 'Fixture must have a genuinely long Health page');
        if (input === 'keyboard') await key('Enter', 'Enter', 13);
        else {
          await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: before.x, y: before.y });
          await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: before.x, y: before.y, button: 'left', clickCount: 1 });
          await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: before.x, y: before.y, button: 'left', clickCount: 1 });
        }
        for (const stage of ['loading', 'ready']) {
          if (stage === 'ready') await evaluate('(async () => { polishRelease(); await polishView.topology.load(); polishRestore(); })()');
          const state = await evaluate(`(() => {
            const root = polishView.contentEl, active = document.activeElement;
            const section = root.querySelector('.veynrel-topology-preview'), live = root.querySelector('[aria-live=polite]');
            return { route: polishView.route.page, state: polishView.topology.getSnapshot().state,
              scroll: root.scrollTop, section: section.getBoundingClientRect().top,
              inView: section.getBoundingClientRect().top < root.getBoundingClientRect().bottom && section.getBoundingClientRect().bottom > root.getBoundingClientRect().top,
              heading: active.matches('[data-health-heading],[data-findings-heading]'), nearby: section.contains(active),
              focus: active.dataset.healthAction ?? active.dataset.healthFocusAction,
              disabled: root.querySelector('[data-health-action=topology-refresh]').disabled,
              live: !!live.textContent && !live.closest('[aria-busy=true]') };
          })()`);
          assert.equal(state.route, 'health'); assert.equal(state.state, stage, JSON.stringify({width,theme,input,operation,before,state}));
          assert(!state.heading && state.nearby && state.inView);
          assert.equal(state.focus, 'topology-refresh'); assert.equal(state.disabled, stage === 'loading');
          assert(state.live && state.scroll > 200);
          assert(Math.abs(state.scroll - before.scroll) < 96 && Math.abs(state.section - before.section) < 96, JSON.stringify({ before, state }));
          reports.push({ width, theme, input, operation, stage, scroll: state.scroll, delta: state.scroll - before.scroll });
        }
        await key('Tab', 'Tab', 9);
        assert(await evaluate(`polishView.contentEl.contains(document.activeElement) && document.activeElement.matches('button,input,summary') && !document.activeElement.disabled`), 'Tab must continue to a usable control');
      }
      for (const action of ['nav-findings', 'nav-discover', 'topology-open']) {
        await evaluate(`polishView.contentEl.querySelector('[data-health-action=${action}]').click()`);
        assert(await evaluate(`document.activeElement.matches('[data-health-heading]') && document.activeElement === polishView.contentEl.querySelector('[data-health-heading]')`));
        await evaluate(`polishView.contentEl.querySelector('[data-health-action=nav-health]').click()`);
      }
      const style = await evaluate(`(() => {
        const root = polishView.contentEl, nav = root.querySelector('nav'), tabs = [...nav.children];
        const n = getComputedStyle(nav), p = getComputedStyle(root.querySelector('.veynrel-topology-preview'));
        return { fits: root.scrollWidth <= root.clientWidth + 1, count: tabs.length,
          row: tabs.every(b => Math.abs(b.getBoundingClientRect().top - tabs[0].getBoundingClientRect().top) < 1),
          overflow: n.overflowX, rail: [n.borderTopWidth, n.borderRightWidth, n.borderBottomWidth, n.borderLeftWidth, n.borderRadius, n.backgroundColor],
          cells: tabs.every(b => { const s = getComputedStyle(b); return b.tagName === 'BUTTON' && s.backgroundColor === 'rgba(0, 0, 0, 0)' && s.borderTopWidth === '0px' && s.borderRadius === '0px'; }),
          underline: getComputedStyle(nav.querySelector('[aria-current=page]')).boxShadow,
          accent: getComputedStyle(root).getPropertyValue('--interactive-accent').trim(),
          preview: [p.borderTopWidth, p.borderRightWidth, p.borderBottomWidth, p.borderLeftWidth, p.borderRadius, p.backgroundColor] };
      })()`);
      assert(style.fits && style.row && style.cells && style.count === 7 && style.overflow === 'auto', JSON.stringify(style));
      for (const border of [style.rail, style.preview]) assert.deepEqual(border, ['0px', '0px', '1px', '0px', '0px', 'rgba(0, 0, 0, 0)']);
      assert(style.underline.includes('inset') && (theme !== 'yellow' || style.underline.includes('224, 182, 30')));
      // Browser-native Tab scrolls overflowed tabs into view; no application JS scrolling.
      await evaluate(`polishView.contentEl.querySelector('[data-health-action=nav-health]').focus()`);
      for (let i = 0; i < 6; i++) await key('Tab', 'Tab', 9);
      assert(await evaluate(`(() => { const b = document.activeElement, n = b.closest('nav'); return b.dataset.healthAction === 'nav-settings' && b.matches(':focus-visible') && b.getBoundingClientRect().right <= n.getBoundingClientRect().right + 1; })()`));
    }
    console.log(`PASS ${width}px ${theme}: pointer/keyboard load, refresh, stale, route focus, CSS and Tab`);
  }
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await evaluate(`polishView.contentEl.querySelector('[data-health-action=topology-open]').click()`);
  assert(await evaluate(`[...polishView.contentEl.querySelectorAll('.veynrel-health-page-enter,.veynrel-topology-detail,.veynrel-topology-detail *,nav button')].every(e => getComputedStyle(e).animationName === 'none' && getComputedStyle(e).transitionDuration === '0s')`));
  console.log(JSON.stringify({ updates: reports.length, maxScrollDelta: Math.max(...reports.map(r => Math.abs(r.delta))), runtime: await send('Browser.getVersion') }));
} finally {
  await evaluate(`window.polishRelease?.(); window.polishRestore?.(); document.body.style.removeProperty('--interactive-accent')`);
  await send('Emulation.setEmulatedMedia', { features: [] });
  await send('Emulation.clearDeviceMetricsOverride');
  socket.close();
}
