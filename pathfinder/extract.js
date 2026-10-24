// Universal job reader. Runs INSIDE any web page (every frame) via chrome.scripting.executeScript.
// Must be fully self-contained: Chrome serializes this function, so it can't use outside variables.
//
// Layers, most reliable first:
//   1. Site adapters   – known selectors for LinkedIn, Indeed, Glassdoor, Greenhouse, Lever, Workday, ...
//   2. JSON-LD         – schema.org "JobPosting" data most career sites embed for Google Jobs
//   3. __NEXT_DATA__   – job objects inside Next.js apps (e.g. Jobright)
//   4. Heuristics      – "Responsibilities / Qualifications" blocks, <h1>, page title, domain name
function extractJob() {
  // ---------- helpers ----------
  const txt = (el) => (el ? (el.innerText || el.textContent || '').trim() : '');
  const visible = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  const firstLine = (s) => (s || '').split('\n').map((x) => x.trim()).filter(Boolean)[0] || '';
  const find = (selectors) => {
    for (const s of selectors || []) {
      let els;
      try { els = document.querySelectorAll(s); } catch (e) { continue; }
      for (const el of els) {
        const t = txt(el);
        if (t && visible(el)) return t;
      }
    }
    return '';
  };
  // HTML string → readable text, without executing anything (DOMParser documents are inert).
  const htmlToText = (html) => {
    if (!html) return '';
    let s = String(html);
    for (let pass = 0; pass < 2 && /<\/?[a-z][\s\S]*?>|&lt;/i.test(s); pass++) {
      s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|ul|ol|tr|section)>/gi, '\n').replace(/<li[^>]*>/gi, '• ');
      s = new DOMParser().parseFromString(s, 'text/html').body.textContent || '';
    }
    return s.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  };
  const url = location.href;
  const host = location.hostname.replace(/^www\./, '');
  const params = new URLSearchParams(location.search);

  const BOARD_NAME = /^(linkedin|indeed|glassdoor|jobright|jobright\.ai|google|google jobs|google search|ziprecruiter|dice|wellfound|greenhouse|lever|workday|ashby|smartrecruiters|icims|handshake|careers?|jobs?|job board|job application|home)$/i;
  const SECTION_RE = /(responsibilit|qualification|requirement|what you('|’)?ll do|what you will do|about the (role|job|team|position)|who you are|you will|you have|experience (with|in)|benefits|nice to have|preferred)/gi;
  const sectionHits = (s) => new Set(((s || '').match(SECTION_RE) || []).map((m) => m.toLowerCase().slice(0, 12))).size;

  // ---------- which site ----------
  const SITES = [
    ['LinkedIn', /(^|\.)linkedin\.com$/],
    ['Indeed', /(^|\.)indeed\.[a-z.]+$/],
    ['Jobright', /(^|\.)jobright\.ai$/],
    ['Google Jobs', /^google\.[a-z.]+$/],
    ['Glassdoor', /(^|\.)glassdoor\.[a-z.]+$/],
    ['Greenhouse', /(^|\.)greenhouse\.io$/],
    ['Lever', /(^|\.)lever\.co$/],
    ['Workday', /(^|\.)(myworkdayjobs|myworkdaysite)\.com$/],
    ['Ashby', /(^|\.)ashbyhq\.com$/],
    ['SmartRecruiters', /(^|\.)smartrecruiters\.com$/],
    ['iCIMS', /(^|\.)icims\.com$/],
    ['ZipRecruiter', /(^|\.)ziprecruiter\.com$/],
    ['Dice', /(^|\.)dice\.com$/],
    ['Wellfound', /(^|\.)wellfound\.com$/],
    ['Handshake', /(^|\.)joinhandshake\.com$/],
  ];
  const site = (SITES.find(([, re]) => re.test(host)) || ['Company site'])[0];

  // ---------- 1. site adapters ----------
  const A = {}; // adapter result: title, company, location, description, jobId, companyUrl, hiringTeam
  const docParts = document.title.replace(/^\(\d+\+?\)\s*/, '').split(/\s[|\-–—]\s/).map((s) => s.trim()).filter(Boolean);

  if (site === 'LinkedIn') {
    A.jobId = (url.match(/\/jobs\/view\/(\d+)/) || [])[1] || params.get('currentJobId') || '';
    A.title = find(['.job-details-jobs-unified-top-card__job-title h1', '.job-details-jobs-unified-top-card__job-title', '.jobs-unified-top-card__job-title', '.top-card-layout__title', 'h1.t-24']);
    A.company = find(['.job-details-jobs-unified-top-card__company-name a', '.job-details-jobs-unified-top-card__company-name', '.jobs-unified-top-card__company-name a', '.topcard__org-name-link']);
    const lp = document.title.replace(/^\(\d+\+?\)\s*/, '').split(' | ');
    if (lp.length >= 3 && /linkedin/i.test(lp[lp.length - 1])) {
      A.title = A.title || lp[0];
      A.company = A.company || lp[1];
    }
    if (!A.title) A.title = Array.from(document.querySelectorAll('h1')).filter(visible).map(txt).find((t) => t.length > 2 && t.length < 160) || '';
    A.location = find(['.job-details-jobs-unified-top-card__primary-description-container .tvm__text', '.job-details-jobs-unified-top-card__tertiary-description-container span', '.jobs-unified-top-card__bullet', '.topcard__flavor--bullet']);
    if (!A.location) {
      const line = Array.from(document.querySelectorAll('div,p,span'))
        .filter((el) => { const t = (el.textContent || '').trim(); return t.length < 250 && t.includes('·') && /(ago|applicant|clicked apply)/i.test(t); })
        .filter(visible).sort((a, b) => a.textContent.length - b.textContent.length)[0];
      A.location = txt(line);
    }
    A.location = (A.location || '').split('·')[0].trim();
    A.description = find(['#job-details', '.jobs-description__content', '.jobs-description-content__text', '.jobs-box__html-content', '.description__text']);
    const leaf = (re) => Array.from(document.querySelectorAll('h1,h2,h3,h4,span,p,div,strong'))
      .filter((el) => el.childElementCount === 0 && re.test((el.textContent || '').trim())).find(visible);
    const about = leaf(/^about the job$/i);
    if (!A.description && about) {
      let n = about;
      for (let i = 0; i < 8 && n; i++) { n = n.parentElement; if (n && txt(n).length >= 200) break; }
      A.description = txt(n).replace(/^about the job\s*/i, '').trim();
    }
    // Company page link (used by the People tab)
    const links = Array.from(document.querySelectorAll('a[href*="/company/"]')).filter(visible);
    const cl = links.find((a) => firstLine(txt(a)) === firstLine(A.company)) || links[0];
    const m = cl && cl.href.match(/\/company\/([^/?#]+)/);
    if (m) A.companyUrl = 'https://www.linkedin.com/company/' + m[1] + '/';
    // "Meet the hiring team"
    let team = Array.from(document.querySelectorAll('.hirer-card__hirer-information strong, .jobs-poster__name')).map(txt).filter(Boolean);
    const teamHead = leaf(/^meet the hiring team$/i);
    if (!team.length && teamHead) {
      let box = teamHead;
      for (let i = 0; i < 6 && box; i++) { box = box.parentElement; if (box && box.querySelector('a[href*="/in/"]')) break; }
      if (box) team = Array.from(box.querySelectorAll('a[href*="/in/"]')).map((a) => firstLine(txt(a))).filter((t) => t && t.length < 80);
    }
    A.hiringTeam = Array.from(new Set(team));
  } else if (site === 'Indeed') {
    A.jobId = params.get('vjk') || params.get('jk') || '';
    A.title = find(['[data-testid="jobsearch-JobInfoHeader-title"]', 'h1.jobsearch-JobInfoHeader-title', 'h2.jobsearch-JobInfoHeader-title', '.jobsearch-JobInfoHeader-title']);
    A.company = find(['[data-testid="inlineHeader-companyName"]', '[data-company-name="true"]', '.jobsearch-CompanyInfoContainer a', '.jobsearch-InlineCompanyRating div']);
    A.location = find(['[data-testid="inlineHeader-companyLocation"]', '[data-testid="job-location"]', '[data-testid="jobsearch-JobInfoHeader-companyLocation"]', '.jobsearch-JobInfoHeader-subtitle > div:last-child']);
    A.description = find(['#jobDescriptionText', '.jobsearch-jobDescriptionText']);
  } else if (site === 'Glassdoor') {
    A.title = find(['[data-test="job-title"]', 'h1[id^="jd-job-title"]', '[class*="JobDetails_jobTitle"]', 'h1']);
    A.company = find(['[data-test="employer-name"]', '[class*="EmployerProfile_employerName"]', '[class*="employerName"]']);
    A.location = find(['[data-test="location"]', '[class*="JobDetails_location"]']);
    A.description = find(['[class*="JobDetails_jobDescription"]', '.jobDescriptionContent', '[data-test="jobDescriptionContent"]']);
  } else if (site === 'Greenhouse') {
    A.title = find(['.job__title h1', 'h1.section-header', '.app-title', 'h1']);
    A.company = find(['.company-name']).replace(/^at\s+/i, '');
    const gm = document.title.match(/Job Application for (.+?) at (.+)$/i);
    if (gm) { A.title = A.title || gm[1]; A.company = A.company || gm[2]; }
    A.location = find(['.job__location', '.location']);
    A.description = find(['.job__description', '#content', '.job-post-content']);
  } else if (site === 'Lever') {
    A.title = find(['.posting-headline h2', '.posting-header h2']);
    A.location = find(['.posting-categories .location', '.sort-by-location', '.posting-category.location']);
    A.description = find(['[data-qa="job-description"]', '.posting-page .content .section-wrapper.page-full-width', '.posting-page .content']);
    if (docParts.length >= 2) A.company = docParts[0];
  } else if (site === 'Workday') {
    A.title = find(['[data-automation-id="jobPostingHeader"]']);
    A.location = find(['[data-automation-id="locations"] dd', '[data-automation-id="locations"]']).replace(/^locations?\s*/i, '');
    A.description = find(['[data-automation-id="jobPostingDescription"]']);
    A.jobId = find(['[data-automation-id="requisitionId"] dd']);
  } else if (site === 'Ashby') {
    A.title = find(['h1[class*="title"]', 'h1']);
    A.description = find(['[class*="_descriptionText"]', '[class*="descriptionText"]']);
  } else if (site === 'SmartRecruiters') {
    A.title = find(['h1.job-title', 'h1']);
    A.company = find(['[itemprop="hiringOrganization"] [itemprop="name"]']);
    A.location = find(['.job-details .c-spl-job-location', '[itemprop="jobLocation"]']);
    A.description = find(['[itemprop="description"]', '.job-sections']);
  } else if (site === 'iCIMS') {
    A.title = find(['.iCIMS_Header', 'h1']);
    A.description = find(['.iCIMS_JobContent', '.iCIMS_InfoMsg_Job']);
  } else if (site === 'ZipRecruiter') {
    A.title = find(['h1.job_title', 'h1']);
    A.company = find(['.hiring_company_text a', '[class*="company_name"]', 'a[href*="/co/"]']);
    A.description = find(['.job_description', '[class*="job_description"]']);
  } else if (site === 'Dice') {
    A.title = find(['h1[data-cy="jobTitle"]', 'h1']);
    A.company = find(['[data-cy="companyNameLink"]', 'a[data-wa-click="djv-job-company-profile-click"]']);
    A.location = find(['[data-cy="location"]', 'li[data-cy="location"]']);
    A.description = find(['[data-testid="jobDescriptionHtml"]', '#jobDescription']);
  } else if (site === 'Jobright') {
    A.title = find(['[class*="job-title"]', '[class*="jobTitle"]', 'h1']);
    A.company = find(['[class*="company-name"]', '[class*="companyName"]']);
    A.location = find(['[class*="job-location"]', '[class*="location"]']);
  } else if (site === 'Google Jobs') {
    // Google Jobs panel: class names are obfuscated, so anchor on the "Job description" label.
    const label = Array.from(document.querySelectorAll('div,span,h2,h3'))
      .filter((el) => el.childElementCount === 0 && /^(job description|full job description)$/i.test((el.textContent || '').trim()))
      .find(visible);
    if (label) {
      let pane = label;
      for (let i = 0; i < 14 && pane; i++) {
        pane = pane.parentElement;
        if (pane && pane.querySelector('h1, h2, [role="heading"]') && txt(pane).length > 400) break;
      }
      if (pane) {
        const heading = Array.from(pane.querySelectorAll('h1, h2, [role="heading"]')).filter(visible).map(txt)
          .find((t) => t && t.length < 160 && !/job description|job highlights|apply/i.test(t));
        A.title = firstLine(heading);
        const lines = txt(pane).split('\n').map((l) => l.trim()).filter(Boolean);
        const ti = lines.indexOf(A.title);
        const meta = ti >= 0 ? lines.slice(ti + 1, ti + 3) : [];
        const parts = (meta[0] || '').split(/\s*[•·]\s*/);
        A.company = parts[0] || '';
        A.location = (parts[1] && !/^via /i.test(parts[1]) ? parts[1] : meta[1] || '').replace(/\s*via .*$/i, '');
        let box = label;
        for (let i = 0; i < 6 && box; i++) { box = box.parentElement; if (box && txt(box).length > 300) break; }
        A.description = txt(box).replace(/^(full )?job description\s*/i, '').replace(/\n?(show full description|show less)\s*$/i, '');
      }
    }
  } else if (site === 'Wellfound' || site === 'Handshake') {
    A.title = find(['h1']);
    const wm = document.title.match(/^(.+?) at (.+?)(\s[•|-]\s|$)/);
    if (wm) { A.title = A.title || wm[1]; A.company = wm[2]; }
  }

  // ---------- 2. JSON-LD JobPosting ----------
  const LD = {};
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    let data;
    try { data = JSON.parse(s.textContent); } catch (e) { continue; }
    const stack = [data];
    let found = null;
    while (stack.length && !found) {
      const n = stack.pop();
      if (!n || typeof n !== 'object') continue;
      if (Array.isArray(n)) { stack.push(...n); continue; }
      const t = n['@type'];
      if (t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'))) found = n;
      else if (n['@graph']) stack.push(n['@graph']);
    }
    if (!found) continue;
    LD.found = true;
    LD.title = htmlToText(found.title || found.name || '');
    const org = found.hiringOrganization;
    LD.company = htmlToText(typeof org === 'string' ? org : (org && org.name) || '');
    const locs = [].concat(found.jobLocation || []);
    LD.location = locs.map((l) => {
      const a = (l && l.address) || {};
      if (typeof a === 'string') return a;
      return [a.addressLocality, a.addressRegion].filter(Boolean).join(', ') || a.addressCountry || '';
    }).filter(Boolean).slice(0, 2).join(' / ');
    if (/telecommute/i.test(found.jobLocationType || '')) LD.location = LD.location ? LD.location + ' (Remote)' : 'Remote';
    LD.description = htmlToText(found.description || '');
    LD.jobId = (found.identifier && (found.identifier.value || found.identifier)) || '';
    if (typeof LD.jobId !== 'string') LD.jobId = String(LD.jobId || '');
    break;
  }

  // ---------- 3. Next.js page data (Jobright and similar apps) ----------
  const ND = {};
  const nd = document.getElementById('__NEXT_DATA__');
  if (nd && !(A.title && A.description) && !LD.found) {
    let data = null;
    try { data = JSON.parse(nd.textContent); } catch (e) {}
    const stack = [[data, 0]];
    let best = null, bestScore = 0, steps = 0;
    while (stack.length && steps++ < 30000) {
      const [n, depth] = stack.pop();
      if (!n || typeof n !== 'object' || depth > 14) continue;
      if (Array.isArray(n)) { for (const x of n) stack.push([x, depth + 1]); continue; }
      const title = typeof n.jobTitle === 'string' ? n.jobTitle : typeof n.title === 'string' ? n.title : '';
      const company = typeof n.companyName === 'string' ? n.companyName
        : n.company && typeof n.company === 'object' ? (n.company.name || n.company.companyName || '')
        : typeof n.company === 'string' ? n.company : '';
      if (title && title.length < 160) {
        const longText = Object.entries(n)
          .filter(([k, v]) => typeof v === 'string' && v.length > 80 && /desc|summary|responsib|qualif|requirement|content|detail/i.test(k))
          .map(([, v]) => v).join('\n\n');
        const listText = Object.entries(n)
          .filter(([k, v]) => Array.isArray(v) && v.every((x) => typeof x === 'string') && /responsib|qualif|requirement|skill/i.test(k))
          .map(([k, v]) => k.replace(/([A-Z])/g, ' $1') + ':\n• ' + v.join('\n• ')).join('\n\n');
        const score = (company ? 2 : 0) + (longText.length + listText.length > 200 ? 3 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = { title, company, description: htmlToText([longText, listText].filter(Boolean).join('\n\n')), location: typeof n.location === 'string' ? n.location : typeof n.jobLocation === 'string' ? n.jobLocation : '' };
        }
      }
      for (const v of Object.values(n)) if (v && typeof v === 'object') stack.push([v, depth + 1]);
    }
    if (best && bestScore >= 3) Object.assign(ND, best);
  }

  // ---------- 4. Heuristics for any page ----------
  const H = {};
  const meta = (p) => { const m = document.querySelector(`meta[property="${p}"], meta[name="${p}"]`); return m ? (m.getAttribute('content') || '').trim() : ''; };
  H.title = Array.from(document.querySelectorAll('h1')).filter(visible).map((h) => firstLine(txt(h))).find((t) => t.length > 2 && t.length < 160) || '';
  if (!H.title) H.title = meta('og:title') || docParts[0] || '';

  const tm = document.title.match(/^(.+?)\s+(?:at|@)\s+(.+?)(?:\s[|\-–—•]\s.*)?$/i);
  const siteName = meta('og:site_name');
  if (tm) H.company = tm[2];
  else if (siteName && !BOARD_NAME.test(siteName)) H.company = siteName;
  else if (docParts.length >= 2 && !BOARD_NAME.test(docParts[docParts.length - 1]) && docParts[docParts.length - 1].length < 50) H.company = docParts[docParts.length - 1];
  if (!H.company && site === 'Company site') {
    // careers.stripe.com → Stripe, jobs.apple.com → Apple
    const labels = host.split('.');
    const core = labels.length >= 2 ? labels[labels.length - 2] : labels[0];
    if (core && !/^(co|com)$/.test(core)) H.company = core.charAt(0).toUpperCase() + core.slice(1);
  }
  if (!A.company && site === 'Workday') {
    const w = host.split('.')[0];
    H.company = w.charAt(0).toUpperCase() + w.slice(1);
  }

  const bodyLen = (document.body && document.body.textContent || '').length || 1;
  const HEAD_RE = /^(job description|description|about (the|this) (job|role|position|opportunity)|the role|role overview|position (summary|overview)|job summary|overview|what you('|’)?ll do|what you will do|(key |your )?responsibilities|(minimum |basic |preferred )?qualifications|requirements|who you are)\s*:?$/i;
  const scoreBlock = (el) => {
    const len = (el.textContent || '').length;
    if (len < 300 || len > 30000 || (bodyLen > 4000 && len > bodyLen * 0.85)) return -1;
    return sectionHits(el.textContent) * 2000 - len * 0.05;
  };
  let bestBlock = null, bestBlockScore = 0;
  const labels = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,strong,b,p,span,div,dt'))
    .filter((el) => el.childElementCount <= 1 && HEAD_RE.test((el.textContent || '').trim()))
    .slice(0, 30).filter(visible);
  for (const label of labels) {
    let n = label;
    for (let i = 0; i < 10 && n; i++) {
      n = n.parentElement;
      if (!n) break;
      const s = scoreBlock(n);
      if (s > bestBlockScore) { bestBlockScore = s; bestBlock = n; }
    }
  }
  if (!bestBlock) {
    const cands = Array.from(document.querySelectorAll('main, article, [role="main"], section, div')).slice(0, 4000);
    for (const el of cands) {
      const s = scoreBlock(el);
      if (s > bestBlockScore && sectionHits(el.textContent) >= 2 && visible(el)) { bestBlockScore = s; bestBlock = el; }
    }
  }
  H.description = bestBlock ? txt(bestBlock) : '';
  const hasApply = Array.from(document.querySelectorAll('a, button, [role="button"], input[type="submit"]'))
    .slice(0, 3000).some((el) => /^(apply|apply now|easy apply|apply for this (job|position|role)|apply on .+|submit application|i'?m interested)$/i.test((el.textContent || el.value || '').trim()));

  // ---------- merge ----------
  const pickVal = (...vals) => vals.map((v) => (v || '').trim()).find(Boolean) || '';
  const pickDesc = (...vals) => vals.find((v) => v && v.length >= 200) || vals.find(Boolean) || '';
  let title = firstLine(pickVal(A.title, LD.title, ND.title, H.title))
    .replace(/\s*-\s*job post$/i, '')
    .replace(/^job application for\s+/i, '')
    .replace(/\s+(at|@)\s+[^|]+$/i, (m) => (A.title || LD.title ? m : ''))
    .trim();
  if (BOARD_NAME.test(title) || /^(careers?|jobs?|open (roles|positions)|job (search|openings?)|search results?)\b/i.test(title)) title = '';
  let company = firstLine(pickVal(A.company, LD.company, ND.company, H.company)).replace(/\s+\d(\.\d)?\s*★?$/, '').trim();
  if (BOARD_NAME.test(company) || (site === 'Google Jobs' && !A.company)) company = '';
  const description = pickDesc(A.description, LD.description, ND.description, H.description).slice(0, 30000);
  const jobLocation = firstLine(pickVal(A.location, LD.location, ND.location));

  // ---------- is this actually a job posting? ----------
  const hits = sectionHits(description);
  let confidence = 0;
  if (LD.found) confidence += 3;
  if (A.title && A.description) confidence += 3;
  if (ND.title && ND.description) confidence += 2;
  if (title) confidence += 1;
  if (description.length >= 300) confidence += 1;
  if (hits >= 2) confidence += 1;
  if (hasApply) confidence += 1;
  const isJob = !!title && description.length >= 200 && confidence >= 4;

  const cleanUrl = (() => {
    try {
      const u = new URL(url);
      const keep = ['currentJobId', 'jk', 'vjk', 'gh_jid', 'jobId', 'job_id', 'id', 'q', 'udm', 'ibp'];
      const q = new URLSearchParams();
      for (const k of keep) if (u.searchParams.get(k)) q.set(k, u.searchParams.get(k));
      return u.origin + u.pathname + (q.toString() ? '?' + q : '');
    } catch (e) { return url; }
  })();

  return {
    site,
    jobId: A.jobId || LD.jobId || '',
    url,
    key: site + ':' + (A.jobId || (site === 'Google Jobs' ? title + '@' + company : cleanUrl)),
    title,
    company,
    companyUrl: A.companyUrl || '',
    location: jobLocation,
    description,
    hiringTeam: A.hiringTeam || [],
    isJob,
    confidence,
    selection: String(window.getSelection ? window.getSelection() : '').trim().slice(0, 30000),
    isTopFrame: window === window.top,
    extractedAt: new Date().toISOString(),
    // No job text here: safe to copy and share for troubleshooting.
    debug: {
      site, host, pageTitle: document.title.slice(0, 120), confidence,
      adapter: { title: !!A.title, company: !!A.company, description: (A.description || '').length },
      jsonLd: !!LD.found, nextData: !!ND.title, heuristicDescription: (H.description || '').length,
      sectionHits: hits, hasApply,
    },
  };
}

if (typeof module !== 'undefined') module.exports = { extractJob };
