export type ActivityId =
  | 'timeline'
  | 'homework'
  | 'listening'
  | 'progression'
  | 'knowledge'
  | 'musicianship'
  | 'notation'
  | 'live'
  | 'ear-lab';
export interface ActivityDescriptor {
  id: ActivityId;
  title: string;
  category: string;
  objective: string;
  renderer: string;
  inputs: string[];
  demonstrates: string;
  unmeasured: string;
  support: string;
  next: ActivityId;
  references: string[];
  available: boolean;
}
export const ACTIVITIES: ActivityDescriptor[] = [
  {
    id: 'homework',
    title: 'Find your way around the neck',
    category: 'Fretboard · CAGED',
    objective: 'Connect note names, chord tones and neighboring shapes.',
    renderer: 'fretboard',
    inputs: ['Screen answers', 'Self-reported playing'],
    demonstrates:
      'Selected note locations, root landmarks and constructed fragments under the stated constraints.',
    unmeasured: 'Hand technique, clean playing and fluency across the whole neck.',
    support: 'Attention cue, root landmark, partial shape or complete reveal.',
    next: 'progression',
    references: ['agency', 'feedback', 'practice'],
    available: true,
  },
  {
    id: 'listening',
    title: 'Hear what changes',
    category: 'Listening · Harmony',
    objective: 'Work out a progression, then investigate one missed change.',
    renderer: 'recording',
    inputs: ['Screen answers'],
    demonstrates:
      'Root, quality and sequence answers about a particular stimulus. Familiarity can affect the result.',
    unmeasured: 'General listening ability or performance on an instrument.',
    support:
      'Replay the stimulus freely. Answer-choice auditions and revealing help are recorded as assistance.',
    next: 'progression',
    references: ['feedback', 'agency'],
    available: true,
  },
  {
    id: 'progression',
    title: 'One progression, many places',
    category: 'Chords · Movement',
    objective: 'Move accompaniment across the neck and hear an extension.',
    renderer: 'fretboard',
    inputs: ['Exploration', 'Self-reported playing'],
    demonstrates:
      'Valid derived voicings and explicit constraints. Saving a variation preserves the source.',
    unmeasured: 'Comfort, artistic quality or how the original performer fingered a chord.',
    support: 'Compare the original with a variation; inspect degrees, omissions and bass context.',
    next: 'homework',
    references: ['agency', 'practice'],
    available: true,
  },
  {
    id: 'timeline',
    title: 'Play a little, hear a little',
    category: 'Rehearsal · Rhythm',
    objective: 'Follow your passage with readable notes and a steady visual timeline.',
    renderer: 'timeline',
    inputs: ['Self-reported playing'],
    demonstrates: 'Following playback is exploration, not an automatically graded performance.',
    unmeasured: 'Correct playing, precise timing or chosen string positions.',
    support: 'Slow down, loop, pause, switch to a static timeline or open the score.',
    next: 'knowledge',
    references: ['games', 'feedback'],
    available: true,
  },
  {
    id: 'knowledge',
    title: 'Try it without the clues',
    category: 'Recall · Notes & roles',
    objective: 'Name notes, find another location, identify intervals and chord roles.',
    renderer: 'answers',
    inputs: ['Screen answers'],
    demonstrates: 'First-answer recall with assistance, exposure and delayed checks kept separate.',
    unmeasured: 'Hearing or playing the answer. A game score is not a musicianship score.',
    support:
      'Choose a cue, a worked example or a full explanation. Your first response stays in the record.',
    next: 'homework',
    references: ['feedback', 'practice'],
    available: true,
  },
  {
    id: 'musicianship',
    title: 'Make a two-bar reply',
    category: 'Rhythm · Create · Expression',
    objective: 'Place attacks, build a phrase or compare two expressive versions.',
    renderer: 'beat-grid',
    inputs: ['Screen answers', 'Reflection'],
    demonstrates:
      'Symbolic rhythm, explicit phrase constraints and factual differences between versions.',
    unmeasured: 'Artistic quality, clapping accuracy or actual expressive performance.',
    support: 'Hear your proposal, compare examples or change your approach.',
    next: 'timeline',
    references: ['agency', 'practice'],
    available: true,
  },
  {
    id: 'notation',
    title: 'Look inside the score',
    category: 'Read · Understand',
    objective: 'Connect notation, sounding notes and physical positions.',
    renderer: 'notation',
    inputs: ['Exploration'],
    demonstrates: 'Exploration only, unless you start a separate recall question.',
    unmeasured: 'Sight-reading fluency or independence from the labels.',
    support: 'Pitch names, optional octaves, fret hints and staff notation.',
    next: 'knowledge',
    references: ['feedback'],
    available: true,
  },
  {
    id: 'live',
    title: 'Play with my guitar',
    category: 'USB input · Experimental',
    objective: 'Try notes, arpeggiated fragments and bounded chord interactions.',
    renderer: 'live-input',
    inputs: ['Experimental detected audio', 'MIDI'],
    demonstrates:
      'Supported pitch hypotheses with uncertainty. Current input is experimental and ineligible for ranked challenges.',
    unmeasured: 'String identity, fret choice, hand technique and qualified timing.',
    support: 'Check signal, pick a chord one note at a time or use screen answers.',
    next: 'homework',
    references: ['feedback', 'games'],
    available: true,
  },
  {
    id: 'ear-lab',
    title: 'Work it out by ear',
    category: 'Ear Lab · Local research',
    objective: 'Investigate an authorized recording and revise a transcription hypothesis.',
    renderer: 'ear-lab',
    inputs: ['Local audio'],
    demonstrates:
      'Model hypotheses, learner corrections and independent reference truth stay distinct.',
    unmeasured: 'An estimated transcription does not become a grading key.',
    support:
      'Use the original local study or an authorized upload. Heavy analysis requires the optional local worker.',
    next: 'listening',
    references: ['agency', 'feedback'],
    available: true,
  },
];
export const activity = (id: string) => ACTIVITIES.find((a) => a.id === id) ?? ACTIVITIES[0]!;
export const REFERENCES = [
  {
    id: 'games',
    title: 'Digital game–based learning in music education',
    authors: 'Weatherly et al.',
    date: '2024 · review of 2011–2023',
    population: '15 empirical papers across music-education settings',
    design: 'Systematic review',
    finding:
      'Music games offer useful ways to practice; cost, access and limited comparative evidence remain important.',
    consequence:
      'Game presentation is optional. Music stays available without a guitar interface or unlocks.',
    limit: 'This review does not validate this app or show that points improve retention.',
    url: 'https://doi.org/10.1177/1321103X241270819',
  },
  {
    id: 'agency',
    title: 'Autonomy, motivation and music practice',
    authors: 'Bonneville-Roussy & Evans',
    date: '2024 online · 2025 issue',
    population: '213 university music students in the UK and Canada',
    design: 'Cross-sectional self-report study',
    finding: 'Autonomy-supportive teaching was associated with motivation and practice quality.',
    consequence: 'Choose your goal, reject a strategy, repeat an activity or just explore.',
    limit:
      'Association does not establish causality; university musicians differ from this app’s audience.',
    url: 'https://doi.org/10.1177/03057356241296109',
  },
  {
    id: 'feedback',
    title: 'Technology-mediated feedback in instrumental music',
    authors: 'Zhang & Liu',
    date: '13 October 2026',
    population: 'Instrumental music studies, predominantly piano and bowed strings',
    design: 'Systematic review',
    finding:
      'Feedback-supported performance and durable learning are different outcomes. Retention and transfer evidence is limited.',
    consequence:
      'Separate assistance, first answers and delayed checks. Playing scores cannot substitute for learning evidence.',
    limit:
      'Heterogeneous studies do not establish a best feedback system or demonstrate this app’s effectiveness.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/42947794/',
  },
  {
    id: 'practice',
    title: 'Contextual interference in music practice',
    authors: 'Mathias & Goldman',
    date: '2024 online · 2025 issue',
    population: '20 advanced violinists',
    design: 'Practice-schedule experiment with delayed testing',
    finding: 'Blocked practice performed best at the 24-hour retention test in this task.',
    consequence: 'Offer focused repetition as well as a new position or passage.',
    limit:
      'This finding does not mean blocked practice is always preferable, particularly for intermediate guitarists.',
    url: 'https://doi.org/10.1177/00224294231222801',
  },
];
