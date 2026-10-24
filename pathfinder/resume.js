// Resume parsing (PDF / DOCX / TXT) and local, no-AI scoring against a job description.

// ---------- Parsing ----------
async function extractResumeText(file) {
  const name = file.name.toLowerCase();
  const buf = await file.arrayBuffer();
  if (name.endsWith('.pdf')) {
    const pdfjs = await import(chrome.runtime.getURL('lib/pdf.min.mjs'));
    pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.mjs');
    const pdf = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      let out = '';
      for (const item of content.items) out += item.str + (item.hasEOL ? '\n' : ' ');
      pages.push(out);
    }
    return cleanResume(pages.join('\n'));
  }
  if (name.endsWith('.docx')) {
    const res = await window.mammoth.extractRawText({ arrayBuffer: buf });
    return cleanResume(res.value);
  }
  if (name.endsWith('.txt') || name.endsWith('.md')) return cleanResume(new TextDecoder().decode(buf));
  throw new Error('Use a PDF, Word (.docx), or .txt file. Old .doc files need to be saved as .docx first.');
}

function cleanResume(t) {
  return t.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 20000);
}

// ---------- Keyword dictionary ----------
// Canonical term → synonyms that also count as a match.
const SKILLS = {
  // Data & analytics
  sql: [], python: [], r: [], excel: ['microsoft excel', 'spreadsheets'], tableau: [], 'power bi': ['powerbi'], looker: [],
  'data analysis': ['data analytics', 'analyzing data', 'analyze data'], 'data visualization': ['dashboards', 'dashboard'],
  statistics: ['statistical'], 'a/b testing': ['ab testing', 'a/b test', 'experimentation', 'experiments'],
  'machine learning': ['ml'], 'artificial intelligence': ['ai'], 'generative ai': ['genai', 'llm', 'llms', 'large language models'],
  'data modeling': [], etl: ['data pipelines', 'data pipeline'], snowflake: [], databricks: [], bigquery: [], spark: ['pyspark'],
  pandas: [], 'forecasting': ['forecast'], 'kpis': ['kpi', 'metrics'],
  // Engineering
  javascript: ['js'], typescript: [], react: ['react.js', 'reactjs'], 'node.js': ['nodejs'], java: [], 'c++': [], 'c#': [],
  go: ['golang'], ruby: [], php: [], swift: [], kotlin: [], html: [], css: [], 'rest apis': ['restful', 'api', 'apis'],
  graphql: [], microservices: [], aws: ['amazon web services'], azure: [], gcp: ['google cloud'], docker: [], kubernetes: ['k8s'],
  terraform: [], 'ci/cd': ['ci cd', 'continuous integration'], git: ['github', 'gitlab'], linux: [], 'system design': [],
  'distributed systems': [], testing: ['unit tests', 'qa', 'quality assurance'], security: ['cybersecurity'], devops: [],
  // Product & design
  'product management': ['product manager'], roadmap: ['roadmaps', 'roadmapping'], 'product strategy': [], 'user research': ['customer research', 'user interviews'],
  'requirements gathering': ['prds', 'prd', 'user stories'], agile: ['scrum', 'sprint'], jira: [], confluence: [],
  figma: [], 'ux design': ['ux', 'user experience'], prototyping: ['prototypes'], 'go-to-market': ['gtm', 'go to market', 'launch', 'launches'],
  'product analytics': ['amplitude', 'mixpanel'], 'b2b': [], 'b2c': [], saas: [], 'platform': [],
  // Business & ops
  'stakeholder management': ['stakeholders', 'cross-functional', 'cross functional'], 'project management': ['program management', 'pmp'],
  'process improvement': ['process optimization', 'lean', 'six sigma'], operations: ['operational'], 'business analysis': ['business analyst'],
  strategy: ['strategic'], 'financial modeling': ['financial models'], budgeting: ['budget'], 'vendor management': ['vendors', 'procurement'],
  'change management': [], 'risk management': ['risk'], compliance: ['regulatory'], 'policy': ['policies'], 'trust and safety': ['trust & safety', 't&s'],
  'customer success': ['customer experience', 'cx'], 'account management': [], sales: [], 'crm': ['salesforce', 'hubspot'],
  marketing: [], seo: [], 'content strategy': [], negotiation: [], 'communication': ['presentations', 'presenting'],
  leadership: ['led', 'managed a team', 'mentored'], 'implementation': ['deployment', 'deploy', 'rollout', 'onboarding'],
  'solutions engineering': ['solutions engineer', 'sales engineering', 'pre-sales'], 'technical support': ['troubleshooting'],
  'erp': ['sap', 'oracle erp', 'netsuite'], 'lms': ['learning management'], 'edtech': [],
  healthcare: ['clinical', 'hipaa'], fintech: ['payments'], 'supply chain': ['logistics'], 'consulting': ['consultant'],
};

