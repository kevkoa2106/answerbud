# Tests

See [CI results](https://github.com/kevkoa2106/answerbud/actions/workflows/tests.yml) for the current revision.

| Suite | Coverage |
| --- | --- |
| Python backend | Authentication, OCR fixtures, local API requests and model-output validation |
| JavaScript | Input validation, model discovery, profile sanitization, cancellation and ZIP contents |
| Browser fixtures | Chromium and Firefox panel behavior, late responses, storage failures, image limits and themes |
| Installed Chrome | Built extension, real DOM capture, host permissions and credential separation |
| Installed Firefox | ZIP installation with WebDriver, sidebar manifest, real capture, permissions and credential separation |

Packaging runs Mozilla's validator and fails on errors or warnings. Browser tests use a local Node server; no Python service is needed for them.

## Run

Requires Node 24+, Python 3.13, and Tesseract.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-test.txt
npm ci
npx playwright install chromium firefox
.venv/bin/python -m unittest discover -s tests -v
npm test
npm run package
npm run test:browser
npm run test:firefox-native
```

The native Firefox check needs port 8765 free. Selenium Manager obtains Firefox and geckodriver when missing; set `FIREFOX_BINARY` to use a specific Firefox installation. CI supplies a standalone Firefox build.

After full Laya setup, enable the optional checkpoint test:

```sh
HF_HOME="$PWD/.cache/huggingface" LAYA_INTEGRATION=1 .venv/bin/python -m unittest discover -s tests -v
```

## Scope

- Panel fixtures simulate extension APIs in both engines. The installed-browser checks use native APIs; Firefox runs separately through WebDriver.
- Routine tests simulate model responses and do not call paid APIs or load Laya weights.
- Live quiz-site toolbar grants, interactive permission prompts, model accuracy, latency and Firefox signing are not verified.
