const $ = (id) => document.getElementById(id);
const PEOPLE_URL_RE = /^https:\/\/www\.linkedin\.com\/(company\/[^/]+\/people|search\/results\/(people|content|all))/;
const ALL_SITES = { origins: ['https://*/*', 'http://*/*'] };

const state = {
  job: null,          // current job (kept while you browse other pages, e.g. LinkedIn searches)
  verdict: null,
  h1b: null,
  score: null,
  resume: null,       // { text, name }
  settings: {},       // school, country, pastEmployers, apiKey, model, peopleLocation, locationStrict
  lastDebug: null,
  lastKey: '',
  aiByJob: {},
  installId: '',
  drafts: {},
};

// ============================================================
//  Storage, metrics, small UI helpers
// ============================================================
const PROXY_URL = typeof PATHFINDER_AI_URL === 'string' ? PATHFINDER_AI_URL : '';
const freeNote = (r) => (r && r.free && typeof r.remaining === 'number' ? ` · ${r.remaining} free AI run${r.remaining === 1 ? '' : 's'} left today` : '');

const store = {
  get: async (k, d) => ((await chrome.storage.local.get(k))[k] ?? d),
  set: (k, v) => chrome.storage.local.set({ [k]: v }),
};

// Events are written one at a time; parallel writes would overwrite each other and lose metrics.
let logQueue = Promise.resolve();
function logEvent(name, props = {}) {
  logQueue = logQueue
    .then(async () => {
      const events = await store.get('events', []);
      events.push({ name, props, ts: Date.now() });
      await store.set('events', events.slice(-1000));
    })
    .catch((err) => console.error('logEvent', err));
  return logQueue;
}

async function saveJob(job, extra) {
  const jobs = await store.get('jobs', {});
  const isNew = !jobs[job.key];
  const { description, selection, debug, ...slim } = job; // don't store full descriptions for every job
  jobs[job.key] = { ...slim, ...extra, firstSeen: jobs[job.key]?.firstSeen || Date.now() };
  const trimmed = Object.fromEntries(Object.entries(jobs).sort((a, b) => b[1].firstSeen - a[1].firstSeen).slice(0, 100));
  await store.set('jobs', trimmed);
  return isNew;
}

async function renderStats() {
  const jobs = Object.values(await store.get('jobs', {}));
  const blocked = jobs.filter((j) => j.verdictLevel === 'stop').length;
  $('stats').textContent = `${jobs.length} job${jobs.length === 1 ? '' : 's'} checked · ${blocked} dead end${blocked === 1 ? '' : 's'} avoided`;
}

const KW_LABEL = { sql: 'SQL', crm: 'CRM', saas: 'SaaS', kpis: 'KPIs', etl: 'ETL', aws: 'AWS', gcp: 'GCP', seo: 'SEO', erp: 'ERP', lms: 'LMS', b2b: 'B2B', b2c: 'B2C', 'ci/cd': 'CI/CD', 'a/b testing': 'A/B testing', 'ux design': 'UX design', 'power bi': 'Power BI', 'node.js': 'Node.js', 'rest apis': 'REST APIs', graphql: 'GraphQL', javascript: 'JavaScript', typescript: 'TypeScript', edtech: 'EdTech', devops: 'DevOps', html: 'HTML', css: 'CSS', 'c++': 'C++', 'c#': 'C#', 'generative ai': 'Generative AI', 'artificial intelligence': 'AI' };
const kwLabel = (t) => KW_LABEL[t] || (t.length <= 4 && !/[aeiou]/.test(t.slice(1)) ? t.toUpperCase() : t.charAt(0).toUpperCase() + t.slice(1));
const svg = (name, cls = '') => `<svg class="ico ${cls}"><use href="#i-${name}"/></svg>`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = (name) => (name || '?').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
function avatarColor(name) {
  let h = 0;
  for (const c of name || '') h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 46%)`;
}
function setAvatar(el, name) {
  el.textContent = initials(name);
  el.style.background = avatarColor(name);
}
function chip(text, cls = '') {
  const s = document.createElement('span');
  s.className = 'chip ' + cls;
  s.textContent = text;
  return s;
}
async function copyText(btn, text) {
  await navigator.clipboard.writeText(text);
  if (!btn) return;
  const html = btn.innerHTML;
  btn.classList.add('copied');
  btn.innerHTML = svg('go') + 'Copied';
  setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = html; }, 1300);
}
let toastTimer;
function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    Object.assign(t.style, { position: 'fixed', left: '12px', right: '12px', bottom: '46px', padding: '10px 12px', borderRadius: '10px', background: 'var(--text)', color: 'var(--surface)', fontSize: '12.5px', boxShadow: 'var(--shadow-lg)', zIndex: 20 });
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.style.display = 'none'), 3500);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ============================================================
//  Tabs, states, banner
// ============================================================
function showTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  ['job', 'resume', 'people', 'settings'].forEach((t) => $('tab-' + t).classList.toggle('hidden', t !== name));
  if (name === 'settings') { renderMetricsSummary(); renderPermStatus(); }
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
document.querySelectorAll('.tile').forEach((t) => t.addEventListener('click', () => {
  if (t.dataset.go === 'job') $('verdict-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  else showTab(t.dataset.go);
}));

function showJobState(name) {
  ['empty', 'loading', 'job'].forEach((s) => $('state-' + s).classList.toggle('hidden', s !== name));
}

// kind: null | 'last-job' | 'no-access' | 'people-page'
function setBanner(kind, host) {
  const b = $('page-banner');
  $('banner-allow').classList.toggle('hidden', kind !== 'no-access');
  $('banner-select').classList.toggle('hidden', kind !== 'last-job');
  if (!kind || (kind === 'last-job' && !state.job)) { b.classList.add('hidden'); return; }
  const text = {
    'last-job': 'Showing your last job. On a job page Pathfinder missed? Highlight the description, then:',
    'no-access': `Pathfinder isn't allowed to read ${host || 'this site'} yet. Allow it once and it works on every company career page.`,
    'people-page': `Reading people on this LinkedIn page for ${state.job ? state.job.company : 'your job'}. See the People tab.`,
  }[kind];
  $('page-banner-text').textContent = text;
  b.classList.remove('hidden');
}

// ============================================================
//  JOB TAB
// ============================================================
const LEVEL_ICON = { go: 'go', caution: 'caution', stop: 'stop', unknown: 'unknown' };
const LEVEL_TILE = { go: 'Likely yes', caution: 'Ask first', stop: 'Skip', unknown: 'Check' };

