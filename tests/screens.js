// Renders the real side panel in Chromium with a fake extension environment, for visual review.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
const EXT = path.resolve('pathfinder');
const JOB = {
  site: 'Indeed', key: 'Indeed:abc', jobId: 'abc', url: 'https://www.indeed.com/viewjob?jk=abc',
  title: 'Product Deployment Specialist', company: 'Confido', location: 'Phoenix, AZ', companyUrl: '',
  description: 'Lead implementation and onboarding for enterprise SaaS customers. Responsibilities: own deployments, partner with stakeholders. Qualifications: 3+ years of experience with SQL, Excel, Salesforce, Jira and Agile. Candidates must be authorized to work in the US without the need for current or future sponsorship.',
  hiringTeam: [], isJob: true, confidence: 7,
};
const H1B = { 'h1b:co': { confido: { n: 'CONFIDO INC', y: { 2022: [6, 9, 1], 2023: [8, 11, 0], 2024: [12, 20, 1], 2025: [15, 26, 1] } } }, h1bMeta: { years: [2022, 2023, 2024, 2025] } };
const RESUME = { name: 'roopha_resume.pdf', text: 'Roopha\nManaged rollout of internal tools to operations teams\nBuilt SQL and Excel dashboards for 5 cross-functional stakeholders, cutting reporting time by 40%\nRan Agile sprints in Jira for a 10-person team\nLed implementation of trust and safety tooling for 12 teams' };
const PEOPLE = [
  { name: 'Sam Patel', slug: 'sam', profileUrl: '#', headline: 'Technical Recruiter at Confido', location: 'Tempe, Arizona', source: 'people_search', postedDaysAgo: null, postText: '', degree: '2nd' },
  { name: 'Raj Iyer', slug: 'raj', profileUrl: '#', headline: 'Deployment Lead at Confido · ASU alum', location: 'Greater Phoenix Area', source: 'people_search', postedDaysAgo: 4, postText: "We're hiring on my team", degree: '3rd' },
  { name: 'Ana Ruiz', slug: 'ana', profileUrl: '#', headline: 'Implementation Manager at Confido', location: 'Tucson, Arizona', source: 'people_search', postedDaysAgo: null, postText: '', degree: '' },
  { name: 'Lee Chen', slug: 'lee', profileUrl: '#', headline: 'Senior Recruiter at Confido', location: 'San Francisco Bay Area', source: 'people_search', postedDaysAgo: null, postText: '', degree: '' },
];
const AI = { fit_summary: 'Solid fit on implementation and stakeholder work; light on Salesforce.', edits: [
  { section: 'Experience — Uber', original: 'Managed rollout of internal tools to operations teams', revised: 'Led implementation and onboarding of internal SaaS tools for [N] operations teams, partnering with cross-functional stakeholders', why: 'Mirrors the "implementation" and "stakeholder management" requirements', keywords_added: ['implementation', 'stakeholder management'], needs_input: 'number of teams' },
  { section: 'Experience — Uber', original: 'Built SQL and Excel dashboards for 5 cross-functional stakeholders, cutting reporting time by 40%', revised: 'Built SQL and Excel deployment dashboards for 5 cross-functional stakeholders, cutting reporting time by 40%', why: 'Ties your reporting work to deployments', keywords_added: ['SQL', 'Excel'], needs_input: '' }],
  summary_line: { original: '', revised: '' }, gaps: [{ keyword: 'Salesforce', advice: 'Mention any CRM work in your cover letter.' }] };

(async () => {
  const browser = await chromium.launch();
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 380, height: 1100 }, colorScheme: scheme, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.addInitScript(({ JOB, H1B, RESUME, PEOPLE, AI }) => {
      const mem = { activeJob: JOB, resume: RESUME, settings: { peopleLocation: 'Phoenix, AZ', school: 'ASU', apiKey: 'x' }, 'people:confido': PEOPLE, ...H1B,
        jobs: { a: { verdictLevel: 'stop' }, b: { verdictLevel: 'go' }, 'Indeed:abc': { verdictLevel: 'caution' } } };
      const clone = (x) => JSON.parse(JSON.stringify(x));
      window.chrome = {
        storage: { local: {
          get: async (k) => { if (k == null) return clone(mem); const o = {}; [].concat(k).forEach((x) => { if (x in mem) o[x] = clone(mem[x]); }); return o; },
          set: async (o) => Object.assign(mem, clone(o)), remove: async (k) => delete mem[k], clear: async () => {},
        } },
        tabs: { query: async () => [{ id: 1, url: 'chrome://newtab' }], create: async () => {}, onUpdated: { addListener() {} }, onActivated: { addListener() {} } },
        scripting: { executeScript: async () => [] },
        permissions: { contains: async () => false, request: async () => true },
        runtime: { getURL: (p) => p },
      };
      window.__AI = AI;
      window.fetch = async (u, o) => /LinkedIn outreach/.test(JSON.parse(o.body).system)
        ? ({ ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify({ connection_note: "Hi Raj, saw your post about the deployment team hiring here in Phoenix! I'm looking at the Product Deployment Specialist role. Curious: what do new folks on your team usually find hardest in the first few months?", message: 'Hi Raj, I saw your post about the deployment team growing.', question: 'What do new folks find hardest in the first few months?' }) }], usage: {} }) })
        : ({ ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(AI) }], usage: {} }) });
    }, { JOB, H1B, RESUME, PEOPLE, AI });
    await page.goto('file://' + EXT + '/sidepanel.html');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `shots/${scheme}-job.png`, fullPage: true });
    await page.click('[data-tab="resume"]');
    await page.click('#ai-run'); await page.waitForTimeout(400);
    await page.screenshot({ path: `shots/${scheme}-resume.png`, fullPage: true });
    await page.click('[data-tab="people"]'); await page.waitForTimeout(300);
    await page.click('.person .msg'); await page.waitForTimeout(400);
    await page.screenshot({ path: `shots/${scheme}-people.png`, fullPage: true });
    await page.click('[data-tab="settings"]'); await page.waitForTimeout(300);
    await page.screenshot({ path: `shots/${scheme}-settings.png`, fullPage: true });
    // empty state
    await page.evaluate(() => chrome.storage.local.set({ activeJob: null }));
    await page.reload(); await page.waitForTimeout(500);
    await page.evaluate(() => { window.chrome.storage.local.get('x'); });
    await ctx.close();
  }
  // empty state separately
  const ctx = await browser.newContext({ viewport: { width: 380, height: 760 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.chrome = { storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {}, clear: async () => {} } },
      tabs: { query: async () => [{ id: 1, url: 'chrome://newtab' }], create: async () => {}, onUpdated: { addListener() {} }, onActivated: { addListener() {} } },
      scripting: { executeScript: async () => [] }, permissions: { contains: async () => false, request: async () => true }, runtime: { getURL: (p) => p } };
  });
  await page.goto('file://' + EXT + '/sidepanel.html'); await page.waitForTimeout(500);
  await page.screenshot({ path: 'shots/light-empty.png', fullPage: true });
  await browser.close();
  console.log('ok');
})().catch((e) => { console.error(e); process.exit(1); });
