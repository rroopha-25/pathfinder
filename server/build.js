// Builds server/worker.js from the template, embedding the exact prompts and schemas the extension uses.
const fs = require('fs'), path = require('path');
const P = require('../pathfinder/prompts.js');
const A = require('../pathfinder/ai.js');
let s = fs.readFileSync(path.join(__dirname, 'worker.template.js'), 'utf8');
s = s.replace('__RESUME_SYSTEM__', JSON.stringify(P.RESUME_SYSTEM_PROMPT))
  .replace('__OUTREACH_SYSTEM__', JSON.stringify(P.OUTREACH_SYSTEM_PROMPT))
  .replace('__RESUME_SCHEMA__', JSON.stringify(A.RESUME_SCHEMA))
  .replace('__OUTREACH_SCHEMA__', JSON.stringify(A.OUTREACH_SCHEMA));
fs.writeFileSync(path.join(__dirname, 'worker.js'), s);
console.log('built server/worker.js', s.length, 'chars');
