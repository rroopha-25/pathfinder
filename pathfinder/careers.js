// Career-page matching: on a company careers page, read every listed job, score each one
// against the saved resume, and surface the best matches (75%+ by default).

// ---------- Runs IN THE PAGE (via chrome.scripting). Must stay self-contained. ----------
function findJobListings() {
  const here = location.href.split('#')[0];
  const host = location.hostname;
  const BOARDS = /(^|\.)(linkedin|indeed|glassdoor|ziprecruiter|dice|google|jobright|joinhandshake|wellfound)\.(com|ai)$/;
  if (BOARDS.test(host)) return { url: here, host, ats: null, links: [], board: true };

  // Which applicant tracking system powers this board? (Including boards embedded in an iframe.)
  const atsFrom = (u) => {
    let x; try { x = new URL(u, here); } catch (e) { return null; }
    const seg = x.pathname.split('/').filter(Boolean);
    if (/(^|\.)greenhouse\.io$/.test(x.hostname)) {
      const slug = x.searchParams.get('for') || (seg[0] !== 'embed' ? seg[0] : '');
      return slug ? { type: 'greenhouse', slug } : null;
    }
    if (x.hostname === 'jobs.lever.co' && seg[0]) return { type: 'lever', slug: seg[0] };
    if (x.hostname === 'jobs.ashbyhq.com' && seg[0]) return { type: 'ashby', slug: seg[0] };
    if (/\.myworkday(jobs|site)\.com$/.test(x.hostname)) {
      const s = seg.filter((p) => !/^[a-z]{2}-[A-Z]{2}$/.test(p));
      const site = s[0] === 'recruiting' ? s[2] : s[0];
      if (site && site !== 'wday') return { type: 'workday', host: x.hostname, tenant: s[0] === 'recruiting' ? s[1] : x.hostname.split('.')[0], site };
    }
    return null;
  };
  // Job data the page itself loaded (career sites built on an ATS fetch its API in the background).
  const apiFrom = (u) => {
    let x; try { x = new URL(u); } catch (e) { return null; }
    const p = x.pathname;
    let m;
    if (/(^|\.)greenhouse\.io$/.test(x.hostname) && (m = p.match(/\/v1\/boards\/([^/]+)/))) return { type: 'greenhouse', slug: m[1] };
    if (x.hostname === 'api.lever.co' && (m = p.match(/\/v0\/postings\/([^/?]+)/))) return { type: 'lever', slug: m[1] };
    if (x.hostname === 'api.ashbyhq.com' && (m = p.match(/job-board\/([^/?]+)/))) return { type: 'ashby', slug: m[1] };
    if (x.hostname === 'jobs.ashbyhq.com' && x.searchParams.get('organizationHostedJobsPageName')) return { type: 'ashby', slug: x.searchParams.get('organizationHostedJobsPageName') };
    if (/\.myworkday(jobs|site)\.com$/.test(x.hostname) && (m = p.match(/\/wday\/cxs\/([^/]+)\/([^/]+)\/jobs/))) return { type: 'workday', host: x.hostname, tenant: m[1], site: m[2] };
    if (x.hostname === 'api.smartrecruiters.com' && (m = p.match(/\/companies\/([^/]+)\/postings/))) return { type: 'smartrecruiters', slug: m[1] };
    return null;
  };
  let ats = atsFrom(here);
  if (!ats) {
    for (const el of document.querySelectorAll('iframe[src], script[src]')) { ats = atsFrom(el.getAttribute('src')) || apiFrom(el.src); if (ats) break; }
  }
  const resources = (performance.getEntriesByType ? performance.getEntriesByType('resource') : []).map((e) => e.name);
  if (!ats) for (const r of resources) { ats = apiFrom(r); if (ats) break; }
  const apiHosts = [...new Set(resources.filter((r) => /job|career|posting|recruit|talent|requisition/i.test(r)).map((r) => { try { return new URL(r).hostname; } catch (e) { return ''; } }))].slice(0, 12);

  // Links that look like individual job postings.
  const JOB_PATH = /\/(jobs?|careers?|positions?|openings?|opportunit(y|ies)|vacanc(y|ies)|requisitions?|job-details|postings?)\/|[?&](gh_jid|jobid|job_id|jid|ajid)=|jobs\.lever\.co\/[^/]+\/[0-9a-f-]{20,}|jobs\.ashbyhq\.com\/[^/]+\/[0-9a-f-]{20,}|\/job\/[^/]+\/[^/]+/i;
  const NAV = /^(jobs?|careers?|open (roles|positions|jobs)|all (jobs|openings|roles)|view (all|more|jobs|openings|details|job)|see (all|more|openings)|search( jobs)?|apply( now)?|learn more|read more|benefits|life at|our (team|culture|values)|sign in|log in|join (us|our talent)|back|next|previous|home|students?|university|internships?|teams?|locations?|faqs?|privacy.*|cookie.*|\d+)$/i;
  const GENERIC = /^(apply( now| here| today| online)?|view( (the )?(job|details|role|position|posting|opening))?|details|job details|learn more|read more|more( info)?|see (job|details|more|role)|open( role)?|[→›>»]|go)$/i;
  const SECTION = /^(about|job description|description|responsibilities|qualifications|requirements|essential|minimum|desired|preferred|benefits|salary|compensation|location|how to apply|overview|summary|duties|what you|who you|apply)/i;
  const HEAD = 'h1,h2,h3,h4,h5,h6,summary,button[aria-expanded],[class*="title" i],[class*="heading" i],[class*="header" i]';
  const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const okHead = (t) => t.length >= 4 && t.length <= 140 && !SECTION.test(t) && !GENERIC.test(t) && !NAV.test(t);
  function titleFromContext(a) {
    let node = a;
    for (let depth = 0; depth < 7 && node && node !== document.body; depth++) {
      // Headers just before this block (accordion header above its panel; card title above its button).
      let sib = node.previousElementSibling;
      for (let k = 0; sib && k < 4; k++, sib = sib.previousElementSibling) {
        const h = sib.matches(HEAD) ? sib : sib.querySelector(HEAD);
        const t = clean(h && h.textContent);
        if (okHead(t)) return t;
        if (sib.querySelector('a[href]') && JOB_PATH.test(sib.querySelector('a[href]').href)) break; // that's another job's row
      }
      node = node.parentElement;
      // A row/card that holds this link and a heading.
      if (node && node.querySelectorAll('a[href]').length <= 3) {
        const h = [...node.querySelectorAll(HEAD)].find((x) => !x.contains(a) && okHead(clean(x.textContent)));
        if (h) return clean(h.textContent);
      }
    }
    return '';
  }
  const seen = new Set();
  const links = [];
  for (const a of document.querySelectorAll('a[href], [data-href], [data-url], [data-link]')) {
    let u; try { u = new URL(a.getAttribute('href') || a.getAttribute('data-href') || a.getAttribute('data-url') || a.getAttribute('data-link'), here); } catch (e) { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    u.hash = '';
    const href = u.href;
    if (href === here || seen.has(href)) continue;
    if (!JOB_PATH.test(href)) continue;
    // Listing paths like /careers/ or /jobs/ alone are navigation, not a posting.
    if (/\/(jobs?|careers?|positions?|openings?)\/?$/i.test(u.pathname) && !u.search) continue;
    const c = a.cloneNode(true);
    c.querySelectorAll('br, div, p, span, li, h1, h2, h3, h4, h5, h6').forEach((n) => n.after('\n'));
    const lines = (c.textContent || '').split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    let title = (a.querySelector('h1,h2,h3,h4,h5,[class*="title" i]')?.textContent || lines[0] || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
    // "Apply now" / "View job" buttons: the job title sits in the row or accordion header above the link.
    if (title.length < 4 || GENERIC.test(title)) title = titleFromContext(a);
    // Workday URLs carry the title: /job/EdTech-Innovation-Fellow_JR128580
    if ((title.length < 4 || GENERIC.test(title)) && /myworkday(jobs|site)\.com$/.test(u.hostname)) {
      title = decodeURIComponent(u.pathname.split('/').pop() || '').replace(/_[A-Z]*-?\d[\w-]*$/, '').replace(/-+/g, ' ').trim();
    }
    if (title.length < 4 || title.length > 140 || NAV.test(title) || GENERIC.test(title)) continue;
    // Location: a second line inside the link, or a sibling element in the same row.
    const row = a.closest('li, tr, [class*="job" i], [class*="posting" i], [class*="opening" i], [class*="position" i]') || a.parentElement;
    const locEl = row && row.querySelector('[class*="location" i], [data-testid*="location" i]');
    const location = (locEl ? locEl.textContent : lines.slice(1).find((l) => /,|remote|hybrid|on-?site/i.test(l)) || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    // The posting text is often right on this page (accordions, expandable cards): keep it as a fallback.
    let box = null, node = a;
    for (let depth = 0; depth < 8; depth++) {
      node = node.parentElement;
      if (!node || node === document.body) break;
      const others = [...node.querySelectorAll('a[href]')].filter((x) => x !== a && JOB_PATH.test(x.href) && x.href.split('#')[0] !== href);
      if (others.length) break;
      box = node;
    }
    let inlineText = '';
    if (box) {
      const bc = box.cloneNode(true);
      bc.querySelectorAll('script, style, svg, noscript').forEach((n) => n.remove());
      bc.querySelectorAll('br, div, p, li, h1, h2, h3, h4, h5, h6, tr').forEach((n) => n.after('\n'));
      inlineText = (bc.textContent || '').replace(/[ \t\u00a0]+/g, ' ').replace(/\n\s*/g, '\n').trim().slice(0, 8000);
    }
    seen.add(href);
    links.push({ url: href, title, location, inlineText });
    if (links.length >= 300) break;
  }
  return { url: here, host, ats, links, title: document.title, apiHosts, anchors: document.querySelectorAll('a[href]').length };
}

// ---------- Runs in the side panel ----------
const MATCH_LIMITS = { pages: 40, workday: 60, concurrency: 3, delayMs: 250 };

function decodeEntities(s) {
  const t = new DOMParser().parseFromString(`<!doctype html><body>${s || ''}`, 'text/html');
  return t.body.textContent || '';
}

// HTML → readable text with line breaks between blocks (no layout engine needed).
function htmlToText(html) {
  const doc = typeof html === 'string' ? new DOMParser().parseFromString(html, 'text/html') : html;
  const root = doc.body || doc;
  root.querySelectorAll('script, style, noscript, svg, template, iframe').forEach((n) => n.remove());
  root.querySelectorAll('p, li, br, div, h1, h2, h3, h4, h5, h6, tr, section, article, ul, ol').forEach((n) => n.after(doc.createTextNode('\n')));
  root.querySelectorAll('li').forEach((n) => n.before(doc.createTextNode('• ')));
  return (root.textContent || '').replace(/[ \t ]+/g, ' ').replace(/\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function findJobPostingLd(doc) {
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let data; try { data = JSON.parse(s.textContent); } catch (e) { continue; }
    const stack = [data];
    while (stack.length) {
      const n = stack.pop();
      if (!n || typeof n !== 'object') continue;
      if (Array.isArray(n)) { stack.push(...n); continue; }
      const t = n['@type'];
      if (t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'))) return n;
      if (n['@graph']) stack.push(n['@graph']);
    }
  }
  return null;
}

function ldLocation(ld) {
  const locs = [].concat(ld.jobLocation || []);
  const parts = locs.map((l) => { const a = (l && l.address) || {}; return [a.addressLocality, a.addressRegion].filter(Boolean).join(', '); }).filter(Boolean);
  if (parts.length) return parts.slice(0, 2).join(' · ');
  return /TELECOMMUTE/i.test(ld.jobLocationType || '') ? 'Remote' : '';
}

// A fetched job page → { title, company, location, text }. JSON-LD first, then the main content.
function parseJobHtml(html, url) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const ld = findJobPostingLd(doc);
  if (ld && ld.description) {
    return {
      title: decodeEntities(ld.title || ''), company: (ld.hiringOrganization && ld.hiringOrganization.name) || '',
      location: ldLocation(ld), text: htmlToText(decodeEntities(ld.description).includes('<') ? decodeEntities(ld.description) : ld.description),
    };
  }
  const title = (doc.querySelector('h1')?.textContent || doc.title || '').replace(/\s+/g, ' ').trim();
  const main = doc.querySelector('main, article, [role="main"], #content, .content, [class*="description" i]') || doc.body;
  main.querySelectorAll('nav, header, footer, form, aside').forEach((n) => n.remove());
  return { title, company: '', location: '', text: htmlToText(main.outerHTML) };
}

const titleCase = (s) => (s || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

async function getJson(fetchFn, url, opts) {
  const res = await fetchFn(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Public job-board APIs: one request returns every job with its description.
async function loadAtsJobs(ats, { fetchFn = fetch, onProgress = () => {} } = {}) {
  if (ats.type === 'greenhouse') {
    const base = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(ats.slug)}`;
    const [data, board] = await Promise.all([getJson(fetchFn, base + '/jobs?content=true'), getJson(fetchFn, base).catch(() => ({}))]);
    return (data.jobs || []).map((j) => ({
      title: j.title, location: (j.location && j.location.name) || '', url: j.absolute_url,
      company: j.company_name || board.name || titleCase(ats.slug), text: htmlToText(decodeEntities(j.content)),
    }));
  }
  if (ats.type === 'lever') {
    const data = await getJson(fetchFn, `https://api.lever.co/v0/postings/${encodeURIComponent(ats.slug)}?mode=json`);
    return (data || []).map((j) => ({
      title: j.text, location: (j.categories && (j.categories.location || (j.categories.allLocations || []).join(' · '))) || '',
      url: j.hostedUrl, company: titleCase(ats.slug),
      text: [j.descriptionPlain, ...(j.lists || []).map((l) => `${l.text}\n${htmlToText(l.content)}`), j.additionalPlain].filter(Boolean).join('\n\n'),
    }));
  }
  if (ats.type === 'ashby') {
    const data = await getJson(fetchFn, `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(ats.slug)}`);
    return (data.jobs || []).filter((j) => j.isListed !== false).map((j) => ({
      title: j.title, location: [j.location, j.isRemote ? 'Remote' : ''].filter(Boolean).join(' · '),
      url: j.jobUrl, company: titleCase(ats.slug), text: j.descriptionPlain || htmlToText(j.descriptionHtml || ''),
    }));
  }
  if (ats.type === 'smartrecruiters') {
    const base = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(ats.slug)}/postings`;
    const list = (await getJson(fetchFn, base + '?limit=100')).content || [];
    const out = [];
    await runPool(list.slice(0, MATCH_LIMITS.workday), async (p, i) => {
      const d = await getJson(fetchFn, `${base}/${p.id}`).catch(() => null);
      const sec = (d && d.jobAd && d.jobAd.sections) || {};
      const loc = p.location || {};
      out[i] = {
        title: p.name, location: loc.remote ? 'Remote' : [loc.city, loc.region].filter(Boolean).join(', '),
        url: (d && d.postingUrl) || `https://jobs.smartrecruiters.com/${ats.slug}/${p.id}`,
        company: (p.company && p.company.name) || titleCase(ats.slug),
        text: ['jobDescription', 'qualifications', 'additionalInformation'].map((k) => sec[k] && htmlToText(sec[k].text || '')).filter(Boolean).join('\n\n'),
      };
      onProgress(out.filter(Boolean).length, list.length);
    });
    return out.filter(Boolean);
  }
  if (ats.type === 'workday') {
    const base = `https://${ats.host}/wday/cxs/${ats.tenant}/${ats.site}`;
    const list = [];
    for (let offset = 0; offset < MATCH_LIMITS.workday; offset += 20) {
      const page = await getJson(fetchFn, base + '/jobs', {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: '' }),
      });
      list.push(...(page.jobPostings || []));
      if (!page.jobPostings || page.jobPostings.length < 20 || list.length >= (page.total || 0)) break;
    }
    const out = [];
    await runPool(list.slice(0, MATCH_LIMITS.workday), async (p, i) => {
      const d = await getJson(fetchFn, base + p.externalPath, { headers: { accept: 'application/json' } }).catch(() => null);
      const info = (d && d.jobPostingInfo) || {};
      out[i] = {
        title: info.title || p.title, location: info.location || p.locationsText || '',
        url: info.externalUrl || `https://${ats.host}/${ats.site}${p.externalPath}`,
        company: (d && d.hiringOrganization && d.hiringOrganization.name) || titleCase(ats.tenant),
        text: htmlToText(info.jobDescription || ''),
      };
      onProgress(out.filter(Boolean).length, list.length);
    });
    return out.filter(Boolean);
  }
  return [];
}

