// ---------- Runs INSIDE the LinkedIn page (self-contained) ----------
// Reads people visible on: post search results, people search, company People page.
function extractLinkedInPeople() {
  const txt = (el) => (el ? (el.innerText || el.textContent || '').trim() : '');
  const visible = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  const slugOf = (href) => ((href || '').match(/\/in\/([^/?#]+)/) || [])[1] || '';
  const JUNK = /^(connect|follow|message|view .*profile|linkedin member|see more|…more|more|pending|\d+(st|nd|rd|th)?|•|status is (online|offline|reachable))$/i;

  const cleanName = (a) => {
    const hidden = a.querySelector('span[aria-hidden="true"]');
    let n = txt(hidden) || txt(a).split('\n')[0];
    n = n.replace(/View .*?profile/i, '').replace(/\s*•.*$/, '').replace(/\s+(1st|2nd|3rd\+?)$/, '').trim();
    return n;
  };
  const agoDays = (t) => {
    const m = (t || '').slice(0, 400).match(/(?:^|[\s•·])(\d+)\s?(s|m|min|h|hr|d|w|mo|yr|y)\b/i);
    if (!m) return null;
    const n = +m[1], u = m[2].toLowerCase();
    if (u === 'd') return n;
    if (u === 'w') return n * 7;
    if (u === 'mo') return n * 30;
    if (u === 'yr' || u === 'y') return n * 365;
    return 0; // seconds, minutes, hours
  };

  const url = location.href;
  const mode = /\/search\/results\/content/.test(url) ? 'posts'
    : /\/company\/[^/]+\/people/.test(url) ? 'company_people'
    : /\/search\/results\/people/.test(url) ? 'people_search' : 'other';

  const people = [];
  const seen = new Set();

  // Posts mode: one card per post, author = first profile link in the post.
  const postSelectors = ['[data-urn*="urn:li:activity"]', '.feed-shared-update-v2', '[data-view-name="feed-full-update"]', 'div[role="article"]'];
  let posts = [];
  if (mode === 'posts') {
    for (const s of postSelectors) {
      posts = Array.from(document.querySelectorAll(s)).filter(visible);
      if (posts.length) break;
    }
  }

  if (posts.length) {
    for (const post of posts) {
      const a = Array.from(post.querySelectorAll('a[href*="/in/"]')).find((x) => cleanName(x));
      if (!a) continue;
      const slug = slugOf(a.href);
      const text = txt(post);
      const name = cleanName(a);
      const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !JUNK.test(l) && l !== name);
      people.push({
        name, slug, profileUrl: `https://www.linkedin.com/in/${slug}/`,
        headline: lines[0] || '',
        degree: (text.match(/\b(1st|2nd|3rd)\b/) || [])[1] || '',
        postedDaysAgo: agoDays(text),
        postText: text.slice(0, 600),
        source: 'posts',
      });
    }
  } else {
    // People cards: group profile links, climb to the card that holds only that person.
    const anchors = Array.from(document.querySelectorAll('a[href*="/in/"]')).filter(visible);
    for (const a of anchors) {
      const slug = slugOf(a.href);
      if (!slug || seen.has(slug)) continue;
      const name = cleanName(a);
      if (!name || name.length > 80 || JUNK.test(name)) continue;
      let card = a;
      for (let i = 0; i < 7; i++) {
        const p = card.parentElement;
        if (!p) break;
        const slugs = new Set(Array.from(p.querySelectorAll('a[href*="/in/"]')).map((x) => slugOf(x.href)));
        if (slugs.size > 1) break;
        card = p;
      }
      seen.add(slug);
      const text = txt(card);
      const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !JUNK.test(l) && l !== name);
      // LinkedIn people cards: name, headline, then a location line like "Tempe, Arizona" or "Greater Phoenix Area".
      const LOC_RE = /(\barea\b|metroplex|metropolitan|united states|^remote$|, [a-z][a-z .]+$|^[a-z .]+, [a-z]{2}$)/i;
      const loc = lines.slice(1, 5).find((l) => l.length < 70 && LOC_RE.test(l) &&
        !/( at |@|\||·|•|followers|connections|mutual|current:|past:|summary:|skills:)/i.test(l)) || '';
      people.push({
        name, slug, profileUrl: `https://www.linkedin.com/in/${slug}/`,
        headline: lines[0] || '',
        location: loc,
        degree: (text.match(/\b(1st|2nd|3rd)\b/) || [])[1] || '',
        postedDaysAgo: null,
        postText: '',
        context: lines.slice(1, 4).join(' · ').slice(0, 200),
        source: mode,
      });
    }
  }
  return { mode, url, people: people.slice(0, 80) };
}

// ---------- Ranking (runs in the side panel) ----------
const TITLE_STOP = new Set(['senior', 'sr', 'junior', 'jr', 'lead', 'principal', 'staff', 'associate', 'specialist', 'i', 'ii', 'iii', 'iv', 'the', 'and', 'of', 'for', 'to', 'a', 'an', 'in', 'with', 'remote', 'hybrid', 'intern', 'contract', 'level', 'entry']);
const RECRUITER_RE = /\b(recruit\w*|talent|sourc\w*|people partner|hrbp|human resources|hiring partner|university relations|campus)\b/i;
const HIRING_RE = /\b(we'?re hiring|i'?m hiring|now hiring|hiring|join (my|our) team|open role|open position|referr?al|looking for|come work with)\b/i;
const MANAGER_RE = /\b(manager|director|head of|lead|vp|vice president|founder|cto|ceo|coo)\b/i;

const LOC_TIER = { match: 0, state: 1, unknown: 2, other: 3 };

function titleTokens(title) {
  return (title || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !TITLE_STOP.has(w));
}

function mergePeople(existing, incoming) {
  const map = new Map((existing || []).map((p) => [p.slug, p]));
  for (const p of incoming) {
    const old = map.get(p.slug);
    if (!old) { map.set(p.slug, { ...p, firstSeen: Date.now() }); continue; }
    map.set(p.slug, {
      ...old,
      headline: old.headline || p.headline,
      degree: old.degree || p.degree,
      location: old.location || p.location || '',
      postedDaysAgo: [old.postedDaysAgo, p.postedDaysAgo].filter((x) => x !== null && x !== undefined).sort((a, b) => a - b)[0] ?? null,
      postText: (old.postText + ' ' + p.postText).trim().slice(0, 1200),
      sources: Array.from(new Set([...(old.sources || [old.source]), p.source])),
    });
  }
  return Array.from(map.values()).slice(-200);
}

// ctx: { company, jobTitle, hiringTeam: [], profile: {school, country, pastEmployers: []},
//        locationMatcher (from buildLocationMatcher), locationStrict: hide people clearly elsewhere }
function rankPeople(people, ctx) {
  const companyNorm = (ctx.company || '').toLowerCase();
  const tokens = titleTokens(ctx.jobTitle);
  const profile = ctx.profile || {};
  const team = (ctx.hiringTeam || []).map((n) => n.toLowerCase());

  return people
    .map((p) => {
      const hay = `${p.headline} ${p.context || ''}`.toLowerCase();
      const all = `${hay} ${(p.postText || '').toLowerCase()}`;
      const reasons = [];
      let score = 0;
      const add = (pts, why) => { score += pts; if (why) reasons.push(why); };

      if (team.includes(p.name.toLowerCase())) add(50, 'On this job\'s hiring team');

      // Location: people in the chosen area rank first; others are hidden when "only this area" is on.
      const locLevel = typeof matchLocation === 'function' ? matchLocation(p.location, ctx.locationMatcher) : 'match';
      if (ctx.locationMatcher) {
        if (locLevel === 'match') add(25, `In ${ctx.locationMatcher.label.replace(/ area$/, '')}`);
        else if (locLevel === 'state') add(8, `Same state (${p.location})`);
        else if (locLevel === 'other') add(-30, `Based in ${p.location}`);
        else add(-5, 'Location unknown');
      }

      const worksThere = companyNorm && hay.includes(companyNorm);
      const fromCompanyPage = (p.sources || [p.source]).includes('company_people');
      if (worksThere || fromCompanyPage) add(10, null);
      else if (p.source === 'posts' || p.source === 'people_search') add(-15, 'Confirm they work there');

      if (p.postedDaysAgo !== null && p.postedDaysAgo !== undefined) {
        if (p.postedDaysAgo <= 7) add(30, `Posted ${p.postedDaysAgo === 0 ? 'today' : p.postedDaysAgo + 'd ago'}`);
        else if (p.postedDaysAgo <= 30) add(15, `Posted ${p.postedDaysAgo}d ago`);
      }
      if (HIRING_RE.test(p.postText || '')) add(20, 'Posted about hiring');
      else if (HIRING_RE.test(hay)) add(12, 'Headline mentions hiring');

      if (RECRUITER_RE.test(hay)) add(20, 'Recruiter / talent team');
      const fnMatch = tokens.filter((t) => hay.includes(t));
      if (fnMatch.length) {
        add(15, `Works in ${fnMatch.slice(0, 2).join(' / ')}`);
        if (MANAGER_RE.test(hay)) add(10, 'Likely hiring-manager level');
      }

      if (profile.school && all.includes(profile.school.toLowerCase())) add(15, `Same school (${profile.school})`);
      if (profile.country && all.includes(profile.country.toLowerCase())) add(10, `Same home country`);
      for (const emp of profile.pastEmployers || []) {
        if (emp && all.includes(emp.toLowerCase())) { add(10, `Also worked at ${emp}`); break; }
      }

      if (p.degree === '1st') add(15, '1st-degree connection');
      else if (p.degree === '2nd') add(8, '2nd-degree connection');

      return { ...p, score, reasons, locLevel };
    })
    .filter((p) => !(ctx.locationStrict && ctx.locationMatcher && p.locLevel === 'other' && !team.includes(p.name.toLowerCase())))
    // With a location picked, location decides the order first (in area → same state → unknown → elsewhere),
    // then activity and fit decide the order inside each group.
    .sort((a, b) => (ctx.locationMatcher ? LOC_TIER[a.locLevel] - LOC_TIER[b.locLevel] : 0) || b.score - a.score);
}

if (typeof module !== 'undefined') {
  if (typeof matchLocation === 'undefined') global.matchLocation = require('./location.js').matchLocation;
  module.exports = { extractLinkedInPeople, rankPeople, mergePeople, titleTokens };
}
