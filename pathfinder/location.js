// Location matching for the people finder.
// "Phoenix" should also match Tempe, Scottsdale, "Greater Phoenix Area", etc.

const US_STATES = {
  al: 'alabama', ak: 'alaska', az: 'arizona', ar: 'arkansas', ca: 'california', co: 'colorado', ct: 'connecticut',
  de: 'delaware', fl: 'florida', ga: 'georgia', hi: 'hawaii', id: 'idaho', il: 'illinois', in: 'indiana', ia: 'iowa',
  ks: 'kansas', ky: 'kentucky', la: 'louisiana', me: 'maine', md: 'maryland', ma: 'massachusetts', mi: 'michigan',
  mn: 'minnesota', ms: 'mississippi', mo: 'missouri', mt: 'montana', ne: 'nebraska', nv: 'nevada', nh: 'new hampshire',
  nj: 'new jersey', nm: 'new mexico', ny: 'new york', nc: 'north carolina', nd: 'north dakota', oh: 'ohio', ok: 'oklahoma',
  or: 'oregon', pa: 'pennsylvania', ri: 'rhode island', sc: 'south carolina', sd: 'south dakota', tn: 'tennessee',
  tx: 'texas', ut: 'utah', vt: 'vermont', va: 'virginia', wa: 'washington', wv: 'west virginia', wi: 'wisconsin',
  wy: 'wyoming', dc: 'district of columbia',
};

// Metro name → [state abbreviation, cities / labels LinkedIn uses]
const METROS = {
  'Phoenix': ['az', ['phoenix', 'scottsdale', 'tempe', 'chandler', 'mesa', 'gilbert', 'glendale', 'peoria', 'goodyear', 'surprise', 'avondale']],
  'San Francisco Bay Area': ['ca', ['bay area', 'san francisco', 'san jose', 'oakland', 'palo alto', 'mountain view', 'sunnyvale', 'menlo park', 'santa clara', 'redwood city', 'fremont', 'cupertino', 'san mateo', 'berkeley', 'milpitas', 'south san francisco']],
  'New York City': ['ny', ['new york city', 'new york, ny', 'new york, new york', 'nyc', 'brooklyn', 'manhattan', 'queens', 'bronx', 'jersey city', 'hoboken', 'newark', 'stamford']],
  'Seattle': ['wa', ['seattle', 'bellevue', 'redmond', 'kirkland', 'tacoma', 'bothell', 'everett']],
  'Los Angeles': ['ca', ['los angeles', 'santa monica', 'irvine', 'pasadena', 'burbank', 'culver city', 'long beach', 'el segundo', 'glendale, ca', 'anaheim']],
  'San Diego': ['ca', ['san diego', 'la jolla', 'carlsbad']],
  'Austin': ['tx', ['austin', 'round rock', 'cedar park']],
  'Dallas-Fort Worth': ['tx', ['dallas', 'fort worth', 'dfw', 'plano', 'irving', 'frisco', 'richardson', 'arlington, tx', 'addison']],
  'Houston': ['tx', ['houston', 'the woodlands', 'sugar land', 'katy']],
  'Boston': ['ma', ['boston', 'cambridge', 'somerville', 'waltham', 'burlington, ma']],
  'Chicago': ['il', ['chicago', 'evanston', 'naperville', 'schaumburg']],
  'Washington DC': ['dc', ['washington dc', 'washington, dc', 'washington, district', 'dc-baltimore', 'arlington, va', 'arlington, virginia', 'mclean', 'reston', 'herndon', 'bethesda', 'alexandria', 'tysons']],
  'Atlanta': ['ga', ['atlanta', 'alpharetta', 'marietta']],
  'Denver': ['co', ['denver', 'boulder', 'aurora, co', 'englewood']],
  'Raleigh-Durham': ['nc', ['raleigh', 'durham', 'research triangle', 'cary', 'chapel hill']],
  'Charlotte': ['nc', ['charlotte']],
  'Miami': ['fl', ['miami', 'fort lauderdale', 'boca raton']],
  'Tampa': ['fl', ['tampa', 'st. petersburg', 'st petersburg']],
  'Minneapolis': ['mn', ['minneapolis', 'st paul', 'saint paul']],
  'Detroit': ['mi', ['detroit', 'ann arbor', 'dearborn']],
  'Philadelphia': ['pa', ['philadelphia']],
  'Pittsburgh': ['pa', ['pittsburgh']],
  'Salt Lake City': ['ut', ['salt lake', 'lehi', 'provo', 'draper']],
  'Portland': ['or', ['portland, or', 'portland, oregon', 'beaverton', 'hillsboro']],
  'Nashville': ['tn', ['nashville', 'franklin, tn']],
  'Columbus': ['oh', ['columbus, oh', 'columbus, ohio']],
  'Las Vegas': ['nv', ['las vegas', 'henderson']],
};
const METRO_NAMES = Object.keys(METROS);

