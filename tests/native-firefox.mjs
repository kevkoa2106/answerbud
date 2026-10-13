import assert from 'node:assert/strict';
import path from 'node:path';
import { Builder, By } from 'selenium-webdriver';
import { Options, ServiceBuilder } from 'selenium-webdriver/firefox.js';
import { startQuizFixture } from './native-fixture.js';

const server = await startQuizFixture();
let driver;
try {
  const options = new Options().addArguments('-headless');
  if (process.env.FIREFOX_BINARY) options.setBinary(process.env.FIREFOX_BINARY);
  driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options).setFirefoxService(new ServiceBuilder().addArguments('--allow-system-access')).build();
  const addon = await driver.installWebExtension(path.resolve('dist/answerbud-firefox.zip'), { permanent: false });
  assert.equal(addon.id, 'quizlens@kevkoa2106.github.io');
  await driver.setContext('chrome');
  const uuid = await driver.executeScript('return JSON.parse(Services.prefs.getStringPref("extensions.webextensions.uuids"))[arguments[0]];', addon.id);
  assert.ok(uuid, 'Firefox must register the installed add-on');
  await driver.setContext('content');
  await driver.get(`moz-extension://${uuid}/panel.html`);
  const panelHandle = await driver.getWindowHandle();
  await driver.switchTo().newWindow('tab');
  await driver.get('http://127.0.0.1:8765/quiz');
  assert.equal(await driver.findElement(By.css('h2')).getText(), 'Output of encryption?');
  await driver.switchTo().window(panelHandle);
  const result = await driver.executeAsyncScript(function () {
    const done = arguments[arguments.length - 1];
    (async () => {
      await import(browser.runtime.getURL('panel.js'));
      const { captureDOM } = await import(browser.runtime.getURL('dom.js'));
      const { publicProfile } = await import(browser.runtime.getURL('profiles.js'));
      const granted = await browser.permissions.contains({ origins: ['http://127.0.0.1/*'] });
      const denied = await browser.permissions.contains({ origins: ['http://localhost/*'] });
      if (!granted) throw new Error('The installed add-on has not received its required fixture host permission.');
      const [tab] = await browser.tabs.query({ url: 'http://127.0.0.1/*' });
      if (!tab) throw new Error('Firefox did not expose the loaded fixture tab to its granted host permission.');
      const frames = await browser.scripting.executeScript({ target: { tabId: tab.id }, func: captureDOM });
      const captured = frames[0].result;
      const profiles = { local_api: publicProfile({ model: 'native-model', api_key: 'private-native-key' }) };
      await browser.storage.local.set({ profiles, last_provider: 'local_api' });
      await browser.storage.session.set({ credentials: { local_api: { api_key: 'private-native-key' } } });
      return { captured, granted, denied, manifest: browser.runtime.getManifest(), local: await browser.storage.local.get(null) };
    })().then(done, error => done({ error: error.message }));
  });
  assert.equal(result.error, undefined);
  assert.equal(result.manifest.sidebar_action.default_panel, `moz-extension://${uuid}/panel.html`);
  assert.ok(result.manifest.background.service_worker == null, 'Firefox must not register a service worker');
  assert.equal(result.granted, true);
  assert.equal(result.denied, false);
  assert.deepEqual(result.captured.options, ['Ciphertext', 'Plaintext']);
  assert.equal(result.captured.question, 'Output of encryption?');
  assert.ok(!result.captured.raw_text.includes('private form value'));
  assert.ok(!JSON.stringify(result.local).includes('private-native-key'));
  await driver.navigate().refresh();
  await driver.executeAsyncScript(function () { const done = arguments[arguments.length - 1]; import(browser.runtime.getURL('panel.js')).then(() => done(true)); });
  assert.equal(await driver.findElement(By.id('model')).getAttribute('value'), 'native-model');
  assert.equal(await driver.findElement(By.id('api-key')).getAttribute('value'), 'private-native-key');
  await driver.executeAsyncScript(function () { const done = arguments[arguments.length - 1]; browser.storage.session.clear().then(() => done(true)); });
  await driver.navigate().refresh();
  await driver.executeAsyncScript(function () { const done = arguments[arguments.length - 1]; import(browser.runtime.getURL('panel.js')).then(() => done(true)); });
  assert.equal(await driver.findElement(By.id('model')).getAttribute('value'), 'native-model');
  assert.equal(await driver.findElement(By.id('api-key')).getAttribute('value'), '');
  console.log('PASS: installed Firefox ZIP, sidebar manifest, real DOM capture, host permissions and credential separation.');
} finally {
  if (driver) await driver.quit();
  await new Promise(resolve => server.close(resolve));
}
