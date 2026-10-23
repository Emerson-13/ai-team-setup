# N8N.md: AI Features Through n8n

Read this when the app needs an AI feature (chatbot, summarize, rewrite, translate, extract data from text). Laravel never talks to a model directly. It calls an **n8n webhook**, and n8n runs the AI.

Why: the API key lives in n8n (not in Laravel or the browser), you can swap the model without a deploy, and non-developers can edit the flow.

Import-ready workflows are in `docs/ai/n8n/`.

---

## 1. The workflows

| File | Webhook path | You send | You get back |
|---|---|---|---|
| `01-ai-chat-agent.json` | `/webhook/ai-chat` | `message`, `session_id`, optional `system_prompt` | `{ "reply": "..." }` |
| `02-ai-text-task.json` | `/webhook/ai-text` | `instruction`, `text` | `{ "result": "..." }` |
| `03-ai-extract.json` | `/webhook/ai-extract` | `text` | `{ "data": { summary, intent, sentiment, language } }` |

- **Chat agent:** AI Agent node with memory (remembers the last 10 messages per `session_id`).
- **Text task:** Basic LLM Chain. One workflow covers summarize, rewrite, translate, and draft a reply: put the job in `instruction`.
- **Extract:** Information Extractor. Edit its attribute list to the fields your app needs.

All three use only built-in AI nodes: **Webhook -> AI node + Chat Model -> Respond to Webhook**. No HTTP Request nodes, no Code nodes, nothing to configure by hand.

## 2. Import (5 steps)

1. In n8n: **Workflows -> Import from file**, choose a `.json` file from `docs/ai/n8n/`.
2. Open the **Chat Model** node and pick **your** credential (your own API key). Nothing is pre-filled.
3. Open the **Webhook** node, create a **Header Auth** credential: Name `X-N8N-Secret`, Value = a long random secret.
4. Click **Execute workflow** once to test, then switch **Active** on.
5. Put the same secret in Laravel `.env` (Section 4).

**Another AI provider?** The shipped Chat Model is OpenAI. To use Anthropic, Gemini, Groq, Ollama or another: delete the Chat Model node, add that provider's **Chat Model** node, and connect it to the same slot. Nothing else changes.

**Test vs production URL:** while testing in the editor use `/webhook-test/<path>`. After you switch the workflow Active use `/webhook/<path>`.

## 3. Adding a new workflow

Follow the same shape so users can import it without setup:

- Trigger: **Webhook** (Header Auth, response mode "Using Respond to Webhook node").
- One built-in AI node: **AI Agent**, **Basic LLM Chain**, **Information Extractor**, **Text Classifier**, **Sentiment Analysis**, **Summarization Chain**, and so on.
- A **Chat Model** sub-node with no credential saved (the user picks their key).
- **Respond to Webhook** returning small JSON.
- Do **not** call model APIs with an HTTP Request node, and do not build an agent by hand out of generic nodes. Use the AI node that already is that thing.
- Export without credentials, add a `notes` text on any node that needs the user's attention, and save to `docs/ai/n8n/NN-name.json`. Update the table in Section 1.
- Test it: import it into a real n8n, activate it, and call the webhook. Mark it **Not Tested** if you could not.

## 4. Calling it from Laravel

`.env`:

```text
N8N_BASE_URL=https://your-n8n.example.com
N8N_WEBHOOK_SECRET=the-same-secret-as-in-n8n
```

`config/services.php`:

```php
'n8n' => [
    'base_url' => env('N8N_BASE_URL'),
    'secret'   => env('N8N_WEBHOOK_SECRET'),
    'timeout'  => 60,
],
```

`app/Services/Ai/N8nAiClient.php` (pattern; adapt names):

```php
class N8nAiClient
{
    public function chat(string $message, string $sessionId, ?string $systemPrompt = null): string
    {
        return $this->post('ai-chat', array_filter([
            'message' => $message,
            'session_id' => $sessionId,
            'system_prompt' => $systemPrompt,
        ]))['reply'];
    }

    public function text(string $instruction, string $text): string
    {
        return $this->post('ai-text', compact('instruction', 'text'))['result'];
    }

    public function extract(string $text): array
    {
        return $this->post('ai-extract', compact('text'))['data'];
    }

    protected function post(string $path, array $payload): array
    {
        return Http::baseUrl(config('services.n8n.base_url'))
            ->withHeaders(['X-N8N-Secret' => config('services.n8n.secret')])
            ->acceptJson()
            ->timeout(config('services.n8n.timeout'))
            ->retry(2, 500, fn ($e) => $e instanceof ConnectionException, throw: false)
            ->post("/webhook/{$path}", $payload)
            ->throw()
            ->json();
    }
}
```

## 5. Rules (every AI feature)

- **Server side only.** Laravel calls n8n from a Service. The browser never sees the n8n URL or secret.
- **Queue slow work.** Anything that can exceed a few seconds runs in a queued Job. Show a pending state and update with the result (Reverb) instead of holding the request open.
- **Retry only on connection errors**, never on a response, so one request is not billed twice.
- **Tenant-safe sessions.** Build `session_id` as `{company_id}:{user_id}:{conversation_id}`. Memory is keyed by this value, so a shared id would mix tenants.
- **Control cost.** Rate-limit per user and per company, cap input length in a Form Request, and log usage (company, feature, duration; not the content).
- **Send the minimum.** No secrets, passwords or unneeded personal data in the payload.
- **Never trust model output.** Validate the shape before use. Never use it to decide permissions, money, or anything irreversible. Handle failures with a clear message and a fallback, not a blank screen.
- **No fake AI.** If the workflow is not connected yet, say so; do not mock replies in production code (AGENTS.md).
- **Tests.** Fake the client (`Http::fake()`) for backend tests. Do not call a real model in the suite.

## 6. Troubleshooting

| Symptom | Cause |
|---|---|
| `403 Authorization data is wrong` | Secret in Laravel does not match the Header Auth credential in n8n |
| `404 webhook is not registered` | Workflow is not Active, or you used the `/webhook-test/` URL after it stopped listening |
| Timeout | Model is slow; queue the call and raise `timeout` |
| Node shows a red credential warning | Pick your credential in that node (Chat Model or Webhook) |
