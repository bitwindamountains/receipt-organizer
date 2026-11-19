// Usage: npm run build:web, serve dist/snapsort/browser with SPA fallback (e.g. npx http-server dist/snapsort/browser -p 8766 -s --proxy "http://127.0.0.1:8766?"),
// then: node scripts/ui-audit.mjs "C:/Program Files/Google/Chrome/Application/chrome.exe" <out-dir> http://127.0.0.1:8766
// Writes one PNG per screen (375 px, light/dark/landscape) and audit.json (small tap targets, text under 12 px, horizontal overflow).
// Drives headless Chrome over CDP: loads demo data, screenshots each screen at 375px, and audits tap targets / tiny text / overflow.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const [chrome, out, base] = process.argv.slice(2);
const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=9333', '--disable-gpu', `--user-data-dir=${out}/profile`, 'about:blank']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch('http://127.0.0.1:9333/json')).json(); if (targets.find((t) => t.type === 'page')) break; } catch {} await sleep(250); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true });
const go = async (path) => { await send('Page.navigate', { url: base + path }); await sleep(6000); };
const audit = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && r.top < innerHeight * 3; };
  const clickables = [...document.querySelectorAll('ion-button, button, a[href], ion-item[button], ion-item[href], ion-chip, ion-segment-button, ion-tab-button, [role=button], ion-toggle, ion-checkbox, input, select, textarea')].filter(vis);
  const small = clickables.map((el) => { const r = el.getBoundingClientRect(); return { tag: el.tagName.toLowerCase(), text: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((x) => x.w < 44 || x.h < 44);
  const unlabeled = clickables.filter((el) => !(el.getAttribute('aria-label') || el.textContent.trim() || el.querySelector('[aria-label]'))).map((el) => el.tagName.toLowerCase() + '.' + [...el.classList].slice(0, 2).join('.'));
  const tiny = [...new Set([...document.querySelectorAll('body *')].filter((el) => el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && vis(el) && parseFloat(getComputedStyle(el).fontSize) < 12).map((el) => parseFloat(getComputedStyle(el).fontSize) + 'px: ' + el.textContent.trim().slice(0, 30)))].slice(0, 12);
  return { url: location.pathname, overflowX: document.documentElement.scrollWidth > innerWidth, small: small.slice(0, 15), unlabeled: unlabeled.slice(0, 10), tiny };
})()`;
const results = {};
const shot = async (name) => { const { result } = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${out}/${name}.png`, Buffer.from(result.data, 'base64')); results[name] = await evaluate(audit); };
const click = (text) => evaluate(`(() => { const el = [...document.querySelectorAll('ion-button, button, ion-item, a, ion-chip')].find((e) => e.textContent.trim().includes(${JSON.stringify(text)})); el?.click(); return !!el; })()`);
await go('/onboarding'); await shot('01-onboarding');
await click('Explore with demo receipts'); await sleep(9000); await shot('02-home');
await evaluate(`document.querySelector('ion-content')?.scrollToPoint(0, 700)`); await sleep(1200); await shot('03-home-scrolled');
await go('/library'); await shot('04-library');
await evaluate(`document.querySelector('app-item-card, .item-card')?.click()`); await sleep(2500); await shot('05-details');
await go('/insights'); await evaluate("document.querySelector('app-insights ion-content, ion-content:not(.ion-page-hidden ion-content)')?.scrollToPoint(0, 640)"); await sleep(1500); await shot('06-insights');
await go('/add'); await shot('07-add');
await go('/settings'); await shot('08-settings');
await go('/receipt/new'); await shot('09-receipt-maker');
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
await go('/home'); await shot('10-home-dark');
await go('/library'); await shot('11-library-dark');
await send('Emulation.setDeviceMetricsOverride', { width: 812, height: 375, deviceScaleFactor: 1, mobile: true });
await send('Emulation.setEmulatedMedia', { features: [] });
await go('/home'); await shot('12-home-landscape');
writeFileSync(`${out}/audit.json`, JSON.stringify(results, null, 1));
ws.close(); proc.kill();
