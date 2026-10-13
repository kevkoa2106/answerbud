import { parseOptions, validateInput, request, renderAnswers } from './core.js';
import { captureDOM } from './dom.js';
import { extensionApi } from './browser-api.js';
import { analyzeProvider, providerOrigin, listProviderModels } from './providers.js';
import { providers, publicProfile } from './profiles.js';

const byId = id => document.getElementById(id);
const status = byId('status');
const question = byId('question');
const options = byId('options');
const token = byId('token');
const themes = ['green', 'blue', 'red', 'grey'];
function applyTheme(theme) {
  const selected = themes.includes(theme) ? theme : 'green';
  document.documentElement.dataset.theme = selected;
  byId('theme').value = selected;
}
try { applyTheme((await extensionApi.storage.local.get('theme')).theme); }
catch { applyTheme('green'); }
byId('theme').addEventListener('change', async () => {
  applyTheme(byId('theme').value);
  try {
    await extensionApi.storage.local.set({ theme: byId('theme').value });
    byId('theme-status').textContent = 'Colour scheme saved on this device.';
  } catch {
    byId('theme-status').textContent = 'Colour scheme applied, but could not be saved. Try again.';
  }
});
let revision = 0;
let capturedImage = '';
function imageMode() { return byId('provider').value !== 'laya' && byId('input-mode').value === 'image'; }
function updateProvider() {
  const provider = byId('provider').value;
  const cloud = ['openai', 'anthropic'].includes(provider);
  byId('local-settings').hidden = provider === 'laya';
  byId('laya-settings').hidden = provider !== 'laya';
  byId('endpoint-settings').hidden = cloud;
  byId('thinking-settings').hidden = cloud;
  byId('json-settings').hidden = provider === 'anthropic';
  byId('provider-note').textContent = cloud ? 'Captured questions and images are sent to this provider using your API key. API usage may incur charges. Your key stays in this browser session; QuizLens has no shared server.' : provider === 'laya' ? 'Laya needs the Python service on this computer. Its token protects the service from website requests.' : 'Calls your model server directly. No QuizLens service or token is needed.';
  byId('api-key-label').textContent = cloud ? 'Provider API key' : 'API key (optional)';
  updateInputMode();
  byId('model-list').replaceChildren();
}
function updateInputMode() {
  byId('text-fields').hidden = imageMode();
  byId('image-fields').hidden = !imageMode();
  question.required = options.required = !imageMode();
}
function setImage(image) {
  capturedImage = image;
  byId('image-preview').src = image;
  byId('image-preview').hidden = false;
  byId('raw').textContent = 'Image mode: the vision model will read the question and answers when you compare.';
}
async function prepareImage(data) {
  if (!/^data:image\/(png|jpeg);base64,/.test(data)) throw new Error('Choose a PNG or JPEG image.');
  let bytes;
  try { bytes = Uint8Array.from(atob(data.split(',')[1]), char => char.charCodeAt(0)); }
  catch { throw new Error('The image could not be decoded.'); }
  if (bytes.length > 12 * 1024 * 1024) throw new Error('Choose an image under 12 MB.');
  let bitmap;
  try { bitmap = await createImageBitmap(new Blob([bytes])); }
  catch { throw new Error('The image could not be decoded.'); }
  try {
    if (bitmap.width * bitmap.height > 20000000) throw new Error('Use an image under 20 megapixels.');
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', .9);
  } finally { bitmap.close(); }
}
const settings = await extensionApi.storage.session.get(['token', 'provider', 'base_url', 'model', 'api_key', 'structured_json', 'no_thinking', 'max_tokens', 'input_mode']);
let stored = {};
try { stored = await extensionApi.storage.local.get(['profiles', 'last_provider']); } catch { /* Use session settings when local storage is unavailable. */ }
const profiles = Object.fromEntries(providers.map(provider => [provider, publicProfile(stored.profiles?.[provider] || {})]));
const { credentials: savedCredentials = {} } = await extensionApi.storage.session.get('credentials');
const credentials = { ...savedCredentials };
let activeProvider = providers.includes(settings.provider) ? settings.provider : providers.includes(stored.last_provider) ? stored.last_provider : 'local_api';
if (!Object.keys(profiles[activeProvider]).length) profiles[activeProvider] = publicProfile(settings);
if (!credentials[activeProvider]) credentials[activeProvider] = { api_key: settings.api_key || '', token: settings.token || '' };
function restoreProfile(provider) {
  const profile = profiles[provider];
  byId('provider').value = provider;
  byId('base-url').value = profile.base_url || (provider === 'ollama' ? 'http://127.0.0.1:11434' : 'http://127.0.0.1:1234/v1');
  byId('model').value = profile.model || '';
  byId('api-key').value = credentials[provider]?.api_key || '';
  token.value = credentials[provider]?.token || '';
  byId('structured-json').checked = profile.structured_json !== false;
  byId('no-thinking').checked = profile.no_thinking !== false;
  byId('max-tokens').value = profile.max_tokens || 512;
  byId('input-mode').value = profile.input_mode || 'text';
  updateProvider();
}
restoreProfile(activeProvider);
byId('input-mode').addEventListener('change', () => { updateInputMode(); clearResult(); });
byId('provider').addEventListener('change', () => {
  profiles[activeProvider] = publicProfile(currentSettings());
  credentials[activeProvider] = { api_key: byId('api-key').value, token: token.value };
  activeProvider = byId('provider').value;
  restoreProfile(activeProvider);
  clearResult();
});
for (const id of ['base-url', 'model', 'api-key', 'structured-json', 'no-thinking', 'max-tokens']) byId(id).addEventListener('input', clearResult);
if (token.value) status.textContent = 'Capture a question or type one below.';

