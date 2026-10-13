export const providers = ['local_api', 'ollama', 'openai', 'anthropic', 'laya'];

export function publicProfile(settings = {}) {
  if (!settings || typeof settings !== 'object') return {};
  const profile = {};
  if (typeof settings.model === 'string' && settings.model.length <= 200) profile.model = settings.model;
  if (typeof settings.base_url === 'string') {
    try {
      const url = new URL(settings.base_url);
      if (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname) && !url.username && !url.password && !url.search && !url.hash) profile.base_url = settings.base_url;
    } catch { /* Invalid endpoints use the provider default. */ }
  }
  for (const key of ['structured_json', 'no_thinking']) if (typeof settings[key] === 'boolean') profile[key] = settings[key];
  if (Number.isInteger(settings.max_tokens) && settings.max_tokens >= 128 && settings.max_tokens <= 8192) profile.max_tokens = settings.max_tokens;
  if (['text', 'image'].includes(settings.input_mode)) profile.input_mode = settings.input_mode;
  return profile;
}
