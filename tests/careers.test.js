// Career-page matching: finding job links, ATS boards, reading pages, scoring.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const EXT = path.join(__dirname, '..', 'pathfinder');
let passed = 0;
const eq = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b);
const ok = (m) => { passed++; console.log('✓ ' + m); };

function page(html, url) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  for (const f of ['sponsorship.js', 'resume.js', 'verdict.js', 'careers.js']) dom.window.eval(fs.readFileSync(path.join(EXT, f), 'utf8'));
  return dom.window;
}

const RESUME = `Priya Sharma
Operations Analyst
Experience
Acme Corp — Operations Analyst, Jan 2022 – Present
- Led implementation of SaaS onboarding for 14 enterprise customers, cutting time-to-value by 30%
- Built SQL dashboards in Tableau tracking KPIs for customer success and operations teams
- Managed stakeholder communication and project management across 5 cross-functional teams
- Automated reporting with Python, saving 10 hours a week
Skills: SQL, Python, Tableau, Excel, project management, stakeholder management, implementation, onboarding, SaaS, customer success`;

const JD_GOOD = `We're hiring an Implementation Analyst. You will own SaaS implementation and onboarding for enterprise customers.
Requirements: SQL, Python, Tableau, project management, stakeholder management, customer success experience.
You'll partner with operations teams and track KPIs. Excel skills a plus. We sponsor H-1B visas for this role.
`.repeat(2);
const JD_BAD = `Senior Mechanical Engineer. Required: SolidWorks, GD&T, finite element analysis, thermal design, CAD, manufacturing,
injection molding, tolerance stack-up. Must be a U.S. citizen required due to export controls. No visa sponsorship is available.
`.repeat(2);