const lc = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const hasTerm = (hay, term) => new RegExp(`(^|[^a-z])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z])`).test(hay);

// Turn what the user typed ("Tempe, AZ", "bay area", "Texas", "Remote") into a matcher.
function buildLocationMatcher(input) {
  const raw = (input || '').trim();
  const q = lc(raw);
  if (!q || /^(anywhere|any|all)$/.test(q)) return null;
  if (/^(remote|us remote|remote us)$/.test(q)) return { label: 'Remote', terms: ['remote'], state: null, metro: null, remote: true };

  // Which metro? Match against metro names and their cities.
  let metro = METRO_NAMES.find((m) => lc(m) === q || lc(m).startsWith(q) || q.startsWith(lc(m)));
  if (!metro) metro = METRO_NAMES.find((m) => METROS[m][1].some((c) => hasTerm(q, c.split(',')[0]) && (!c.includes(',') || hasTerm(q, c))));

  // Which state? "..., AZ" / "arizona" / "AZ"
  let state = null;
  const abbr = (q.match(/(?:,\s*|^)([a-z]{2})$/) || [])[1];
  if (abbr && US_STATES[abbr]) state = abbr;
  if (!state) state = Object.keys(US_STATES).find((k) => hasTerm(q, US_STATES[k])) || null;
  if (!state && metro) state = METROS[metro][0];

  // A state on its own ("Arizona") matches the whole state.
  const onlyState = !metro && state && (q === state || q === US_STATES[state]);
  const terms = metro ? [lc(metro), ...METROS[metro][1]] : onlyState ? [] : [q.split(',')[0].trim()];
  return {
    label: metro ? `${metro} area` : onlyState ? US_STATES[state].replace(/\b\w/g, (c) => c.toUpperCase()) : raw,
    searchTerm: metro ? metro.replace(/ (Bay Area|City)$/, '').split('-')[0] : raw.split(',')[0],
    terms: Array.from(new Set(terms.filter(Boolean))),
    state,
    stateOnly: !!onlyState,
    metro: metro || null,
  };
}

// → 'match' | 'state' | 'other' | 'unknown'
function matchLocation(personLocation, m) {
  if (!m) return 'match';
  const p = lc(personLocation);
  if (!p) return 'unknown';
  if (m.remote) return /remote/.test(p) ? 'match' : 'other';
  if (m.terms.some((t) => hasTerm(p, t)) || (m.metro && hasTerm(p, 'greater ' + lc(m.metro).split(/[- ]/)[0]))) return 'match';
  if (m.state) {
    const inState = hasTerm(p, US_STATES[m.state]) || new RegExp(`,\\s*${m.state}(\\b|$)`).test(p);
    // "Washington" alone is ambiguous (state vs DC) – treat as state-level only.
    if (inState) return m.stateOnly ? 'match' : 'state';
  }
  if (/^united states$/.test(p)) return 'unknown';
  return 'other';
}

function locationOptions() {
  return METRO_NAMES.concat(['Remote']);
}

if (typeof module !== 'undefined') module.exports = { buildLocationMatcher, matchLocation, locationOptions, US_STATES };
