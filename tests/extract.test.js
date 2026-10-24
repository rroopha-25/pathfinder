const { JSDOM } = require('jsdom');
const assert = require('assert');
const src = require('fs').readFileSync('pathfinder/extract.js', 'utf8');
let n = 0; const ok = (m) => { n++; console.log('✓', m); };
function run(html, url, title, selection) {
  const d = new JSDOM(`<html><head><title>${title}</title></head><body>${html}</body></html>`, { url, runScripts: 'outside-only' });
  d.window.HTMLElement.prototype.getClientRects = function () { return [1]; };
  if (selection) d.window.getSelection = () => selection;
  d.window.eval(src);
  return d.window.eval('extractJob()');
}
const JD = `<p>You will lead implementation and onboarding for enterprise SaaS customers across North America.</p>
<h3>Responsibilities</h3><ul><li>Own customer deployments end to end</li><li>Partner with product and engineering on requirements</li></ul>
<h3>Qualifications</h3><ul><li>3+ years of experience in implementation or customer success</li><li>Strong SQL and Excel</li></ul>
<p>Candidates must be authorized to work in the US without the need for current or future sponsorship.</p>`;
const check = (name, r, exp) => {
  for (const [k, v] of Object.entries(exp)) assert.strictEqual(r[k], v, `${name}: ${k} = "${r[k]}"`);
  assert.ok(r.isJob, name + ' isJob'); assert.ok(r.description.length > 200 && /Responsibilities/.test(r.description), name + ' desc');
  ok(`${name}: "${r.title}" · ${r.company} · ${r.location} (confidence ${r.confidence})`);
};

check('LinkedIn', run(`<a href="https://www.linkedin.com/company/confido/">Confido</a><h1>Product Deployment Specialist</h1><div><span>New York, NY</span> · <span>2 weeks ago</span> · <span>Over 100 people clicked apply</span></div><div><h2>About the job</h2>${JD}</div>`,
  'https://www.linkedin.com/jobs/view/4300001/', 'Product Deployment Specialist | Confido | LinkedIn'),
  { site: 'LinkedIn', title: 'Product Deployment Specialist', company: 'Confido', location: 'New York, NY', jobId: '4300001', companyUrl: 'https://www.linkedin.com/company/confido/' });

check('Indeed', run(`<h2 data-testid="jobsearch-JobInfoHeader-title"><span>Implementation Analyst - job post</span></h2><div data-testid="inlineHeader-companyName"><a>Acme Health</a></div><div data-testid="inlineHeader-companyLocation">Phoenix, AZ 85004</div><div id="jobDescriptionText">${JD}</div><button>Apply now</button>`,
  'https://www.indeed.com/jobs?q=analyst&vjk=abc123', 'Analyst Jobs | Indeed'),
  { site: 'Indeed', title: 'Implementation Analyst', company: 'Acme Health', location: 'Phoenix, AZ 85004', jobId: 'abc123' });

const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;
const jdHtmlEscaped = JD.replace(/</g, '&lt;').replace(/>/g, '&gt;');
check('Greenhouse (JSON-LD + escaped HTML)', run(ld({ '@context': 'https://schema.org', '@type': 'JobPosting', title: 'Solutions Engineer', description: jdHtmlEscaped, hiringOrganization: { '@type': 'Organization', name: 'Stripe' }, jobLocation: [{ '@type': 'Place', address: { addressLocality: 'Seattle', addressRegion: 'WA' } }] }) + `<div class="job__title"><h1>Solutions Engineer</h1></div><div class="job__description">${JD}</div>`,
  'https://job-boards.greenhouse.io/stripe/jobs/555', 'Job Application for Solutions Engineer at Stripe'),
  { site: 'Greenhouse', title: 'Solutions Engineer', company: 'Stripe', location: 'Seattle, WA' });

check('Lever', run(`<div class="posting-headline"><h2>Product Operations Manager</h2><div class="posting-categories"><div class="location">Austin, TX</div></div></div><div data-qa="job-description">${JD}</div><a>Apply for this job</a>`,
  'https://jobs.lever.co/figma/abc', 'Figma - Product Operations Manager'),
  { site: 'Lever', title: 'Product Operations Manager', company: 'Figma', location: 'Austin, TX' });

