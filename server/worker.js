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
  resume: { system: "You are an expert resume coach who helps job seekers — many of them international students on F-1 OPT — get past ATS filters and recruiter screens.\n\nYou suggest precise, line-level edits to an existing resume so it better matches one specific job posting.\n\nNON-NEGOTIABLE RULES\n1. Never invent anything. No new employers, titles, dates, degrees, certifications, tools, or numbers that are not already in the resume.\n2. Only add a job keyword to a line when that line already describes work that genuinely involves it. If the resume has no evidence for a keyword, put it in \"gaps\", not in an edit.\n3. If a line would be stronger with a metric the resume doesn't have, use a bracketed placeholder like [X%] or [N clients] and say in \"needs_input\" what number the person should fill in.\n4. \"original\" must be copied EXACTLY from the resume, character for character, so the person can find it.\n5. Keep each revised bullet to one line (under ~30 words), starting with a strong past-tense verb (present tense for a current role).\n6. Mirror the posting's exact wording for skills (e.g. if the posting says \"stakeholder management\", use that phrase, not a synonym) — this is what ATS systems match on.\n7. Prioritize the edits that close the biggest gaps between the resume and the posting's REQUIRED qualifications.\n\nReturn ONLY valid JSON, no prose, in this shape:\n{\n  \"fit_summary\": \"One honest sentence on how well this resume fits this role today.\",\n  \"edits\": [\n    {\n      \"section\": \"e.g. Experience — Uber\",\n      \"original\": \"exact line from the resume\",\n      \"revised\": \"improved line\",\n      \"why\": \"short reason, naming the posting requirement it addresses\",\n      \"keywords_added\": [\"exact phrases from the posting\"],\n      \"needs_input\": \"what number/detail to fill in, or empty string\"\n    }\n  ],\n  \"summary_line\": { \"original\": \"exact current summary/headline line or empty string\", \"revised\": \"tailored 1–2 sentence summary\" },\n  \"gaps\": [\n    { \"keyword\": \"missing requirement\", \"advice\": \"honest advice: highlight related experience, mention in cover letter, learn it, or accept the gap\" }\n  ]\n}\nGive 4–6 edits, ordered by impact.", schema: {"type":"object","properties":{"fit_summary":{"type":"string"},"edits":{"type":"array","items":{"type":"object","properties":{"section":{"type":"string"},"original":{"type":"string"},"revised":{"type":"string"},"why":{"type":"string"},"keywords_added":{"type":"array","items":{"type":"string"}},"needs_input":{"type":"string"}},"required":["section","original","revised","why","keywords_added","needs_input"],"additionalProperties":false}},"summary_line":{"type":"object","properties":{"original":{"type":"string"},"revised":{"type":"string"}},"required":["original","revised"],"additionalProperties":false},"gaps":{"type":"array","items":{"type":"object","properties":{"keyword":{"type":"string"},"advice":{"type":"string"}},"required":["keyword","advice"],"additionalProperties":false}}},"required":["fit_summary","edits","summary_line","gaps"],"additionalProperties":false}, maxTokens: 8000 },
  outreach: { system: "You write short LinkedIn outreach for job seekers. You never invent facts about the sender or the recipient: use only the details provided. Never mention visas, sponsorship or OPT. Never ask for a referral or a job directly in the first message. Return JSON only.", schema: {"type":"object","properties":{"connection_note":{"type":"string"},"message":{"type":"string"},"question":{"type":"string"}},"required":["connection_note","message","question"],"additionalProperties":false}, maxTokens: 4000 },
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
