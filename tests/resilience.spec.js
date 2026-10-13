import { test, expect } from './panel-fixture.js';

async function selectLocal(page) {
  await page.locator('#settings summary').click();
  await page.locator('#provider').selectOption('local_api');
  await page.locator('#model').fill('first-model');
}

test('storage mocks return requested keys and preserve default values', async ({ page }) => {
  expect(await page.evaluate(() => chrome.storage.session.get('credentials'))).toEqual({});
  expect(await page.evaluate(() => chrome.storage.session.get({ missing: 'default' }))).toEqual({ missing: 'default' });
  expect(await page.evaluate(() => chrome.storage.local.get('theme'))).toEqual({ theme: null });
});

test('an old cancelled completion arriving after a retry cannot replace the newer answer', async ({ page }) => {
  await selectLocal(page);
  await page.evaluate(() => {
    let calls = 0;
    window.fetch = async () => {
      calls++;
      const response = index => Response.json({ choices: [{ message: { content: JSON.stringify({ best_index: index, probabilities: index ? [.1, .9] : [.9, .1] }) } }] });
      if (calls === 1) return new Promise(resolve => { window.finishOld = () => resolve(response(0)); });
      return response(1);
    };
  });
  await page.locator('#capture').click();
  await expect.poll(() => page.evaluate(() => typeof window.finishOld)).toBe('function');
  await page.locator('#cancel').click();
  await page.locator('#model').fill('new-model');
  await page.locator('#capture').click();
  await expect(page.locator('#status')).toContainText('Compared with new-model');
  await expect(page.locator('#verdict')).toContainText('favors B');
  await page.evaluate(async () => { window.finishOld(); await new Promise(resolve => setTimeout(resolve, 0)); });
  await expect(page.locator('#verdict')).toContainText('favors B');
  await expect(page.locator('#status')).toContainText('Compared with new-model');
});

test('cancelling a pending DOM capture leaves a later capture intact', async ({ page }) => {
  await selectLocal(page);
  await page.evaluate(() => {
    let calls = 0;
    chrome.scripting.executeScript = async () => {
      calls++;
      if (calls === 1) return new Promise(resolve => { window.finishOldCapture = () => resolve([{ result: { question: 'Old question?', options: ['old a', 'old b'] } }]); });
      return [{ result: { question: 'New question?', options: ['new a', 'new b'] } }];
    };
    window.fetch = async () => Response.json({ choices: [{ message: { content: '{"best_index":1,"probabilities":[0.1,0.9]}' } }] });
  });
  await page.locator('#capture').click();
  await expect.poll(() => page.evaluate(() => typeof window.finishOldCapture)).toBe('function');
  await page.locator('#cancel').click();
  await page.locator('#capture').click();
  await expect(page.locator('#question')).toHaveValue('New question?');
  await expect(page.locator('#status')).toContainText('Compared with');
  await page.evaluate(async () => { window.finishOldCapture(); await new Promise(resolve => setTimeout(resolve, 0)); });
  await expect(page.locator('#question')).toHaveValue('New question?');
  await expect(page.locator('.chosen-answer')).toContainText('new b');
});

test('cancelled model discovery cannot replace a newer model list', async ({ page }) => {
  await selectLocal(page);
  await page.evaluate(() => {
    let calls = 0;
    window.fetch = async () => {
      calls++;
      if (calls === 1) return new Promise(resolve => { window.finishOldModels = () => resolve(Response.json({ data: [{ id: 'old-model' }] })); });
      return Response.json({ data: [{ id: 'new-model' }] });
    };
  });
  await page.locator('#refresh-models').click();
  await expect.poll(() => page.evaluate(() => typeof window.finishOldModels)).toBe('function');
  await page.locator('#cancel').click();
  await page.locator('#refresh-models').click();
  await expect(page.locator('#model-list option')).toHaveAttribute('value', 'new-model');
  await page.evaluate(async () => { window.finishOldModels(); await new Promise(resolve => setTimeout(resolve, 0)); });
  await expect(page.locator('#model-list option')).toHaveAttribute('value', 'new-model');
});

test('failed model refresh clears old choices and restores controls', async ({ page }) => {
  await selectLocal(page);
  await page.route('http://127.0.0.1:1234/v1/models', route => route.fulfill({ json: { data: [{ id: 'old-model' }] } }));
  await page.locator('#refresh-models').click();
  await expect(page.locator('#model-list option')).toHaveCount(1);
  await page.unroute('http://127.0.0.1:1234/v1/models');
  await page.route('http://127.0.0.1:1234/v1/models', route => route.fulfill({ status: 401, json: {} }));
  await page.locator('#refresh-models').click();
  await expect(page.locator('#status')).toContainText('HTTP 401');
  await expect(page.locator('#model-list option')).toHaveCount(0);
  await expect(page.locator('#refresh-models')).toBeEnabled();
  await expect(page.locator('#cancel')).toBeHidden();
});