async function renderJob(job) {
  state.job = job;
  showJobState('job');
  $('job-title').textContent = job.title || 'Untitled role';
  $('job-company').textContent = job.company || 'Unknown company';
  $('job-location').textContent = job.location || '';
  $('job-location-wrap').classList.toggle('hidden', !job.location);
  setAvatar($('co-avatar'), job.company || job.title);
  $('job-source').textContent = job.manual ? 'From highlighted text' : `Read from ${job.site}`;
  const badge = $('site-badge');
  badge.textContent = job.site;
  badge.classList.remove('hidden');

  const scan = scanSponsorship(job.description);
  const h1b = job.company ? await lookupH1B(job.company) : { status: 'no_data' };
  const v = sponsorshipVerdict(scan, h1b, job.company || 'This company');
  state.verdict = v;
  state.h1b = h1b;

  $('verdict-card').className = 'card verdict ' + v.level;
  $('verdict-ico-use').setAttribute('href', '#i-' + LEVEL_ICON[v.level]);
  $('verdict-headline').textContent = v.headline;
  $('verdict-explain').textContent = v.explanation;
  $('verdict-history').textContent = v.history;
  $('verdict-history').classList.toggle('hidden', !v.history);
  $('verdict-action').textContent = v.action;
  $('verdict-action').classList.toggle('hidden', !v.action);
  $('copy-ask').classList.toggle('hidden', !v.askRecruiter);

  const ul = $('sponsor-matches');
  ul.innerHTML = '';
  for (const m of scan.matches.slice(0, 4)) {
    const li = document.createElement('li');
    li.innerHTML = `<b>${esc(m.label)}</b><q>${esc(m.snippet)}</q>`;
    ul.appendChild(li);
  }
  $('jd-evidence').classList.toggle('hidden', !scan.matches.length);

  const tile = $('tile-sponsor');
  tile.className = 'tile ' + v.level;
  tile.querySelector('.tile-value').textContent = LEVEL_TILE[v.level];

  renderH1B(h1b, job.company);
  renderResumeTab();
  renderPeopleTab();
  return { scan, h1b, v };
}

