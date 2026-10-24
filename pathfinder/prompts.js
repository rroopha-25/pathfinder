// ============================================================
//  PATHFINDER PROMPTS — edit these to change how the AI behaves.
//  Reload the extension after editing.
// ============================================================

const RESUME_SYSTEM_PROMPT = `You are an expert resume coach who helps job seekers — many of them international students on F-1 OPT — get past ATS filters and recruiter screens.

You suggest precise, line-level edits to an existing resume so it better matches one specific job posting.

NON-NEGOTIABLE RULES
1. Never invent anything. No new employers, titles, dates, degrees, certifications, tools, or numbers that are not already in the resume.
2. Only add a job keyword to a line when that line already describes work that genuinely involves it. If the resume has no evidence for a keyword, put it in "gaps", not in an edit.
3. If a line would be stronger with a metric the resume doesn't have, use a bracketed placeholder like [X%] or [N clients] and say in "needs_input" what number the person should fill in.
4. "original" must be copied EXACTLY from the resume, character for character, so the person can find it.
5. Keep each revised bullet to one line (under ~30 words), starting with a strong past-tense verb (present tense for a current role).
6. Mirror the posting's exact wording for skills (e.g. if the posting says "stakeholder management", use that phrase, not a synonym) — this is what ATS systems match on.
7. Prioritize the edits that close the biggest gaps between the resume and the posting's REQUIRED qualifications.

Return ONLY valid JSON, no prose, in this shape:
{
  "fit_summary": "One honest sentence on how well this resume fits this role today.",
  "edits": [
    {
      "section": "e.g. Experience — Uber",
      "original": "exact line from the resume",
      "revised": "improved line",
      "why": "short reason, naming the posting requirement it addresses",
      "keywords_added": ["exact phrases from the posting"],
      "needs_input": "what number/detail to fill in, or empty string"
    }
  ],
  "summary_line": { "original": "exact current summary/headline line or empty string", "revised": "tailored 1–2 sentence summary" },
  "gaps": [
    { "keyword": "missing requirement", "advice": "honest advice: highlight related experience, mention in cover letter, learn it, or accept the gap" }
  ]
}
Give 4–6 edits, ordered by impact.`;

function buildResumeUserPrompt({ job, resume, score }) {
  const missing = score.missing.map((m) => m.term + (m.required ? ' (required)' : '')).join(', ') || 'none';
  return `JOB TITLE: ${job.title}
COMPANY: ${job.company}

JOB POSTING:
"""
${(job.description || '').slice(0, 9000)}
"""

RESUME:
"""
${resume.slice(0, 12000)}
"""

KEYWORD CHECK (automated): matched = ${score.matched.join(', ') || 'none'}; missing = ${missing}.
Current match score: ${score.score}/100.

Suggest the edits.`;
}

// ============================================================
//  LINKEDIN DM PROMPT — your template. The panel fills the [brackets] for each person.
// ============================================================
const OUTREACH_SYSTEM_PROMPT = `You write short LinkedIn outreach for job seekers. You never invent facts about the sender or the recipient: use only the details provided. Never mention visas, sponsorship or OPT. Never ask for a referral or a job directly in the first message. Return JSON only.`;

const OUTREACH_TEMPLATE = `Write a casual LinkedIn DM to [NAME - TITLE] at [COMPANY] about the [JOB TITLE] role.

Their role: [THEIR JOB TITLE]
Their background: [THEIR BACKGROUND]
The job I'm applying for: [JOB DESCRIPTION]
My background in 1 sentence: [MY BACKGROUND]

Make it:
- 4-6 sentences max (if sending as message)
- 300 characters or less (if sending as connection note)
- Ask ONE smart question about the role based on their position
- NO résumé flex or credentials bragging
- Sounds like a real conversation, not a template
- Shows genuine curiosity, not desperation
- Natural opener if there's a connection (school, location, etc.)

Tone: Humble, curious, human-to-human.`;

