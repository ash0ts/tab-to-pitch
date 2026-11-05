import { expect, it } from 'vitest';
import { validateTeacherReview } from './teacher-review.js';

it('requires critic verdicts to cite actual prose and allowed evidence', () => {
  const prose = 'You played that perfectly.';
  const rejected = {
    approved: false,
    issues: [
      {
        excerpt: prose,
        code: 'invented-observation',
        reason: 'There is no performance observation.',
        evidenceRefs: ['screen-answer'],
      },
    ],
  };
  expect(validateTeacherReview(rejected, prose, ['screen-answer']).approved).toBe(false);
  expect(() =>
    validateTeacherReview(rejected, 'Try another example.', ['screen-answer']),
  ).toThrow();
  expect(() => validateTeacherReview(rejected, prose, [])).toThrow();
  expect(() =>
    validateTeacherReview({ ...rejected, approved: true }, prose, ['screen-answer']),
  ).toThrow();
  expect(validateTeacherReview({ approved: true, issues: [] }, 'Try another example.', [])).toEqual(
    { approved: true, issues: [] },
  );
});
