// Pathfinder AI proxy — a Cloudflare Worker.
// Holds the Claude API key so users don't need their own.
// Only accepts Pathfinder's two request types, with per-user and global daily limits.
//
// Setup (Cloudflare dashboard, no command line needed): see server/DEPLOY.md
//   Secret:   ANTHROPIC_API_KEY
//   KV:       LIMITS   (bind a KV namespace with this exact name)
//   Vars (optional): PER_USER_DAILY (default 5), GLOBAL_DAILY (default 300)

const MODEL = 'claude-sonnet-5-5';
const MAX_USER_CHARS = 25000;

const KINDS = {
  resume: { system: __RESUME_SYSTEM__, schema: __RESUME_SCHEMA__, maxTokens: 8000 },
  outreach: { system: __OUTREACH_SYSTEM__, schema: __OUTREACH_SCHEMA__, maxTokens: 4000 },
};

const cors = (origin) => ({
  'Access-Control-Allow-Origin': origin && origin.startsWith('chrome-extension://') ? origin : 'null',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Max-Age': '86400',
});
const json = (body, status, origin, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors(origin), ...extra } });

async function bump(kv, key, limit) {
  const n = parseInt((await kv.get(key)) || '0', 10);
  if (n >= limit) return { ok: false, n };
  await kv.put(key, String(n + 1), { expirationTtl: 60 * 60 * 26 });
  return { ok: true, n: n + 1 };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin);
    if (!origin.startsWith('chrome-extension://')) return json({ error: 'forbidden' }, 403, origin);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400, origin); }
    const kind = KINDS[body.kind];
    const user = typeof body.user === 'string' ? body.user : '';
    const installId = typeof body.installId === 'string' && /^[a-f0-9-]{20,40}$/.test(body.installId) ? body.installId : '';
    if (!kind || !user || !installId) return json({ error: 'bad_request' }, 400, origin);
    if (user.length > MAX_USER_CHARS) return json({ error: 'too_long', message: 'That job or resume is too long for the free AI. Add your own key in Settings.' }, 413, origin);

    const day = new Date().toISOString().slice(0, 10);
    const perUser = parseInt(env.PER_USER_DAILY || '5', 10);
    const globalCap = parseInt(env.GLOBAL_DAILY || '300', 10);
    const g = await bump(env.LIMITS, `g:${day}`, globalCap);
    if (!g.ok) return json({ error: 'busy', message: 'Free AI is at capacity for today. Try tomorrow, or add your own Claude key in Settings.' }, 429, origin);
    const u = await bump(env.LIMITS, `u:${installId}:${day}`, perUser);
    if (!u.ok) return json({ error: 'daily_limit', message: `You've used today's ${perUser} free AI runs. They reset tomorrow, or add your own Claude key in Settings for unlimited use.`, remaining: 0 }, 429, origin);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: kind.maxTokens,
        system: kind.system,
        messages: [{ role: 'user', content: user }],
        output_config: { format: { type: 'json_schema', schema: kind.schema } },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const status = res.status === 429 || res.status >= 500 ? 503 : 502;
      return json({ error: 'upstream', message: 'Claude is busy right now. Try again in a moment.' }, status, origin);
    }
    const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
    if (!text.trim()) return json({ error: 'empty', message: 'The AI returned an empty answer. Try again.' }, 502, origin);
    return json({ text, usage: data.usage || {}, remaining: Math.max(0, perUser - u.n) }, 200, origin);
  },
};
