const questionInput = document.querySelector("#question");
const charCount = document.querySelector("#char-count");
const analyzeButton = document.querySelector("#analyze-button");
const selectAllButton = document.querySelector("#select-all");
const formError = document.querySelector("#form-error");
const resultsSection = document.querySelector("#results");
const loadingOverlay = document.querySelector("#loading-overlay");
const providerInputs = [...document.querySelectorAll('input[name="provider"]')];

const providerMeta = {
  openai: { label: "OpenAI", symbol: "O", icon: "openai-icon" },
  gemini: { label: "Google Gemini", symbol: "✳", icon: "gemini-icon" },
  anthropic: { label: "Anthropic Claude", symbol: "A", icon: "claude-icon" },
  sarvam: { label: "Sarvam AI", symbol: "S", icon: "sarvam-icon" }
};

questionInput.addEventListener("input", () => {
  charCount.textContent = `${questionInput.value.length} / 4000`;
});

providerInputs.forEach(input => {
  input.addEventListener("change", updateSelectAllLabel);
});

selectAllButton.addEventListener("click", () => {
  const allChecked = providerInputs.every(input => input.checked);
  providerInputs.forEach(input => { input.checked = !allChecked; });
  updateSelectAllLabel();
});

function updateSelectAllLabel() {
  selectAllButton.textContent = providerInputs.every(input => input.checked)
    ? "Deselect all"
    : "Select all";
}

function showError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

function clearError() {
  formError.textContent = "";
  formError.hidden = true;
}

function setLoading(loading) {
  loadingOverlay.hidden = !loading;
  analyzeButton.disabled = loading;
  analyzeButton.querySelector(".button-label").textContent =
    loading ? "Analyzing…" : "Analyze responses";
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    for (const provider of data.providers || []) {
      const element = document.querySelector(`#status-${provider.id}`);
      if (!element) continue;
      element.textContent = provider.configured
        ? `Ready · ${provider.model}`
        : "API key not configured";
      element.classList.toggle("ready", provider.configured);
      element.classList.toggle("missing", !provider.configured);
    }
  } catch {
    for (const input of providerInputs) {
      const element = document.querySelector(`#status-${input.value}`);
      if (element) element.textContent = "Server unavailable";
    }
  }
}

analyzeButton.addEventListener("click", async () => {
  clearError();
  const question = questionInput.value.trim();
  const providers = providerInputs.filter(input => input.checked).map(input => input.value);

  if (!question) {
    showError("Enter a question to analyze.");
    questionInput.focus();
    return;
  }
  if (!providers.length) {
    showError("Select at least one AI provider.");
    return;
  }

  setLoading(true);
  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, providers })
    });
    const data = await response.json();

    if (!response.ok && !data.responses) {
      throw new Error(data.error || "The request failed.");
    }
    renderResults(data, providers.length);
    resultsSection.hidden = false;
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    if (!response.ok && data.error) showError(data.error);
  } catch (error) {
    showError(error.message || "Could not reach the server. Make sure npm start is running.");
  } finally {
    setLoading(false);
  }
});

function renderResults(data, selectedCount) {
  const analysis = data.analysis || {};
  const responses = data.responses || [];
  const successCount = responses.filter(item => item.status === "success").length;

  document.querySelector("#result-count").textContent =
    `${successCount} successful response${successCount === 1 ? "" : "s"}`;
  document.querySelector("#result-summary").textContent =
    data.summary || data.error || "Responses received.";
  document.querySelector("#overlap-score").textContent =
    Number.isFinite(analysis.averageTextOverlap) ? analysis.averageTextOverlap : "—";
  document.querySelector("#overlap-bar").style.width =
    `${Math.max(0, Math.min(100, analysis.averageTextOverlap || 0))}%`;
  document.querySelector("#shared-count").textContent =
    (analysis.sharedTerms || []).length;
  document.querySelector("#success-count").textContent = successCount;
  document.querySelector("#selected-total").textContent = `/ ${selectedCount}`;
  document.querySelector("#overlap-label").textContent =
    analysis.agreementLabel || "Overlap estimate";
  document.querySelector("#analysis-note").textContent =
    analysis.note || "The analysis is a lightweight text comparison, not a fact-check.";

  renderSharedTerms(analysis.sharedTerms || []);
  renderUniqueTerms(analysis.uniqueTerms || []);
  renderPairs(analysis.pairComparisons || []);
  renderResponses(responses);
}

