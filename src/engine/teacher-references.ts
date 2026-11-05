import { CURRICULUM_VERSION } from '../shared/teacher.js';

export interface TeachingReference {
  id: string;
  title: string;
  url: string;
  guidance: string;
  limitation: string;
}
export const TEACHING_REFERENCES: readonly TeachingReference[] = [
  {
    id: 'practice-strategies-2025',
    title: 'Lubert & Gröpel: psychological practice interventions',
    url: 'https://doi.org/10.1177/10298649241290448',
    guidance:
      'Offer goals, attention strategies, imagery, feedback and self-evaluation as choices. Persist what the learner chose and whether it helped.',
    limitation:
      'The review includes studies through 2022 with mixed findings and variable methods. It does not establish one effective guitar routine.',
  },
  {
    id: 'learner-autonomy',
    title: 'Bonneville-Roussy & Evans: autonomy and practice',
    url: 'https://doi.org/10.1177/03057356241296109',
    guidance:
      'Support meaningful choices, changed goals and rejected strategies. Explanation, demonstration and exploration are legitimate choices alongside assessment.',
    limitation:
      'Cross-sectional university-musician associations do not establish causal effects of this interface.',
  },
  {
    id: 'ai-feedback-2026',
    title: 'Lin & Zheng: human-teacher-mediated AI feedback',
    url: 'https://link.springer.com/article/10.1007/s44163-026-02689-9',
    guidance:
      'Make feedback actionable: a supported discrepancy, a practical response, and a subsequent check.',
    limitation:
      'Existing-group confounding and continued human support do not establish autonomous AI teaching or retention after support withdrawal.',
  },
  {
    id: 'creating-performing-responding',
    title: 'NAfME: harmonizing-instrument standards',
    url: 'https://nafme.org/publications-resources/standards/',
    guidance:
      'Include creating and interpreting musical ideas alongside identification. Grade explicit constraints separately from artistic preferences and self-reported performance.',
    limitation:
      'A curriculum coverage framework, not evidence that this application improves learning.',
  },
  {
    id: 'caged-landmarks',
    title: 'Fender: CAGED parent shapes',
    url: 'https://www.fender.com/articles/scales/major-guitar-scales',
    guidance:
      'Use C, A, G, E and D parent major shapes as movable landmarks. Separate shape family from sounding harmony. Prefer small chord fragments, note names and actual chord degrees. A neck position does not change the mode.',
    limitation:
      'Instructional reference, not evidence that CAGED or this application improves recall or playing.',
  },
  {
    id: 'gordon-context',
    title: 'Gordon: sound, context, and symbols',
    url: 'https://giml.org/mlt/methodology/',
    guidance:
      'Offer listening and prediction before symbols when useful. Return an isolated idea to its progression. Hearing playback alone is not evidence of audiation.',
    limitation:
      'A teaching tradition, not a controlled test of this app or adult guitar instruction.',
  },
  {
    id: 'duke-practice',
    title: 'Duke, Simmons & Cash: practice strategies',
    url: 'https://blogs.ischool.berkeley.edu/i225s14/files/2014/04/Music-practice-Its-not-how-much-its-how.pdf',
    guidance:
      'Use a specific goal, an observable attempt, and reflection on the result. Attend to error correction rather than repetition counts.',
    limitation:
      'Observations of 17 advanced pianists do not establish a causal guitar teaching policy.',
  },
  {
    id: 'retrieval',
    title: 'Roediger & Karpicke: retrieval',
    url: 'https://learninglab.psych.purdue.edu/downloads/2006/2006_Roediger_Karpicke_PsychSci.pdf',
    guidance:
      'Offer an answer-before-reveal activity and a later check. Keep assisted answers separate from unassisted recall.',
    limitation: 'The study concerns verbal material, not fretboard performance.',
  },
  {
    id: 'spacing',
    title: 'Cepeda and colleagues: distributed practice',
    url: 'https://pubmed.ncbi.nlm.nih.gov/19076480/',
    guidance:
      'Revisit successful objectives after a delay. Record the interval and measure later recall.',
    limitation:
      'The app’s one, three, and seven day defaults are product choices, not optimal intervals established for guitar.',
  },
  {
    id: 'varied-practice',
    title: 'Contrasting evidence on varied music practice',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4989027/',
    guidance:
      'Offer focused practice, contrasting examples, and position changes selectively. A difficult passage can need repeated focused work.',
    limitation:
      'Small music studies differ by task and performer; constant interleaving is not justified. See also Mathias & Goldman, https://journals.sagepub.com/doi/10.1177/00224294231222801.',
  },
  {
    id: 'modes',
    title: 'Open Music Theory: diatonic modes',
    url: 'https://viva.pressbooks.pub/openmusictheory/chapter/diatonic-modes/',
    guidance:
      'Distinguish a neck position from a tonal center. Moving the same scale fingering does not establish a different mode.',
    limitation:
      'An explanatory theory source, not evidence that a particular exercise improves learning.',
  },
  {
    id: 'substitution',
    title: 'Berklee: contextual substitution',
    url: 'https://online.berklee.edu/takenote/reharmonization-simple-substitution/',
    guidance:
      'Evaluate function, melody, bass, and resolution before suggesting a substitution. Shared tones alone do not make chords interchangeable.',
    limitation: 'A constrained example does not establish universal interchangeability.',
  },
];
export const LESSON_DEFINITIONS = [
  {
    id: 'foundations',
    version: CURRICULUM_VERSION,
    title: 'Notes and chord roles',
    objectives: [
      'Identify note names separately from chord roles',
      'Locate a chord tone in another position',
    ],
    prerequisites: ['Read string and fret coordinates'],
    referenceIds: ['gordon-context', 'retrieval', 'duke-practice'],
    taskFactories: ['note-name', 'note-location', 'chord-tone'],
  },
  {
    id: 'connections',
    version: CURRICULUM_VERSION,
    title: 'Connections between chords',
    objectives: [
      'Predict a next-chord target',
      'Connect two actual positions with a specified movement',
    ],
    prerequisites: ['Identify chord roles'],
    referenceIds: ['gordon-context', 'varied-practice', 'spacing'],
    taskFactories: ['next-target', 'voice-connection'],
  },
  {
    id: 'extensions',
    version: CURRICULUM_VERSION,
    title: 'Extensions and bass context',
    objectives: ['Identify an added tone', 'Explain a partial voicing under explicit bass context'],
    prerequisites: ['Identify root, third, fifth, and seventh'],
    referenceIds: ['gordon-context', 'substitution'],
    taskFactories: ['changed-tone', 'chord-tone'],
  },
] as const;
