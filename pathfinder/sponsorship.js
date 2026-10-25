// Heuristic scan of a job description for visa-sponsorship language.
// Returns { status: 'negative' | 'positive' | 'unknown', matches: [{type, label, snippet}] }
const SPONSOR_RULES = [
  { type: 'negative', label: 'Says no sponsorship', re: /\b(no|not|unable to|cannot|can't|will not|won't|do not|does not|don't|doesn't)\s+(currently\s+)?(be\s+)?(able to\s+)?(offer|provide|support)?\s*(any\s+)?(employment\s+)?(visa\s+)?sponsor/i },
  { type: 'negative', label: 'Requires no future sponsorship', re: /without\s+(the\s+)?(need\s+(for|of)\s+)?(current\s+or\s+future\s+|future\s+)?(employer\s+|visa\s+)?sponsorship/i },
  { type: 'negative', label: 'Citizenship / green card required', re: /\b(u\.?s\.?\s+citizen(s|ship)?|green\s+card\s+holders?|permanent\s+residents?)\b.{0,40}\b(only|required|must)\b/i },
  { type: 'negative', label: 'Citizenship / green card required', re: /\b(must be|requires?|only|open to)\s+(a\s+)?(us|u\.s\.)\s+citizens?\b/i },
  { type: 'negative', label: 'Security clearance required', re: /\b(security|secret|ts\/sci)\s+clearance\b/i },
  { type: 'positive', label: 'Mentions offering sponsorship', re: /\b(will|can|able to|do|does|happy to)\s+(provide|offer|support)?\s*(visa\s+|h-?1b\s+)?sponsor/i },
  { type: 'positive', label: 'Sponsorship available', re: /\b(visa|h-?1b)\s+sponsorship\s+(is\s+)?(available|provided|offered)/i },
  { type: 'positive', label: 'Mentions offering sponsorship', re: /\bwe\s+(do\s+|gladly\s+|proudly\s+)?sponsor\s+(h-?1b|visas?|work\s+visas?|employment)/i },
  { type: 'positive', label: 'H-1B transfer mentioned', re: /\bh-?1b\s+transfer/i },
];

function scanSponsorship(text) {
  if (!text) return { status: 'unknown', matches: [] };
  // "U.S." would otherwise end a sentence and split "U.S. citizenship required" in two.
  text = text.replace(/\bU\.\s?S\.(\s?A\.)?/gi, 'US');
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim());
  const matches = [];
  const seen = new Set();
  for (const sentence of sentences) {
    for (const rule of SPONSOR_RULES) {
      if (rule.re.test(sentence)) {
        // A sentence like "no sponsorship available" hits both; keep only the negative.
        if (rule.type === 'positive' && matches.some((m) => m.snippet === sentence.trim() && m.type === 'negative')) continue;
        const key = rule.label + '|' + sentence.trim();
        if (seen.has(key)) continue;
        seen.add(key);
        matches.push({ type: rule.type, label: rule.label, snippet: sentence.trim().slice(0, 220) });
        break;
      }
    }
  }
  const status = matches.some((m) => m.type === 'negative')
    ? 'negative'
    : matches.some((m) => m.type === 'positive')
    ? 'positive'
    : 'unknown';
  return { status, matches };
}

if (typeof module !== 'undefined') module.exports = { scanSponsorship };
