// Generates the README visuals (banner, demo GIF, screenshots) from the real side panel.
// Run: node tests/visuals.js  → writes to repo/docs/
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
const fs = require('fs');
const EXT = path.resolve('pathfinder');
const OUT = path.resolve('repo/docs');
const FONT_DIR = path.resolve('deps/node_modules/@fontsource/inter/files');
fs.mkdirSync(OUT + '/screenshots', { recursive: true });
fs.mkdirSync(OUT + '/frames', { recursive: true });

const FONT_CSS = [400, 600, 700, 800].map((w) => `@font-face{font-family:Inter;font-weight:${w};src:url(file://${FONT_DIR}/inter-latin-${w}-normal.woff2) format('woff2')}`).join('');

const JOB = {
  site: 'LinkedIn', key: 'LinkedIn:1', jobId: '1', url: 'https://www.linkedin.com/jobs/view/1/',
  title: 'Product Deployment Specialist', company: 'Confido', location: 'Phoenix, AZ', companyUrl: 'https://www.linkedin.com/company/confido/',
  description: 'Lead implementation and onboarding for enterprise SaaS customers. Responsibilities: own customer deployments end to end, partner with stakeholders across product and engineering. Qualifications: 3+ years of experience with SQL, Excel, Salesforce, Jira and Agile delivery; strong stakeholder management. Candidates must be authorized to work in the US without the need for current or future sponsorship.',
  hiringTeam: [], isJob: true, confidence: 7,
};
const H1B = { 'h1b:co': { confido: { n: 'CONFIDO INC', y: { 2022: [6, 9, 1], 2023: [8, 11, 0], 2024: [12, 20, 1], 2025: [15, 26, 1] } } }, h1bMeta: { years: [2022, 2023, 2024, 2025] } };
const RESUME = { name: 'resume.pdf', text: 'Alex Kumar\nManaged rollout of internal tools to operations teams\nBuilt SQL and Excel dashboards for 5 cross-functional stakeholders, cutting reporting time by 40%\nRan Agile sprints in Jira for a 10-person team\nLed implementation of trust and safety tooling for 12 teams\nPartnered with product managers on requirements for enterprise customers' };
const PEOPLE = [
  { name: 'Raj Iyer', slug: 'raj', profileUrl: '#', headline: 'Deployment Lead at Confido · ASU alum', location: 'Greater Phoenix Area', source: 'people_search', postedDaysAgo: 4, postText: "We're hiring on my team", degree: '3rd' },
  { name: 'Sam Patel', slug: 'sam', profileUrl: '#', headline: 'Technical Recruiter at Confido', location: 'Tempe, Arizona', source: 'people_search', postedDaysAgo: null, postText: '', degree: '2nd' },
  { name: 'Ana Ruiz', slug: 'ana', profileUrl: '#', headline: 'Implementation Manager at Confido', location: 'Tucson, Arizona', source: 'people_search', postedDaysAgo: null, postText: '', degree: '' },
  { name: 'Lee Chen', slug: 'lee', profileUrl: '#', headline: 'Senior Recruiter at Confido', location: 'San Francisco Bay Area', source: 'people_search', postedDaysAgo: null, postText: '', degree: '' },
];
const AI = { fit_summary: 'Solid fit on implementation and stakeholder work; light on Salesforce.', edits: [
  { section: 'Experience', original: 'Managed rollout of internal tools to operations teams', revised: 'Led implementation and onboarding of internal SaaS tools for [N] operations teams, partnering with cross-functional stakeholders', why: 'Mirrors the "implementation" and "stakeholder management" requirements', keywords_added: ['implementation', 'stakeholder management'], needs_input: 'number of teams' },
  { section: 'Experience', original: 'Built SQL and Excel dashboards for 5 cross-functional stakeholders, cutting reporting time by 40%', revised: 'Built SQL and Excel deployment dashboards for 5 cross-functional stakeholders, cutting reporting time by 40%', why: 'Ties your reporting work to customer deployments', keywords_added: ['SQL', 'Excel'], needs_input: '' }],
  summary_line: { original: '', revised: '' }, gaps: [{ keyword: 'Salesforce', advice: 'Mention any CRM work in your cover letter.' }] };