test('changing providers while save awaits permission does not save mismatched settings', async ({ page }) => {
  await selectLocal(page);
  await page.locator('#api-key').fill('private-first-key');
  await page.evaluate(() => { chrome.permissions.request = () => new Promise(resolve => { window.finishPermission = resolve; }); });
  await page.locator('#save').click();
  await expect.poll(() => page.evaluate(() => typeof window.finishPermission)).toBe('function');
  await page.locator('#provider').selectOption('openai');
  await page.evaluate(() => window.finishPermission(true));
  await expect(page.locator('#status')).toContainText('Settings changed');
  expect(await page.evaluate(() => window.savedLocal)).toBeUndefined();
  expect(await page.evaluate(() => window.savedSettings)).toBeUndefined();
  await expect(page.locator('#api-key')).toHaveValue('');
  await expect(page.locator('#save')).toBeEnabled();
});

test('failed profile storage is reported and can be retried', async ({ page }) => {
  await selectLocal(page);
  await page.evaluate(() => {
    const save = chrome.storage.local.set;
    chrome.storage.local.set = async settings => { if (settings.profiles) throw new Error('Storage write failed'); return save(settings); };
    window.restoreStorage = () => { chrome.storage.local.set = save; };
  });
  await page.locator('#save').click();
  await expect(page.locator('#status')).toContainText('Storage write failed');
  await expect(page.locator('#save')).toBeEnabled();
  await page.evaluate(() => window.restoreStorage());
  await page.locator('#save').click();
  await expect(page.locator('#status')).toContainText('profile saved');
});

test('legacy session settings migrate without persisting old credentials', async ({ page }) => {
  await page.evaluate(() => sessionStorage.setItem('test-session', JSON.stringify({ provider: 'local_api', model: 'legacy-model', api_key: 'legacy-secret', base_url: 'http://localhost:1234/v1' })));
  await page.reload();
  await page.locator('#settings summary').click();
  await expect(page.locator('#model')).toHaveValue('legacy-model');
  await expect(page.locator('#api-key')).toHaveValue('legacy-secret');
  await page.locator('#save').click();
  const saved = await page.evaluate(() => window.savedLocal);
  expect(saved.profiles.local_api.model).toBe('legacy-model');
  expect(JSON.stringify(saved)).not.toContain('legacy-secret');
});

test('malformed saved profile values fall back to usable defaults', async ({ page }) => {
  await page.evaluate(() => {
    sessionStorage.setItem('test-session', '{}');
    sessionStorage.setItem('test-local', JSON.stringify({ profiles: { laya: { model: { secret: 'corrupt' }, max_tokens: -1, input_mode: 'invalid', structured_json: 'invalid' } } }));
  });
  await page.reload();
  await page.locator('#settings summary').click();
  await page.locator('#provider').selectOption('local_api');
  await page.locator('#provider').selectOption('laya');
  await expect(page.locator('#model')).toHaveValue('');
  await expect(page.locator('#max-tokens')).toHaveValue('512');
  await expect(page.locator('#input-mode')).toHaveValue('text');
  await expect(page.locator('#structured-json')).toBeChecked();
});

test('session storage read failures leave persisted public profiles usable', async ({ page }) => {
  await page.evaluate(() => sessionStorage.setItem('test-local', JSON.stringify({ last_provider: 'local_api', profiles: { local_api: { model: 'saved-model' } } })));
  await page.addInitScript(() => { chrome.storage.session.get = async () => { throw new Error('Read failed'); }; });
  await page.reload();
  await page.locator('#settings summary').click();
  await expect(page.locator('#model')).toHaveValue('saved-model');
  await expect(page.locator('#api-key')).toHaveValue('');
  await expect(page.locator('#capture')).toBeEnabled();
});

test('failed session credential write never writes a persistent profile or reports success', async ({ page }) => {
  await selectLocal(page);
  await page.locator('#api-key').fill('private-key');
  await page.evaluate(() => { chrome.storage.session.set = async () => { throw new Error('Session write failed'); }; });
  await page.locator('#save').click();
  await expect(page.locator('#status')).toContainText('Session write failed');
  expect(await page.evaluate(() => window.savedLocal)).toBeUndefined();
  await expect(page.locator('#save')).toBeEnabled();
});
