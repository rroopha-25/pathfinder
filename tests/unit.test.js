const assert = require('assert');
const P = '../pathfinder/';
const {normalizeCompany, decodeFile, parseDelimited, aggregateH1B, summarizeH1B} = require(P+'h1b.js');
const {scanSponsorship} = require(P+'sponsorship.js');
const {sponsorshipVerdict, recruiterQuestion} = require(P+'verdict.js');
const {scoreResume, extractJobKeywords} = require(P+'resume.js');
const {rankPeople, mergePeople} = require(P+'people.js');
const {parseJsonLoose, verifyEdits} = require(P+'ai.js');
const {outreachMessage, buildResumeUserPrompt} = require(P+'prompts.js');
let n=0; const ok=(name)=>{n++;console.log('✓',name)};

// --- H-1B: new CSV format
const csvNew = `Fiscal Year,Employer (Petitioner) Name,Tax ID,Industry (NAICS) Code,Petitioner City,Petitioner State,Petitioner Zip Code,New Employment Approval,New Employment Denial,Continuation Approval,Continuation Denial,Change with Same Employer Approval,Change with Same Employer Denial,New Concurrent Approval,New Concurrent Denial,Change of Employer Approval,Change of Employer Denial,Amended Approval,Amended Denial
2024,GOOGLE LLC,1234,54,MOUNTAIN VIEW,CA,94043,"1,200",20,800,5,10,0,0,0,300,4,50,1
2024,Google LLC,1234,54,NEW YORK,NY,10011,100,2,50,1,0,0,0,0,20,0,0,0
2023,GOOGLE LLC,1234,54,MOUNTAIN VIEW,CA,94043,900,10,700,3,0,0,0,0,200,2,0,0
2024,"CONFIDO HEALTH, INC.",99,54,NEW YORK,NY,10001,2,0,0,0,0,0,0,0,1,0,0,0
2021,OLD SPONSOR CORP,5,54,X,AZ,1,3,0,0,0,0,0,0,0,0,0,0,0
`;
const agg = aggregateH1B(parseDelimited(decodeFile(Buffer.from(csvNew).buffer.slice(0))));
const g = agg.employers['google'];
assert.deepStrictEqual(g.y[2024], [1200+300+100+20, 1200+800+10+300+50+100+50+20, 20+5+4+1+2+1]);
assert.ok(agg.employers['confido health']);
ok('USCIS new CSV format: aggregates approvals/denials across rows and locations');

// --- H-1B: old UTF-16 tab format
const tsvOld = 'Fiscal Year\tEmployer\tInitial Approval\tInitial Denial\tContinuing Approval\tContinuing Denial\tNAICS\tTax ID\tState\tCity\tZIP\n2019\tAMAZON.COM SERVICES LLC\t4,000\t100\t3,000\t50\t45\t1\tWA\tSEATTLE\t98109\n';
const buf16 = Buffer.concat([Buffer.from([0xff,0xfe]), Buffer.from(tsvOld,'utf16le')]);
const agg2 = aggregateH1B(parseDelimited(decodeFile(buf16.buffer.slice(buf16.byteOffset, buf16.byteOffset+buf16.length))));
assert.deepStrictEqual(agg2.employers['amazon com services'].y[2019], [4000, 7000, 150]);
ok('USCIS old UTF-16 tab-separated format');

assert.throws(()=>aggregateH1B(parseDelimited('name,age\nx,1\n')), /does not look like/);
ok('Rejects a wrong file with a clear message');

assert.strictEqual(normalizeCompany('Google'), normalizeCompany('GOOGLE LLC'));
assert.strictEqual(normalizeCompany('The Walt Disney Company'), 'walt disney');
assert.strictEqual(normalizeCompany('AT&T Inc.'), 'at and t');
ok('Company name normalization (LinkedIn "Google" == USCIS "GOOGLE LLC")');

// lookup logic via summarize (storage-free)
const sGoogle = summarizeH1B(g, true, [2021,2023,2024]);
assert.strictEqual(sGoogle.status, 'active');
const sOld = summarizeH1B(agg.employers['old sponsor'], true, [2021,2023,2024]);
assert.strictEqual(sOld.status, 'past');
ok('History status: active vs past sponsor');

// --- Verdicts
const V = (jd, h1b) => sponsorshipVerdict(scanSponsorship(jd), h1b, 'Acme');
const none = {status:'none'}, nodata = {status:'no_data'};
const cases = [
 ['Active Secret security clearance required.', sGoogle, 'stop'],
 ['Must be authorized to work in the US without current or future sponsorship.', sGoogle, 'caution'],
 ['Must be authorized to work in the US without current or future sponsorship.', none, 'stop'],
 ['We are unable to sponsor visas for this role.', sGoogle, 'caution'],
 ['We are unable to sponsor visas for this role.', none, 'stop'],
 ['Visa sponsorship is available.', none, 'go'],
 ['Great team.', sGoogle, 'go'],
 ['Great team.', sOld, 'caution'],
 ['Great team.', none, 'caution'],
 ['Great team.', nodata, 'unknown'],
 ['Must be authorized to work in the US without current or future sponsorship.', nodata, 'stop'],
 ['We are unable to sponsor visas for this role.', nodata, 'caution'],
];
for (const [jd,h,exp] of cases) assert.strictEqual(V(jd,h).level, exp, `${jd} / ${h.status}`);
assert.strictEqual(V(cases[0][0], sGoogle).askRecruiter, false);
assert.strictEqual(V(cases[1][0], sGoogle).askRecruiter, true);
for (const [jd,h] of cases.filter(c=>c[1].status==='no_data')) assert.ok(!/No H-1B|record/.test(V(jd,h).explanation+V(jd,h).history), 'no-data must not claim history');
ok('Sponsorship verdict: all 12 JD × history combinations');
assert.ok(/F-1 OPT/.test(recruiterQuestion({title:'PM',company:'Acme'}, 'Jane Doe')) && recruiterQuestion({title:'PM',company:'Acme'},'Jane Doe').startsWith('Hi Jane,'));
ok('Recruiter sponsorship question');