async function runPool(items, worker, { concurrency = MATCH_LIMITS.concurrency, delayMs = MATCH_LIMITS.delayMs } = {}) {
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
}

// A Workday job URL → its JSON API (https://acme.wd1.myworkdayjobs.com/en-US/Site/job/Title_R1 → /wday/cxs/acme/Site/job/Title_R1)
function workdayJobApi(url) {
  let u; try { u = new URL(url); } catch (e) { return null; }
  if (!/\.myworkday(jobs|site)\.com$/.test(u.hostname)) return null;
  const seg = u.pathname.split('/').filter((p) => p && !/^[a-z]{2}-[A-Z]{2}$/.test(p));
  let tenant = u.hostname.split('.')[0], rest = seg;
  if (seg[0] === 'recruiting') { tenant = seg[1]; rest = seg.slice(2); }
  const j = rest.indexOf('job');
  if (j !== 1) return null;
  return `https://${u.hostname}/wday/cxs/${tenant}/${rest[0]}/${rest.slice(1).join('/')}`;
}

// The job links on the page themselves point at an ATS board (e.g. a company page linking to Lever).
function atsFromLinks(links) {
  for (const l of links) {
    let u; try { u = new URL(l.url); } catch (e) { continue; }
    const seg = u.pathname.split('/').filter(Boolean);
    if (u.hostname === 'jobs.lever.co' && seg[0]) return { type: 'lever', slug: seg[0] };
    if (u.hostname === 'jobs.ashbyhq.com' && seg[0]) return { type: 'ashby', slug: seg[0] };
    if (/^(boards|job-boards)\.greenhouse\.io$/.test(u.hostname) && seg[0] && seg[1] === 'jobs') return { type: 'greenhouse', slug: seg[0] };
  }
  return null;
}