function renderH1B(h1b, company) {
  const links = $('h1b-links');
  links.innerHTML = '';
  if (company) {
    for (const l of h1bLinks(company)) {
      const a = document.createElement('a');
      a.href = l.url; a.target = '_blank';
      a.innerHTML = esc(l.label) + svg('external');
      a.addEventListener('click', () => logEvent('h1b_link_clicked', { site: l.label }));
      links.appendChild(a);
    }
  }
  const body = $('h1b-body');
  if (h1b.status === 'no_data') {
    body.innerHTML = `<div class="setup-box"><span>Load the free USCIS data once to see if this company actually sponsors.</span><button class="btn btn-sm" id="h1b-setup">Set up</button></div>`;
    $('h1b-setup').onclick = () => showTab('settings');
    return;
  }
  if (!h1b.rows) {
    body.innerHTML = `<p class="muted small">No filings found for "${esc(company)}". Big companies often file under a legal name (e.g. "Meta Platforms"). Try <b>Edit</b> above, or check the links.</p>`;
    return;
  }
  const latest = h1b.rows[0];
  const max = Math.max(...h1b.rows.slice(0, 5).map((r) => r.approvals), 1);
  body.innerHTML = `
    ${h1b.exact ? '' : `<div class="match-warn">Closest match: "${esc(h1b.employerName)}". Make sure it's the same company.</div>`}
    <div class="h1b-summary">
      <div class="stat"><b>${latest.newApprovals.toLocaleString()}</b><span>new hires FY${latest.year}</span></div>
      <div class="stat"><b>${latest.approvals.toLocaleString()}</b><span>total approvals</span></div>
      ${h1b.approvalRate !== null ? `<div class="stat"><b>${h1b.approvalRate}%</b><span>approval rate</span></div>` : ''}
    </div>
    <div class="bars">
      ${h1b.rows.slice(0, 5).map((r) => `
        <div class="bar-row" title="FY${r.year}: ${r.newApprovals} new, ${r.approvals} total approvals, ${r.denials} denials">
          <span class="bar-year">FY${String(r.year).slice(-2)}</span>
          <div class="bar"><i class="b-new" style="width:${(100 * r.newApprovals) / max}%"></i><i class="b-rest" style="width:${(100 * Math.max(0, r.approvals - r.newApprovals)) / max}%"></i></div>
          <span class="bar-val">${r.approvals.toLocaleString()}</span>
        </div>`).join('')}
    </div>
    <div class="legend"><span><i class="b-new"></i>New hires &amp; transfers</span><span><i class="b-rest"></i>Renewals &amp; other</span></div>`;
}

$('copy-ask').addEventListener('click', () => {
  if (!state.job) return;
  copyText($('copy-ask'), recruiterQuestion(state.job));
  logEvent('recruiter_question_copied', { key: state.job.key, level: state.verdict?.level });
});
$('copy-debug').addEventListener('click', () => {
  const version = (chrome.runtime.getManifest ? chrome.runtime.getManifest().version : '?');
  copyText($('copy-debug'), JSON.stringify({ version, ...(state.lastDebug || { note: 'No scan yet' }) }, null, 2));
});

// ---------- Edit title / company / location ----------
$('edit-job').addEventListener('click', () => openEdit());
function openEdit() {
  if (!state.job) return;
  $('edit-title').value = state.job.title || '';
  $('edit-company').value = state.job.company || '';
  $('edit-location').value = state.job.location || '';
  $('edit-form').classList.remove('hidden');
  (state.job.title ? $('edit-company') : $('edit-title')).focus();
}
$('edit-cancel').addEventListener('click', () => $('edit-form').classList.add('hidden'));
$('edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const patch = { title: $('edit-title').value.trim(), company: $('edit-company').value.trim(), location: $('edit-location').value.trim() };
  const overrides = await store.get('overrides', {});
  overrides[state.job.key] = patch;
  await store.set('overrides', overrides);
  $('edit-form').classList.add('hidden');
  const job = { ...state.job, ...patch };
  await store.set('activeJob', job);
  const { v, h1b } = await renderJob(job);
  await saveJob(job, { verdictLevel: v.level, h1bStatus: h1b.status });
  logEvent('job_edited', { site: job.site, changed: Object.keys(patch).filter((k) => patch[k] !== state.job[k]) });
});

// ============================================================
//  RESUME TAB
// ============================================================
function renderResumeTab() {
  const hasResume = !!(state.resume && state.resume.text);
  $('resume-empty').classList.toggle('hidden', hasResume);
  $('resume-nojob').classList.toggle('hidden', !hasResume || !!state.job);
  $('resume-body').classList.toggle('hidden', !hasResume || !state.job);
  const tile = $('tile-match');
  if (!hasResume || !state.job) {
    tile.className = 'tile dim';
    tile.querySelector('.tile-value').textContent = hasResume ? '—' : 'Add resume';
    return;
  }

  const s = scoreResume(state.resume.text, state.job.description, state.job.title);
  state.score = s;
  $('score-num').textContent = s.score;
  const ring = $('score-ring');
  ring.className = 'ring ' + s.label;
  ring.style.setProperty('--p', s.score);
  $('score-label').className = 'score-label ' + s.label;
  $('score-label').textContent = `${s.label} match`;
  const meter = (id, v, max) => { $(id).style.width = `${(100 * v) / max}%`; $(id + '-v').textContent = `${v}/${max}`; };
  meter('m-kw', s.breakdown.keywords, 70);
  meter('m-title', s.breakdown.title, 15);
  meter('m-impact', s.breakdown.impact, 15);
  $('score-resume-name').textContent = `Scored ${state.resume.name} · ${s.quantifiedLines} lines include numbers`;

  tile.className = 'tile ' + (s.label === 'Strong' ? 'go' : s.label === 'Fair' ? 'caution' : 'stop');
  tile.querySelector('.tile-value').textContent = `${s.score}/100`;

  const miss = $('kw-missing'), ok = $('kw-matched');
  miss.innerHTML = ''; ok.innerHTML = '';
  s.missing.forEach((m) => miss.appendChild(chip(kwLabel(m.term), 'miss' + (m.required ? ' req' : ''))));
  if (!s.missing.length) miss.appendChild(chip('Nothing major missing', 'ok'));
  s.matched.forEach((m) => ok.appendChild(chip(kwLabel(m), 'ok')));
  if (!s.matched.length) ok.appendChild(chip('None yet'));

  const cached = state.aiByJob[state.job.key];
  $('ai-results').innerHTML = '';
  if (cached) renderAI(cached);
  else $('ai-status').textContent = 'Line-by-line changes for this job, using only what\'s already on your resume.';

  if (state.lastScoredKey !== state.job.key) {
    state.lastScoredKey = state.job.key;
    logEvent('resume_scored', { key: state.job.key, site: state.job.site, score: s.score, missing: s.missing.length });
  }
}

$('ai-run').addEventListener('click', async () => {
  if (!state.job || !state.resume) return;
  if (!aiAvailable(state.settings, PROXY_URL)) {
    toast('Add your Claude API key in Settings first.');
    showTab('settings');
    $('set-apikey').focus();
    return;
  }
  const btn = $('ai-run');
  btn.disabled = true;
  $('ai-status').textContent = 'Writing suggestions… this takes 10–30 seconds.';
  $('ai-results').innerHTML = '<div class="skeleton" style="height:90px;margin-top:10px"></div><div class="skeleton" style="height:90px"></div>';
  const started = Date.now();
  try {
    const resp = await aiRequest({
      kind: 'resume', settings: state.settings, installId: state.installId, proxyUrl: PROXY_URL,
      system: RESUME_SYSTEM_PROMPT,
      user: buildResumeUserPrompt({ job: state.job, resume: state.resume.text, score: state.score }),
      schema: RESUME_SCHEMA,
    });
    const { text, usage } = resp;
    const result = verifyEdits(parseJsonLoose(text), state.resume.text);
    state.aiByJob[state.job.key] = result;
    renderAI(result);
    $('ai-status').textContent += freeNote(resp);
    logEvent('suggestions_generated', {
      key: state.job.key, edits: result.edits.length,
      unverified: result.edits.filter((e) => !e.found).length,
      inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, ms: Date.now() - started,
    });
  } catch (err) {
    $('ai-results').innerHTML = '';
    $('ai-status').textContent = 'Error: ' + err.message;
    logEvent('suggestions_error', { message: err.message });
  } finally {
    btn.disabled = false;
  }
});

function renderAI(r) {
  $('ai-status').textContent = 'Copy a line into your resume. Replace any [brackets] with real numbers.';
  const box = $('ai-results');
  box.innerHTML = '';
  if (r.fit_summary) {
    const p = document.createElement('div');
    p.className = 'fit';
    p.textContent = r.fit_summary;
    box.appendChild(p);
  }
  const edits = [...(r.edits || [])];
  if (r.summary_line && r.summary_line.revised) {
    edits.unshift({ section: 'Summary', original: r.summary_line.original, revised: r.summary_line.revised, why: 'Tailors your opening lines to this role.', keywords_added: [], found: r.summary_line.found !== false });
  }
  edits.forEach((e, i) => {
    const d = document.createElement('div');
    d.className = 'edit';
    d.innerHTML = `
      <div class="edit-sec">${esc(e.section || 'Edit ' + (i + 1))}</div>
      ${e.original ? `<div class="edit-from">${esc(e.original)}</div>` : ''}
      <div class="edit-to">${esc(e.revised)}</div>
      ${e.why ? `<div class="edit-why">${esc(e.why)}</div>` : ''}
      ${e.needs_input ? `<div class="edit-note">Fill in: ${esc(e.needs_input)}</div>` : ''}
      ${e.original && e.found === false ? `<div class="edit-note">Couldn't find this exact line in your resume. Double-check before using.</div>` : ''}
      <div class="edit-foot"><div class="chips"></div><button class="btn btn-sm">${svg('copy')}Copy new line</button></div>`;
    const chips = d.querySelector('.chips');
    (e.keywords_added || []).forEach((k) => chips.appendChild(chip('+ ' + k, 'ok')));
    const b = d.querySelector('button');
    b.onclick = () => {
      copyText(b, e.revised);
      logEvent('suggestion_copied', { key: state.job?.key, index: i, section: e.section }).then(renderStats);
    };
    box.appendChild(d);
  });
  if (r.gaps && r.gaps.length) {
    const h = document.createElement('h3');
    h.className = 'mt';
    h.textContent = 'Gaps wording can\'t fix';
    box.appendChild(h);
    const ul = document.createElement('ul');
    ul.className = 'gaps';
    r.gaps.forEach((g) => { const li = document.createElement('li'); li.innerHTML = `<b>${esc(g.keyword)}</b>: ${esc(g.advice)}`; ul.appendChild(li); });
    box.appendChild(ul);
  }
}

async function handleResumeFile(file, statusEl) {
  if (!file) return;
  statusEl.className = 'status';
  statusEl.textContent = 'Reading…';
  try {
    const text = await extractResumeText(file);
    if (text.length < 200) throw new Error('Found very little text. If this is a scanned PDF, export it as a text PDF or .docx.');
    state.resume = { text, name: file.name, updatedAt: Date.now() };
    await store.set('resume', state.resume);
    const words = text.split(/\s+/).length;
    for (const el of [statusEl, $('resume-status')]) { el.className = 'status ok'; el.textContent = `✓ ${file.name} (${words} words)`; }
    $('resume-drop-label').textContent = 'Replace resume';
    logEvent('resume_uploaded', { type: file.name.split('.').pop(), words });
    autofillProfile(text);
    state.lastScoredKey = '';
    renderResumeTab();
    match.cache = {};
    if (match.listing) showMatchCard(match.listing);
  } catch (err) {
    statusEl.className = 'status err';
    statusEl.textContent = err.message;
    logEvent('resume_upload_error', { message: err.message });
  }
}
// Fill empty "About you" fields from the resume. Never overwrites what the user typed.
async function autofillProfile(text) {
  const found = parseProfile(text);
  const filled = [];
  const set = (key, id, value) => {
    if (!value || (state.settings[key] || '').trim()) return;
    state.settings[key] = value;
    $(id).value = value;
    filled.push(key);
  };
  set('school', 'set-school', found.school);
  set('pastEmployers', 'set-employers', found.pastEmployers.join(', '));
  set('myBackground', 'set-mybg', found.background);
  if (!filled.length) return;
  await store.set('settings', state.settings);
  const names = { school: 'school', pastEmployers: 'past employers', myBackground: 'background' };
  toast(`Filled in your ${filled.map((k) => names[k]).join(', ')} from your resume. Check them in Settings.`);
  logEvent('profile_autofilled', { fields: filled });
  renderPeopleTab();
}

$('resume-file').addEventListener('change', (e) => handleResumeFile(e.target.files[0], $('resume-status')));
$('resume-file-quick').addEventListener('change', (e) => handleResumeFile(e.target.files[0], $('resume-quick-status')));

// ============================================================
//  PEOPLE TAB (location-aware)
// ============================================================
const peopleKey = (company) => 'people:' + normalizeCompany(company);
const locMatcher = () => buildLocationMatcher(state.settings.peopleLocation);

function searchUrl(kind) {
  const job = state.job;
  const enc = encodeURIComponent;
  const fn = titleTokens(job.title).slice(0, 2).join(' ');
  const m = locMatcher();
  const where = m && !m.remote ? ' ' + m.searchTerm : '';
  switch (kind) {
    case 'posts':
      return `https://www.linkedin.com/search/results/content/?keywords=${enc(`"${job.company}" hiring`)}&datePosted=%22past-month%22&sortBy=%22date_posted%22`;
    case 'recruiters':
      return `https://www.linkedin.com/search/results/people/?keywords=${enc(`${job.company} recruiter${where}`)}`;
    case 'team':
      return `https://www.linkedin.com/search/results/people/?keywords=${enc(`${job.company} ${fn}${where}`)}`;
    case 'alumni':
      if (!state.settings.school) return null;
      return job.companyUrl
        ? `${job.companyUrl}people/?keywords=${enc(state.settings.school)}`
        : `https://www.linkedin.com/search/results/people/?keywords=${enc(`${job.company} ${state.settings.school}${where}`)}`;
    case 'company':
      return job.companyUrl ? `${job.companyUrl}people/` : `https://www.linkedin.com/search/results/companies/?keywords=${enc(job.company)}`;
  }
  return null;
}

