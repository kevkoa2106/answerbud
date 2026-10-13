import test from 'node:test';
import assert from 'node:assert/strict';
import { publicProfile } from '../extension/profiles.js';

test('persistent profiles include only non-sensitive settings', () => {
  assert.deepEqual(publicProfile({ model: 'test', base_url: 'http://localhost:1234/v1', max_tokens: 512, api_key: 'secret', token: 'secret', credentials: { openai: 'secret' }, question: 'private', image: 'private' }), { base_url: 'http://localhost:1234/v1', model: 'test', max_tokens: 512 });
});

test('saved credentials and capture data are excluded even when restoring old profile objects', () => {
  const oldProfile = { model: 'old-model', api_key: 'old-key', token: 'old-token', image: 'old-image', options: ['private'] };
  assert.deepEqual(publicProfile(oldProfile), { model: 'old-model' });
  assert.deepEqual(publicProfile({}), {});
});

test('malformed preferences and credentials in endpoint URLs are discarded', () => {
  assert.deepEqual(publicProfile({ model: {}, base_url: 'http://localhost:1234/v1?key=secret', structured_json: 'false', no_thinking: null, max_tokens: -1, input_mode: 'invalid' }), {});
  for (const value of [null, 'invalid', [], { max_tokens: true }, { model: 'x'.repeat(201) }]) assert.deepEqual(publicProfile(value), {});
  assert.deepEqual(publicProfile({ structured_json: false, no_thinking: false, max_tokens: 128, input_mode: 'image' }), { structured_json: false, no_thinking: false, max_tokens: 128, input_mode: 'image' });
});