function renderSharedTerms(terms) {
  const root = document.querySelector("#shared-terms");
  root.replaceChildren();
  if (!terms.length) {
    root.textContent = "No shared terms found.";
    root.className = "term-list muted";
    return;
  }
  root.className = "term-list";
  terms.forEach(item => {
    const chip = document.createElement("span");
    chip.className = "term-chip";
    chip.append(document.createTextNode(item.term));
    const count = document.createElement("small");
    count.textContent = `${item.count}×`;
    chip.append(count);
    root.append(chip);
  });
}

function renderUniqueTerms(items) {
  const root = document.querySelector("#unique-terms");
  root.replaceChildren();
  if (!items.length) {
    root.textContent = "No provider-specific terms available.";
    return;
  }
  items.forEach(item => {
    const card = document.createElement("div");
    card.className = "unique-item";
    const title = document.createElement("strong");
    title.textContent = item.provider;
    card.append(title);
    if (!item.terms?.length) {
      const empty = document.createElement("span");
      empty.className = "muted";
      empty.textContent = "No unique terms detected";
      card.append(empty);
    } else {
      item.terms.forEach(term => {
        const chip = document.createElement("span");
        chip.className = "term-chip";
        chip.textContent = term;
        card.append(chip);
      });
    }
    root.append(card);
  });
}

function renderPairs(pairs) {
  const root = document.querySelector("#pair-comparisons");
  root.replaceChildren();
  if (!pairs.length) {
    root.textContent = "Pairwise comparison requires at least two successful responses.";
    root.className = "muted";
    return;
  }
  root.className = "pair-list";
  pairs.forEach(pair => {
    const row = document.createElement("div");
    row.className = "pair-row";
    const names = document.createElement("span");
    names.textContent = `${pair.first} ↔ ${pair.second}`;
    const score = document.createElement("strong");
    score.textContent = `${pair.score}%`;
    const track = document.createElement("div");
    track.className = "pair-track";
    const fill = document.createElement("span");
    fill.style.width = `${Math.max(0, Math.min(100, pair.score))}%`;
    track.append(fill);
    row.append(names, score, track);
    root.append(row);
  });
}

function renderResponses(responses) {
  const root = document.querySelector("#response-grid");
  root.replaceChildren();

  responses.forEach(response => {
    const meta = providerMeta[response.provider] || {
      label: response.name || "Provider",
      symbol: "?",
      icon: ""
    };
    const card = document.createElement("article");
    card.className = "response-card";

    const header = document.createElement("div");
    header.className = "response-card-head";
    const provider = document.createElement("div");
    provider.className = "response-provider";
    const icon = document.createElement("span");
    icon.className = `provider-icon ${meta.icon}`;
    icon.textContent = meta.symbol;
    const labels = document.createElement("div");
    const name = document.createElement("span");
    name.textContent = response.name || meta.label;
    const model = document.createElement("small");
    model.className = "response-model";
    model.textContent = response.model || "";
    labels.append(name, model);
    provider.append(icon, labels);

    const status = document.createElement("span");
    status.className = `response-status${response.status === "error" ? " failed" : ""}`;
    status.textContent = response.status === "success" ? "SUCCESS" : "FAILED";
    header.append(provider, status);

    const body = document.createElement("div");
    body.className = `response-body${response.status === "error" ? " error-body" : ""}`;
    body.textContent = response.status === "success"
      ? response.text
      : (response.error || "Provider request failed.");

    card.append(header, body);
    root.append(card);
  });
}

checkHealth();
