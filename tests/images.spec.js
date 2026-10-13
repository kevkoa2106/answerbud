import { test, expect } from './panel-fixture.js';
import path from 'node:path';

async function imageMode(page) {
  await page.locator('#settings summary').click();
  await page.locator('#provider').selectOption('local_api');
  await page.locator('#model').fill('vision-model');
  await page.locator('#input-mode').selectOption('image');
}

async function jpeg(page) {
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 32;
    const context = canvas.getContext('2d'); context.fillStyle = 'red'; context.fillRect(0, 0, 64, 32);
    return canvas.toDataURL('image/jpeg').split(',')[1];
  });
  return { name: 'question.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(data, 'base64') };
}

test('a valid JPEG upload can be compared through the vision provider', async ({ page }) => {
  await imageMode(page);
  await page.route('http://127.0.0.1:1234/v1/chat/completions', async route => {
    const content = route.request().postDataJSON().messages[1].content;
    expect(content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
    await route.fulfill({ json: { choices: [{ message: { content: '{"question":"Image question?","options":["a","b"],"best_index":1,"probabilities":[0.1,0.9]}' } }] } });
  });
  await page.locator('#image-upload').setInputFiles(await jpeg(page));
  await expect(page.locator('#status')).toContainText('Image loaded');
  await page.locator('#analyze').click();
  await expect(page.locator('.chosen-answer')).toContainText('B. b');
});

test('corrupt images with valid MIME types clear prior captures and never reach a provider', async ({ page }) => {
  await imageMode(page);
  let calls = 0;
  await page.route('http://127.0.0.1:1234/**', route => { calls++; return route.abort(); });
  await page.locator('#image-upload').setInputFiles(path.resolve('tests/quiz.png'));
  await expect(page.locator('#image-preview')).toBeVisible();
  for (const mimeType of ['image/png', 'image/jpeg']) {
    await page.locator('#image-upload').setInputFiles({ name: mimeType === 'image/png' ? 'corrupt.png' : 'corrupt.jpg', mimeType, buffer: Buffer.from('not an image') });
    await expect(page.locator('#status')).toContainText('could not be decoded');
    await expect(page.locator('#image-preview')).toBeHidden();
    await page.locator('#analyze').click();
    await expect(page.locator('#status')).toContainText('Capture a tab or choose an image first');
    await expect(page.locator('#analyze')).toBeEnabled();
  }
  expect(calls).toBe(0);
});

test('files exceeding 12 MB are rejected before decoding', async ({ page }) => {
  await imageMode(page);
  await page.evaluate(() => { window.createImageBitmap = async () => { window.decodeCalled = true; throw new Error('Should not decode'); }; });
  await page.locator('#image-upload').setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(12 * 1024 * 1024 + 1) });
  await expect(page.locator('#status')).toContainText('under 12 MB');
  expect(await page.evaluate(() => window.decodeCalled || false)).toBe(false);
  await expect(page.locator('#analyze')).toBeEnabled();
});

test('excessive pixel dimensions reject the image and release its bitmap', async ({ page }) => {
  await imageMode(page);
  await page.evaluate(() => { window.createImageBitmap = async () => ({ width: 5001, height: 4000, close: () => { window.bitmapClosed = true; } }); });
  await page.locator('#image-upload').setInputFiles(path.resolve('tests/quiz.png'));
  await expect(page.locator('#status')).toContainText('under 20 megapixels');
  expect(await page.evaluate(() => window.bitmapClosed)).toBe(true);
  await expect(page.locator('#image-preview')).toBeHidden();
});

test('cancelling an image read prevents it from replacing a later upload', async ({ page }) => {
  await imageMode(page);
  const replacement = await jpeg(page);
  await page.evaluate(() => {
    const Original = window.FileReader;
    let first = true;
    window.FileReader = class extends Original {
      readAsDataURL(file) {
        if (first) { first = false; window.finishOldImage = () => super.readAsDataURL(file); }
        else super.readAsDataURL(file);
      }
    };
  });
  await page.locator('#image-upload').setInputFiles(path.resolve('tests/quiz.png'));
  await expect.poll(() => page.evaluate(() => typeof window.finishOldImage)).toBe('function');
  await page.locator('#cancel').click();
  await page.locator('#image-upload').setInputFiles(replacement);
  await expect(page.locator('#status')).toContainText('Image loaded');
  const preview = await page.locator('#image-preview').getAttribute('src');
  await page.evaluate(async () => { window.finishOldImage(); await new Promise(resolve => setTimeout(resolve, 0)); });
  await expect(page.locator('#image-preview')).toHaveAttribute('src', preview);
  await expect(page.locator('#status')).toContainText('Image loaded');
});
