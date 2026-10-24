const assert = require('assert');
const { buildLocationMatcher: B, matchLocation: M } = require('../pathfinder/location.js');
const { rankPeople } = require('../pathfinder/people.js');
let n = 0; const ok = (m) => { n++; console.log('✓', m); };
const phx = B('Phoenix, AZ');
const t = (loc, exp, m = phx) => assert.strictEqual(M(loc, m), exp, `${loc} → ${M(loc, m)} (want ${exp})`);
t('Tempe, Arizona', 'match'); t('Greater Phoenix Area', 'match'); t('Scottsdale, AZ', 'match'); t('Phoenix, Arizona, United States', 'match');
t('Tucson, Arizona', 'state'); t('San Francisco Bay Area', 'other'); t('', 'unknown'); t('United States', 'unknown');
ok('Phoenix matches Tempe / Scottsdale / "Greater Phoenix Area"; Tucson = same state; SF = other');
const bay = B('bay area');
t('San Jose, California', 'match', bay); t('Palo Alto, CA', 'match', bay); t('Los Angeles, California', 'state', bay); t('Seattle, Washington', 'other', bay);
ok('"bay area" matches San Jose and Palo Alto; LA is same-state only');
const tx = B('Texas');
t('Austin, Texas', 'match', tx); t('Plano, TX', 'match', tx); t('Denver, Colorado', 'other', tx);
ok('A whole state ("Texas") matches any city in it');
const nyc = B('New York');
t('Brooklyn, New York', 'match', nyc); t('Jersey City, NJ', 'match', nyc); t('Albany, New York', 'state', nyc);
ok('"New York" = NYC metro (incl. Jersey City); Albany = same state');
const any = B('Tempe'); assert.strictEqual(any.metro, 'Phoenix'); assert.strictEqual(B('Anywhere'), null);
t('Remote', 'match', B('Remote')); t('Austin, Texas', 'other', B('Remote'));
ok('"Tempe" resolves to the Phoenix metro; "Anywhere" disables the filter; Remote works');

const people = [
  { name: 'Recruiter SF', slug: 'a', headline: 'Technical Recruiter at Acme', location: 'San Francisco Bay Area', source: 'people_search', postedDaysAgo: null, postText: '' },
  { name: 'Recruiter PHX', slug: 'b', headline: 'Technical Recruiter at Acme', location: 'Tempe, Arizona', source: 'people_search', postedDaysAgo: null, postText: '' },
  { name: 'Poster', slug: 'c', headline: 'Implementation Manager at Acme', location: '', source: 'posts', postedDaysAgo: 2, postText: "We're hiring!" },
  { name: 'Tucson PM', slug: 'd', headline: 'Implementation Lead at Acme', location: 'Tucson, Arizona', source: 'people_search', postedDaysAgo: null, postText: '' },
];
const ctx = { company: 'Acme', jobTitle: 'Implementation Specialist', hiringTeam: [], profile: {}, locationMatcher: phx, locationStrict: true };
const r = rankPeople(people, ctx);
console.log('   strict:', r.map((p) => `${p.name}(${p.score})`).join(' > '));
assert.ok(!r.find((p) => p.name === 'Recruiter SF')); assert.deepStrictEqual(r.map((p) => p.name), ['Recruiter PHX', 'Tucson PM', 'Poster']);
ok('Strict mode hides people clearly elsewhere; local recruiter ranks first');
const r2 = rankPeople(people, { ...ctx, locationStrict: false });
assert.strictEqual(r2[r2.length - 1].name, 'Recruiter SF');
ok('Non-strict mode keeps everyone but pushes other locations to the bottom');
console.log(`\n${n} location tests passed`);
