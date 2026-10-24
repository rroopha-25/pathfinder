// Claude API calls. Uses the person's own API key (stored only in this browser).
const DEFAULT_MODEL = 'claude-sonnet-5-5';

// JSON shapes Claude must return. Sent as structured output, so the reply is always valid JSON.
const RESUME_SCHEMA = {
  type: 'object',
  properties: {
    fit_summary: { type: 'string' },
    edits: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          section: { type: 'string' },
          original: { type: 'string' },
          revised: { type: 'string' },
          why: { type: 'string' },
          keywords_added: { type: 'array', items: { type: 'string' } },
          needs_input: { type: 'string' },
        },
        required: ['section', 'original', 'revised', 'why', 'keywords_added', 'needs_input'],
        additionalProperties: false,
      },
    },
    summary_line: {
      type: 'object',
      properties: { original: { type: 'string' }, revised: { type: 'string' } },
      required: ['original', 'revised'],
      additionalProperties: false,
    },
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: { keyword: { type: 'string' }, advice: { type: 'string' } },
        required: ['keyword', 'advice'],
        additionalProperties: false,
      },
    },
  },
  required: ['fit_summary', 'edits', 'summary_line', 'gaps'],
  additionalProperties: false,
};

const OUTREACH_SCHEMA = {
  type: 'object',
  properties: {
    connection_note: { type: 'string' },
    message: { type: 'string' },
    question: { type: 'string' },
  },
  required: ['connection_note', 'message', 'question'],
  additionalProperties: false,
};

async function postMessages(apiKey, body) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function callClaude({ apiKey, model, system, user, schema, maxTokens = 8000 }) {
  const body = {
    model: model || DEFAULT_MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  };
  if (schema) body.output_config = { format: { type: 'json_schema', schema } };

  let { res, data } = await postMessages(apiKey, body);
  // A custom model in Settings may not support structured output; retry once without it.
  if (!res.ok && schema && res.status === 400 && /output_config|format|schema/i.test(data.error?.message || '')) {
    delete body.output_config;
    ({ res, data } = await postMessages(apiKey, body));
  }
  if (!res.ok) {
    const msg = data.error && data.error.message ? data.error.message : `HTTP ${res.status}`;
    if (res.status === 401) throw new Error('Your API key was rejected. Check it in Settings.');
    if (res.status === 404) throw new Error(`Model not found: "${body.model}". Clear the Model field in Settings to use the default.`);
    if (res.status === 429) throw new Error('Too many requests right now. Wait a minute and try again.');
    if (res.status === 529 || res.status >= 500) throw new Error('Claude is busy right now. Try again in a moment.');
    if (/credit|billing|balance/i.test(msg)) throw new Error('Your API account is out of credits. Add credits at console.anthropic.com → Billing.');
    throw new Error(msg);
  }
  const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  if (!text.trim()) {
    if (data.stop_reason === 'max_tokens') throw new Error('The AI ran out of room before answering. Try again.');
    if (data.stop_reason === 'refusal') throw new Error('The AI declined this request. Try again or edit the job text.');
    throw new Error(`The AI returned an empty answer (${data.stop_reason || 'unknown reason'}). Try again.`);
  }
  return { text, usage: data.usage || {}, stopReason: data.stop_reason };
}

// Free AI through the Pathfinder server (no key needed), used when the user has no key of their own.
async function callPathfinderAI({ url, kind, user, installId }) {
  let res;
  try {
    res = await fetch(url.replace(/\/+$/, '') + '/v1/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, user, installId }),
    });
  } catch (e) {
    throw new Error('Could not reach the Pathfinder AI service. Check your internet connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Pathfinder AI error (${res.status}). Try again in a moment.`);
  return { text: data.text, usage: data.usage || {}, remaining: data.remaining, free: true };
}

// One entry point: the user's own key if set (unlimited), otherwise the free Pathfinder service.
async function aiRequest({ kind, settings, installId, proxyUrl, system, user, schema, maxTokens }) {
  if (settings.apiKey) return callClaude({ apiKey: settings.apiKey, model: settings.model, system, user, schema, maxTokens });
  if (proxyUrl) return callPathfinderAI({ url: proxyUrl, kind, user, installId });
  throw new Error('NO_AI');
}
const aiAvailable = (settings, proxyUrl) => !!(settings.apiKey || proxyUrl);

function parseJsonLoose(text) {
  const clean = (text || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try { return JSON.parse(clean); } catch (e) { /* fall through to slicing */ }
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('The AI response was not in the expected format. Try again.');
  try { return JSON.parse(clean.slice(start, end + 1)); } catch (e) {
    throw new Error('The AI response was cut off or malformed. Try again.');
  }
}

const squash = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// Check each suggested "original" line really exists in the resume, so nothing invented slips through.
function verifyEdits(result, resume) {
  const r = squash(resume);
  result.edits = (result.edits || []).filter((e) => e && e.revised).map((e) => ({ ...e, found: !!e.original && r.includes(squash(e.original)) }));
  result.gaps = result.gaps || [];
  if (result.summary_line && result.summary_line.original) {
    result.summary_line.found = r.includes(squash(result.summary_line.original));
  }
  return result;
}

if (typeof module !== 'undefined') module.exports = { parseJsonLoose, verifyEdits, callClaude, callPathfinderAI, aiRequest, aiAvailable, RESUME_SCHEMA, OUTREACH_SCHEMA };
