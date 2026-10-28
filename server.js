require("dotenv").config();

const express = require("express");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: "30kb" }));
app.use(express.static(path.join(__dirname, "public")));

const PROVIDERS = {
  openai: {
    name: "OpenAI",
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    configured: () => Boolean(process.env.OPENAI_API_KEY)
  },
  
gemini: {
  name: "Google Gemini",
  model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
  configured: () => Boolean(process.env.GEMINI_API_KEY)
},

  anthropic: {
    name: "Anthropic Claude",
    model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest",
    configured: () => Boolean(process.env.ANTHROPIC_API_KEY)
  },
  sarvam: {
    name: "Sarvam AI",
    model: process.env.SARVAM_MODEL || "sarvam-105b",
    configured: () => Boolean(process.env.SARVAM_API_KEY)
  }
};

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    providers: Object.entries(PROVIDERS).map(([id, p]) => ({
      id,
      name: p.name,
      model: p.model,
      configured: p.configured()
    }))
  });
});

function getErrorMessage(data, status) {
  const message =
    data?.error?.message ||
    data?.message ||
    data?.detail ||
    `Provider returned HTTP ${status}`;
  return String(message).slice(0, 350);
}


async function postJson(url, headers, body) {
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...headers
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180000)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const error = new Error(
          getErrorMessage(data, response.status)
        );
        error.status = response.status;
        throw error;
      }

      return data;

    } catch (error) {
      const retryable =
        [408, 429, 500, 502, 503, 504].includes(error.status) ||
        error.name === "TimeoutError" ||
        error.name === "TypeError";

      if (!retryable || attempt === maxRetries) {
        throw error;
      }

      const delay = Math.min(1000 * (2 ** attempt), 8000);

      console.log(
        `Temporary API failure. Retry ${attempt + 1}/${maxRetries} in ${delay / 1000}s.`
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
async function askOpenAI(question) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Missing OPENAI_API_KEY in your .env file.");

  const model = PROVIDERS.openai.model;
  const data = await postJson(
    "https://api.openai.com/v1/responses",
    { authorization: `Bearer ${key}` },
    {
      model,
      input: question,
      max_output_tokens: 900
    }
  );

  const text = data.output_text ||
    (data.output || [])
      .flatMap(item => item.content || [])
      .filter(part => part.type === "output_text")
      .map(part => part.text)
      .join("\n");

  if (!text) throw new Error("The provider returned an empty response.");
  return { provider: "openai", name: PROVIDERS.openai.name, model, text };
}

async function askGemini(question) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY in your .env file.");

  const model = PROVIDERS.gemini.model;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const data = await postJson(url, {}, {
    contents: [{ parts: [{ text: question }] }],
    generationConfig: { maxOutputTokens: 900, temperature: 0.3 }
  });

  const text = (data.candidates || [])
    .flatMap(candidate => candidate.content?.parts || [])
    .map(part => part.text || "")
    .join("\n")
    .trim();

  if (!text) throw new Error(data.promptFeedback?.blockReason
    ? `Request blocked: ${data.promptFeedback.blockReason}`
    : "The provider returned an empty response.");
  return { provider: "gemini", name: PROVIDERS.gemini.name, model, text };
}

async function askAnthropic(question) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Missing ANTHROPIC_API_KEY in your .env file.");

  const model = PROVIDERS.anthropic.model;
  const data = await postJson(
    "https://api.anthropic.com/v1/messages",
    {
      "x-api-key": key,
      "anthropic-version": "2023-06-01"
    },
    {
      model,
      max_tokens: 900,
      messages: [{ role: "user", content: question }]
    }
  );

  const text = (data.content || [])
    .filter(part => part.type === "text")
    .map(part => part.text)
    .join("\n")
    .trim();

  if (!text) throw new Error("The provider returned an empty response.");
  return { provider: "anthropic", name: PROVIDERS.anthropic.name, model, text };
}

async function askSarvam(question) {
  const key = process.env.SARVAM_API_KEY;
  if (!key) throw new Error("Missing SARVAM_API_KEY in your .env file.");

  const model = PROVIDERS.sarvam.model;
  const data = await postJson(
    "https://api.sarvam.ai/v1/chat/completions",
    { "api-subscription-key": key },
    {
      model,
      messages: [{ role: "user", content: question }],
      max_tokens: 900,
      temperature: 0.3
    }
  );

  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("The provider returned an empty response.");
  return { provider: "sarvam", name: PROVIDERS.sarvam.name, model, text };
}

const ASK_FUNCTIONS = {
  openai: askOpenAI,
  gemini: askGemini,
  anthropic: askAnthropic,
  sarvam: askSarvam
};