document.querySelectorAll('[data-search]').forEach((b) =>
  b.addEventListener('click', () => {
    if (!state.job) return;
    const kind = b.dataset.search;
    const url = searchUrl(kind);
    if (!url) {
      toast('Add your school in Settings first.');
      return;
    }
    chrome.tabs.create({ url });
    $('people-status').textContent = kind === 'company' && !state.job.companyUrl
      ? 'Opened a company search. Click the company, then "People". This list updates as you scroll.'
      : 'Opened in a new tab. Scroll the results and this list updates automatically.';
    logEvent('people_search_opened', { kind, company: state.job.company, location: state.settings.peopleLocation || 'anywhere' });
  })
);

// ---------- Location picker ----------
function renderLocationPicker() {
  const input = $('loc-input');
  if (document.activeElement !== input) input.value = state.settings.peopleLocation || '';
  $('loc-strict').checked = state.settings.locationStrict !== false;
  const m = locMatcher();
  $('loc-anywhere').classList.toggle('on', !m);
  const jobLoc = state.job && state.job.location && !/remote/i.test(state.job.location) ? state.job.location.replace(/\s*\d{5}.*$/, '').split(' / ')[0] : '';
  const useJob = $('loc-use-job');
  const alreadyThere = m && jobLoc && buildLocationMatcher(jobLoc)?.label === m.label;
  useJob.classList.toggle('hidden', !jobLoc || !!alreadyThere);
  useJob.innerHTML = svg('pin') + esc('Job\'s location: ' + jobLoc);
  useJob.dataset.loc = jobLoc;
  const where = m ? m.label : '';
  $('s-rec-sub').textContent = where ? `At this company · ${where}` : 'At this company';
  $('s-team-sub').textContent = where ? `Likely teammates · ${where}` : 'Likely teammates or managers';
  $('s-alumni-sub').textContent = state.settings.school ? `${state.settings.school} alumni here` : 'Add your school in Settings';
}

