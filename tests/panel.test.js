const { JSDOM } = require('jsdom');
const assert = require('assert');
const path = require('path');
const EXT = path.resolve('pathfinder');
let n = 0; const ok = (m) => { n++; console.log('✓', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const JD = `<p>Lead implementation and onboarding for enterprise SaaS customers. You will own deployments end to end.</p>
<h3>Responsibilities</h3><ul><li>Own customer deployments</li><li>Partner with stakeholders</li></ul>
<h3>Qualifications</h3><ul><li>3+ years of experience with SQL, Excel, Salesforce, Jira, Agile</li></ul>
<p>Candidates must be authorized to work in the US without the need for current or future sponsorship.</p>`;
const PAGES = {
  indeed: [`<h2 data-testid="jobsearch-JobInfoHeader-title">Product Deployment Specialist - job post</h2><div data-testid="inlineHeader-companyName">Confido</div><div data-testid="inlineHeader-companyLocation">Phoenix, AZ 85004</div><div id="jobDescriptionText">${JD}</div><button>Apply now</button>`,
    'https://www.indeed.com/viewjob?jk=abc123', 'Product Deployment Specialist - Phoenix, AZ | Indeed.com'],
  blog: [`<h1>Weekend reading</h1><p>Nothing to see.</p>`, 'https://news.example.com/a', 'News'],
  weird: [`<div>Custom widget job page</div>`, 'https://careers.weirdco.com/x', 'Careers | WeirdCo'],
  careers: [`<h1>Open roles at Confido</h1><ul>
<li class="job"><a href="/careers/jobs/1-deployment"><h3>Deployment Specialist</h3></a><span class="location">Phoenix, AZ</span></li>
<li class="job"><a href="/careers/jobs/2-cad"><h3>CAD Designer</h3></a><span class="location">Austin, TX</span></li>
<li class="job"><a href="/careers/jobs/3-sales"><h3>Sales Development Rep</h3></a><span class="location">Remote</span></li>
</ul>`, 'https://careers.confido.com/', 'Careers | Confido'],
  people: [`
<ul>
<li><a href="https://www.linkedin.com/in/sam-phx/"><span aria-hidden="true">Sam Patel</span></a>
<div>Technical Recruiter at Confido</div>
<div>Tempe, Arizona</div></li>
<li><a href="https://www.linkedin.com/in/lee-sf/"><span aria-hidden="true">Lee Chen</span></a>
<div>Senior Recruiter at Confido</div>
<div>San Francisco Bay Area</div></li>
<li><a href="https://www.linkedin.com/in/ana-tuc/"><span aria-hidden="true">Ana Ruiz</span></a>
<div>Implementation Manager at Confido</div>
<div>Tucson, Arizona</div></li>
<li><a href="https://www.linkedin.com/in/raj-phx/"><span aria-hidden="true">Raj Iyer</span></a>
<div>Deployment Lead at Confido</div>
<div>Greater Phoenix Area</div></li>
</ul>`, 'https://www.linkedin.com/search/results/people/?keywords=Confido%20recruiter%20Phoenix', 'Search | LinkedIn'],
};
function makePage(key, selection) {
  const [html, url, title] = PAGES[key];
  const d = new JSDOM(`<html><head><title>${title}</title></head><body>${html}</body></html>`, { url, runScripts: 'outside-only' });
  d.window.HTMLElement.prototype.getClientRects = function () { return [1]; };
  if (selection) d.window.getSelection = () => selection;
  return d;
}
let page = makePage('indeed');
let blocked = false, permGranted = false;

const mem = {}; const listeners = { updated: [], activated: [] }; const created = []; const clip = [];
const chromeMock = {
  storage: { local: {
    get: async (k) => { if (k == null) return { ...mem }; const ks = Array.isArray(k) ? k : [k]; const o = {}; ks.forEach((x) => { if (x in mem) o[x] = JSON.parse(JSON.stringify(mem[x])); }); return o; },
    set: async (o) => { for (const [k, v] of Object.entries(o)) mem[k] = JSON.parse(JSON.stringify(v)); },
    remove: async (k) => { delete mem[k]; }, clear: async () => { for (const k in mem) delete mem[k]; },
  } },
  tabs: {
    query: async () => [{ id: 1, active: true, url: page.window.location.href }],
    create: async ({ url }) => { created.push(url); },
    onUpdated: { addListener: (f) => listeners.updated.push(f) },
    onActivated: { addListener: (f) => listeners.activated.push(f) },
  },
  scripting: { executeScript: async ({ func }) => {
    if (blocked && !permGranted) throw new Error('Cannot access contents of the page. Extension manifest must request permission to access the respective host.');
    return [{ result: JSON.parse(JSON.stringify(page.window.eval('(' + func.toString() + ')()'))) }];
  } },
  permissions: { contains: async () => permGranted, request: async () => { permGranted = true; return true; } },
  runtime: { getURL: (p) => 'file://' + EXT + '/' + p },
};
const aiResponse = { content: [{ type: 'text', text: JSON.stringify({
  fit_summary: 'Solid fit on implementation; light on Salesforce.',
  edits: [{ section: 'Experience — Uber', original: 'Managed rollout of internal tools to operations teams', revised: 'Led implementation and onboarding of internal SaaS tools for [N] operations teams', why: 'Mirrors the implementation requirement', keywords_added: ['implementation'], needs_input: 'number of teams' }],
  summary_line: { original: '', revised: 'Operations analyst with enterprise rollout experience.' },
  gaps: [{ keyword: 'Salesforce', advice: 'Mention CRM work in your cover letter.' }] }) }], usage: { input_tokens: 2500, output_tokens: 600 } };

const fetchBodies = []; const careerFetches = []; let failNext = false;
const outreachResponse = { content: [{ type: 'thinking', thinking: 'planning' }, { type: 'text', text: JSON.stringify({
  connection_note: "Hi Sam, fellow Phoenix person here! I'm looking at the Product Deployment Specialist role at Confido. Curious: what separates people who ramp fastest on the deployment team?",
  message: "Hi Sam, I noticed you recruit for Confido's deployment teams here in Phoenix. I'm looking at the Product Deployment Specialist role and I've spent the last few years rolling out tools to ops teams. I'm curious how the team splits time between onsite customer work and internal coordination. Would love your take if you have a minute. Thanks either way!",
  question: 'What separates people who ramp fastest on the deployment team?' }) }], usage: { input_tokens: 900, output_tokens: 200 } };
const navigate = (key, sel) => { page = makePage(key, sel); listeners.updated.forEach((f) => f(1, { url: page.window.location.href }, { active: true })); };

(async () => {
  const dom = await JSDOM.fromFile(path.join(EXT, 'sidepanel.html'), {
    resources: 'usable', runScripts: 'dangerously', url: 'file://' + EXT + '/sidepanel.html',
    beforeParse(w) {
      w.chrome = chromeMock;
      Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => clip.push(t) } });
      w.fetch = async (url, opts) => {
        if (/careers\.confido\.com\/careers\/jobs\//.test(url)) {
          careerFetches.push(url);
          const id = url.match(/jobs\/(\d)/)[1];
          const desc = { 1: JD + '<p>Tools: SQL, Excel, Salesforce, Jira, Agile, implementation, onboarding, stakeholders, deployments.</p>', 2: '<p>' + 'SolidWorks, GD&amp;T, AutoCAD drafting, tolerance analysis, sheet metal, injection molding. '.repeat(5) + '</p>', 3: '<p>Short.</p>' }[id];
          return { ok: true, status: 200, text: async () => `<html><body><main><h1>Job ${id}</h1>${desc}</main></body></html>` };
        }
        const body = JSON.parse(opts.body); fetchBodies.push(body);
        if (/\/v1\/ai$/.test(url)) {
          const txt = body.kind === 'outreach' ? outreachResponse.content[1].text : aiResponse.content[0].text;
          return { ok: true, status: 200, json: async () => ({ text: txt, usage: {}, remaining: 4 }) };
        }
        if (failNext) { failNext = false; return { ok: true, status: 200, json: async () => ({ content: [{ type: 'thinking', thinking: '...' }], stop_reason: 'max_tokens', usage: {} }) }; }
        if (/LinkedIn outreach/.test(body.system)) return { ok: true, status: 200, json: async () => outreachResponse };
        return { ok: true, status: 200, json: async () => aiResponse };
      };
      w.confirm = () => true;
      w.HTMLElement.prototype.scrollIntoView = () => {};
      w.File.prototype.arrayBuffer = function () { return new Promise((res) => { const r = new w.FileReader(); r.onload = () => res(r.result); r.readAsArrayBuffer(this); }); };
    },
  });
  const w = dom.window, $ = (id) => w.document.getElementById(id);
  const errors = []; w.addEventListener('error', (e) => errors.push(e.message));
  const until = async (fn, what, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return; } catch (e) {} await sleep(50); } throw new Error('timeout: ' + what); };
  const giveFiles = (input, files) => { Object.defineProperty(input, 'files', { value: files, configurable: true }); input.dispatchEvent(new w.Event('change')); };
  const tileVal = (id) => $(id).querySelector('.tile-value').textContent;

  // 1. Indeed job
  await until(() => !$('state-job').classList.contains('hidden'), 'job shown');
  assert.strictEqual($('job-title').textContent, 'Product Deployment Specialist');
  assert.strictEqual($('job-company').textContent, 'Confido');
  assert.strictEqual($('site-badge').textContent, 'Indeed');
  assert.strictEqual($('job-source').textContent, 'Read from Indeed');
  assert.ok(!$('jd') && !w.document.body.textContent.includes('Own customer deployments'), 'job description is not repeated in the panel');
  assert.strictEqual(tileVal('tile-sponsor'), 'Skip');
  ok('Indeed job read; site badge; no duplicate job description; tile = Skip before H-1B data');

  // 2. H-1B import
  const csv = 'Fiscal Year,Employer (Petitioner) Name,New Employment Approval,New Employment Denial,Continuation Approval,Continuation Denial,Change of Employer Approval,Change of Employer Denial\n2024,CONFIDO INC,12,1,5,0,3,0\n2023,CONFIDO INC,8,0,2,0,1,0\n';
  giveFiles($('h1b-file'), [new w.File([csv], 'h1b_fy2024.csv')]);
  await until(() => $('verdict-card').className.includes('caution'), 'verdict caution');
  assert.strictEqual(tileVal('tile-sponsor'), 'Ask first');
  assert.strictEqual($('h1b-body').querySelectorAll('.bar-row').length, 2);
  assert.ok($('h1b-body').textContent.includes('15') && $('h1b-body').textContent.includes('new hires FY2024'));
  $('copy-ask').click(); await sleep(20); assert.ok(clip.at(-1).includes('F-1 OPT'));
  ok('H-1B import → "Ask first", bar chart with 2 fiscal years, recruiter question copies');

  // 3. Resume
  const resume = 'Roopha\nManaged rollout of internal tools to operations teams\nBuilt SQL and Excel dashboards for 5 cross-functional stakeholders, cutting reporting time by 40%\nRan Agile sprints in Jira for a 10-person team\n' + 'Analyst with experience across enterprise operations and product programs for global teams. '.repeat(3);
  giveFiles($('resume-file'), [new w.File([resume], 'roopha_resume.txt')]);
  await until(() => !$('resume-body').classList.contains('hidden'), 'resume body');
  assert.ok(/\/100$/.test(tileVal('tile-match')));
  assert.ok($('score-ring').style.getPropertyValue('--p') > 0);
  ok(`Resume scored: tile shows ${tileVal('tile-match')}, ring + meters rendered`);

  // 4. AI
  $('set-apikey').value = 'sk-ant-test'; $('set-apikey').dispatchEvent(new w.Event('change')); await sleep(30);
  failNext = true;
  $('ai-run').click();
  await until(() => $('ai-status').textContent.includes('ran out of room'), 'clear error');
  ok('Empty AI reply (thinking used the budget) shows a clear error instead of "not in the expected format"');
  $('ai-run').click();
  await until(() => $('ai-results').querySelectorAll('.edit').length === 2, 'ai edits');
  const rb = fetchBodies.at(-1);
  assert.strictEqual(rb.output_config.format.type, 'json_schema'); assert.ok(rb.max_tokens >= 8000);
  assert.ok(rb.output_config.format.schema.required.includes('edits'));
  assert.ok($('ai-results').textContent.includes('Fill in: number of teams'));
  $('ai-results').querySelectorAll('.edit button')[1].click(); await sleep(20);
  assert.ok(clip.at(-1).startsWith('Led implementation'));
  ok('AI edits render (before → after, fill-in note) and copy');

  // 5. Edit company → saved override
  $('edit-job').click();
  $('edit-company').value = 'Confido Health';
  $('edit-form').dispatchEvent(new w.Event('submit', { cancelable: true }));
  await until(() => $('job-company').textContent === 'Confido Health', 'edit applied');
  assert.strictEqual(mem.overrides['Indeed:abc123'].company, 'Confido Health');
  ok('Edit company works and is remembered for this job');

  // 6. Non-job page keeps last job
  navigate('blog');
  await until(() => !$('page-banner').classList.contains('hidden'), 'banner');
  assert.ok($('page-banner-text').textContent.includes('last job'));
  assert.strictEqual($('job-title').textContent, 'Product Deployment Specialist');
  ok('Non-job page: keeps the last job, shows a banner with "Use highlighted text"');

  // 7. Blocked site → allow
  blocked = true; navigate('weird');
  await until(() => !$('banner-allow').classList.contains('hidden'), 'allow button');
  assert.ok($('page-banner-text').textContent.includes('careers.weirdco.com'));
  $('banner-allow').click();
  await until(() => permGranted && mem.events.some((e) => e.name === 'permission_all_sites'), 'permission');
  ok('Blocked site → "Allow on all sites" → permission requested and page rescanned');

  // 8. Highlighted text fallback
  page = makePage('weird', 'Senior Program Manager. ' + 'Responsibilities: drive cross-functional programs, own roadmaps and reporting. Qualifications: 5+ years of experience. '.repeat(3));
  await sleep(50);
  $('banner-select').classList.remove('hidden'); $('banner-select').click();
  await until(() => $('job-source').textContent === 'From highlighted text', 'manual');
  assert.ok(!$('edit-form').classList.contains('hidden'), 'asks for missing title/company');
  $('edit-title').value = 'Senior Program Manager'; $('edit-company').value = 'WeirdCo';
  $('edit-form').dispatchEvent(new w.Event('submit', { cancelable: true }));
  await until(() => $('job-company').textContent === 'WeirdCo', 'manual edit');
  ok('Highlighted text becomes the job; edit form opens to fill title/company');

  // back to Indeed job for people
  navigate('indeed');
  await until(() => $('job-company').textContent === 'Confido Health', 'back to indeed');

  // 9. Location picker + people
  w.document.querySelector('[data-tab="people"]').click();
  assert.ok(!$('loc-use-job').classList.contains('hidden') && $('loc-use-job').textContent.includes('Phoenix, AZ'));
  $('loc-use-job').click(); await sleep(50);
  assert.strictEqual(mem.settings.peopleLocation, 'Phoenix, AZ');
  w.document.querySelector('[data-search="recruiters"]').click(); await sleep(20);
  assert.ok(decodeURIComponent(created.at(-1)).includes('Confido Health recruiter Phoenix'), created.at(-1));
  ok('Location picker: "Use job\'s location" sets Phoenix; recruiter search includes Phoenix');

  navigate('people');
  await until(() => $('people-list').querySelectorAll('.person').length >= 3, 'people ranked');
  const names = [...$('people-list').querySelectorAll('.person-name')].map((a) => a.textContent);
  console.log('   ranked:', names.join(' > '), '|', $('loc-summary').textContent, '| tile:', tileVal('tile-people'));
  assert.ok(!names.includes('Lee Chen'), 'SF recruiter hidden');
  assert.deepStrictEqual(names.slice(0, 2).sort(), ['Raj Iyer', 'Sam Patel']);
  assert.strictEqual(names[2], 'Ana Ruiz');
  assert.ok($('people-list').textContent.includes('1 person outside Phoenix area hidden'));
  assert.strictEqual(tileVal('tile-people'), '2 nearby');
  ok('People: Phoenix-area first (Tempe, Greater Phoenix), Tucson next, SF hidden with "Show them"');
  [...$('people-list').querySelectorAll('.link-btn')].find((b) => b.textContent === 'Show them').click();
  await until(() => [...$('people-list').querySelectorAll('.person-name')].some((a) => a.textContent === 'Lee Chen'), 'show all');
  const last = [...$('people-list').querySelectorAll('.person-name')].map((a) => a.textContent).at(-1);
  assert.strictEqual(last, 'Lee Chen');
  ok('"Show them" reveals people elsewhere, ranked last');
  // Message drafts (AI, with key set earlier)
  const samCard = [...$('people-list').querySelectorAll('.person')].find((c) => c.textContent.includes('Sam Patel'));
  samCard.querySelector('.msg').click();
  await until(() => samCard.querySelector('.draft-text') && samCard.querySelector('.draft-text').value.startsWith('Hi Sam'), 'draft');
  const ob = fetchBodies.at(-1);
  assert.ok(ob.messages[0].content.includes('Write a casual LinkedIn DM to Sam Patel - Technical Recruiter at Confido Health'));
  assert.ok(ob.messages[0].content.includes('NO résumé flex') && ob.messages[0].content.includes('Tone: Humble, curious, human-to-human.'));
  assert.ok(ob.messages[0].content.includes('Tempe, Arizona'));
  assert.strictEqual(ob.output_config.format.schema.required.join(), 'connection_note,message,question');
  assert.ok(/\d+\/300/.test(samCard.querySelector('.count').textContent));
  ok('Write message: your DM template is filled (name, role, company, location) and sent with structured output');
  samCard.querySelector('.seg [data-k="message"]').click();
  assert.ok(samCard.querySelector('.draft-text').value.includes('Would love your take'));
  const ta = samCard.querySelector('.draft-text'); ta.value = 'x'.repeat(320); ta.dispatchEvent(new w.Event('input'));
  samCard.querySelector('.seg [data-k="connection_note"]').click();
  ta.value = 'y'.repeat(320); ta.dispatchEvent(new w.Event('input'));
  assert.ok(samCard.querySelector('.count').classList.contains('over'));
  ta.value = 'Hi Sam, edited by me. Curious what the team values most?'; ta.dispatchEvent(new w.Event('input'));
  samCard.querySelector('.copy').click(); await sleep(20);
  assert.strictEqual(clip.at(-1), 'Hi Sam, edited by me. Curious what the team values most?');
  const oc = mem.events.filter((e) => e.name === 'outreach_copied').at(-1).props;
  assert.ok(oc.edited && oc.format === 'connection_note' && oc.ai);
  ok('Drafts: switch note/message, edit text, 300-char counter turns red, copy logs whether you edited it');
  // No API key → free Pathfinder AI service (no key needed)
  $('set-apikey').value = ''; $('set-apikey').dispatchEvent(new w.Event('change')); await sleep(30);
  const rajCard = [...$('people-list').querySelectorAll('.person')].find((c) => c.textContent.includes('Raj Iyer'));
  const before = fetchBodies.length;
  rajCard.querySelector('.msg').click(); await sleep(60);
  const sent = fetchBodies.slice(before).at(-1);
  assert.ok(sent && sent.kind === 'outreach' && sent.installId && !sent.system && /Raj/.test(sent.user), 'sent to the free service with kind + installId only');
  assert.ok(rajCard.querySelector('.draft-text').value.startsWith('Hi '));
  ok('No key: message drafted through the free Pathfinder AI service (kind + install ID, no key)');
  $('loc-anywhere').click(); await sleep(60);
  assert.strictEqual(mem.settings.peopleLocation, '');
  ok('"Anywhere" clears the location filter');

  // 9b. Careers page: best matches for the resume
  navigate('careers'); await until(() => !$('match-card').classList.contains('hidden'), 'match card');
  assert.strictEqual($('match-count').textContent, '3 jobs on page');
  assert.ok(/Find my best matches/.test($('match-run').textContent));
  $('match-run').click();
  await until(() => $('match-list').querySelectorAll('.match-row').length > 0 || !$('match-note').classList.contains('hidden'), 'matches rendered');
  assert.strictEqual(careerFetches.length, 3);
  const rows = [...$('match-list').querySelectorAll('.match-row')];
  const firstTitle = rows[0].querySelector('.match-title').textContent;
  assert.ok(firstTitle.includes('Deployment Specialist'), firstTitle);
  assert.ok(rows[0].textContent.includes('Phoenix, AZ'));
  assert.ok(rows[0].querySelector('.match-title').getAttribute('href') === 'https://careers.confido.com/careers/jobs/1-deployment');
  // The JD says "without current or future sponsorship" + Confido sponsors (imported H-1B data) → ask first
  assert.ok(rows[0].textContent.includes('Sponsorship: ask first'), rows[0].textContent);
  $('match-filters').querySelector('[data-min="0"]').click(); await sleep(20);
  const all = [...$('match-list').querySelectorAll('.match-row')];
  assert.strictEqual(all.length, 3);
  assert.ok(all[2].querySelector('.match-score').textContent === 'n/a', 'unreadable job ranked last');
  const run = mem.events.filter((e) => e.name === 'career_matches_run').at(-1).props;
  assert.ok(run.read === 3 && run.scored === 2 && run.source === 'pages', JSON.stringify(run));
  console.log(`   scores: ${all.map((r) => r.querySelector('.match-score').textContent).join(', ')} | top: ${rows[0].querySelector('.match-score').textContent}`);
  ok('Careers page: card appears, reads 3 job pages, ranks the best fit first with a sponsorship check, filters work');

  // 10. Metrics
  const ev = mem.events.map((e) => e.name);
  for (const e of ['job_scanned', 'h1b_imported', 'resume_scored', 'suggestion_copied', 'job_edited', 'permission_all_sites', 'job_captured_manually', 'location_set', 'people_search_opened', 'people_scanned']) assert.ok(ev.includes(e), 'missing ' + e);
  const sites = mem.events.filter((e) => e.name === 'job_scanned').map((e) => e.props.site);
  assert.ok(sites.includes('Indeed'));
  w.document.querySelector('[data-tab="settings"]').click(); await sleep(50);
  assert.strictEqual($('metrics-summary').querySelectorAll('.metric').length, 6);
  ok('Metrics log site, manual captures, location and permission events; settings shows 6 metric tiles');

  assert.deepStrictEqual(errors, []);
  ok('No runtime errors');
  console.log(`\n${n} panel tests passed`);
  process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