const DM = { connection_note: "Hi Raj, saw your post about the deployment team hiring here in Phoenix! I'm looking at the Product Deployment Specialist role. Curious: what do new folks on your team usually find hardest in the first few months?", message: "Hi Raj, I saw your post about the deployment team growing and it caught my eye since I'm also in Phoenix. I'm looking at the Product Deployment Specialist role. I've spent the last few years rolling out tools to ops teams, so I'm curious: what do new folks on your team find hardest in the first few months? Thanks either way!", question: 'What do new folks find hardest in the first few months?' };

async function panelPage(browser, scheme, height = 1000) {
  const ctx = await browser.newContext({ viewport: { width: 400, height }, colorScheme: scheme, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.addInitScript(({ JOB, H1B, RESUME, PEOPLE, AI, DM }) => {
    const mem = { activeJob: JOB, resume: RESUME, settings: { peopleLocation: 'Phoenix, AZ', school: 'ASU', apiKey: 'x' }, 'people:confido': PEOPLE, ...H1B,
      jobs: { a: { verdictLevel: 'stop' }, b: { verdictLevel: 'stop' }, c: { verdictLevel: 'go' }, 'LinkedIn:1': { verdictLevel: 'caution' } } };
    const clone = (x) => JSON.parse(JSON.stringify(x));
    window.chrome = {
      storage: { local: {
        get: async (k) => { if (k == null) return clone(mem); const o = {}; [].concat(k).forEach((x) => { if (x in mem) o[x] = clone(mem[x]); }); return o; },
        set: async (o) => Object.assign(mem, clone(o)), remove: async (k) => delete mem[k], clear: async () => {},
      } },
      tabs: { query: async () => [{ id: 1, url: 'https://www.linkedin.com/jobs/view/1/' }], create: async () => {}, onUpdated: { addListener() {} }, onActivated: { addListener() {} } },
      scripting: { executeScript: async () => [{ result: { ...JOB, isTopFrame: true, selection: '' } }] },
      permissions: { contains: async () => true, request: async () => true },
      runtime: { getURL: (p) => p },
    };
    window.fetch = async (u, o) => {
      await new Promise((r) => setTimeout(r, 300));
      const isDM = /LinkedIn outreach/.test(JSON.parse(o.body).system);
      return { ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(isDM ? DM : AI) }], usage: {} }) };
    };
  }, { JOB, H1B, RESUME, PEOPLE, AI, DM });
  await page.goto('file://' + EXT + '/sidepanel.html');
  await page.addStyleTag({ content: FONT_CSS });
  await page.waitForTimeout(900);
  return { page, ctx };
}

