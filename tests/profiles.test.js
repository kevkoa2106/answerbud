import test from 'node:test';
import assert from 'node:assert/strict';
import { publicProfile } from '../extension/profiles.js';

test('persistent profiles include only non-sensitive settings', () => {
  assert.deepEqual(publicProfile({ model: 'test', base_url: 'http://localhost:1234/v1', max_tokens: 512, api_key: 'secret', token: 'secret', credentials: { openai: 'secret' }, question: 'private', image: 'private' }), { base_url: 'http://localhost:1234/v1', model: 'test', max_tokens: 512 });
});