function linkOrigins(links) {
  return [...new Set(links.map((l) => { try { return new URL(l.url).origin + '/*'; } catch (e) { return null; } }).filter(Boolean))];
}

// Read every job (ATS API when possible, otherwise each linked page, politely), then score.
async function collectJobs(listing, { fetchFn = fetch, onProgress = () => {}, fallbackCompany = '' } = {}) {
  const ats = listing.ats || atsFromLinks(listing.links);
  if (ats) {
    try {
      const jobs = await loadAtsJobs(ats, { fetchFn, onProgress });
      if (jobs.length) return { jobs, source: ats.type, total: jobs.length };
    } catch (e) { /* fall back to reading the pages */ }
  }
  const links = listing.links.slice(0, MATCH_LIMITS.pages);
  const jobs = [];
  let done = 0;
  const inline = (l) => ({ title: l.title, location: l.location, url: l.url, company: fallbackCompany, text: l.inlineText });
  await runPool(links, async (l, i) => {
    // Full description already on this page → no need to fetch anything.
    if ((l.inlineText || '').length >= 800) { jobs[i] = inline(l); onProgress(++done, links.length); return; }
    try {
      const wd = workdayJobApi(l.url);
      if (wd) {
        const d = await getJson(fetchFn, wd, { headers: { accept: 'application/json' } });
        const info = (d && d.jobPostingInfo) || {};
        jobs[i] = { title: info.title || l.title, location: info.location || l.location, url: l.url,
          company: (d.hiringOrganization && d.hiringOrganization.name) || fallbackCompany, text: htmlToText(info.jobDescription || '') };
      } else {
        const res = await fetchFn(l.url, { credentials: 'omit' });
        if (res.ok) {
          const p = parseJobHtml(await res.text(), l.url);
          jobs[i] = { title: l.title || p.title, location: l.location || p.location, url: l.url, company: p.company || fallbackCompany, text: p.text };
        }
      }
    } catch (e) { /* unreadable page */ }
    if ((!jobs[i] || (jobs[i].text || '').length < 300) && (l.inlineText || '').length > ((jobs[i] && jobs[i].text) || '').length) jobs[i] = inline(l);
    onProgress(++done, links.length);
  });
  return { jobs: jobs.filter(Boolean), source: 'pages', total: listing.links.length };
}

// Score jobs against the resume. A job needs some real description to be scored fairly.
function rankJobs(jobs, resume) {
  return jobs.map((j) => {
    const readable = (j.text || '').length >= 300;
    const s = readable ? scoreResume(resume, j.text, j.title) : null;
    return { ...j, readable, score: s ? s.score : null, matched: s ? s.matched.slice(0, 4) : [], missing: s ? s.missing.filter((m) => m.required).slice(0, 3).map((m) => m.term) : [], sponsor: scanSponsorship(j.text || '') };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

if (typeof module !== 'undefined') module.exports = { workdayJobApi, findJobListings, htmlToText, parseJobHtml, loadAtsJobs, collectJobs, rankJobs, atsFromLinks, linkOrigins, runPool, MATCH_LIMITS };
