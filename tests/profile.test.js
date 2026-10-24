const assert = require('assert');
const { parseProfile } = require('../pathfinder/resume.js');
const cases = {
  'title, company | dates': `Alex Kumar
Phoenix, AZ | alex@email.com
EXPERIENCE
Policy Analyst, Uber | Jan 2023 – Present
- Led trust and safety policy rollout for 12 markets
Senior Consultant, Deloitte | Jun 2020 – Dec 2022
- Built SQL dashboards for 5 stakeholders
Software Engineer Intern, Oracle | May 2019 – Aug 2019
EDUCATION
Arizona State University, Tempe, AZ
Master of Science in Information Systems, 2024`,
  'company line, title line + dates': `Priya S
WORK EXPERIENCE
EdPlus at Arizona State University
Data Analyst                     Aug 2022 - Present
Ambac Inc
Operations Analyst               Jan 2020 - Jul 2022
EDUCATION
Bachelor of Technology, Computer Science
Vellore Institute of Technology    2015 - 2019`,
};
for (const [name, text] of Object.entries(cases)) {
  const r = parseProfile(text);
  console.log(name, '→', JSON.stringify(r));
}
const a = parseProfile(cases['title, company | dates']);
assert.strictEqual(a.school, 'Arizona State University');
assert.deepStrictEqual(a.pastEmployers, ['Uber', 'Deloitte', 'Oracle']);
assert.strictEqual(a.background, 'Policy Analyst at Uber');
const b = parseProfile(cases['company line, title line + dates']);
assert.ok(/Vellore Institute of Technology/.test(b.school), b.school);
assert.ok(b.pastEmployers.includes('Ambac Inc'), b.pastEmployers);
console.log('profile tests passed');