async function main() {
  const browser = await chromium.launch();

  // ---------- Full screenshots, light + dark ----------
  for (const scheme of ['light', 'dark']) {
    const { page, ctx } = await panelPage(browser, scheme);
    await page.screenshot({ path: `${OUT}/screenshots/${scheme}-job.png`, fullPage: true });
    await page.click('[data-tab="resume"]'); await page.click('#ai-run'); await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/screenshots/${scheme}-resume.png`, fullPage: true });
    await page.click('[data-tab="people"]'); await page.waitForTimeout(300);
    await page.click('.person .msg'); await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/screenshots/${scheme}-people.png`, fullPage: true });
    await page.click('[data-tab="settings"]'); await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/screenshots/${scheme}-settings.png`, fullPage: true });
    await ctx.close();
  }

  // ---------- Feature close-ups (light) ----------
  {
    const { page, ctx } = await panelPage(browser, 'light', 1400);
    const shot = async (sel, name) => { const el = await page.$(sel); await el.screenshot({ path: `${OUT}/screenshots/${name}.png` }); };
    await shot('#verdict-card', 'feature-verdict');
    await shot('#h1b-body', 'feature-h1b');
    await shot('.tiles', 'feature-tiles');
    await page.click('[data-tab="resume"]'); await page.click('#ai-run'); await page.waitForTimeout(700);
    await shot('.score-card', 'feature-score');
    await shot('#ai-results .edit', 'feature-edit');
    await page.click('[data-tab="people"]'); await page.waitForTimeout(300);
    await shot('.loc-card', 'feature-location');
    await page.click('.person .msg'); await page.waitForTimeout(700);
    await shot('.person', 'feature-message');
    await ctx.close();
  }

  // ---------- Demo frames (viewport-sized) ----------
  {
    const { page, ctx } = await panelPage(browser, 'light', 720);
    let n = 0;
    const frame = async (hold = 1) => { for (let i = 0; i < hold; i++) await page.screenshot({ path: `${OUT}/frames/${String(n++).padStart(3, '0')}.png` }); };
    await frame(3);
    for (let y = 120; y <= 600; y += 120) { await page.evaluate((y) => window.scrollTo(0, y), y); await page.waitForTimeout(60); await frame(); }
    await frame(2);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.click('[data-tab="resume"]'); await page.waitForTimeout(200); await frame(2);
    await page.click('#ai-run'); await page.waitForTimeout(80); await frame(1); await page.waitForTimeout(700); await frame(1);
    for (let y = 150; y <= 450; y += 150) { await page.evaluate((y) => window.scrollTo(0, y), y); await page.waitForTimeout(60); await frame(); }
    await frame(2);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.click('[data-tab="people"]'); await page.waitForTimeout(250); await frame(2);
    for (let y = 200; y <= 560; y += 180) { await page.evaluate((y) => window.scrollTo(0, y), y); await page.waitForTimeout(60); await frame(); }
    await page.click('.person .msg'); await page.waitForTimeout(80); await frame(1); await page.waitForTimeout(700);
    await page.evaluate(() => document.querySelector('.draft').scrollIntoView({ block: 'center' })); await page.waitForTimeout(80);
    await frame(4);
    await ctx.close();
    console.log('frames', n);
  }

  // ---------- Banner ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 760 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const img = (f) => 'file://' + OUT + '/screenshots/' + f;
    const html = (`<!doctype html><html><head><style>${FONT_CSS}
      *{box-sizing:border-box;margin:0}
      body{width:1600px;height:760px;font-family:Inter,sans-serif;overflow:hidden;
        background:radial-gradient(1200px 600px at 85% 20%,#e0e3ff 0%,transparent 60%),linear-gradient(135deg,#f7f8fc 0%,#eef0fb 100%);color:#0f1729;position:relative}
      .left{position:absolute;left:96px;top:120px;width:640px}
      .logo{display:flex;align-items:center;gap:16px;font-size:30px;font-weight:800;letter-spacing:-.02em}
      .logo img{width:60px;height:60px}
      h1{font-size:62px;line-height:1.06;font-weight:800;letter-spacing:-.035em;margin-top:44px}
      h1 span{color:#4f46e5}
      p{font-size:22px;line-height:1.5;color:#3d4a63;margin-top:22px;max-width:560px}
      .pills{display:flex;gap:10px;margin-top:34px;flex-wrap:wrap}
      .pill{font-size:16px;font-weight:600;padding:9px 16px;border-radius:999px;background:#fff;border:1px solid #dfe3ef;color:#3d4a63;box-shadow:0 1px 2px rgba(16,24,40,.05)}
      .pill b{color:#4f46e5}
      .shot{position:absolute;width:350px;border-radius:22px;overflow:hidden;box-shadow:0 30px 60px rgba(30,27,75,.22),0 6px 16px rgba(30,27,75,.1);border:1px solid rgba(15,23,41,.08)}
      .shot img{display:block;width:100%}
      .s1{left:800px;top:70px;height:640px} .s2{left:1180px;top:130px;height:600px}
      .s1 img,.s2 img{object-fit:cover;object-position:top}
    </style></head><body>
      <div class="left">
        <div class="logo"><img src="file://${EXT}/icons/icon128.png">Pathfinder</div>
        <h1>Stop applying to jobs that <span>can't hire you.</span></h1>
        <p>A Chrome extension for international job seekers. Sponsorship check, resume fit, and the right people to message, on any job posting.</p>
        <div class="pills"><span class="pill"><b>H-1B</b> history</span><span class="pill"><b>AI</b> resume edits</span><span class="pill"><b>Local</b> contacts</span><span class="pill"><b>Private</b> by design</span></div>
      </div>
      <div class="shot s1"><img src="${img('light-job.png')}"></div>
      <div class="shot s2"><img src="${img('dark-people.png')}"></div>
    </body></html>`);
    fs.writeFileSync(OUT + '/frames/banner.html', html);
    await page.goto('file://' + OUT + '/frames/banner.html');
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/banner.png` });
    await ctx.close();
  }
  await browser.close();
  console.log('ok');
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { panelPage, FONT_CSS, EXT, chromium };
