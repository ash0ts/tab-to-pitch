/** Coordinates are rendered by the verified fretboard action, not generated prose.
 * This guard recognizes common English coordinate forms; it is not a general
 * factual verifier. The independent critic still reviews the whole explanation.
 */
export function hasProseCoordinates(message: string): boolean {
  const number =
    '(?:\\d+(?:st|nd|rd|th)?|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|open)';
  const separator = '[\\s:–—-]*';
  return new RegExp(
    `\\b(?:${number}${separator}(?:string|fret)|(?:string|fret)${separator}${number})\\b`,
    'i',
  ).test(message);
}