async function setPeopleLocation(value, how) {
  state.settings.peopleLocation = (value || '').trim();
  await store.set('settings', state.settings);
  logEvent('location_set', { location: state.settings.peopleLocation || 'anywhere', how });
  renderPeopleTab();
}
(() => {
  const dl = $('loc-options');
  for (const o of locationOptions()) { const opt = document.createElement('option'); opt.value = o; dl.appendChild(opt); }
})();
$('loc-input').addEventListener('change', () => setPeopleLocation($('loc-input').value, 'typed'));
$('loc-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('loc-input').blur(); });
$('loc-anywhere').addEventListener('click', () => { $('loc-input').value = ''; setPeopleLocation('', 'anywhere'); });
$('loc-use-job').addEventListener('click', () => { $('loc-input').value = $('loc-use-job').dataset.loc; setPeopleLocation($('loc-use-job').dataset.loc, 'job'); });
$('loc-strict').addEventListener('change', async () => {
  state.settings.locationStrict = $('loc-strict').checked;
  await store.set('settings', state.settings);
  renderPeopleTab();
});

// ---------- List ----------
async function renderPeopleTab() {
  $('people-nojob').classList.toggle('hidden', !!state.job);
  $('people-body').classList.toggle('hidden', !state.job);
  const tile = $('tile-people');
  if (!state.job) return;
  $('people-company').textContent = state.job.company || 'this company';
  renderLocationPicker();

  const m = locMatcher();
  const strict = state.settings.locationStrict !== false;
  const pool = await store.get(peopleKey(state.job.company), []);
  const ctx = {
    company: state.job.company,
    jobTitle: state.job.title,
    hiringTeam: state.job.hiringTeam,
    locationMatcher: m,
    locationStrict: strict,
    profile: {
      school: state.settings.school,
      country: state.settings.country,
      pastEmployers: (state.settings.pastEmployers || '').split(',').map((s) => s.trim()).filter(Boolean),
    },
  };
  const ranked = rankPeople(pool, ctx);
  const everyone = m ? rankPeople(pool, { ...ctx, locationStrict: false }) : ranked;
  const inArea = everyone.filter((p) => p.locLevel === 'match').length;
  const unknown = everyone.filter((p) => p.locLevel === 'unknown').length;
  const elsewhere = everyone.filter((p) => p.locLevel === 'other').length;
  $('loc-summary').textContent = !pool.length ? '' : m ? `${inArea} here · ${unknown} unknown · ${elsewhere} elsewhere` : `${pool.length} people`;

  const tileVal = tile.querySelector('.tile-value');
  tile.className = 'tile' + (pool.length ? '' : ' dim');
  tileVal.textContent = !pool.length ? 'Find' : m ? `${inArea} nearby` : `${pool.length} found`;

  const list = $('people-list');
  list.innerHTML = '';
  $('people-clear').classList.toggle('hidden', !pool.length);

  if (state.job.hiringTeam && state.job.hiringTeam.length) {
    const c = document.createElement('div');
    c.className = 'card team-card';
    c.innerHTML = `<b>On the job posting:</b> ${esc(state.job.hiringTeam.join(', '))}. Message them first, since they're tied to this exact role.`;
    list.appendChild(c);
  }

  if (!pool.length) {
    const p = document.createElement('p');
    p.className = 'hidden-note';
    p.textContent = m
      ? `No one collected yet. Start with "Recruiters". The search includes ${m.label}.`
      : 'No one collected yet. Pick a location above, then start with "Recent hiring posts" or "Recruiters".';
    list.appendChild(p);
    return;
  }

  const head = document.createElement('div');
  head.className = 'list-head';
  head.innerHTML = `<h3>${m ? `Top contacts · ${esc(m.label)}` : 'Top contacts'}</h3><span>${Math.min(5, ranked.length)} of ${ranked.length}</span>`;
  list.appendChild(head);

  ranked.slice(0, 5).forEach((p, i) => {
    const c = document.createElement('div');
    c.className = 'card person';
    c.innerHTML = `
      <div class="avatar"></div>
      <div class="person-body">
        <div class="person-top"><a class="person-name" target="_blank"></a><span class="person-rank">#${i + 1}</span></div>
        <div class="person-headline"></div>
        ${p.location ? `<div class="person-loc">${svg('pin')}<span></span></div>` : ''}
        <div class="chips"></div>
        <div class="person-actions"><button class="btn btn-primary btn-sm msg">${svg('spark')}Write message</button></div>
        <div class="draft hidden"></div>
      </div>`;
    setAvatar(c.querySelector('.avatar'), p.name);
    const a = c.querySelector('.person-name');
    a.href = p.profileUrl; a.textContent = p.name;
    a.onclick = () => logEvent('person_profile_opened', { rank: i + 1, score: p.score, locLevel: p.locLevel });
    c.querySelector('.person-headline').textContent = p.headline;
    if (p.location) c.querySelector('.person-loc span').textContent = p.location;
    const chips = c.querySelector('.chips');
    // Location first, then the strongest two reasons.
    const reasons = [...p.reasons.filter((r) => /^In |^Same state|Based in|Location unknown/.test(r)), ...p.reasons.filter((r) => !/^In |^Same state|Based in|Location unknown/.test(r))].slice(0, 3);
    reasons.forEach((r) => chips.appendChild(chip(r, /^In /.test(r) ? 'loc' : /confirm|unknown|based in/i.test(r) ? 'warn' : '')));
    const mb = c.querySelector('.msg');
    const draftBox = c.querySelector('.draft');
    const cached = state.drafts[draftKey(p)];
    if (cached) renderDraft(draftBox, p, i, cached);
    mb.onclick = () => {
      if (!draftBox.classList.contains('hidden') && state.drafts[draftKey(p)]) { draftBox.classList.add('hidden'); return; }
      if (state.drafts[draftKey(p)]) renderDraft(draftBox, p, i, state.drafts[draftKey(p)]);
      else writeMessage(draftBox, p, i);
    };
    if (state.verdict?.askRecruiter && /recruit|talent/i.test(p.headline)) {
      const q = document.createElement('button');
      q.className = 'btn btn-sm';
      q.innerHTML = svg('unknown') + 'Ask about sponsorship';
      q.onclick = () => {
        copyText(q, recruiterQuestion(state.job, p.name));
        logEvent('recruiter_question_copied', { via: 'people', rank: i + 1 });
      };
      c.querySelector('.person-actions').appendChild(q);
    }
    list.appendChild(c);
  });

  if (m && strict && elsewhere) {
    const n = document.createElement('p');
    n.className = 'hidden-note';
    n.innerHTML = `${elsewhere} ${elsewhere === 1 ? 'person' : 'people'} outside ${esc(m.label)} hidden. `;
    const show = document.createElement('button');
    show.className = 'link-btn';
    show.textContent = 'Show them';
    show.onclick = () => { $('loc-strict').checked = false; $('loc-strict').dispatchEvent(new Event('change')); };
    n.appendChild(show);
    list.appendChild(n);
  }
  const note = document.createElement('p');
  note.className = 'hidden-note';
  note.textContent = 'Personalize one line and send from LinkedIn yourself. Pathfinder never sends anything.';
  list.appendChild(note);
}

// ---------- AI LinkedIn messages (your DM template in prompts.js) ----------
const draftKey = (p) => (state.job ? state.job.key : '') + '|' + p.slug;
const profileCtx = () => ({
  school: state.settings.school, country: state.settings.country,
  pastEmployers: (state.settings.pastEmployers || '').split(',').map((s) => s.trim()).filter(Boolean),
});

async function writeMessage(box, p, rank) {
  box.classList.remove('hidden');
  if (!aiAvailable(state.settings, PROXY_URL)) {
    const fallback = outreachMessage(p, state.job, profileCtx());
    const d = { connection_note: fallback, message: fallback, question: '', ai: false };
    state.drafts[draftKey(p)] = d;
    renderDraft(box, p, rank, d);
    return;
  }
  box.innerHTML = '<div class="skeleton" style="height:84px;margin:0"></div><p class="muted small">Writing a message for ' + esc(p.name.split(' ')[0]) + '…</p>';
  const started = Date.now();
  try {
    const resp = await aiRequest({
      kind: 'outreach', settings: state.settings, installId: state.installId, proxyUrl: PROXY_URL,
      system: OUTREACH_SYSTEM_PROMPT,
      user: buildOutreachUserPrompt({ person: p, job: state.job, profile: profileCtx(), myBackground: state.settings.myBackground, resume: state.resume?.text }),
      schema: OUTREACH_SCHEMA,
      maxTokens: 4000,
    });
    const { text, usage } = resp;
    const d = { ...parseJsonLoose(text), ai: true, note: freeNote(resp) };
    state.drafts[draftKey(p)] = d;
    renderDraft(box, p, rank, d);
    logEvent('outreach_generated', { rank, noteChars: d.connection_note.length, ms: Date.now() - started, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens });
  } catch (err) {
    box.innerHTML = '';
    const e = document.createElement('p');
    e.className = 'status err';
    e.textContent = err.message;
    const retry = document.createElement('button');
    retry.className = 'btn btn-sm';
    retry.textContent = 'Try again';
    retry.onclick = () => writeMessage(box, p, rank);
    box.append(e, retry);
    logEvent('outreach_error', { message: err.message });
  }
}

function renderDraft(box, p, rank, d) {
  box.classList.remove('hidden');
  const kind = box.dataset.kind || 'connection_note';
  box.innerHTML = `
    <div class="seg">
      <button data-k="connection_note">Connection note</button>
      <button data-k="message">Message</button>
    </div>
    <textarea class="draft-text" rows="5" spellcheck="true"></textarea>
    <div class="draft-foot">
      <span class="count"></span>
      <div class="draft-actions">
        ${d.ai ? `<button class="btn btn-ghost btn-sm regen">${svg('refresh')}New version</button>` : ''}
        <button class="btn btn-primary btn-sm copy">${svg('copy')}Copy</button>
      </div>
    </div>
    ${d.ai ? '' : '<p class="muted small">Add your Claude API key in Settings for a personalized AI message.</p>'}
    ${d.question ? `<p class="muted small">Question asked: ${esc(d.question)}</p>` : ''}
    ${d.note ? `<p class="muted small">${esc(d.note.replace(/^ · /, ''))}</p>` : ''}`;
  const ta = box.querySelector('.draft-text');
  const count = box.querySelector('.count');
  const show = (k) => {
    box.dataset.kind = k;
    box.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
    ta.value = d[k] || '';
    update();
  };
  const update = () => {
    d[box.dataset.kind] = ta.value; // keep your edits
    const n = ta.value.length;
    const note = box.dataset.kind === 'connection_note';
    count.textContent = note ? `${n}/300` : `${n} characters`;
    count.className = 'count' + (note && n > 300 ? ' over' : '');
    ta.style.height = 'auto';
    ta.style.height = Math.min(260, ta.scrollHeight + 2) + 'px';
  };
  ta.addEventListener('input', update);
  box.querySelectorAll('.seg button').forEach((b) => (b.onclick = () => show(b.dataset.k)));
  const copy = box.querySelector('.copy');
  copy.onclick = () => {
    if (box.dataset.kind === 'connection_note' && ta.value.length > 300) {
      toast('Over 300 characters. LinkedIn will cut it off. Trim it or use "Message".');
    }
    copyText(copy, ta.value);
    logEvent('outreach_copied', { rank, format: box.dataset.kind, ai: d.ai, edited: ta.value !== d['_orig_' + box.dataset.kind], chars: ta.value.length, locLevel: p.locLevel, company: state.job.company });
  };
  const regen = box.querySelector('.regen');
  if (regen) regen.onclick = () => { delete state.drafts[draftKey(p)]; writeMessage(box, p, rank); };
  d._orig_connection_note = d._orig_connection_note ?? d.connection_note;
  d._orig_message = d._orig_message ?? d.message;
  show(kind);
}

$('people-clear').addEventListener('click', async () => {
  if (!state.job) return;
  await chrome.storage.local.remove(peopleKey(state.job.company));
  renderPeopleTab();
});

async function scanPeople(tab, trigger) {
  if (!state.job) {
    $('people-status').textContent = 'Open a job posting first so Pathfinder knows which company to rank people for.';
    return;
  }
  setBanner('people-page');
  let res = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractLinkedInPeople });
    res = result;
    if (res && res.people.length) break;
    await sleep(1000);
  }
  if (!res || !res.people.length) {
    $('people-status').textContent = 'No people found on this page yet. Scroll a bit, then tap "Scan the current LinkedIn page".';
    logEvent('people_scan_empty', { mode: res?.mode });
    return;
  }
  const key = peopleKey(state.job.company);
  const merged = mergePeople(await store.get(key, []), res.people);
  await store.set(key, merged);
  const withLoc = res.people.filter((p) => p.location).length;
  $('people-status').textContent = `Read ${res.people.length} people (${withLoc} with a location) · ${merged.length} saved for ${state.job.company}.`;
  logEvent('people_scanned', { mode: res.mode, found: res.people.length, withLocation: withLoc, total: merged.length, trigger });
  showTab('people');
  renderPeopleTab();
}

