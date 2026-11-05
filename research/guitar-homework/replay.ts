import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { guitarHomeworkCases, GUITAR_HOMEWORK_PROTOCOL } from './cases.js';
import { localTeacher, validateTeacherTurn } from '../../src/engine/teacher.js';
const cases = guitarHomeworkCases();
const rows = cases.map((c) => {
  const output = localTeacher(c.request);
  return {
    id: c.id,
    request: c.request,
    output,
    validationError: validateTeacherTurn(output, c.request) ? null : 'Rejected by runtime validator',
    arm: 'authored-policy',
    status: 'executed',
    inferenceCalls: 0,
  };
});
const report = {
  protocol: GUITAR_HOMEWORK_PROTOCOL,
  caseHash: createHash('sha256').update(JSON.stringify(cases)).digest('hex'),
  rows,
  cloud: { actor: 'unexecuted', critic: 'unexecuted', qualification: 'not-assessed' },
  costDollars: 0,
  limitations:
    'Local action/reference checks only. No claim of conversational quality, detector qualification or improved learning.',
};
mkdirSync('research/guitar-homework/results', { recursive: true });
writeFileSync(
  'research/guitar-homework/results/authored.json',
  JSON.stringify(report, null, 2) + '\n',
);
if (rows.some((r) => r.validationError)) process.exitCode = 1;
console.log(
  JSON.stringify({
    cases: rows.length,
    valid: rows.filter((r) => !r.validationError).length,
    inferenceCalls: 0,
  }),
);
