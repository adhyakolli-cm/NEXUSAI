# NEXUS AI — AI Response Analysis Engine

NEXUS AI is a full-stack web application that sends a question to selected AI providers and displays their answers side by side. Its analysis panel computes simple word-set overlap, shared terms, provider-specific terms, and pairwise text-similarity estimates.

> **Important:** Text overlap is not a fact-check. Similar wording does not prove a claim is true, and different wording does not automatically mean providers disagree.

## Features

- Responsive dark dashboard.
- Select one or multiple AI providers.
- Backend integrations for OpenAI, Google Gemini, Anthropic Claude, and Sarvam AI.
- Parallel requests so providers are queried at the same time.
- Individual provider error states: one provider can fail while others succeed.
- Shared-term and provider-specific-term analysis.
- Pairwise lexical overlap estimate.
- API keys stored server-side in `.env`.
- Health endpoint that shows whether provider keys are configured without revealing them.

## Technology

- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js, Express
- Configuration: dotenv
- Provider APIs: OpenAI Responses API, Gemini `generateContent`, Anthropic Messages API, Sarvam Chat Completions

## Project structure

```text
NEXUS-AI/
├── server.js
├── package.json
├── package-lock.json        # created by npm install
├── .gitignore
├── .env.example
├── README.md
└── public/
    ├── index.html
    ├── style.css
    └── script.js
```

## Requirements

- Node.js 18 or later (a current LTS release is recommended).
- API keys and provider account access for whichever providers you select.
- Internet access for provider API calls.

## Run locally

1. Install Node.js from https://nodejs.org/ if it is not already installed.
2. Open this project folder in VS Code.
3. Open Terminal → New Terminal.
4. Install dependencies:

   ```bash
   npm install
   ```

5. Copy `.env.example` to a new file named `.env`.
6. Add the API keys you have. Leave unused provider keys blank. Example:

   ```env
   PORT=3000
   OPENAI_API_KEY=your_openai_key
   OPENAI_MODEL=gpt-4.1-mini
   GEMINI_API_KEY=your_gemini_key
   GEMINI_MODEL=gemini-2.5-flash
   ANTHROPIC_API_KEY=your_anthropic_key
   ANTHROPIC_MODEL=claude-3-5-haiku-latest
   SARVAM_API_KEY=your_sarvam_key
   SARVAM_MODEL=sarvam-105b
   ```

7. Verify that the model IDs are available to your provider account and match the provider's current documentation. Change the corresponding `*_MODEL` value if necessary.
8. Start the server:

   ```bash
   npm start
   ```

9. Open http://localhost:3000 in your browser.
10. Select only providers whose keys are configured, enter a question, and click **Analyze responses**.

### Development mode

```bash
npm run dev
```

This uses Node's built-in watch mode to restart the server when server-side files change.

## API endpoints

- `GET /api/health` — server status and provider configuration status.
- `POST /api/ask` — accepts a JSON body such as:

  ```json
  {
    "question": "What are the benefits of regular exercise?",
    "providers": ["openai", "gemini"]
  }
  ```

The API keys are never sent to the browser. Provider calls are made by the backend.

## Security notes

- **Never upload `.env` to GitHub.** The `.gitignore` file excludes it.
- Never put API keys into `public/script.js` or HTML.
- Do not commit `node_modules/`.
- If a key is accidentally exposed, revoke or rotate it immediately. Removing it in a later commit does not erase it from Git history.
- For a public production deployment, add rate limiting, authentication or abuse protection, stricter request logging controls, and usage limits before sharing the endpoint widely.

## Analysis limitations

The current analyzer uses basic lexical overlap and term counts. It does not understand every paraphrase, determine logical contradiction reliably, verify claims against trusted sources, or judge which model is correct. A future version could add semantic embeddings, structured claim extraction, source citations, and independent fact-checking.

## Troubleshooting

- **“API key not configured”** — confirm that the `.env` file exists in the project root and the key name matches exactly; restart the server after changing `.env`.
- **Provider authentication/model error** — check that the key is valid, your account has API access, billing/quotas are available, and the model ID is supported.
- **Server unavailable** — run `npm start` in the project folder and inspect the terminal for errors.
- **No response from one provider** — the UI displays provider failures separately; try the other configured providers.

## Project status

Working prototype. Provider API access, model availability, and account quotas must be configured and tested by the person running the application.