$('people-scan').addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (tab && tab.url && PEOPLE_URL_RE.test(tab.url)) scanPeople(tab, 'manual');
  else toast('Open a LinkedIn people search or company People page first. Use the buttons above.');
});

// ============================================================
//  SETTINGS
// ============================================================
const SETTING_FIELDS = { school: 'set-school', country: 'set-country', pastEmployers: 'set-employers', myBackground: 'set-mybg', apiKey: 'set-apikey', model: 'set-model' };

async function loadSettings() {
  state.settings = await store.get('settings', {});
  state.installId = await store.get('installId', '');
  if (!state.installId) {
    state.installId = (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) => x.toString(16).padStart(2, '0')).join('')).toLowerCase();
    await store.set('installId', state.installId);
  }
  for (const [k, id] of Object.entries(SETTING_FIELDS)) $(id).value = state.settings[k] || '';
  state.resume = await store.get('resume', null);
  if (state.resume) {
    $('resume-status').className = 'status ok';
    $('resume-status').textContent = `✓ ${state.resume.name}`;
    $('resume-drop-label').textContent = 'Replace resume';
  }
  $('ai-plan').textContent = PROXY_URL
    ? 'AI edits and messages are free: 5 runs a day, no key needed. Add your own key below for unlimited use.'
    : 'Add your Claude API key to turn on AI edits and messages.';
  const meta = await store.get('h1bMeta', null);
  if (meta) { $('h1b-status').className = 'status ok'; $('h1b-status').textContent = `✓ Loaded ${meta.years.map((y) => 'FY' + y).join(', ')}`; }
}

for (const [k, id] of Object.entries(SETTING_FIELDS)) {
  $(id).addEventListener('change', async () => {
    state.settings[k] = $(id).value.trim();
    await store.set('settings', state.settings);
    logEvent('setting_changed', { field: k === 'apiKey' ? 'apiKey(set)' : k });
    if (!['apiKey', 'model', 'myBackground'].includes(k)) renderPeopleTab();
  });
}

$('h1b-file').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  const status = $('h1b-status');
  status.className = 'status';
  let employers = 0;
  try {
    for (const [i, f] of files.entries()) {
      status.textContent = `Reading ${f.name} (${i + 1}/${files.length})…`;
      await sleep(30);
      const agg = aggregateH1B(parseDelimited(decodeFile(await f.arrayBuffer())));
      employers += Object.keys(agg.employers).length;
      status.textContent = `Saving ${f.name}…`;
      const meta = await saveH1B(agg);
      status.className = 'status ok';
      status.textContent = `✓ Loaded ${meta.years.map((y) => 'FY' + y).join(', ')} · ${employers.toLocaleString()} employers`;
    }
    logEvent('h1b_imported', { files: files.length, employers });
    if (state.job) {
      const { v, h1b } = await renderJob(state.job);
      await saveJob(state.job, { verdictLevel: v.level, h1bStatus: h1b.status });
      renderStats();
    }
  } catch (err) {
    status.className = 'status err';
    status.textContent = err.message;
    logEvent('h1b_import_error', { message: err.message });
  }
});

// ---------- Site permissions ----------
async function renderPermStatus() {
  const has = await chrome.permissions.contains(ALL_SITES).catch(() => false);
  const pill = $('perm-status');
  pill.className = 'pill' + (has ? ' ok' : '');
  pill.textContent = has ? '✓ All career sites allowed' : 'Job boards only';
  $('perm-all').classList.toggle('hidden', has);
}
async function requestAllSites(source) {
  const granted = await chrome.permissions.request(ALL_SITES).catch(() => false);
  logEvent('permission_all_sites', { granted, source });
  renderPermStatus();
  if (granted) { setBanner(null); state.lastKey = ''; scan('permission'); }
  else toast('No problem. You can still highlight a job description and use "Use highlighted text".');
}
$('perm-all').addEventListener('click', () => requestAllSites('settings'));
$('banner-allow').addEventListener('click', () => requestAllSites('banner'));