// Their job title from a LinkedIn headline: "Senior Recruiter at Confido | Hiring" → "Senior Recruiter"
function roleFromHeadline(headline, company) {
  const h = (headline || '').split(/\s[|•·]\s/)[0];
  const m = h.match(/^(.*?)\s+(?:at|@)\s+/i);
  return (m ? m[1] : h).trim() || 'Employee';
}

// Connections worth opening with (school, location, past employer, a recent post).
function sharedContext(person, profile, job) {
  const bits = [];
  for (const r of person.reasons || []) {
    if (/same school/i.test(r)) bits.push(`we both went to ${profile.school}`);
    else if (/same home country/i.test(r)) bits.push(`we're both from ${profile.country}`);
    else if (/also worked at/i.test(r)) bits.push(r.replace(/^Also worked at/i, 'we both worked at'));
    else if (/^In /.test(r) && person.location) bits.push(`we're both in the ${person.location} area`);
  }
  if (person.postText && /hiring|join|team/i.test(person.postText)) bits.push(`they recently posted: "${person.postText.replace(/\s+/g, ' ').slice(0, 220)}"`);
  return bits;
}

function buildOutreachUserPrompt({ person, job, profile, myBackground, resume }) {
  const role = roleFromHeadline(person.headline, job.company);
  const ctx = sharedContext(person, profile, job);
  const background = [person.headline, person.location && `based in ${person.location}`, ...ctx].filter(Boolean).join('; ');
  const jd = (job.description || '').replace(/\s+/g, ' ').slice(0, 1800);
  const me = (myBackground || '').trim();
  const filled = OUTREACH_TEMPLATE
    .replace('[NAME - TITLE]', `${person.name} - ${role}`)
    .replace('[COMPANY]', job.company)
    .replace('[JOB TITLE]', job.title)
    .replace('[THEIR JOB TITLE]', role)
    .replace('[THEIR BACKGROUND]', background || 'Not much on their profile')
    .replace('[JOB DESCRIPTION]', `Summarize this posting in 1-2 sentences for yourself, then use it: ${jd}`)
    .replace('[MY BACKGROUND]', me || `Write one sentence from this resume, without bragging: ${(resume || '').replace(/\s+/g, ' ').slice(0, 1500)}`);
  return `${filled}

Return JSON with:
- "connection_note": the 300-character-or-less version (count carefully; it must fit LinkedIn's connection note limit)
- "message": the 4-6 sentence version
- "question": the one question you asked
Start both with "Hi ${person.name.split(' ')[0]},"`;
}

// No-AI fallback that follows the same rules: short, humble, one question, no bragging.
function outreachMessage(person, job, profile = {}) {
  const first = (person.name || '').split(' ')[0] || 'there';
  const role = roleFromHeadline(person.headline, job.company);
  const ctx = sharedContext(person, profile, job).filter((b) => !b.startsWith('they recently posted'));
  const opener = /hiring/i.test(person.postText || '')
    ? `saw your post about the team hiring`
    : ctx.length ? `noticed ${ctx[0]}` : `came across your profile while looking at ${job.company}`;
  const question = /recruit|talent/i.test(role)
    ? `what does the team look for most in someone stepping into this role?`
    : `what does a typical week look like for the ${job.title} role on your side?`;
  const msg = `Hi ${first}, ${opener}. I'm looking at the ${job.title} role at ${job.company} and I'm curious: ${question}`;
  return msg.length <= 300 ? msg : `Hi ${first}, I'm looking at the ${job.title} role at ${job.company}. Curious: ${question}`.slice(0, 300);
}

if (typeof module !== 'undefined') module.exports = { RESUME_SYSTEM_PROMPT, buildResumeUserPrompt, outreachMessage, OUTREACH_SYSTEM_PROMPT, OUTREACH_TEMPLATE, buildOutreachUserPrompt, roleFromHeadline };
