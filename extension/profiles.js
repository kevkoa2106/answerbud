export const providers = ['local_api', 'ollama', 'openai', 'anthropic', 'laya'];

export function publicProfile(settings) {
  return Object.fromEntries(['base_url', 'model', 'structured_json', 'no_thinking', 'max_tokens', 'input_mode'].filter(key => settings[key] !== undefined).map(key => [key, settings[key]]));
}