// ---------- Metrics ----------
async function metricsSummary() {
  const events = await store.get('events', []);
  const jobs = Object.values(await store.get('jobs', {}));
  const count = (n) => events.filter((e) => e.name === n).length;
  const scores = events.filter((e) => e.name === 'resume_scored').map((e) => e.props.score);
  return {
    jobsChecked: jobs.length,
    bySite: jobs.reduce((m, j) => ((m[j.site || 'LinkedIn'] = (m[j.site || 'LinkedIn'] || 0) + 1), m), {}),
    verdicts: jobs.reduce((m, j) => ((m[j.verdictLevel || 'n/a'] = (m[j.verdictLevel || 'n/a'] || 0) + 1), m), {}),
    avgResumeScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    suggestionRuns: count('suggestions_generated'),
    suggestionsCopied: count('suggestion_copied'),
    peopleSearchesOpened: count('people_search_opened'),
    outreachMessagesCopied: count('outreach_copied'),
    recruiterQuestionsCopied: count('recruiter_question_copied'),
    manualCaptures: count('job_captured_manually'),
  };
}
async function renderMetricsSummary() {
  const m = await metricsSummary();
  const tiles = [
    [m.jobsChecked, 'jobs checked'], [m.verdicts.stop || 0, 'dead ends avoided'], [m.avgResumeScore ?? '—', 'avg match'],
    [m.suggestionsCopied, 'edits used'], [m.outreachMessagesCopied, 'messages drafted'], [m.recruiterQuestionsCopied, 'visa questions'],
  ];
  $('metrics-summary').innerHTML = tiles.map(([v, l]) => `<div class="metric"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('');
}
$('copy-metrics').addEventListener('click', async () => {
  const events = await store.get('events', []);
  copyText($('copy-metrics'), JSON.stringify({ summary: await metricsSummary(), events }, null, 2));
});
$('clear-all').addEventListener('click', async () => {
  if (!confirm('Delete your resume, settings, H-1B data, people lists and metrics from this browser?')) return;
  await chrome.storage.local.clear();
  location.reload();
});

// ============================================================
//  CAREER PAGES: best jobs on this page for your resume
// ============================================================
const match = { listing: null, results: null, min: 75, hideSkip: false, running: false, cache: {} };

async function readListings(tab) {
  let raw;
  try {
    raw = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: findJobListings });
  } catch (err) {
    raw = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: findJobListings });
  }
  raw = raw.slice().sort((a, b) => (a.frameId || 0) - (b.frameId || 0));
  const frames = raw.map((r) => r.result).filter(Boolean);
  const top = frames[0];
  if (!top || top.board) return null;
  const seen = new Set();
  const links = frames.flatMap((f) => f.links).filter((l) => !seen.has(l.url) && seen.add(l.url));
  const ats = (frames.find((f) => f.ats) || {}).ats || null;
  state.lastDebug = { ...(state.lastDebug || {}), listing: {
    frames: frames.length, ats, jobLinks: links.length, sample: links.slice(0, 5).map((l) => `${l.title} → ${l.url}`),
    anchors: frames.map((f) => f.anchors), apiHosts: [...new Set(frames.flatMap((f) => f.apiHosts || []))],
  } };
  if (!ats && links.length < 3) return null;
  return { url: top.url, host: top.host, title: top.title, ats, links };
}

function companyFromListing(l) {
  const t = (l.title || '').split(/\s[|–—-]\s/).map((x) => x.trim()).filter(Boolean);
  const named = t.find((x) => !/careers?|jobs?|openings|positions|work with us|join/i.test(x));
  return named || (l.host || '').replace(/^(www|careers|jobs|boards)\./, '').split('.')[0].replace(/\b\w/, (c) => c.toUpperCase());
}

function showMatchCard(listing) {
  match.listing = listing;
  const card = $('match-card');
  if (!listing) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  const n = listing.links.length;
  $('match-count').textContent = listing.ats && !n ? 'Job board' : `${n} job${n === 1 ? '' : 's'} on page`;
  const cached = match.cache[listing.url];
  if (cached) { match.results = cached; renderMatches(); return; }
  match.results = null;
  $('match-list').innerHTML = '';
  $('match-filters').classList.add('hidden');
  $('match-note').classList.add('hidden');
  $('match-progress').classList.add('hidden');
  $('match-run').classList.remove('hidden');
  $('match-run').disabled = false;
  if (!state.resume) {
    $('match-intro').textContent = 'This looks like a careers page. Add your resume and Pathfinder will check every job here and show the ones that fit you best.';
    $('match-run').innerHTML = '<svg class="ico"><use href="#i-upload"/></svg>Add your resume first';
  } else {
    $('match-intro').textContent = 'Pathfinder can check every job on this page against your resume and show your best matches (75%+), with a sponsorship check for each.';
    $('match-run').innerHTML = '<svg class="ico"><use href="#i-search"/></svg>Find my best matches';
  }
}

function setMatchProgress(done, total, label) {
  $('match-progress').classList.remove('hidden');
  $('match-progress').querySelector('.bar span').style.width = (total ? Math.round((done / total) * 100) : 10) + '%';
  $('match-progress').querySelector('p').textContent = label || `Reading jobs… ${done} of ${total}`;
}

async function runMatches() {
  const listing = match.listing;
  if (!listing || match.running) return;
  if (!state.resume) { showTab('settings'); $('resume-file').scrollIntoView?.({ block: 'center' }); return; }
  // Permission must be asked right away (inside the click), before any other await.
  const ats = listing.ats || atsFromLinks(listing.links);
  // ATS boards on known hosts are already allowed; company-hosted boards (Eightfold) and plain pages need the site.
  const origins = ats ? (ats.type === 'eightfold' ? [`https://${ats.host}/*`] : []) : linkOrigins(listing.links.slice(0, MATCH_LIMITS.pages));
  if (origins.length) {
    const ok = await chrome.permissions.request({ origins }).catch(() => false);
    if (!ok) { toast('Pathfinder needs permission to read the job pages on this site.'); logEvent('career_match_denied', { host: listing.host }); return; }
  }
  match.running = true;
  $('match-run').classList.add('hidden');
  setMatchProgress(0, 0, ats ? `Reading all jobs from ${ats.type[0].toUpperCase() + ats.type.slice(1)}…` : 'Reading jobs…');
  const started = Date.now();
  try {
    const fallbackCompany = companyFromListing(listing);
    const { jobs, source, total } = await collectJobs(listing, { onProgress: (d, t) => setMatchProgress(d, t), fallbackCompany });
    setMatchProgress(1, 1, 'Scoring against your resume…');
    const ranked = rankJobs(jobs, state.resume.text);
    // Sponsorship: posting language + the company's H-1B history (looked up once per company).
    const h1bCache = {};
    for (const j of ranked) {
      const co = j.company || fallbackCompany;
      if (!(co in h1bCache)) h1bCache[co] = co ? await lookupH1B(co) : { status: 'no_data' };
      j.verdict = sponsorshipVerdict(j.sponsor, h1bCache[co], co || 'This company').level;
    }
    match.results = { jobs: ranked, source, total, url: listing.url };
    match.cache[listing.url] = match.results;
    renderMatches();
    const scored = ranked.filter((j) => j.readable);
    logEvent('career_matches_run', {
      host: listing.host, source, total, read: jobs.length, scored: scored.length,
      strong: scored.filter((j) => j.score >= 75).length, top: scored[0] ? scored[0].score : null, ms: Date.now() - started,
    });
  } catch (err) {
    $('match-run').classList.remove('hidden');
    $('match-note').textContent = 'Could not read the jobs on this page: ' + err.message;
    $('match-note').classList.remove('hidden');
  } finally {
    match.running = false;
    $('match-progress').classList.add('hidden');
  }
}

const VERDICT_CHIP = { go: ['ok', 'Sponsorship: likely yes'], caution: ['warn', 'Sponsorship: ask first'], stop: ['miss', 'Says no sponsorship'], unknown: ['', 'Sponsorship: check'] };

function renderMatches() {
  const r = match.results;
  if (!r) return;
  $('match-run').classList.add('hidden');
  $('match-filters').classList.remove('hidden');
  document.querySelectorAll('#match-filters [data-min]').forEach((b) => b.classList.toggle('on', +b.dataset.min === match.min));
  $('match-hide-skip').classList.toggle('on', match.hideSkip);
  const scored = r.jobs.filter((j) => j.readable);
  const strong = scored.filter((j) => j.score >= 75).length;
  $('match-count').textContent = `${strong} strong match${strong === 1 ? '' : 'es'}`;
  $('match-intro').textContent = `Checked ${scored.length} job${scored.length === 1 ? '' : 's'} against your resume${r.total > r.jobs.length ? ` (first ${r.jobs.length} of ${r.total})` : ''}. Tap a job to open it and get the full check.`;

  let list = r.jobs.filter((j) => (match.min ? j.readable && j.score >= match.min : true));
  if (match.hideSkip) list = list.filter((j) => j.verdict !== 'stop');
  let note = '';
  if (!list.length && scored.length) {
    list = scored.filter((j) => !match.hideSkip || j.verdict !== 'stop').slice(0, 5);
    note = `No ${match.min}%+ matches on this page. Your closest ones:`;
  } else if (!scored.length) {
    note = "These job pages load their text in a way Pathfinder can't read in the background. Open a job and Pathfinder will check it.";
  }
  $('match-note').textContent = note;
  $('match-note').classList.toggle('hidden', !note);

  $('match-list').innerHTML = list.slice(0, 50).map((j, i) => {
    const sc = j.readable ? `<div class="match-score ${j.score >= 75 ? 'hi' : j.score >= 55 ? 'mid' : ''}">${j.score}</div>` : '<div class="match-score na">n/a</div>';
    const [cls, label] = VERDICT_CHIP[j.verdict] || VERDICT_CHIP.unknown;
    const chips = [`<span class="chip ${cls}">${esc(label)}</span>`]
      .concat(j.missing.map((m) => `<span class="chip miss">Missing: ${esc(kwLabel(m))}</span>`)).join('');
    return `<li class="match-row"><div>${sc}</div><div>
      <a class="match-title" href="${esc(j.url)}" target="_blank" rel="noopener" data-i="${i}">${esc(j.title || 'Untitled role')}<svg class="ico"><use href="#i-external"/></svg></a>
      <div class="match-meta">${esc([j.location, j.company].filter(Boolean).join(' · '))}</div>
      <div class="chips">${chips}</div></div></li>`;
  }).join('');
  $('match-list').querySelectorAll('.match-title').forEach((a) => a.addEventListener('click', () => {
    const j = list[+a.dataset.i];
    logEvent('career_match_opened', { score: j.score, verdict: j.verdict, rank: +a.dataset.i + 1 });
  }));
}

$('match-run').addEventListener('click', runMatches);
document.querySelectorAll('#match-filters [data-min]').forEach((b) => b.addEventListener('click', () => { match.min = +b.dataset.min; renderMatches(); }));
$('match-hide-skip').addEventListener('click', () => { match.hideSkip = !match.hideSkip; renderMatches(); });

// ============================================================
//  Reading the active tab (any site)
// ============================================================
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Runs the universal reader in every frame (career sites often embed Greenhouse/iCIMS in an iframe).
async function readTab(tab) {
  try {
    return (await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: extractJob })).map((r) => r.result).filter(Boolean);
  } catch (err) {
    return (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractJob })).map((r) => r.result).filter(Boolean);
  }
}
function pickBest(results) {
  const jobs = results.filter((r) => r.isJob).sort((a, b) => b.confidence - a.confidence || b.description.length - a.description.length);
  return jobs[0] || results.find((r) => r.isTopFrame) || results[0] || null;
}