// Lightweight, transparent lexical comparison. This is not a truth detector.
const STOP_WORDS = new Set([
  "about","after","again","against","also","among","because","been","being",
  "before","between","both","could","does","doing","during","each","from",
  "have","having","here","into","itself","just","more","most","other","over",
  "same","should","some","such","than","that","their","them","then","there",
  "these","they","this","those","through","under","very","what","when","where",
  "which","while","with","would","your","will","were","your","are","and","the",
  "for","you","not","but","can","was","has","had","its","our","out","use",
  "using","how","why","who","all","any","may","might","like","make","many",
  "much","one","two","get","got","per","via","because","need","needs"
]);

function tokens(text) {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) || [])
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

function tokenSet(text) {
  return new Set(tokens(text));
}

function similarity(a, b) {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  let intersection = 0;
  for (const word of A) if (B.has(word)) intersection++;
  return intersection / (A.size + B.size - intersection);
}

function analyzeResponses(responses) {
  const wordCounts = new Map();
  const perProvider = responses.map(response => {
    const unique = tokenSet(response.text);
    for (const word of unique) wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    return { provider: response.name, words: unique };
  });

  const sharedTerms = [...wordCounts.entries()]
    .filter(([, count]) => count >= Math.max(2, Math.ceil(responses.length * 0.6)))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([term, count]) => ({ term, count }));

  const uniqueTerms = perProvider.map(item => ({
    provider: item.provider,
    terms: [...item.words]
      .filter(word => wordCounts.get(word) === 1)
      .slice(0, 8)
  }));

  const pairs = [];
  for (let i = 0; i < responses.length; i++) {
    for (let j = i + 1; j < responses.length; j++) {
      pairs.push({
        first: responses[i].name,
        second: responses[j].name,
        score: Math.round(similarity(responses[i].text, responses[j].text) * 100)
      });
    }
  }

  const average = pairs.length
    ? Math.round(pairs.reduce((sum, pair) => sum + pair.score, 0) / pairs.length)
    : (responses.length ? 100 : 0);

  let label = "Not enough responses";
  if (responses.length === 1) label = "Single response";
  else if (average >= 55) label = "Higher text overlap";
  else if (average >= 30) label = "Moderate text overlap";
  else label = "Lower text overlap";

  return {
    responseCount: responses.length,
    averageTextOverlap: average,
    agreementLabel: label,
    sharedTerms,
    uniqueTerms,
    pairComparisons: pairs,
    note: "Text overlap is a simple lexical estimate, not semantic proof. Similar wording does not establish truth, and different wording does not necessarily mean disagreement."
  };
}

app.post("/api/ask", async (req, res) => {
  const question = typeof req.body?.question === "string"
    ? req.body.question.trim()
    : "";
  const requested = Array.isArray(req.body?.providers)
    ? [...new Set(req.body.providers)]
    : [];

  if (!question) {
    return res.status(400).json({ error: "Enter a question first." });
  }
  if (question.length > 4000) {
    return res.status(400).json({ error: "Questions must be 4,000 characters or fewer." });
  }
  if (!requested.length) {
    return res.status(400).json({ error: "Select at least one AI provider." });
  }
  if (requested.some(id => !Object.hasOwn(ASK_FUNCTIONS, id))) {
    return res.status(400).json({ error: "One or more selected providers are invalid." });
  }

  const results = await Promise.all(requested.map(async id => {
    try {
      const response = await ASK_FUNCTIONS[id](question);
      return { ...response, status: "success" };
    } catch (error) {
      return {
        provider: id,
        name: PROVIDERS[id].name,
        model: PROVIDERS[id].model,
        status: "error",
        error: error.message || "Request failed."
      };
    }
  }));

  const successful = results.filter(item => item.status === "success");
  const failures = results.filter(item => item.status === "error");

  if (!successful.length) {
    return res.status(502).json({
      error: "No selected provider returned an answer. Check the API keys, model IDs, network connection, and provider account access.",
      responses: results,
      analysis: analyzeResponses([])
    });
  }

  res.json({
    question,
    responses: results,
    analysis: analyzeResponses(successful),
    summary: `${successful.length} of ${requested.length} selected provider(s) returned an answer.${failures.length ? ` ${failures.length} provider(s) failed; see their cards for details.` : ""}`
  });
});

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({ error: "Invalid JSON request body." });
  }
  console.error("Server error:", error.message);
  res.status(500).json({ error: "Unexpected server error. Check the terminal for details." });
});

app.listen(PORT, () => {
  console.log(`\nNEXUS AI is running at http://localhost:${PORT}`);
  console.log("API keys are read from .env and are never sent to the browser.\n");
});
