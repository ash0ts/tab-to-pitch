import { useId } from 'react';
import { ArrowRight, Check, Eye, Lightbulb, RotateCcw, Target } from 'lucide-react';
import type { ExerciseKind, ExerciseSelection, GradeResult } from '../engine/types';
import { answerLabel } from '../engine/assessment';
import { SKILL_LABELS, SKILL_ORDER } from '../engine/exercises';

export function PracticePanel({
  selection,
  result,
  revealed,
  kind,
  onKind,
  onAnswer,
  onReveal,
  onNext,
  onSelfReport,
  octaveRequired,
  onOctave,
  exactLocation,
  onExactLocation,
  waiting,
  answerText,
  onAnswerText,
  onListen,
  teacherQuestion = false,
  onTeacherHelp,
}: {
  selection: ExerciseSelection | null;
  result: GradeResult | null;
  revealed: boolean;
  kind: ExerciseKind;
  onKind(kind: ExerciseKind): void;
  onAnswer(answer: string): void;
  onReveal(): void;
  onNext(): void;
  onSelfReport(): void;
  octaveRequired: boolean;
  onOctave(value: boolean): void;
  exactLocation: boolean;
  onExactLocation(value: boolean): void;
  waiting?: boolean;
  answerText: string;
  onAnswerText(value: string): void;
  onListen?(pitches: number[]): void;
  teacherQuestion?: boolean;
  onTeacherHelp?(): void;
}) {
  const kindId = useId(),
    answerId = useId();
  const exercise = selection?.exercise;
  const finished = !!result || revealed;
  return (
    <>
      <div className="panel-heading">
        <span className="eyebrow">A little less guessing</span>
        <Target size={17} />
      </div>
      <h2 className="panel-title">Make it stick.</h2>
      <p className="small-muted">One idea from this song. Then try it somewhere new.</p>
      <label className="field-label" htmlFor={kindId}>
        Your focus
      </label>
      <select
        id={kindId}
        className="field-input"
        value={kind}
        onChange={(e) => onKind(e.target.value as ExerciseKind)}
      >
        {SKILL_ORDER.map((k) => (
          <option key={k} value={k}>
            {SKILL_LABELS[k]}
          </option>
        ))}
      </select>
      {kind === 'note-name' && (
        <label className="check-label">
          <input
            type="checkbox"
            checked={octaveRequired}
            onChange={(e) => onOctave(e.target.checked)}
          />
          Also name the octave (advanced)
        </label>
      )}
      {kind === 'note-location' && (
        <label className="check-label">
          <input
            type="checkbox"
            checked={exactLocation}
            onChange={(event) => onExactLocation(event.target.checked)}
          />
          Match the exact octave (advanced)
        </label>
      )}
      {exercise ? (
        <div className="exercise-card" data-testid="exercise-card">
          <div className="exercise-stage">
            <span className="status-dot" />
            {selection.mode === 'transfer'
              ? 'Held-back question'
              : selection.mode === 'delayed'
                ? 'Due for review'
                : selection.mode === 'recall'
                  ? 'Without hints'
                  : 'Learn this idea'}
            <span className="subtle-pill">
              {exercise.kind === 'note-location'
                ? exactLocation
                  ? 'Exact pitch'
                  : 'Any octave'
                : exercise.stimulus
                  ? 'Lesson example'
                  : 'From your score'}
            </span>
          </div>
          <h3>{exercise.prompt}</h3>
          {exercise.listeningExample && onListen && (
            <div className="chord-auditions">
              {exercise.listeningExample.map((pitches, index) => (
                <button className="secondary-button" key={index} onClick={() => onListen(pitches)}>
                  Hear version {index === 0 ? 'A' : 'B'}
                </button>
              ))}
            </div>
          )}
          {selection.support === 'guided' && !finished && (
            <div className="teaching-cue">
              <span className="eyebrow">Learn it first</span>
              <strong>
                {exercise.answer.type === 'position'
                  ? `Try string ${exercise.answer.positions[0]?.string}, fret ${exercise.answer.positions[0]?.fret}`
                  : answerLabel(exercise)}
              </strong>
              <p>{exercise.explanation}</p>
              <p className="caption">
                This answer has a cue. Your next question will check recall with the clues hidden.
              </p>
            </div>
          )}
          {!finished && (
            <>
              <div className="answer-options">
                {exercise.choices.map((choice) => (
                  <button key={choice.id} onClick={() => onAnswer(choice.value)}>
                    {choice.label}
                  </button>
                ))}
              </div>
              {(exercise.answer.type !== 'text' || exercise.choices.length === 0) && (
                <form
                  className="typed-answer"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (answerText.trim()) onAnswer(answerText.trim());
                  }}
                >
                  <label className="sr-only" htmlFor={answerId}>
                    {exercise.answer.type === 'pitch'
                      ? 'Type a note name'
                      : exercise.answer.type === 'position-pair'
                        ? 'Type starting string:fret to ending string:fret'
                        : exercise.answer.type === 'position'
                          ? 'Type string:fret'
                          : 'Type your answer'}
                  </label>
                  <input
                    id={answerId}
                    value={answerText}
                    maxLength={500}
                    onChange={(e) => onAnswerText(e.target.value)}
                    placeholder={
                      exercise.answer.type === 'pitch'
                        ? 'Or type a note'
                        : exercise.answer.type === 'position-pair'
                          ? '2:6 -> 2:5'
                          : exercise.answer.type === 'position'
                            ? 'Or type string:fret'
                            : 'Type your answer'
                    }
                    autoComplete="off"
                  />
                  <button aria-label="Submit typed answer" disabled={!answerText.trim()}>
                    <ArrowRight size={17} />
                  </button>
                </form>
              )}
              <button className="text-button hint-button" onClick={onReveal}>
                <Eye size={16} />
                Show me the answer
              </button>
              {teacherQuestion && onTeacherHelp && (
                <button className="text-button teacher-help-button" onClick={onTeacherHelp}>
                  Ask teacher for help
                </button>
              )}
            </>
          )}
          {finished && (
            <div className={`feedback ${result?.correct ? 'correct' : ''}`} role="status">
              <span className="feedback-heading">
                {result?.correct ? <Check size={19} /> : <Lightbulb size={19} />}{' '}
                {revealed
                  ? 'A useful clue'
                  : result?.correct
                    ? 'You’ve got it.'
                    : 'Keep this one in mind.'}
              </span>
              <p>{result?.feedback || exercise.explanation}</p>
              <p className="caption">
                {revealed
                  ? 'Revealed answers are recorded separately from recall.'
                  : selection.support === 'guided'
                    ? 'This was a guided answer. It does not count as unassisted recall.'
                    : 'This records your first answer, not your guitar performance.'}
              </p>
              <button className="primary-button full-width" onClick={onNext}>
                {teacherQuestion ? 'Continue with teacher' : 'Next question'}
                <ArrowRight size={16} />
              </button>
            </div>
          )}
          <p className="caption exercise-reason">{selection.reason}</p>
        </div>
      ) : waiting ? (
        <p className="caption" role="status">
          Your next question will be ready when you return to practice.
        </p>
      ) : (
        <div className="empty-panel compact">
          <Target size={25} />
          <h3>No eligible questions here yet.</h3>
          <p>
            Choose another focus or guitar track. Some techniques play correctly but cannot be
            graded reliably.
          </p>
        </div>
      )}
      <div className="offscreen-challenge">
        <div>
          <h3>Now, look away.</h3>
          <p>Find a note on your guitar without watching the screen.</p>
        </div>
        <button className="text-button" onClick={onSelfReport}>
          <Check size={16} />I tried it
        </button>
        <span className="caption">Self-reported. Kept separate from recall scores.</span>
      </div>
      <button className="text-button" onClick={onNext}>
        <RotateCcw size={15} />
        {teacherQuestion ? 'Return to teacher' : 'Choose another question'}
      </button>
    </>
  );
}
