# Privacy policy

Updated: 13 October 2026. Applies to the official QuizLens extension and optional local Laya service.

## Data used

QuizLens reads visible question and answer text when you choose **Capture this tab**. It also processes text you enter. Image mode captures the visible tab or uses a PNG/JPEG you select; images may include unrelated personal information visible on the page.

Capture automatically sends the captured data for comparison. Uploading an image waits until you choose **Compare answers**. QuizLens does not continuously monitor tabs, collect browsing history, or read form-field values in DOM mode.

**Load available models** requests model identifiers from your selected provider. **Test connection** sends a generated sample question or image using your current settings, without sending your captured question. It may incur cloud API charges.

## Where data goes

Questions, answer options, or images go directly to the provider you select:

- **OpenAI or Anthropic:** their official APIs, with your API key for authentication.
- **LM Studio / local API or Ollama:** the localhost server you configure, with an optional key. That server may use a cloud model or keep logs, depending on its configuration.
- **Laya:** the token-protected service on your computer. Model weights are downloaded from upstream hosting on first use; question text is processed locally.

Providers receive connection information and handle requests under their own policies. Their retention and use of data are outside QuizLens's control.

QuizLens has no developer-operated collection server, analytics, advertising, or sale of user data. Data is used to compare answers and display results.

## Storage and removal

API keys and the Laya token stay in browser session storage and are cleared when the browser session ends. Captured data and results stay in panel memory until replaced or the panel document is closed or reloaded. QuizLens does not save question history.

Provider profiles (model, endpoint, and request options), the selected provider, and the colour preference stay in local browser storage until changed or the extension is removed. Credentials are excluded from saved profiles. Stop the Laya service to clear its running session; downloaded model files remain on disk. Service errors may appear in its terminal.

To stop sending data, stop capturing or comparing, revoke provider access in browser settings, or remove the extension. Removing QuizLens does not delete data already held by a provider; contact that provider for deletion requests.

**Cancel request** aborts the browser request and stops waiting. It does not guarantee that a provider stops processing, billing, or retaining a request already received.

## Contact and updates

Privacy questions or requests: [khoa210611@protonmail.com](mailto:khoa210611@protonmail.com). Do not send API keys or service tokens. Security concerns: [report privately](SECURITY.md).

Changes to this policy will be published here with an updated date.