function clearResult() {
  revision++;
  byId('answers').replaceChildren();
  byId('verdict').textContent = 'Compare the current question to see estimates.';
}
question.addEventListener('input', clearResult);
options.addEventListener('input', clearResult);

let operation;
byId('cancel').addEventListener('click', () => {
  revision++;
  operation?.abort(new DOMException('Request cancelled.', 'AbortError'));
});
async function run(message, action, cancellable = true) {
  if (operation) return;
  const controller = new AbortController();
  operation = controller;
  const buttons = [...document.querySelectorAll('button:not(#cancel)')];
  buttons.forEach(button => button.disabled = true);
  byId('cancel').hidden = !cancellable;
  byId('elapsed').hidden = false;
  const started = Date.now();
  const tick = () => { byId('elapsed').textContent = `Elapsed: ${Math.floor((Date.now() - started) / 1000)}s`; };
  tick();
  const timer = setInterval(tick, 1000);
  status.textContent = message;
  try {
    await Promise.race([action(controller.signal), new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true }))]);
  }
  catch (error) { status.textContent = controller.signal.aborted ? 'Request cancelled. Ready to try again.' : error.message; }
  finally {
    clearInterval(timer);
    operation = undefined;
    byId('cancel').hidden = true;
    byId('elapsed').hidden = true;
    buttons.forEach(button => button.disabled = false);
  }
}

byId('save').addEventListener('click', () => run('Saving settings…', async () => {
  const selected = currentSettings();
  const currentRevision = revision;
  const secret = { api_key: selected.api_key, token: token.value.trim() };
  await allowProvider(selected);
  if (revision !== currentRevision) throw new Error('Settings changed while requesting access. Save again.');
  profiles[selected.provider] = publicProfile(selected);
  credentials[selected.provider] = secret;
  await extensionApi.storage.session.set({ ...selected, token: secret.token, credentials });
  await extensionApi.storage.local.set({ profiles: Object.fromEntries(providers.map(provider => [provider, publicProfile(profiles[provider])])), last_provider: selected.provider });
  status.textContent = selected.provider === 'laya' ? 'Token saved for this browser session; provider profile saved on this device.' : 'Provider profile saved on this device. Keys stay in this browser session.';
  byId('settings').open = false;
}, false));

