import { expect, it } from 'vitest';
import { hasProseCoordinates } from './teacher-prose';

it.each([
  'You can hear E4 on the 2nd string, 2nd fret.',
  'The third string at the fourth fret is E4.',
  'Play string 2 fret 2.',
  'Try the open first string.',
  'Fret: 12',
  'third-string, fourth-fret',
])('routes numerical coordinates to the verified diagram: %s', (message) => {
  expect(hasProseCoordinates(message)).toBe(true);
});

it.each([
  'E is the third of C major.',
  'F descends to E by one semitone.',
  'The audio cannot identify your string or CAGED family.',
  'Select a note on the fretboard to hear it.',
])('keeps conceptual explanations available: %s', (message) => {
  expect(hasProseCoordinates(message)).toBe(false);
});
