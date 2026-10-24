// Combines job-description language with the company's H-1B history into one clear answer.
// level: 'go' | 'caution' | 'stop' | 'unknown'

const LABEL_KIND = {
  'Security clearance required': 'legal_no',
  'Citizenship / green card required': 'legal_no',
  'Requires no future sponsorship': 'future_no',
  'Says no sponsorship': 'soft_no',
  'Mentions offering sponsorship': 'yes',
  'Sponsorship available': 'yes',
  'H-1B transfer mentioned': 'yes',
};
const KIND_RANK = ['legal_no', 'future_no', 'soft_no', 'yes'];

function jdKind(scan) {
  const kinds = new Set(scan.matches.map((m) => LABEL_KIND[m.label]));
  return KIND_RANK.find((k) => kinds.has(k)) || 'silent';
}

function historyLine(h1b, company) {
  if (!h1b || h1b.status === 'no_data') return '';
  if (h1b.status === 'none') return `No H-1B filings found for "${company}" in USCIS data.`;
  const latest = h1b.rows[0];
  const name = h1b.exact ? company : `${company} (matched "${h1b.employerName}")`;
  if (h1b.status === 'active') {
    return `${name} got ${latest.approvals.toLocaleString()} H-1B approvals in FY${latest.year}` +
      (h1b.approvalRate !== null ? ` (${h1b.approvalRate}% approval rate overall).` : '.');
  }
  return `${name} sponsored in the past (last approvals FY${latest.year}) but not in recent data.`;
}

function sponsorshipVerdict(scan, h1b, company) {
  const kind = jdKind(scan);
  const hist = h1b ? h1b.status : 'no_data';
  const history = historyLine(h1b, company);
  const sponsorsNow = hist === 'active';
  let v;

  if (kind === 'legal_no') {
    v = {
      level: 'stop',
      headline: 'Closed to visa holders',
      explanation: 'This role needs a security clearance or US citizenship / green card. That is a legal requirement, not a company choice, so the recruiter cannot make an exception.',
      action: sponsorsNow
        ? `Skip this role. ${company} does sponsor for other roles, so look at their other openings.`
        : 'Skip this role. Don\'t spend time tailoring for it.',
    };
  } else if (kind === 'future_no' && hist === 'no_data') {
    v = {
      level: 'stop',
      headline: 'Posting says no sponsorship, now or later',
      explanation: '"Without current or future sponsorship" means they won\'t file an H-1B for you. On OPT you could start, but you would lose the job when OPT ends.',
      action: 'Likely skip. Import H-1B data in Settings to see whether the company sponsors other roles, which would make it worth asking.',
    };
  } else if (kind === 'soft_no' && hist === 'no_data') {
    v = {
      level: 'caution',
      headline: 'Says "no sponsorship", but it\'s ambiguous',
      explanation: 'It doesn\'t say "future" sponsorship, so it may only mean they won\'t transfer an H-1B right now.',
      action: 'Import H-1B data in Settings to check the company\'s history before deciding.',
    };
  } else if (kind === 'future_no') {
    v = sponsorsNow
      ? {
          level: 'caution',
          headline: 'This role says no, but the company sponsors',
          explanation: '"Without current or future sponsorship" means they won\'t file an H-1B for you later. On OPT or STEM OPT you could start, but the job would end with your OPT. Because the company does sponsor other roles, this is likely a team-level rule, and occasionally a strong candidate gets an exception.',
          action: 'Ask the recruiter before applying. Apply only if they say yes.',
        }
      : {
          level: 'stop',
          headline: 'No sponsorship, now or later',
          explanation: '"Without current or future sponsorship" means they won\'t file an H-1B for you. On OPT you could start, but you would lose the job when OPT ends. The company also has no recent H-1B record.',
          action: 'Skip unless you already have a referral who can confirm otherwise.',
        };
  } else if (kind === 'soft_no') {
    v = sponsorsNow
      ? {
          level: 'caution',
          headline: 'Says "no sponsorship", but it\'s ambiguous',
          explanation: 'It doesn\'t say "future" sponsorship. Some companies write this to mean "we won\'t transfer an H-1B right now," and still hire OPT candidates they later sponsor. The company\'s filing history makes that plausible here.',
          action: 'Worth a quick question to the recruiter before you tailor your resume.',
        }
      : {
          level: 'stop',
          headline: 'Likely a true no',
          explanation: 'The posting says no sponsorship and the company has no recent H-1B filings, so the statement probably means what it says.',
          action: 'Skip, or ask only if you have a strong referral there.',
        };
  } else if (kind === 'yes') {
    v = {
      level: 'go',
      headline: 'Sponsorship mentioned',
      explanation: 'The posting explicitly mentions visa sponsorship.',
      action: 'Go ahead and tailor your resume for this one.',
    };
  } else if (hist === 'active') {
    v = {
      level: 'go',
      headline: 'Likely viable',
      explanation: 'The posting doesn\'t restrict sponsorship, and the company sponsors regularly.',
      action: 'Go ahead. Confirm sponsorship on the first recruiter call.',
    };
  } else if (hist === 'past') {
    v = {
      level: 'caution',
      headline: 'Sponsored before, not recently',
      explanation: 'The posting is silent, and the company\'s H-1B filings stopped in recent years. They may have paused sponsorship.',
      action: 'Ask the recruiter early, before investing a lot of time.',
    };
  } else if (hist === 'none') {
    v = {
      level: 'caution',
      headline: 'No H-1B history found',
      explanation: 'The posting is silent, and no filings were found under this name. It could be a small company that has never sponsored, or it files under a different legal name (check the H1BGrader link).',
      action: 'Ask the recruiter early.',
    };
  } else {
    v = {
      level: 'unknown',
      headline: 'Posting doesn\'t mention sponsorship',
      explanation: 'Import the USCIS H-1B data in Settings to check whether this company actually sponsors.',
      action: '',
    };
  }
  v.history = history;
  v.jdKind = kind;
  v.askRecruiter = v.level === 'caution' || (v.level === 'stop' && kind !== 'legal_no');
  return v;
}

function recruiterQuestion(job, recipientName) {
  const hi = recipientName ? `Hi ${recipientName.split(' ')[0]},` : 'Hi,';
  return `${hi} I'm interested in the ${job.title} role at ${job.company}. Before I apply, could you confirm whether the team can consider candidates on F-1 OPT/STEM OPT who would need H-1B sponsorship later? Happy to share my background. Thank you!`;
}

if (typeof module !== 'undefined') module.exports = { sponsorshipVerdict, recruiterQuestion, jdKind };