function currentSettings() {
  return { provider: byId('provider').value, base_url: byId('base-url').value.trim(), model: byId('model').value.trim(), api_key: byId('api-key').value.trim(), structured_json: byId('structured-json').checked, no_thinking: byId('no-thinking').checked, max_tokens: Number(byId('max-tokens').value), input_mode: imageMode() ? 'image' : 'text' };
}

async function allowProvider(settings) {
  if (settings.provider !== 'laya' && !await extensionApi.permissions.request({ origins: [providerOrigin(settings)] })) throw new Error('Provider access was declined.');
}

byId('refresh-models').addEventListener('click', () => run('Loading available models…', async signal => {
  const settings = currentSettings();
  const currentRevision = revision;
  await allowProvider(settings);
  signal.throwIfAborted();
  const models = await listProviderModels(settings, fetch, signal);
  signal.throwIfAborted();
  if (revision !== currentRevision) return;
  byId('model-list').replaceChildren(...models.map(model => { const option = document.createElement('option'); option.value = model; return option; }));
  status.textContent = models.length ? `${models.length} models available. Choose a model or enter its identifier.` : 'No models available. Load or download a model in your server, then retry.';
}));

byId('test-provider').addEventListener('click', () => run('Testing provider settings…', async signal => {
  const settings = currentSettings();
  const currentRevision = revision;
  await allowProvider(settings);
  signal.throwIfAborted();
  const payload = { ...settings, question: 'What is 2 + 2?', options: ['4', '5'] };
  if (settings.input_mode === 'image') {
    const canvas = document.createElement('canvas');
    canvas.width = 400; canvas.height = 160;
    const context = canvas.getContext('2d');
    context.fillStyle = 'white'; context.fillRect(0, 0, 400, 160);
    context.fillStyle = 'black'; context.font = '28px sans-serif';
    context.fillText('What is 2 + 2?', 20, 45); context.fillText('A. 4     B. 5', 20, 110);
    payload.image = canvas.toDataURL('image/jpeg', .9);
  }
  if (settings.provider === 'laya') await request('/analyze', payload, token.value, fetch, signal);
  else await analyzeProvider(payload, fetch, signal);
  signal.throwIfAborted();
  if (revision === currentRevision) status.textContent = 'Connection works. The model returned valid answer data with these settings.';
}));

async function compare(currentRevision, signal) {
  signal.throwIfAborted();
  status.textContent = byId('provider').value === 'laya' ? 'Laya is comparing the answers. First use may download a model…' : 'Your selected model is comparing the answers…';
  const choices = parseOptions(options.value);
  if (imageMode()) {
    if (!capturedImage) throw new Error('Capture a tab or choose an image first.');
  } else validateInput(question.value, choices);
  const payload = { question: question.value.trim(), options: choices, provider: byId('provider').value, base_url: byId('base-url').value.trim(), model: byId('model').value.trim(), api_key: byId('api-key').value.trim(), structured_json: byId('structured-json').checked, no_thinking: byId('no-thinking').checked, max_tokens: Number(byId('max-tokens').value), input_mode: imageMode() ? 'image' : 'text', ...(imageMode() ? { image: capturedImage } : {}) };
  if (payload.provider !== 'laya' && !await extensionApi.permissions.contains({ origins: [providerOrigin(payload)] })) throw new Error('Save settings and allow access to the selected provider first.');
  signal.throwIfAborted();
  const result = payload.provider === 'laya' ? await request('/analyze', payload, token.value, fetch, signal) : await analyzeProvider(payload, fetch, signal);
  signal.throwIfAborted();
  if (revision !== currentRevision) { status.textContent = 'Question changed during analysis. Compare it again.'; return; }
  if (result.input_mode === 'image') {
    question.value = result.question;
    options.value = result.options.join('\n');
    byId('raw').textContent = `${result.question}\n${result.options.join('\n')}`;
  }
  const chosen = result.answers.find(answer => answer.index === result.chosen_index) || result.answers[0];
  const tied = result.tied ?? result.answers.filter(answer => Math.abs(answer.probability - chosen.probability) < 1e-9).length > 1;
  renderAnswers(byId('answers'), result.answers, chosen.index);
  byId('verdict').textContent = `${result.provider_label || 'Laya'} favors ${String.fromCharCode(65 + chosen.index)}. ${chosen.text}` +
    (tied ? ' Scores are tied; this is a tentative choice.' : result.uncertain ? ' Uncertain: below the 70% display threshold.' : '');
  byId('probability-note').textContent = (result.probability_note || "Percentages reflect Laya's preferences among these options. They have not been calibrated on your quizzes and can be confidently wrong.") +
    (tied ? result.choice_source === 'model' ? ' The model explicitly selected this answer despite tied scores.' : ' The original option order breaks the tie; the scores do not distinguish a winner.' : '');
  status.textContent = `Compared with ${result.model}; ${result.method || 'averaged across answer orders'}.`;
}

