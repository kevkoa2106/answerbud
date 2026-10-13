import { test as base, expect, chromium } from '@playwright/test';
import fs from 'node:fs/promises';

export { expect, chromium };

export const test = base.extend({
  panelSetup: [async ({ page, browserName }, use) => {
  const screenshot = 'data:image/png;base64,' + (await fs.readFile('tests/quiz.png')).toString('base64');
  await page.addInitScript(({ isFirefox, screenshot }) => {
    function getStored(area, keys) {
      const values = area === 'session' ? { provider: 'laya', ...JSON.parse(sessionStorage.getItem('test-session') || '{}') } : { theme: sessionStorage.getItem('test-theme'), ...JSON.parse(sessionStorage.getItem('test-local') || '{}') };
      if (keys === null || keys === undefined) return values;
      const requested = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      return Object.fromEntries(requested.filter(key => Object.hasOwn(values, key) || typeof keys === 'object' && !Array.isArray(keys)).map(key => [key, Object.hasOwn(values, key) ? values[key] : keys[key]]));
    }
    window.chrome = {
      storage: {
        session: {
          get: async keys => getStored('session', keys),
          set: async settings => { window.savedSettings = settings; sessionStorage.setItem('test-session', JSON.stringify({ ...JSON.parse(sessionStorage.getItem('test-session') || '{}'), ...settings })); }
        },
        local: {
          get: async keys => getStored('local', keys),
          set: async settings => {
            if (settings.theme) sessionStorage.setItem('test-theme', settings.theme);
            const stored = { ...JSON.parse(sessionStorage.getItem('test-local') || '{}'), ...settings };
            sessionStorage.setItem('test-local', JSON.stringify(stored)); window.savedLocal = stored;
          }
        }
      },
      permissions: { contains: async () => true, request: async request => { window.requestedOrigins = request.origins; return true; } },
      tabs: { query: async () => [{ id: 42 }], captureVisibleTab: async () => { window.screenshotCalls = (window.screenshotCalls || 0) + 1; return screenshot; } },
      scripting: { executeScript: async () => [{ result: { question: 'Encryption output?', options: ['Ciphertext', '<img src=x onerror=alert(1)>'], raw_text: 'Encryption output?\nCiphertext\nPlaintext' } }] }
    };
    if (isFirefox) window.browser = window.chrome;
  }, { isFirefox: browserName === 'firefox', screenshot });
  await page.goto('/panel.html');
  await page.evaluate(() => import('./panel.js').then(() => true));
  await use();
  }, { auto: true }]
});