(async () => {
  // 1. Generic careers page
  let w = page(`<html><head><title>Careers | Confido</title></head><body>
    <nav><a href="/careers/">Careers</a><a href="/jobs/">All jobs</a><a href="/about">About</a></nav>
    <ul>
      <li class="job-row"><a href="/careers/jobs/101-implementation-analyst"><h3>Implementation Analyst</h3></a><span class="job-location">Phoenix, AZ</span></li>
      <li class="job-row"><a href="/careers/jobs/102-mech-eng"><h3>Senior Mechanical Engineer</h3></a><span class="job-location">Austin, TX</span></li>
      <li class="job-row"><a href="/careers/jobs/103-data">Data Analyst<br>Remote</a></li>
      <li class="job-row"><a href="/careers/jobs/104-sales">Account Executive</a></li>
      <li><a href="/careers/jobs/104-sales">Account Executive</a></li>
      <li><a href="/careers/jobs/benefits">Benefits</a></li>
      <li><a href="/careers/jobs/105#apply">Apply now</a></li>
    </ul></body></html>`, 'https://www.confido.com/careers/');
  let L = w.findJobListings();
  assert.strictEqual(L.ats, null);
  eq(L.links.map((l) => l.title), ['Implementation Analyst', 'Senior Mechanical Engineer', 'Data Analyst', 'Account Executive']);
  assert.strictEqual(L.links[0].location, 'Phoenix, AZ');
  assert.strictEqual(L.links[0].url, 'https://www.confido.com/careers/jobs/101-implementation-analyst');
  ok('Careers page: finds 4 job links with locations; skips nav, duplicates, "Benefits", "Apply now"');

  // 1b. "Apply Now" buttons inside accordions / cards (title is in the header above), Workday job links
  w = page(`<html><head><title>Careers | ASU EdPlus</title></head><body><h2>Explore open positions</h2>
    <div class="accordion">
      <div class="accordion-item"><div class="accordion-header"><h3><button aria-expanded="false">Communications Specialist <svg></svg></button></h3></div>
        <div class="accordion-body"><p>Write things.</p><h4>Minimum qualifications</h4><p>BA</p>
          <a class="btn" href="https://asu.wd1.myworkdayjobs.com/en-US/ASUStaffCareers/job/Communications-Specialist_JR1">Apply Now</a></div></div>
      <div class="accordion-item"><div class="accordion-header"><h3><button aria-expanded="false">EdTech Innovation Fellow</button></h3></div>
        <div class="accordion-body"><h4>Job description</h4><p>Build pilots.</p>
          <a class="btn" href="https://asu.wd1.myworkdayjobs.com/en-US/ASUStaffCareers/job/EdTech-Innovation-Fellow_JR2">Apply Now</a></div></div>
    </div>
    <div class="card"><h3 class="card-title">Salesforce Administrator Senior</h3><p>Tempe, AZ</p><a href="/careers/jobs/77">View job</a></div>
  </body></html>`, 'https://edplus.asu.edu/careers/');
  const LA = w.findJobListings();
  const bare = page(`<body><p>Join us</p><a href="https://asu.wd1.myworkdayjobs.com/en-US/ASUStaffCareers/job/EdTech-Innovation-Fellow_JR128580">Apply Now</a><a href="https://asu.wd1.myworkdayjobs.com/en-US/ASUStaffCareers/job/Learning-Assessment-Lead_JR128216-1">Apply Now</a></body>`, 'https://edplus.asu.edu/x').findJobListings();
  eq(bare.links.map((l) => l.title), ['EdTech Innovation Fellow', 'Learning Assessment Lead']);
  eq(LA.links.map((l) => l.title), ['Communications Specialist', 'EdTech Innovation Fellow', 'Salesforce Administrator Senior']);
  assert.strictEqual(w.workdayJobApi(LA.links[0].url), 'https://asu.wd1.myworkdayjobs.com/wday/cxs/asu/ASUStaffCareers/job/Communications-Specialist_JR1');
  assert.strictEqual(w.workdayJobApi('https://wd5.myworkdaysite.com/en-US/recruiting/acme/Ext/job/Austin/Eng_R9'), 'https://wd5.myworkdaysite.com/wday/cxs/acme/Ext/job/Austin/Eng_R9');
  assert.strictEqual(w.workdayJobApi('https://asu.wd1.myworkdayjobs.com/en-US/ASUStaffCareers'), null);
  const wdCalls = [];
  const asu = await w.collectJobs({ ...LA, links: LA.links.slice(0, 2) }, { fallbackCompany: 'Arizona State University', fetchFn: async (url) => {
    wdCalls.push(url);
    return { ok: true, status: 200, json: async () => ({ jobPostingInfo: { title: 'Communications Specialist', location: 'Tempe, AZ', jobDescription: '<p>' + 'Write and edit. '.repeat(30) + '</p>' } }) };
  } });
  assert.ok(wdCalls.every((u) => u.includes('/wday/cxs/asu/ASUStaffCareers/job/')));
  assert.ok(asu.jobs[0].text.startsWith('Write and edit.') && asu.jobs[0].text.length > 300);
  assert.ok(LA.links[0].inlineText.includes('Write things.'), 'keeps the on-page text as a fallback');
  assert.strictEqual(asu.jobs[0].location, 'Tempe, AZ');
  ok('"Apply Now" links take their title from the accordion/card header; Workday job links read via Workday\'s API');

  // 2. ATS detection
  w = page(`<body><iframe src="https://boards.greenhouse.io/embed/job_board?for=acmeco&b=https%3A%2F%2Facme.com"></iframe></body>`, 'https://acme.com/careers');
  eq(w.findJobListings().ats, { type: 'greenhouse', slug: 'acmeco' });
  w = page('<body></body>', 'https://job-boards.greenhouse.io/figma');
  eq(w.findJobListings().ats, { type: 'greenhouse', slug: 'figma' });
  w = page('<body></body>', 'https://jobs.lever.co/plaid');
  eq(w.findJobListings().ats, { type: 'lever', slug: 'plaid' });
  w = page('<body></body>', 'https://jobs.ashbyhq.com/notion');
  eq(w.findJobListings().ats, { type: 'ashby', slug: 'notion' });
  w = page('<body></body>', 'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite');
  eq(w.findJobListings().ats, { type: 'workday', host: 'nvidia.wd5.myworkdayjobs.com', tenant: 'nvidia', site: 'NVIDIAExternalCareerSite' });
  w = page('<body><div class="card">Director, FP&amp;A</div></body>', 'https://careers.bigco.com/');
  w.performance.getEntriesByType = () => [{ name: 'https://bigco.wd1.myworkdayjobs.com/wday/cxs/bigco/External/jobs' }, { name: 'https://cdn.x.com/a.js' }];
  eq(w.findJobListings().ats, { type: 'workday', host: 'bigco.wd1.myworkdayjobs.com', tenant: 'bigco', site: 'External' });
  w.performance.getEntriesByType = () => [{ name: 'https://api.smartrecruiters.com/v1/companies/BigCo1/postings?offset=0' }];
  eq(w.findJobListings().ats, { type: 'smartrecruiters', slug: 'BigCo1' });
  w = page('<body><div>Director, FP&amp;A</div></body>', 'https://explore.jobs.netflix.net/careers?domain=netflix.com&sort_by=relevance&jobIndex=3&job_index=3&query=analyst');
  eq(w.findJobListings().ats, { type: 'eightfold', host: 'explore.jobs.netflix.net', domain: 'netflix.com', params: { sort_by: 'relevance', query: 'analyst' } });
  const efCalls = [];
  const ef = await w.loadAtsJobs({ type: 'eightfold', host: 'explore.jobs.netflix.net', domain: 'netflix.com', params: { query: 'analyst' } }, { fetchFn: async (url) => {
    efCalls.push(url);
    const body = /v2\/jobs\?/.test(url)
      ? { count: 12, positions: (url.includes('start=0') ? [...Array(10)] : [...Array(2)]).map((_, i) => ({ id: (url.includes('start=0') ? 0 : 10) + i, name: 'Role ' + i, location: 'Los Gatos, CA', job_description: '', canonicalPositionUrl: 'https://explore.jobs.netflix.net/careers/job/' + i })) }
      : { name: 'Role X', job_description: '<p>At Netflix we entertain the world.</p>' };
    return { ok: true, status: 200, json: async () => body };
  } });
  assert.strictEqual(ef.length, 12);
  assert.strictEqual(ef.total, 12);
  assert.strictEqual(ef[0].company, 'Netflix');
  assert.strictEqual(ef[0].text, 'At Netflix we entertain the world.');
  assert.ok(efCalls[0].includes('query=analyst') && efCalls[0].includes('domain=netflix.com') && efCalls.some((u) => /v2\/jobs\/\d+\?domain=netflix.com/.test(u)));
  w = page('<body><a href="/jobs/view/123">Analyst</a></body>', 'https://www.linkedin.com/jobs/search/');
  assert.ok(w.findJobListings().board);
  eq(w.atsFromLinks([{ url: 'https://jobs.lever.co/acme/0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b' }]), { type: 'lever', slug: 'acme' });
  ok('Detects Greenhouse (embedded + hosted), Lever, Ashby, Workday; skips job boards like LinkedIn');

  // 3. Reading a fetched job page (JSON-LD with escaped HTML)
  const ld = { '@context': 'https://schema.org', '@type': 'JobPosting', title: 'Implementation Analyst', hiringOrganization: { name: 'Confido Inc' },
    jobLocation: { address: { addressLocality: 'Phoenix', addressRegion: 'AZ' } }, description: '&lt;p&gt;Own &lt;b&gt;SaaS implementation&lt;/b&gt;.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;SQL&lt;/li&gt;&lt;li&gt;Python&lt;/li&gt;&lt;/ul&gt;' };
  const p = w.parseJobHtml(`<html><head><script type="application/ld+json">${JSON.stringify({ '@graph': [ld] })}</script></head><body>x</body></html>`, 'https://x.com/j/1');
  assert.strictEqual(p.title, 'Implementation Analyst');
  assert.strictEqual(p.company, 'Confido Inc');
  assert.strictEqual(p.location, 'Phoenix, AZ');
  assert.ok(/Own SaaS implementation\.\n/.test(p.text) && p.text.includes('• SQL') && !p.text.includes('<'), p.text);
  const p2 = w.parseJobHtml('<html><body><nav>Menu</nav><main><h1>Data Analyst</h1><p>Build dashboards.</p><footer>©</footer></main></body></html>');
  assert.strictEqual(p2.title, 'Data Analyst');
  assert.ok(p2.text.includes('Build dashboards.') && !p2.text.includes('Menu') && !p2.text.includes('©'));
  ok('Job pages: JSON-LD (incl. @graph, escaped HTML) and plain HTML both read cleanly');

  // 4. ATS APIs
  const calls = [];
  const fake = (routes) => async (url, opts) => {
    calls.push({ url, opts });
    const hit = Object.entries(routes).find(([k]) => url.includes(k));
    if (!hit) return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
    const body = typeof hit[1] === 'function' ? hit[1](url, opts) : hit[1];
    return { ok: true, status: 200, json: async () => body, text: async () => body };
  };
  let jobs = await w.loadAtsJobs({ type: 'greenhouse', slug: 'acme' }, { fetchFn: fake({
    '/jobs?content=true': { jobs: [{ title: 'Implementation Analyst', location: { name: 'Phoenix, AZ' }, absolute_url: 'https://boards.greenhouse.io/acme/jobs/1', content: '&lt;p&gt;SQL and Python&lt;/p&gt;' }] },
    'boards/acme': { name: 'Acme Co' } }) });
  eq(jobs[0], { title: 'Implementation Analyst', location: 'Phoenix, AZ', url: 'https://boards.greenhouse.io/acme/jobs/1', company: 'Acme Co', text: 'SQL and Python' });
  jobs = await w.loadAtsJobs({ type: 'lever', slug: 'acme-labs' }, { fetchFn: fake({ 'api.lever.co/v0/postings/acme-labs': [
    { text: 'Ops Analyst', categories: { location: 'Remote' }, hostedUrl: 'https://jobs.lever.co/acme-labs/1', descriptionPlain: 'About the role.', lists: [{ text: 'Requirements', content: '<li>SQL</li><li>Tableau</li>' }], additionalPlain: 'We sponsor visas.' }] }) });
  assert.strictEqual(jobs[0].company, 'Acme Labs');
  assert.ok(jobs[0].text.includes('Requirements\n• SQL') && jobs[0].text.includes('We sponsor visas.'));
  jobs = await w.loadAtsJobs({ type: 'ashby', slug: 'notion' }, { fetchFn: fake({ 'posting-api/job-board/notion': { jobs: [
    { title: 'PM', location: 'NYC', isRemote: false, jobUrl: 'https://jobs.ashbyhq.com/notion/1', descriptionPlain: 'Ship things.' }, { title: 'Hidden', isListed: false }] } }) });
  eq(jobs.map((j) => j.title), ['PM']);
  calls.length = 0;
  jobs = await w.loadAtsJobs({ type: 'workday', host: 'acme.wd1.myworkdayjobs.com', tenant: 'acme', site: 'Careers' }, { fetchFn: fake({
    '/wday/cxs/acme/Careers/jobs': { total: 2, jobPostings: [{ title: 'Analyst', externalPath: '/job/Phoenix/Analyst_R1', locationsText: 'Phoenix, AZ' }, { title: 'Engineer', externalPath: '/job/Austin/Engineer_R2', locationsText: 'Austin' }] },
    '/job/Phoenix/Analyst_R1': { jobPostingInfo: { title: 'Analyst', jobDescription: '<p>SQL</p>', externalUrl: 'https://acme.wd1.myworkdayjobs.com/Careers/job/Phoenix/Analyst_R1', location: 'Phoenix, AZ' }, hiringOrganization: { name: 'Acme Inc' } },
    '/job/Austin/Engineer_R2': { jobPostingInfo: { title: 'Engineer', jobDescription: '<p>CAD</p>' } } }) });
  assert.strictEqual(jobs.length, 2);
  assert.strictEqual(jobs[0].company, 'Acme Inc');
  assert.strictEqual(calls[0].opts.method, 'POST');
  assert.ok(JSON.parse(calls[0].opts.body).limit === 20);
  ok('Reads whole boards in one go: Greenhouse, Lever, Ashby, Workday (list + details)');

  // 5. Generic pages: polite parallel reading, then ranking
  let active = 0, peak = 0;
  const pages = {
    '101': `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title: 'Implementation Analyst', hiringOrganization: { name: 'Confido' }, description: JD_GOOD })}</script>`,
    '102': `<main><h1>Senior Mechanical Engineer</h1><p>${JD_BAD}</p></main>`,
    '103': '<main><h1>Data Analyst</h1><p>Loading…</p></main>',
    '104': `<main><h1>Account Executive</h1><p>${'Sell enterprise software. Quota, pipeline, Salesforce, negotiation, cold calling. '.repeat(6)}</p></main>`,
  };
  const slowFetch = async (url) => {
    active++; peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 20));
    active--;
    const id = url.match(/jobs\/(\d+)/)[1];
    return { ok: true, status: 200, text: async () => `<html><body>${pages[id]}</body></html>` };
  };
  const progress = [];
  const got = await w.collectJobs(L, { fetchFn: slowFetch, onProgress: (d, t) => progress.push(`${d}/${t}`), fallbackCompany: 'Confido' });
  assert.strictEqual(got.jobs.length, 4);
  assert.ok(peak <= 3, 'at most 3 pages at a time, got ' + peak);
  assert.strictEqual(progress.at(-1), '4/4');
  const ranked = w.rankJobs(got.jobs, RESUME);
  assert.strictEqual(ranked[0].title, 'Implementation Analyst');
  assert.ok(ranked[0].score >= 75, 'strong match, got ' + ranked[0].score);
  assert.strictEqual(ranked[0].sponsor.status, 'positive');
  const mech = ranked.find((j) => j.title.startsWith('Senior Mechanical'));
  assert.ok(mech.score < 40 && mech.sponsor.status === 'negative', JSON.stringify({ s: mech.score, sp: mech.sponsor.status }));
  const unreadable = ranked.find((j) => j.title === 'Data Analyst');
  assert.ok(!unreadable.readable && unreadable.score === null && ranked.at(-1) === unreadable);
  eq(w.linkOrigins(L.links), ['https://www.confido.com/*']);
  console.log(`   ranked: ${ranked.map((j) => `${j.title} ${j.score ?? 'n/a'}`).join(' | ')}`);
  ok('Reads job pages 3 at a time, ranks by resume match (75%+ on top), flags "no sponsorship", unreadable pages last');

  console.log(`\n${passed} career-page tests passed`);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
