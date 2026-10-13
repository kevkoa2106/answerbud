import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';

before(() => execFileSync(process.execPath, ['scripts/package.mjs']));

test('Chrome and Firefox packages use their own supported sidebar manifests', () => {
  const chrome = JSON.parse(readFileSync('dist/chrome/manifest.json'));
  const firefox = JSON.parse(readFileSync('dist/firefox/manifest.json'));
  assert.equal(chrome.name, 'AnswerBud');
  assert.equal(firefox.name, 'AnswerBud');
  assert.equal(chrome.action.default_title, 'Open AnswerBud');
  assert.equal(firefox.sidebar_action.default_title, 'AnswerBud');
  assert.ok(chrome.background.service_worker);
  assert.ok(chrome.permissions.includes('sidePanel'));
  assert.equal(chrome.side_panel.default_path, 'panel.html');
  assert.deepEqual(chrome.host_permissions, ['http://127.0.0.1:8765/*']);
  assert.deepEqual(firefox.host_permissions, ['http://127.0.0.1/*']);
  assert.deepEqual(firefox.background.scripts, ['background.js']);
  assert.equal(firefox.sidebar_action.default_panel, 'panel.html');
  assert.equal(firefox.permissions.includes('sidePanel'), false);
  assert.equal(firefox.side_panel, undefined);
  assert.equal(firefox.browser_specific_settings.gecko.id, 'quizlens@kevkoa2106.github.io');
});

test('store ZIPs contain runtime files and a browser-specific manifest at the root', () => {
  const expectedFiles = ['LICENSE', 'background.js', 'browser-api.js', 'core.js', 'dom.js', 'manifest.json', 'panel.css', 'panel.html', 'panel.js', 'profiles.js', 'providers.js'];
  for (const target of ['chrome', 'firefox']) {
    const files = unzipSync(readFileSync(`dist/answerbud-${target}.zip`));
    assert.deepEqual(Object.keys(files).sort(), expectedFiles);
    const manifest = JSON.parse(strFromU8(files['manifest.json']));
    assert.equal(manifest.version, JSON.parse(readFileSync('extension/manifest.json')).version);
    assert.ok(files['panel.html']);
    assert.equal(strFromU8(files.LICENSE), readFileSync('LICENSE', 'utf8'));
    if (target === 'firefox') {
      assert.equal(manifest.background.service_worker, undefined);
      assert.equal(manifest.side_panel, undefined);
      assert.equal(manifest.permissions.includes('sidePanel'), false);
      assert.deepEqual(manifest.background.scripts, ['background.js']);
      assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions.required, ['websiteContent', 'authenticationInfo']);
    }
  }
});