check('Workday (JSON-LD inside @graph, remote)', run(ld({ '@graph': [{ '@type': 'WebPage' }, { '@type': 'JobPosting', title: 'Program Manager', description: JD, hiringOrganization: { name: 'NVIDIA' }, jobLocationType: 'TELECOMMUTE' }] }) + `<h2 data-automation-id="jobPostingHeader">Program Manager</h2><div data-automation-id="jobPostingDescription">${JD}</div>`,
  'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternal/job/US-Remote/Program-Manager_JR1', 'Program Manager'),
  { site: 'Workday', title: 'Program Manager', company: 'NVIDIA', location: 'Remote' });

check('Glassdoor', run(`<h1 data-test="job-title">Business Analyst</h1><div data-test="employer-name">Intel 4.1 ★</div><div data-test="location">Chandler, AZ</div><div class="JobDetails_jobDescription__abc">${JD}</div>`,
  'https://www.glassdoor.com/job-listing/business-analyst-intel-JV_123.htm', 'Intel Business Analyst Job | Glassdoor'),
  { site: 'Glassdoor', title: 'Business Analyst', company: 'Intel', location: 'Chandler, AZ' });

const next = { props: { pageProps: { dataSource: { jobResult: { jobTitle: 'Data Analyst', jobLocation: 'Tempe, AZ', jobSummary: 'You will analyze product and operations data to drive decisions for a growing fintech platform used by thousands of customers every day, working closely with finance and operations leaders.', coreResponsibilities: ['Build SQL dashboards', 'Partner with stakeholders'], qualifications: ['3+ years of experience with SQL', 'Excel'] }, companyResult: { companyName: 'Carvana' } } } } };
next.props.pageProps.dataSource.jobResult.companyName = 'Carvana';
check('Jobright (Next.js data)', run(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(next)}</script><div class="index_job-title__x">Data Analyst</div><div class="index_company-name__y">Carvana</div><button>Apply Now</button>`,
  'https://jobright.ai/jobs/info/66f1', 'Data Analyst - Carvana | Jobright.ai'),
  { site: 'Jobright', title: 'Data Analyst', company: 'Carvana' });

check('Google Jobs', run(`<div class="list">…other jobs…</div><div class="pane">
<h2 role="heading">Operations Analyst</h2>
<div>Honeywell • Phoenix, AZ • via LinkedIn</div>
<button>Apply on LinkedIn</button><div><div><span>Job description</span></div>${JD}</div></div>`,
  'https://www.google.com/search?q=operations+analyst+jobs&udm=8', 'operations analyst jobs - Google Search'),
  { site: 'Google Jobs', title: 'Operations Analyst', company: 'Honeywell', location: 'Phoenix, AZ' });

check('Any company careers page (heuristics only)', run(`<nav>Home Products Careers</nav><main><h1>Senior Policy Analyst</h1><section>${JD}</section><a href="#apply">Apply</a></main><footer>© Uber</footer>`,
  'https://careers.uber.com/jobs/12345', 'Senior Policy Analyst | Careers'),
  { site: 'Company site', title: 'Senior Policy Analyst', company: 'Uber' });

const blog = run(`<main><h1>10 tips for your job search</h1><p>${'Networking matters a lot when you look for work. '.repeat(20)}</p><p>Make sure your resume lists responsibilities and qualifications clearly.</p></main>`, 'https://medium.com/@x/tips', '10 tips | Medium');
assert.strictEqual(blog.isJob, false); ok('Blog article about jobs is NOT treated as a job posting');
const news = run(`<h1>Weather today</h1><p>Sunny.</p>`, 'https://weather.com/', 'Weather');
assert.strictEqual(news.isJob, false); ok('Random page is ignored');

const sel = run(`<div>Weird custom widget</div>`, 'https://careers.weirdco.com/x', 'Job | WeirdCo', 'Senior PM. Responsibilities: lead roadmap...');
assert.ok(sel.selection.startsWith('Senior PM')); ok('Highlighted text is captured for the manual fallback');
console.log(`\n${n} extraction tests passed`);
