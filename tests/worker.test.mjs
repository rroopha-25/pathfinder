import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs'), path = require('path'), os = require('os');
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pfw-')), 'worker.mjs');
fs.copyFileSync(new URL('../server/worker.js', import.meta.url), tmp);
const { default: worker } = await import(tmp);
const { aiRequest } = require('../pathfinder/ai.js');
let n = 0; const ok = (m) => { n++; console.log('✓', m); };

const kvStore = new Map();
const env = { ANTHROPIC_API_KEY: 'sk-test', PER_USER_DAILY: '2', GLOBAL_DAILY: '3',
  LIMITS: { get: async (k) => kvStore.get(k) ?? null, put: async (k, v) => kvStore.set(k, v) } };
const sent = [];
globalThis.fetch = async (url, opts) => { sent.push({ url, body: JSON.parse(opts.body), headers: opts.headers });
  return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: '{"connection_note":"Hi","message":"Hi","question":"Q?"}' }], usage: { input_tokens: 10 } }) }; };
const EXT = 'chrome-extension://abmjmkgdmifpioikgdlegdkgklohbfoh';
const req = (body, origin = EXT, method = 'POST') => new Request('https://x.workers.dev/v1/ai', { method, headers: { 'content-type': 'application/json', Origin: origin }, body: method === 'POST' ? JSON.stringify(body) : undefined });
const ID = '0123456789abcdef0123456789abcdef';

let r = await worker.fetch(req({ kind: 'outreach', user: 'hello', installId: ID }), env);
let j = await r.json();
assert.strictEqual(r.status, 200); assert.strictEqual(j.remaining, 1);
assert.strictEqual(r.headers.get('Access-Control-Allow-Origin'), EXT);
const s0 = sent[0];
assert.strictEqual(s0.headers['x-api-key'], 'sk-test'); assert.strictEqual(s0.body.model, 'claude-sonnet-5-5');
assert.ok(/LinkedIn outreach/.test(s0.body.system)); assert.ok(s0.body.output_config.format.schema.required.includes('connection_note'));
ok('Valid request: forwards with server key, fixed model, server-side prompt + schema; CORS for the extension');

r = await worker.fetch(req({ kind: 'outreach', user: 'hello', installId: ID }), env); assert.strictEqual((await r.json()).remaining, 0);
r = await worker.fetch(req({ kind: 'outreach', user: 'hello', installId: ID }), env); j = await r.json();
assert.strictEqual(r.status, 429); assert.strictEqual(j.error, 'daily_limit'); assert.ok(/own Claude key/.test(j.message));
ok('Per-user daily limit enforced with a clear message');

r = await worker.fetch(req({ kind: 'resume', user: 'x', installId: 'ffffffffffffffffffffffffffffffff' }), env);
j = await r.json(); assert.strictEqual(j.error, 'busy');
ok('Global daily cap stops all free usage');

const before = sent.length;
for (const [b, o, code] of [[{ kind: 'resume', user: 'x', installId: ID }, 'https://evil.com', 403], [{ kind: 'chat', user: 'x', installId: ID }, EXT, 400], [{ kind: 'resume', user: 'x', installId: 'nope' }, EXT, 400], [{ kind: 'resume', user: 'y'.repeat(30000), installId: ID }, EXT, 413]]) {
  r = await worker.fetch(req(b, o), env); assert.strictEqual(r.status, code, JSON.stringify(b).slice(0, 40));
}
assert.strictEqual(sent.length, before);
ok('Rejects websites, unknown request types, bad IDs and oversized input, without calling Claude');

r = await worker.fetch(req(null, EXT, 'OPTIONS'), env); assert.strictEqual(r.status, 204);
ok('CORS preflight answered');

// Extension side: no key → uses the free service; own key → goes direct
const calls = [];
globalThis.fetch = async (url, opts) => { calls.push(url); return { ok: true, status: 200, json: async () => ({ text: '{}', usage: {}, remaining: 4 }), }; };
const out = await aiRequest({ kind: 'resume', settings: {}, installId: ID, proxyUrl: 'https://pf.workers.dev/', system: 's', user: 'u', schema: {} });
assert.strictEqual(calls[0], 'https://pf.workers.dev/v1/ai'); assert.strictEqual(out.remaining, 4); assert.ok(out.free);
globalThis.fetch = async (url) => { calls.push(url); return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: '{}' }], usage: {} }) }; };
await aiRequest({ kind: 'resume', settings: { apiKey: 'sk-own' }, installId: ID, proxyUrl: 'https://pf.workers.dev', system: 's', user: 'u', schema: {} });
assert.strictEqual(calls.at(-1), 'https://api.anthropic.com/v1/messages');
await assert.rejects(aiRequest({ kind: 'resume', settings: {}, installId: ID, proxyUrl: '', system: 's', user: 'u', schema: {} }), /NO_AI/);
ok('Extension: no key → free service; own key → direct to Claude; neither → asks for a key');
console.log(`\n${n} server tests passed`);
