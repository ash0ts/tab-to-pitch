import { useEffect, useState } from 'react';
import { Pause, Play, X } from 'lucide-react';
import type { PracticeSession } from '../hooks/usePracticeSession';
import type { ActivityKind, PracticeResponse, SupportKind } from '../shared/practice';
import { responseStudy, workedStudy, supportText, type TimedStudy } from '../engine/musicianship';
import './practice-workspace.css';

const intents = [
  {
    id: 'hear',
    label: 'Work out something I hear',
    goal: 'Hear where the chord changes',
    activity: 'rhythm',
  },
  {
    id: 'perform',
    label: 'Play this passage more musically',
    goal: 'Keep the chord change in time',
    activity: 'rhythm',
  },
  {
    id: 'create',
    label: 'Make something with this idea',
    goal: 'Make a two-bar response',
    activity: 'phrase',
  },
] as const;
const supportLabels: Record<SupportKind, string> = {
  cue: 'Attention cue',
  comparison: 'Focused comparison',
  'worked-example': 'Worked example',
  answer: 'Full explanation',
};
const noteName = (midi: number) =>
  ({ 50: 'D', 52: 'E', 53: 'F', 55: 'G', 59: 'B', 60: 'C' })[midi] ?? String(midi);
export function PracticeWorkspace({
  session,
  onPlay,
  onStop,
  ready,
}: {
  session: PracticeSession;
  onPlay(study: TimedStudy): void;
  onStop(): void;
  ready: boolean;
}) {
  const { state, task, active, feedback } = session;
  const [goal, setGoal] = useState(state.goal?.wording ?? '');
  const [reflection, setReflection] = useState('');
  const [cells, setCells] = useState<(number | null)[]>(Array(16).fill(null));
  const [difference, setDifference] = useState<PracticeResponse['difference']>();
  const [intention, setIntention] = useState('');
  useEffect(() => {
    setGoal(state.goal?.wording ?? '');
  }, [state.goal?.wording]);
  useEffect(() => {
    setCells(Array(16).fill(null));
    setDifference(undefined);
    setIntention('');
  }, [state.episode?.id]);
  const lastSupport = state.episode?.support.at(-1)?.kind;
  const grouped = [
    ['hearing', 'recognition', 'Hearing · recognition'],
    ['hearing', 'recall', 'Hearing · symbolic recall'],
    ['construction', 'construction', 'Construction'],
    ['naming', 'unknown', 'Naming'],
    ['location', 'unknown', 'Location'],
    ['performance', 'self-report', 'Playing'],
  ] as const;
  function audition(study: TimedStudy) {
    session.prepareAudition(study);
    onPlay(study);
  }
  return (
    <section className="practice-workspace" aria-label="Practice workspace">
      <header className="practice-intention">
        <div>
          <span className="eyebrow">Your next musical step</span>
          <h2>{state.goal?.wording ?? 'What would you like to do?'}</h2>
        </div>
        {state.goal && (
          <details>
            <summary>Change goal</summary>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                session.setGoal(goal, state.intent);
              }}
            >
              <label>
                Musical goal
                <input
                  className="field-input"
                  value={goal}
                  maxLength={500}
                  onChange={(e) => setGoal(e.target.value)}
                />
              </label>
              <button className="secondary-button" disabled={!goal.trim()}>
                Save goal
              </button>
            </form>
          </details>
        )}
      </header>
      {!state.goal && (
        <div className="practice-intents">
          {intents.map((intent) => (
            <button
              className="secondary-button"
              key={intent.id}
              disabled={!ready}
              onClick={() => session.setGoal(intent.goal, intent.id)}
            >
              {intent.label}
            </button>
          ))}
        </div>
      )}
      {state.goal && (
        <>
          <p className="caption">
            Your selected passage stays in the workspace. These first activities use an original
            two-bar G7 → Cmaj7 study.
          </p>
          {!task && (
            <div className="practice-start">
              <p>Try a short starting check, or explore without being scored.</p>
              <button
                className="primary-button"
                disabled={!ready}
                onClick={() => session.begin(intents.find((i) => i.id === state.intent)!.activity)}
              >
                Try a starting check
              </button>
              <button
                className="text-button"
                onClick={() => {
                  session.strategy(
                    'Explore before answering',
                    'Hear and compare the idea before a recall check.',
                    true,
                  );
                }}
              >
                Just explore
              </button>
            </div>
          )}
          <div className="practice-strategy">
            <label>
              Approach
              <select
                aria-label="Approach"
                disabled={!ready}
                className="field-input"
                value={state.strategy?.accepted ? state.strategy.approach : ''}
                onChange={(e) =>
                  session.strategy(
                    e.target.value,
                    e.target.value === 'Focused repetition'
                      ? 'Return to the same detail before varying it.'
                      : e.target.value === 'Compare two versions'
                        ? 'Attend to a specific difference.'
                        : 'Construct and listen to your own response.',
                    true,
                  )
                }
              >
                <option value="" disabled>
                  Choose an approach (optional)
                </option>
                <option>Focused repetition</option>
                <option>Compare two versions</option>
                <option>Make and revise</option>
                <option>Explore before answering</option>
              </select>
            </label>
            {state.strategy?.accepted === null && (
              <div>
                <p>
                  Teacher suggests: {state.strategy.approach}. {state.strategy.rationale}
                </p>
                <button
                  className="secondary-button"
                  onClick={() =>
                    session.strategy(state.strategy!.approach, state.strategy!.rationale, true)
                  }
                >
                  Use this approach
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    session.strategy(state.strategy!.approach, state.strategy!.rationale, false)
                  }
                >
                  Choose something else
                </button>
              </div>
            )}
          </div>
          <nav className="practice-activities" aria-label="Musicianship activities">
            {(['rhythm', 'phrase', 'expression'] as ActivityKind[]).map((kind) => (
              <button
                className="secondary-button"
                key={kind}
                aria-pressed={task?.kind === kind}
                disabled={!ready}
                onClick={() => session.begin(kind)}
              >
                {kind === 'rhythm'
                  ? 'Rhythm & timing'
                  : kind === 'phrase'
                    ? 'Build a phrase'
                    : 'Expression'}
              </button>
            ))}
          </nav>
          {task && (
            <div className="musicianship-task" data-testid="musicianship-task">
              <div className="task-title">
                <div>
                  <span className="eyebrow">Original study · synthesized audio</span>
                  <h3>{task.title}</h3>
                </div>
                <button
                  className="icon-button"
                  aria-label="Cancel current activity"
                  onClick={() => session.interrupt('The learner stopped this activity.')}
                >
                  <X size={18} />
                </button>
              </div>
              <p>{task.prompt}</p>
              <div className="task-transport">
                <button className="secondary-button" onClick={() => audition(task.stimulus)}>
                  <Play size={16} />
                  {task.kind === 'expression' ? 'Hear version A' : 'Hear original study'}
                </button>
                {task.kind === 'expression' && (
                  <button className="secondary-button" onClick={() => audition(task.comparison)}>
                    Hear version B
                  </button>
                )}
                <button className="text-button" onClick={onStop}>
                  <Pause size={16} />
                  Stop
                </button>
              </div>
              {task.kind !== 'expression' ? (
                <>
                  <div className="beat-grid" role="group" aria-label="Two-bar response grid">
                    {cells.map((pitch, index) => (
                      <label key={index}>
                        <span>
                          {index === 0 ? 'G7 · ' : index === 8 ? 'Cmaj7 · ' : ''}
                          {index % 2 === 0 ? `${(Math.floor(index / 2) % 4) + 1}` : '&'}
                        </span>
                        <select
                          aria-label={`Bar ${index < 8 ? 1 : 2}, beat ${(Math.floor(index / 2) % 4) + 1}${index % 2 ? ' and' : ''}`}
                          disabled={!active}
                          value={pitch ?? ''}
                          onChange={(e) =>
                            setCells((before) =>
                              before.map((value, at) =>
                                at === index
                                  ? e.target.value === ''
                                    ? null
                                    : Number(e.target.value)
                                  : value,
                              ),
                            )
                          }
                        >
                          <option value="">Rest</option>
                          {(task.kind === 'rhythm'
                            ? [index < 8 ? 55 : 60]
                            : task.allowedPitches
                          ).map((midi) => (
                            <option key={midi} value={midi}>
                              {task.kind === 'rhythm' ? 'Attack' : noteName(midi)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <button
                    className="text-button"
                    onClick={() => {
                      if (active && task.kind === 'rhythm') session.help('comparison');
                      audition(responseStudy(task, { cells }));
                    }}
                  >
                    Hear my response
                  </button>
                </>
              ) : (
                <>
                  <fieldset className="expression-options">
                    <legend>What changes between A and B?</legend>
                    {(['articulation', 'dynamics', 'timing', 'pitch'] as const).map((value) => (
                      <label key={value}>
                        <input
                          type="radio"
                          name="expressive-difference"
                          disabled={!active}
                          value={value}
                          checked={difference === value}
                          onChange={() => setDifference(value)}
                        />
                        {value}
                      </label>
                    ))}
                  </fieldset>
                  <label>
                    What would you choose, and why? (optional)
                    <textarea
                      className="field-input"
                      maxLength={500}
                      value={intention}
                      onChange={(e) => setIntention(e.target.value)}
                    />
                  </label>
                </>
              )}
              {active && (
                <button
                  className="primary-button"
                  disabled={
                    (task.kind === 'expression' && (!difference || !session.heardComparison)) ||
                    (task.kind !== 'phrase' && !session.heard)
                  }
                  onClick={() =>
                    session.answer(
                      task.kind === 'expression' ? { difference, intention } : { cells },
                    )
                  }
                >
                  {state.episode!.responseCount ? 'Try this revision' : 'Check my response'}
                </button>
              )}
              {active &&
                task.kind !== 'phrase' &&
                (!session.heard || (task.kind === 'expression' && !session.heardComparison)) && (
                  <p className="caption">
                    Hear {task.kind === 'expression' ? 'both versions' : 'the study'} before
                    checking your response.
                  </p>
                )}
              {feedback && (
                <p className="practice-feedback" role="status">
                  {feedback}
                </p>
              )}
              {state.episode!.responseCount > 0 && (
                <p className="caption">
                  Your first response is preserved. Revisions after feedback are recorded separately
                  as assisted.
                </p>
              )}
              {active && (
                <details className="support-options">
                  <summary>Choose some help</summary>
                  <div>
                    {(Object.keys(supportLabels) as SupportKind[]).map((level) => (
                      <button
                        className="secondary-button"
                        key={level}
                        onClick={() => session.help(level)}
                      >
                        {supportLabels[level]}
                      </button>
                    ))}
                  </div>
                </details>
              )}
              {lastSupport && (
                <>
                  <p role="status" className="teaching-cue">
                    {supportText(task, lastSupport)}
                  </p>
                  {lastSupport === 'worked-example' && (
                    <button
                      className="secondary-button"
                      onClick={() => audition(workedStudy(task))}
                    >
                      Hear the worked example
                    </button>
                  )}
                </>
              )}
              {!active && (
                <button className="secondary-button" onClick={() => session.begin(task.kind)}>
                  Try another example
                </button>
              )}
            </div>
          )}
          <details open={session.reflectionRequested || undefined} className="practice-reflection">
            <summary>Reflect & bookmark (optional)</summary>
            <label>
              What helped, or what would you try next?
              <textarea
                className="field-input"
                value={reflection}
                maxLength={1000}
                onChange={(e) => setReflection(e.target.value)}
              />
            </label>
            <button className="secondary-button" onClick={() => session.reflect(reflection, null)}>
              Save reflection & bookmark
            </button>
            {state.bookmark && (
              <p className="caption">
                Bookmark saved {new Date(state.bookmark.at).toLocaleDateString()}.{' '}
                {state.review
                  ? `Review available ${new Date(state.review.dueAt).toLocaleDateString()}.`
                  : ''}
              </p>
            )}
          </details>
          <details className="practice-evidence">
            <summary>What you have demonstrated</summary>
            {grouped.map(([format, responseFormat, label]) => {
              const responses = session.evidence.filter(
                (e) =>
                  e.format === format &&
                  (e.responseFormat ?? 'unknown') === responseFormat &&
                  e.firstResponse &&
                  !e.assisted,
              );
              return (
                <p key={label}>
                  <strong>{label}:</strong>{' '}
                  {responses.length
                    ? `${responses.filter((e) => e.outcome === 'correct').length}/${responses.length} correct first responses without help in these original examples (${new Date(responses.at(-1)!.at).toLocaleDateString()}).`
                    : 'No unassisted evidence recorded here.'}
                </p>
              );
            })}
            <p className="caption">
              Recognition, recall, construction and playing are separate. A symbolic response does
              not assess performance on your instrument.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