async function applyOverrides(job) {
  const o = (await store.get('overrides', {}))[job.key];
  return o ? { ...job, ...Object.fromEntries(Object.entries(o).filter(([, v]) => v)) } : job;
}

async function acceptJob(job, trigger) {
  job = await applyOverrides(job);
  $('edit-form').classList.add('hidden');
  const { v, h1b } = await renderJob(job);
  await store.set('activeJob', job);
  if (job.key !== state.lastKey) {
    state.lastKey = job.key;
    const isNew = await saveJob(job, { verdictLevel: v.level, h1bStatus: h1b.status });
    logEvent('job_scanned', {
      trigger, isNew, site: job.site, manual: !!job.manual, verdict: v.level, jdKind: v.jdKind, h1b: h1b.status,
      confidence: job.confidence, hasCompany: !!job.company, hasLocation: !!job.location,
    });
    renderStats();
  }
}

let scanning = false;
async function scan(trigger) {
  if (scanning) return;
  scanning = true;
  $('rescan').classList.add('spin');
  try { await doScan(trigger); } finally { scanning = false; $('rescan').classList.remove('spin'); }
}

async function doScan(trigger) {
  const tab = await getActiveTab();
  if (!tab || !tab.url || !/^https?:/.test(tab.url)) {
    showMatchCard(null);
    setBanner(state.job ? 'last-job' : null);
    if (!state.job) showJobState('empty');
    return;
  }
  if (PEOPLE_URL_RE.test(tab.url)) {
    try { await scanPeople(tab, trigger); } catch (err) { $('people-status').textContent = 'Error: ' + err.message; }
    return;
  }
  if (!state.job) showJobState('loading');

  let best = null, results = [];
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      results = await readTab(tab);
      best = pickBest(results);
      if (best && best.isJob) break;
      // Job boards load details after the URL changes; give them a moment. Other sites: one retry.
      if (attempt >= 1 && (!best || best.site === 'Company site')) break;
      await sleep(800);
    }
  } catch (err) {
    const host = (() => { try { return new URL(tab.url).hostname.replace(/^www\./, ''); } catch (e) { return ''; } })();
    state.lastDebug = { url: tab.url, error: err.message };
    showMatchCard(null);
    if (/cannot access|permission|not allowed|host/i.test(err.message)) setBanner('no-access', host);
    if (!state.job) showJobState('empty');
    logEvent('extract_blocked', { host, message: err.message.slice(0, 120) });
    return;
  }

  state.lastDebug = { url: tab.url, frames: results.length, ...(best && best.debug) };
  if (best && best.isJob) {
    setBanner(null);
    showMatchCard(null);
    await acceptJob(best, trigger);
    return;
  }
  // Not a single job: is it a careers page listing many jobs?
  const listing = await readListings(tab).catch((err) => { state.lastDebug = { ...(state.lastDebug || {}), listingError: err.message }; return null; });
  showMatchCard(listing);
  if (listing) {
    if (!state.job) { setBanner(null); showJobState('empty'); $('state-empty').classList.add('hidden'); }
    else { setBanner(null); showJobState('job'); }
    if (match.lastLogged !== listing.url) { match.lastLogged = listing.url; logEvent('career_page_detected', { host: listing.host, links: listing.links.length, ats: listing.ats ? listing.ats.type : null }); }
    return;
  }
  if (state.job) { setBanner('last-job'); showJobState('job'); }
  else { setBanner(null); showJobState('empty'); }
  if (best && best.site !== 'Company site') logEvent('job_not_found', state.lastDebug);
}

// "Use highlighted text": works on any page Pathfinder can read.
async function captureSelection() {
  const tab = await getActiveTab();
  if (!tab || !/^https?:/.test(tab.url || '')) return toast('Open the job page first.');
  let results;
  try { results = await readTab(tab); } catch (err) {
    setBanner('no-access', new URL(tab.url).hostname);
    return;
  }
  const withSel = results.filter((r) => r.selection).sort((a, b) => b.selection.length - a.selection.length)[0];
  if (!withSel || withSel.selection.length < 150) {
    toast('Highlight the whole job description on the page first (drag across it), then tap the button again.');
    return;
  }
  const { selection, ...rest } = withSel;
  // People often start the highlight at the job title: use a short first line as the title if we have none.
  const first = selection.split('\n')[0].trim();
  const title = rest.title || (selection.includes('\n') && first.length < 90 && !/[.:]$/.test(first) ? first : '');
  const job = { ...rest, title, description: selection, isJob: true, manual: true, key: 'manual:' + (rest.url || tab.url).split('#')[0] };
  setBanner(null);
  await acceptJob(job, 'manual');
  logEvent('job_captured_manually', { site: job.site, chars: selection.length });
  if (!job.title || !job.company) { openEdit(); toast('Add the job title and company so the H-1B check works.'); }
}
$('empty-select').addEventListener('click', captureSelection);
$('banner-select').addEventListener('click', captureSelection);

let debounceTimer;
function debouncedScan(trigger) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => scan(trigger), 700);
}
$('rescan').addEventListener('click', () => { state.lastKey = ''; scan('manual'); });
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (tab.active && (info.url || info.status === 'complete')) debouncedScan('navigation');
});
chrome.tabs.onActivated.addListener(() => debouncedScan('tab_switch'));

// ---------- Start ----------
(async () => {
  await loadSettings();
  const saved = await store.get('activeJob', null);
  if (saved && saved.key) await renderJob(saved);
  else { showJobState('empty'); renderResumeTab(); renderPeopleTab(); }
  logEvent('panel_opened');
  renderStats();
  scan('open');
})();