const ACRONYM_STOP = new Set(['US', 'USA', 'NY', 'CA', 'TX', 'WA', 'MA', 'IL', 'EEO', 'EOE', 'AND', 'OR', 'THE', 'OPT', 'CPT', 'HR', 'PTO', 'LLC', 'INC', 'FAQ', 'N/A', 'AM', 'PM', 'ET', 'PT', 'CT', 'MT', 'EST', 'PST', 'ADA', 'IT', 'BS', 'BA', 'MS', 'MBA', 'PHD', 'H-1B', 'H1B', 'CEO', 'CTO', 'COO', 'VP', 'OK', 'ID', 'DC', 'AZ', 'CO', 'GA', 'FL', 'NJ', 'PA', 'OH', 'NC', 'VA', 'WE', 'YOU', 'OUR', 'I', 'A']);
const REQ_HEAD = /(requirements|qualifications|what you('ll)? (bring|need)|you have|you bring|must[- ]haves?|minimum|preferred|skills|about you|who you are|what we're looking for)/i;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const termRe = (t) => new RegExp(`(^|[^a-z0-9+#])${escapeRe(t.toLowerCase())}(?=$|[^a-z0-9+#])`, 'i');
const countIn = (text, t) => (text.match(new RegExp(termRe(t).source, 'gi')) || []).length;

function extractJobKeywords(jd) {
  if (!jd) return [];
  const lower = jd.toLowerCase();
  const reqStart = jd.search(REQ_HEAD);
  const reqText = reqStart >= 0 ? lower.slice(reqStart) : '';
  const found = new Map();

  const addTerm = (term, variants) => {
    const hits = variants.reduce((s, v) => s + countIn(lower, v), 0);
    if (!hits) return;
    const inReq = variants.some((v) => reqText && termRe(v).test(reqText));
    // Single-letter / very generic terms need to appear in requirements to count.
    if ((term === 'r' || term === 'go' || term === 'platform' || term === 'policy') && !inReq) return;
    found.set(term, { term, variants, weight: 1 + (inReq ? 1 : 0) + Math.min(1.5, (hits - 1) * 0.5), required: inReq });
  };

  for (const [term, syns] of Object.entries(SKILLS)) addTerm(term, [term, ...syns]);

  // Acronyms and tool names the dictionary doesn't know (e.g. "HL7", "NetSuite", "dbt").
  const acronyms = jd.match(/\b[A-Z][A-Z0-9&+/-]{1,6}\b/g) || [];
  for (const a of new Set(acronyms)) {
    if (ACRONYM_STOP.has(a) || found.has(a.toLowerCase())) continue;
    const already = Array.from(found.values()).some((f) => f.variants.includes(a.toLowerCase()));
    if (!already) addTerm(a.toLowerCase(), [a.toLowerCase()]);
  }

  return Array.from(found.values()).sort((a, b) => b.weight - a.weight).slice(0, 25);
}

function scoreResume(resume, jd, jobTitle) {
  const keywords = extractJobKeywords(jd);
  const r = (resume || '').toLowerCase();
  const matched = [], missing = [];
  for (const k of keywords) (k.variants.some((v) => termRe(v).test(r)) ? matched : missing).push(k);
  const totalW = keywords.reduce((s, k) => s + k.weight, 0) || 1;
  const keywordPart = matched.reduce((s, k) => s + k.weight, 0) / totalW;

  const tTokens = (jobTitle || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 2 && !['senior', 'junior', 'lead', 'principal', 'staff', 'associate', 'the', 'and', 'for', 'remote', 'hybrid', 'level'].includes(w));
  const titlePart = tTokens.length ? tTokens.filter((w) => r.includes(w)).length / tTokens.length : 0.5;

  const bullets = (resume || '').split('\n').map((l) => l.trim()).filter((l) => l.length > 40);
  const quantified = bullets.filter((l) => /\d|%|\$/.test(l)).length;
  const impactPart = bullets.length ? Math.min(1, quantified / bullets.length / 0.5) : 0;

  const score = Math.round(keywordPart * 70 + titlePart * 15 + impactPart * 15);
  return {
    score,
    label: score >= 75 ? 'Strong' : score >= 55 ? 'Fair' : 'Low',
    breakdown: {
      keywords: Math.round(keywordPart * 70),
      title: Math.round(titlePart * 15),
      impact: Math.round(impactPart * 15),
    },
    matched: matched.map((k) => k.term),
    missing: missing.map((k) => ({ term: k.term, required: k.required })),
    quantifiedLines: `${quantified}/${bullets.length}`,
  };
}

// ---------- Profile auto-fill (no AI): school, past employers, a one-line background ----------
const SCHOOL_RE = /\b(university|college|institute of technology|institute|school of|polytechnic|IIT|NIT|BITS)\b/i;
const DEGREE_RE = /\b(bachelor|master|b\.?\s?tech|m\.?\s?tech|b\.?\s?e\.?|m\.?\s?s\.?|m\.?\s?b\.?\s?a|b\.?\s?s\.?|b\.?\s?a\.?|ph\.?\s?d|degree|mba)\b/i;
const MONTHS = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
const DATE_RE = new RegExp(`(${MONTHS}\\s*\\d{4}|\\b(19|20)\\d{2}\\b)\\s*(-|–|—|to)\\s*(${MONTHS}\\s*\\d{4}|\\b(19|20)\\d{2}\\b|present|current|now)`, 'i');
const TITLE_WORDS = /\b(analyst|engineer|manager|intern|associate|consultant|developer|specialist|lead|director|coordinator|designer|scientist|officer|assistant|administrator|architect|researcher|product|program|project|operations|policy|data|software|business)\b/i;
const SECTION_RE = /^(education|experience|work experience|professional experience|employment|projects|skills|certifications|summary|profile|leadership|activities|publications|awards)\s*:?$/i;

function cleanOrg(s) {
  return (s || '')
    .replace(DATE_RE, '')
    .replace(/\b(remote|hybrid|on-?site)\b/ig, '')
    .replace(/[|•·–—]\s*$/,'')
    .replace(/,\s*[A-Z][a-zA-Z .]+,\s*[A-Z]{2}\s*$/, "") // trailing ", City, ST"
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,|•·–—-]+|[\s,|•·–—-]+$/g, '')
    .trim();
}

