// H-1B employer history from the official USCIS H-1B Employer Data Hub export.
// Import runs in the browser; data is sharded in chrome.storage.local so a lookup
// only loads one small shard.

const H1B_SUFFIXES = /\b(incorporated|inc|llc|l l c|corp|corporation|co|company|ltd|limited|lp|llp|plc|pllc|pc|gmbh|na|the|dba)\b/g;

function normalizeCompany(name) {
  return (name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(H1B_SUFFIXES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// USCIS has shipped both UTF-8 CSV and UTF-16 tab-separated files over the years.
function decodeFile(buffer) {
  const b = new Uint8Array(buffer);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(buffer);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(buffer);
  let zeros = 0;
  for (let i = 1; i < Math.min(b.length, 400); i += 2) if (b[i] === 0) zeros++;
  if (zeros > 100) return new TextDecoder('utf-16le').decode(buffer);
  return new TextDecoder('utf-8').decode(buffer).replace(/^﻿/, '');
}

function parseDelimited(text) {
  const firstLine = text.slice(0, text.indexOf('\n') > 0 ? text.indexOf('\n') : text.length);
  const delim = (firstLine.split('\t').length > firstLine.split(',').length) ? '\t' : ',';
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = (rows.shift() || []).map((h) => h.trim());
  return { header, rows: rows.filter((r) => r.length > 1) };
}

const toInt = (v) => parseInt(String(v || '').replace(/[^0-9-]/g, ''), 10) || 0;

// Returns { employers: { norm: {n, y: {year: [newApprovals, totalApprovals, denials]}} }, years: [] }
function aggregateH1B({ header, rows }) {
  const idx = (re) => header.findIndex((h) => re.test(h));
  const yearCol = idx(/fiscal\s*year/i);
  const nameCol = idx(/employer/i);
  if (yearCol < 0 || nameCol < 0) {
    throw new Error('This file does not look like the USCIS H-1B Employer Data Hub export (missing "Fiscal Year" or "Employer" column).');
  }
  const approvalCols = header.map((h, i) => (/approv/i.test(h) ? i : -1)).filter((i) => i >= 0);
  const denialCols = header.map((h, i) => (/denial/i.test(h) ? i : -1)).filter((i) => i >= 0);
  const newCols = header
    .map((h, i) => (/(initial|new employment|change of employer).*approv/i.test(h) ? i : -1))
    .filter((i) => i >= 0);

  const employers = {};
  const years = new Set();
  for (const r of rows) {
    const rawName = (r[nameCol] || '').trim();
    const norm = normalizeCompany(rawName);
    const year = toInt(r[yearCol]);
    if (!norm || !year) continue;
    years.add(year);
    const e = (employers[norm] = employers[norm] || { n: rawName, y: {} });
    const y = (e.y[year] = e.y[year] || [0, 0, 0]);
    y[0] += newCols.reduce((s, i) => s + toInt(r[i]), 0);
    y[1] += approvalCols.reduce((s, i) => s + toInt(r[i]), 0);
    y[2] += denialCols.reduce((s, i) => s + toInt(r[i]), 0);
  }
  return { employers, years: Array.from(years).sort() };
}

const shardKey = (norm) => 'h1b:' + (norm + '__').slice(0, 2);

async function saveH1B(agg) {
  const byShard = {};
  for (const [norm, e] of Object.entries(agg.employers)) {
    (byShard[shardKey(norm)] = byShard[shardKey(norm)] || {})[norm] = e;
  }
  const existing = await chrome.storage.local.get(Object.keys(byShard));
  const toSet = {};
  for (const [k, shard] of Object.entries(byShard)) {
    const merged = existing[k] || {};
    for (const [norm, e] of Object.entries(shard)) {
      if (!merged[norm]) merged[norm] = e;
      else Object.assign(merged[norm].y, e.y); // newer import of a year replaces it
    }
    toSet[k] = merged;
  }
  const { h1bMeta = { years: [] } } = await chrome.storage.local.get('h1bMeta');
  toSet.h1bMeta = {
    years: Array.from(new Set([...h1bMeta.years, ...agg.years])).sort(),
    importedAt: Date.now(),
  };
  await chrome.storage.local.set(toSet);
  return toSet.h1bMeta;
}

async function lookupH1B(companyName) {
  const { h1bMeta } = await chrome.storage.local.get('h1bMeta');
  if (!h1bMeta || !h1bMeta.years.length) return { status: 'no_data' };
  const norm = normalizeCompany(companyName);
  if (!norm) return { status: 'none', years: h1bMeta.years };
  const key = shardKey(norm);
  const shard = (await chrome.storage.local.get(key))[key] || {};

  let match = shard[norm] ? { norm, e: shard[norm], exact: true } : null;
  if (!match) {
    // "Google" vs "google cloud", or LinkedIn's "Acme Health" vs "acme".
    const candidates = Object.entries(shard)
      .filter(([k]) => k.startsWith(norm + ' ') || norm.startsWith(k + ' '))
      .map(([k, e]) => ({ norm: k, e, exact: false, total: Object.values(e.y).reduce((s, y) => s + y[1], 0) }))
      .sort((a, b) => b.total - a.total);
    match = candidates[0] || null;
  }
  if (!match) return { status: 'none', years: h1bMeta.years };
  return summarizeH1B(match.e, match.exact, h1bMeta.years);
}

function summarizeH1B(e, exact, dataYears) {
  const years = Object.keys(e.y).map(Number).sort((a, b) => b - a);
  const rows = years.map((yr) => ({ year: yr, newApprovals: e.y[yr][0], approvals: e.y[yr][1], denials: e.y[yr][2] }));
  const latestDataYear = Math.max(...dataYears);
  const recent = rows.filter((r) => r.year >= latestDataYear - 1);
  const recentApprovals = recent.reduce((s, r) => s + r.approvals, 0);
  const totalApprovals = rows.reduce((s, r) => s + r.approvals, 0);
  const totalDenials = rows.reduce((s, r) => s + r.denials, 0);
  return {
    status: recentApprovals > 0 ? 'active' : totalApprovals > 0 ? 'past' : 'none',
    employerName: e.n,
    exact,
    rows,
    recentApprovals,
    totalApprovals,
    approvalRate: totalApprovals + totalDenials ? Math.round((100 * totalApprovals) / (totalApprovals + totalDenials)) : null,
    latestDataYear,
  };
}

function h1bLinks(company) {
  const q = encodeURIComponent(company);
  return [
    { label: 'H1BGrader', url: `https://www.google.com/search?q=${q}+site%3Ah1bgrader.com` },
    { label: 'MyVisaJobs', url: `https://www.google.com/search?q=${q}+site%3Amyvisajobs.com` },
  ];
}

if (typeof module !== 'undefined') {
  module.exports = { normalizeCompany, decodeFile, parseDelimited, aggregateH1B, summarizeH1B, h1bLinks };
}