byId('capture').addEventListener('click', () => run('Reading the visible page…', async signal => {
  clearResult();
  const currentRevision = revision;
  let result;
  try {
    if (imageMode()) {
      capturedImage = '';
      byId('image-preview').hidden = true;
      const image = await prepareImage(await extensionApi.tabs.captureVisibleTab(undefined, { format: 'png' }));
      signal.throwIfAborted();
      if (revision !== currentRevision) { status.textContent = 'Input changed during capture. Capture again when ready.'; return; }
      setImage(image);
    } else {
      const [tab] = await extensionApi.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('Open a quiz tab before capturing.');
      const frames = await extensionApi.scripting.executeScript({ target: { tabId: tab.id }, func: captureDOM });
      signal.throwIfAborted();
      result = frames[0]?.result;
      if (!result) throw new Error('Could not read this page. Enter the question below or use Image mode.');
      if (revision !== currentRevision) { status.textContent = 'Text changed during capture. Capture again when ready.'; return; }
      question.value = result.question;
      options.value = result.options.join('\n');
      byId('raw').textContent = result.raw_text || 'No complete question found in visible page elements.';
      if (result.error) { status.textContent = result.error; return; }
    }
  } catch (error) {
    if (/activeTab|<all_urls>|Cannot access|cannot be scripted|Missing host permission/i.test(error.message)) {
      throw new Error('Click the QuizLens extension icon in Chrome’s toolbar while viewing this quiz tab, then click Capture this tab again. Switching tabs or websites requires another toolbar click. Chrome internal pages cannot be read.');
    }
    throw error;
  }
  await compare(currentRevision, signal);
}));

byId('question-form').addEventListener('submit', event => {
  event.preventDefault();
  run('Comparing answers…', async signal => {
    clearResult();
    await compare(revision, signal);
  });
});

byId('image-upload').addEventListener('change', () => run('Loading image…', async signal => {
  clearResult();
  capturedImage = '';
  byId('image-preview').hidden = true;
  const currentRevision = revision;
  const file = byId('image-upload').files[0];
  if (!file) return;
  if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 12 * 1024 * 1024) throw new Error('Choose a PNG or JPEG under 12 MB.');
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read this image.'));
    reader.readAsDataURL(file);
  });
  signal.throwIfAborted();
  const image = await prepareImage(data);
  signal.throwIfAborted();
  if (revision !== currentRevision) { status.textContent = 'Input changed while loading the image. Choose it again.'; return; }
  setImage(image);
  status.textContent = 'Image loaded. Compare with a vision-capable local model.';
}));