// --- Resume score
const jd = `About the job
We need a Product Deployment Specialist to lead implementation and onboarding for enterprise customers.
Requirements
- 3+ years in implementation or customer success at a SaaS company
- Strong SQL and Excel skills; experience with Salesforce
- Stakeholder management across cross-functional teams
- Experience with Jira and Agile delivery
Nice to have: Python, healthcare experience.`;
const kws = extractJobKeywords(jd).map(k=>k.term);
assert.ok(!kws.includes('requirements gathering'), 'heading must not count');
for (const k of ['sql','excel','saas','implementation','customer success','crm','jira','agile','stakeholder management']) assert.ok(kws.includes(k), 'missing kw '+k);
const resumeStrong = `Roopha
Implementation lead for SaaS onboarding of 40 enterprise customers, cutting time-to-live by 30%
Built SQL and Excel reporting used by 5 cross-functional stakeholders
Ran Agile sprints in Jira for a 12-person deployment team
Managed Salesforce CRM data for customer success programs across 3 regions
Product deployment specialist experience with enterprise rollouts to 200+ users`;
const resumeWeak = `Roopha
Wrote marketing copy for social media campaigns and events across the region
Organized community events and partnered with local vendors on logistics`;
const sStrong = scoreResume(resumeStrong, jd, 'Product Deployment Specialist');
const sWeak = scoreResume(resumeWeak, jd, 'Product Deployment Specialist');
assert.ok(sStrong.score >= 75 && sStrong.label==='Strong', 'strong='+sStrong.score);
assert.ok(sWeak.score < 40 && sWeak.label==='Low', 'weak='+sWeak.score);
console.log('   strong resume:', sStrong.score, sStrong.breakdown, '| weak resume:', sWeak.score, '| missing(weak):', sWeak.missing.slice(0,5).map(m=>m.term).join(', '));
ok('Resume score separates a strong vs weak resume');

// --- People ranking
const people = [
 {name:'Random Person', slug:'rp', headline:'Accountant at Acme', degree:'3rd', postedDaysAgo:null, postText:'', source:'company_people'},
 {name:'Priya S', slug:'ps', headline:'Senior Implementation Manager at Acme', degree:'2nd', postedDaysAgo:3, postText:"We're hiring a deployment specialist on my team! DM me.", source:'posts'},
 {name:'Tom R', slug:'tr', headline:'Technical Recruiter at Acme | ASU alum', degree:'3rd', postedDaysAgo:null, postText:'', source:'people_search'},
 {name:'Out Sider', slug:'os', headline:'Coach helping job seekers', degree:'3rd', postedDaysAgo:1, postText:'Acme is hiring! Great company', source:'posts'},
];
const ranked = rankPeople(mergePeople([], people), {company:'Acme', jobTitle:'Product Deployment Specialist', hiringTeam:[], profile:{school:'ASU', country:'', pastEmployers:[]}});
console.log('   ranking:', ranked.map(p=>`${p.name}(${p.score})`).join(' > '));
assert.strictEqual(ranked[0].name, 'Priya S');
assert.strictEqual(ranked[1].name, 'Tom R');
assert.ok(ranked.find(p=>p.name==='Out Sider').reasons.includes('Confirm they work there'));
ok('People ranking: active hiring manager > recruiter alum > others; flags non-employees');
const merged = mergePeople(mergePeople([], [people[1]]), [{...people[1], postedDaysAgo:1, source:'company_people'}]);
assert.strictEqual(merged.length, 1); assert.strictEqual(merged[0].postedDaysAgo, 1);
ok('Merging people across searches dedupes and keeps freshest activity');
const msg = outreachMessage(ranked[0], {title:'Product Deployment Specialist', company:'Acme'});
assert.ok(msg.length <= 300 && msg.startsWith('Hi Priya, saw your post about the team hiring') && msg.includes('?'));
ok(`Outreach note fits LinkedIn's 300-char limit (${msg.length} chars)`);

// --- AI output handling
const fake = 'Here you go:\n{"fit_summary":"Good fit.","edits":[{"section":"Experience","original":"Built SQL and Excel reporting used by 5 cross-functional stakeholders","revised":"x","why":"y","keywords_added":["SQL"],"needs_input":""},{"section":"Experience","original":"Invented line not in resume","revised":"z","why":"","keywords_added":[],"needs_input":""}],"summary_line":{"original":"","revised":"s"},"gaps":[]}\nThanks';
const r = verifyEdits(parseJsonLoose(fake), resumeStrong);
assert.strictEqual(r.edits[0].found, true); assert.strictEqual(r.edits[1].found, false);
ok('AI response parsing + flags suggested lines that are not in the resume');
const up = buildResumeUserPrompt({job:{title:'T',company:'C',description:jd}, resume:resumeStrong, score:sStrong});
assert.ok(up.includes('JOB POSTING') && up.includes('RESUME') && up.includes('matched ='));
ok('Prompt includes job, resume and keyword check');
console.log(`\n${n} tests passed`);