function parseProfile(text) {
  const lines = (text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  let section = '';
  let school = '';
  const employers = [];
  let firstRole = null;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (SECTION_RE.test(l)) { section = l.toLowerCase(); continue; }

    // School: first line naming a university/college (prefer the education section)
    if (!school && SCHOOL_RE.test(l) && l.length < 120 && (section.startsWith('education') || DEGREE_RE.test(l) || DEGREE_RE.test(lines[i + 1] || ''))) {
      const m = l.match(/([A-Z][\w&.'-]*(?:\s+(?:of|at|and|&|the|[A-Z][\w&.'-]*))*\s+(?:University|College|Institute(?:\s+of\s+Technology)?)(?:\s+(?:of|at)\s+[A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*)*)?|(?:University|College|Institute)\s+of\s+[A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*)*|\b(?:IIT|NIT|BITS)\b[\w\s-]*)/);
      school = cleanOrg(m ? m[0] : l.split(/[,|•·–—]/)[0]);
      continue;
    }

    // Employers: lines in experience sections that carry a date range
    const inExp = /experience|employment/.test(section) || (!section && DATE_RE.test(l));
    if (inExp && DATE_RE.test(l) && !SCHOOL_RE.test(l)) {
      // "Title, Company  Jan 2022 – Present" or "Company | Title | dates" or company on its own line above/below
      const stripped = cleanOrg(l);
      const parts = stripped.split(/\s*(?:,|\||•|·|–|—| at | @ )\s*/).map((x) => x.trim()).filter(Boolean);
      let company = '', title = '';
      if (parts.length >= 2) {
        const t = parts.findIndex((x) => TITLE_WORDS.test(x));
        if (t >= 0) { title = parts[t]; company = parts.find((x, k) => k !== t && !TITLE_WORDS.test(x)) || parts[t === 0 ? 1 : 0]; }
        else { company = parts[0]; title = parts[1]; }
      } else if (parts.length === 1) {
        const prev = lines[i - 1] || '', next = lines[i + 1] || '';
        const ok = (x) => x && x.length < 60 && !/^[-•*▪◦]/.test(x) && !SECTION_RE.test(x) && !DATE_RE.test(x);
        if (TITLE_WORDS.test(parts[0])) { title = parts[0]; company = cleanOrg(ok(prev) && !TITLE_WORDS.test(prev) ? prev : ok(next) && !TITLE_WORDS.test(next) ? next : ''); }
        else { company = parts[0]; title = cleanOrg(ok(next) && TITLE_WORDS.test(next) ? next : ok(prev) && TITLE_WORDS.test(prev) ? prev : ''); }
      }
      company = cleanOrg(company);
      if (company && company.length < 60 && !/\d{3,}/.test(company) && !employers.some((e) => e.toLowerCase() === company.toLowerCase())) {
        employers.push(company);
        if (!firstRole && title) firstRole = { title: cleanOrg(title), company };
      }
    }
  }

  const background = firstRole && firstRole.title.length < 60
    ? `${firstRole.title} at ${firstRole.company}`
    : '';
  return { school, pastEmployers: employers.slice(0, 6), background };
}

if (typeof module !== 'undefined') module.exports = { extractJobKeywords, scoreResume, cleanResume, termRe, parseProfile };
