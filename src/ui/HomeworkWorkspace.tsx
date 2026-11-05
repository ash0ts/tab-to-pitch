import { positionExposureKey } from '../engine/exposure';
import { useEffect, useState } from 'react';
import type { HomeworkSession } from '../hooks/useHomeworkSession';
import type { ProgressionSession } from '../hooks/useProgressionSession';
import {
  CAGED_FAMILIES,
  cagedPlacements,
  fragmentFamilies,
  conventionalCaged,
  noteAt,
  positionKey,
  regionFragments,
} from '../engine/caged';
import { homeworkHelp, solution } from '../engine/homework';
import {
  CHORD_QUALITIES,
  defineChord,
  parseChordSymbol,
  type ChordQuality,
} from '../engine/harmony';
import { formatPitch } from '../engine/exploration';
import type { FretPosition } from '../engine/types';
import type { HomeworkKind, HomeworkSupport } from '../shared/homework';
import { Fretboard, type FretboardMarker } from './Fretboard';
import './homework.css';
const labels: Record<HomeworkKind, string> = {
  locate: 'Find a note',
  name: 'Name a position',
  roots: 'Find the roots',
  complete: 'Complete a fragment',
  voicing: 'Build any voicing',
  neighbor: 'Connect a family',
  connection: 'Seventh → third',
  target: 'Choose a phrase target',
};
const supports: Record<HomeworkSupport, string> = {
  cue: 'Attention cue',
  landmark: 'Root landmark',
  partial: 'Partial shape',
  'worked-example': 'Worked example',
  answer: 'Complete reveal',
};
const role = (degree: string): FretboardMarker['role'] =>
  degree === '1'
    ? 'root'
    : degree.includes('3')
      ? 'third'
      : degree.includes('5')
        ? 'fifth'
        : degree.includes('7')
          ? 'seventh'
          : 'extension';
export function HomeworkWorkspace({
  homework: h,
  progression: p,
  tuning,
  capo,
  ready,
  onListen,
  onStop,
  onOriginal,
  showOctaves,
}: {
  homework: HomeworkSession;
  progression: ProgressionSession;
  tuning: readonly number[];
  capo: number;
  ready: boolean;
  onListen(pitches: number[]): void;
  onStop(): void;
  onOriginal(): void;
  showOctaves: boolean;
}) {
  const { minutes, setMinutes } = h;
  const { family, setFamily } = h;
  const region = h.setup.region;
  const [selected, setSelected] = useState<FretPosition[]>([]);
  const [name, setName] = useState('');
  const [exact, setExact] = useState(false);
  const [fragmentOnly, setFragmentOnly] = useState(true);
  const [reflection, setReflection] = useState(h.state?.reflection ?? '');
  const symbol = p.span?.confirmation === 'confirmed' ? p.span.chord?.symbol : null;
  const chord = parseChordSymbol(symbol ?? 'C')!;
  const task = h.task;
  const recall = h.view === 'recall' && !!task;
  const shownRegion = recall ? task.region : region;
  const placements = cagedPlacements(chord.rootName, tuning, capo);
  const options = regionFragments(
    placements.filter((x) => x.family === family),
    region,
  );
  const match = options.find((x) => x.fragment.positions.length === 3);
  const shape =
    match?.placement ??
    placements.find(
      (x) =>
        x.family === family &&
        x.notes.every(
          (n) => n.position.fret >= region.minFret && n.position.fret <= region.maxFret,
        ),
    );
  const supported = conventionalCaged(tuning, capo);
  useEffect(() => {
    setSelected([]);
    setName('');
  }, [task?.id, h.state?.id]);
  useEffect(() => {
    if (h.state) {
      setReflection(h.state.reflection);
    }
  }, [h.state?.id]);
  const revealed = !!task && h.state?.support.includes('answer');
  let markers: FretboardMarker[] = [];
  if (recall && task) {
    const given =
      task.kind === 'name'
        ? [task.sourcePosition!]
        : task.kind === 'roots'
          ? task.template
          : task.kind === 'neighbor'
            ? task.template
                .filter(
                  (pos) =>
                    noteAt(pos, tuning, capo)! % 12 ===
                    parseChordSymbol(task.symbol)!.rootPitchClass,
                )
                .slice(0, 1)
            : task.kind === 'complete'
              ? task.template.slice(0, 1)
              : [];
    const visible = revealed
      ? solution(task)
      : h.state?.support.includes('partial')
        ? solution(task).slice(0, 1)
        : given;
    markers = visible.map((position) => ({
      position,
      ...(revealed ? { label: formatPitch(noteAt(position, tuning, capo)!, task.exact) } : {}),
    }));
  } else if (h.view === 'apply') {
    markers =
      p.event?.voicing.notes.map((n) => ({
        position: n.position,
        label: showOctaves ? n.label : n.noteName,
        role: role(n.degree),
      })) ?? [];
  } else if (shape) {
    markers = shape.notes
      .filter(
        (n) =>
          !fragmentOnly ||
          match?.fragment.positions.some((pos) => positionKey(pos) === positionKey(n.position)),
      )
      .map((n) => ({
        position: n.position,
        label: showOctaves ? formatPitch(n.midi, true) : n.name,
        role: role(n.degree),
      }));
  }
  const visibleKey = markers.map((m) => positionKey(m.position)).join(',');
  useEffect(() => {
    if (h.view !== 'recall')
      h.expose(markers.map((m) => positionExposureKey(tuning, capo, m.position)));
  }, [visibleKey, h.view, h.state?.id, tuning.join(','), capo]);
  function choose(position: FretPosition) {
    if (!recall) {
      onListen([noteAt(position, tuning, capo)!]);
      return;
    }
    setSelected((previous) =>
      previous.some((p) => positionKey(p) === positionKey(position))
        ? previous.filter((p) => positionKey(p) !== positionKey(position))
        : [...(['locate', 'target'].includes(task!.kind) ? [] : previous), position].slice(-6),
    );
  }
  function start(kind?: HomeworkKind) {
    h.begin(
      minutes,
      region,
      symbol ?? 'C',
      family,
      kind ?? (!symbol ? 'locate' : undefined),
      exact,
    );
  }
  function move(minFret: number, maxFret: number) {
    h.setView('apply');
    p.changeOptions({
      ...p.options,
      minFret,
      maxFret,
      voiceCount: 3,
      maxSpan: 4,
      rootless: false,
      omitFifth: false,
    });
  }
  return (
    <section className="homework-workspace" aria-label="Fretboard homework">
      <header className="homework-heading">
        <div>
          <span className="eyebrow">Notes, chord tones and progressions</span>
          <h2>Fretboard homework</h2>
        </div>
        <span className="homework-badge">
          {h.state ? `${h.state.minutes} min workload` : 'Notes · shapes · progressions'}
        </span>
      </header>
      {h.state?.status === 'paused' && (
        <div className="homework-actions">
          <button className="primary-button" disabled={!h.fresh || !ready} onClick={h.resume}>
            Resume saved assignment
          </button>
          {!h.fresh && (
            <p className="caption">
              Your previous task is saved. Restore its passage and constraints, or start new
              homework for this selection.
            </p>
          )}
        </div>
      )}
      <div className="homework-setup" hidden={h.active}>
        <label>
          Suggested workload
          <select
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value) as 5 | 15 | 30)}
          >
            {[5, 15, 30].map((n) => (
              <option key={n} value={n}>
                {n} minutes
              </option>
            ))}
          </select>
        </label>
        <label>
          Neck region
          <select
            aria-label="Homework neck region"
            value={`${region.minFret}`}
            disabled={h.active}
            onChange={(e) => {
              const min = Number(e.target.value);
              p.changeOptions({ ...p.options, minFret: min, maxFret: min === 0 ? 5 : min + 4 });
            }}
          >
            {[0, 3, 5, 8, 10, 12, 15, 20].map((n) => (
              <option value={n} key={n}>
                Frets {n}–{n === 0 ? 5 : n + 4}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary-button" disabled={!ready || h.active} onClick={onOriginal}>
          Open C–F–G–C study
        </button>
      </div>
      <p className="caption">
        {symbol
          ? `Selected harmony: ${symbol}. `
          : 'Confirm the selected passage’s harmony for chord tasks. Note recall remains available. '}
        Suggested work, no countdown. Pause and resume whenever you need.
      </p>
      {!supported && (
        <p className="teaching-cue">
          This tuning changes the conventional CAGED intervals. Note and chord tasks use your actual
          tuning; CAGED maps are unavailable.
        </p>
      )}
      <nav className="homework-views" aria-label="Homework views">
        {(['explore', 'recall', 'apply'] as const).map((v) => (
          <button
            className="secondary-button"
            key={v}
            aria-pressed={h.view === v}
            onClick={() => h.setView(v)}
          >
            {v[0]!.toUpperCase() + v.slice(1)}
          </button>
        ))}
      </nav>
      <nav className="caged-families" aria-label="CAGED shape families">
        {CAGED_FAMILIES.map((f) => (
          <button
            key={f}
            disabled={!supported || h.active}
            aria-pressed={family === f}
            onClick={() => setFamily(f)}
          >
            <strong>{f}</strong>
            <span>family</span>
          </button>
        ))}
      </nav>
      {h.view === 'explore' && (
        <>
          <h3>
            {chord.rootName} major · {family}-family map
          </h3>
          <p>
            The family is a landmark. The sounding chord is {chord.rootName} major, with{' '}
            {parseChordSymbol(chord.rootName)!
              .tones.map(
                (t) =>
                  `${t.noteName} (${t.degree === '1' ? 'root' : t.degree === '3' ? 'third' : 'fifth'})`,
              )
              .join(', ')}
            .
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={fragmentOnly}
              onChange={(e) => setFragmentOnly(e.target.checked)}
            />
            Show a three-note fragment
          </label>
          {!shape && (
            <p className="teaching-cue">
              No complete {family}-family fragment fits this region. Choose another family or
              region.
            </p>
          )}
          {match && (
            <p className="caption">
              This fragment belongs to{' '}
              {fragmentFamilies(match.fragment.positions, placements).join(' and ')} family maps.
              Some fragments occur in more than one family.
            </p>
          )}
          {shape &&
            !fragmentOnly &&
            shape.notes.some(
              (n) => n.position.fret < region.minFret || n.position.fret > region.maxFret,
            ) && (
              <p className="caption">
                The full parent extends outside this view. Its complete coordinates:{' '}
                {shape.notes.map((n) => `S${n.position.string}:${n.position.fret}`).join(', ')}. No
                out-of-view notes are omitted from the parent.
              </p>
            )}
          <p className="caption">
            Fragments contain root, third and fifth. Full C and G grips are references, not required
            fingering. Minor and extended harmony stays available in Apply.
          </p>
        </>
      )}
      {recall && task && (
        <div className="homework-task-heading">
          <span className="eyebrow">
            Task {h.state!.index + 1} of {h.state!.tasks.length} ·{' '}
            {h.state!.exposure === 'reserved'
              ? 'Unexposed region at start'
              : h.state!.exposure === 'unknown'
                ? 'Earlier exposure unknown'
                : 'Previously explored region'}
          </span>
          <h3>{labels[task.kind]}</h3>
          <p>{task.prompt}</p>
          {!h.fresh && (
            <p role="alert">
              The selection changed. This task is saved but cannot accept more answers. Start a new
              assignment.
            </p>
          )}
          {h.state?.status === 'paused' && (
            <button className="secondary-button" onClick={h.resume}>
              Resume assignment with support
            </button>
          )}
        </div>
      )}
      <Fretboard
        tuning={tuning}
        capo={capo}
        minFret={h.view === 'apply' ? p.options.minFret : shownRegion.minFret}
        maxFret={h.view === 'apply' ? p.options.maxFret : shownRegion.maxFret}
        markers={markers}
        selectedPositions={recall ? selected : []}
        selectableAll
        hideLabels={recall && !revealed}
        showOctaves={showOctaves}
        currentPosition={recall && task?.kind === 'name' ? task.sourcePosition : null}
        onChoose={choose}
        label="Homework interactive fretboard"
      />
      {recall && task && (
        <>
          {task.kind === 'name' && (
            <label>
              Note name
              <input
                className="field-input"
                aria-label="Homework note name"
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          {selected.length > 0 && (
            <p className="caption">
              Selected:{' '}
              {selected
                .map((p) => `S${p.string}:${p.fret}`)
                .join(task.kind === 'connection' ? ' → ' : ', ')}
            </p>
          )}
          <div className="homework-actions">
            <button
              className="primary-button"
              disabled={
                !h.active || !ready || (task.kind === 'name' ? !name.trim() : !selected.length)
              }
              onClick={() => h.answer({ positions: selected, text: name })}
            >
              Check answer
            </button>
            <button className="secondary-button" disabled={!h.active} onClick={h.next}>
              Next task
            </button>
            <button className="text-button" onClick={h.pause}>
              Pause homework
            </button>
          </div>
          <details className="support-options">
            <summary>Choose some help</summary>
            <div>
              {(Object.keys(supports) as HomeworkSupport[]).map((k) => (
                <button
                  className="secondary-button"
                  key={k}
                  disabled={!h.active}
                  onClick={() => h.help(k)}
                >
                  {supports[k]}
                </button>
              ))}
            </div>
          </details>
          {h.state?.support.at(-1) && (
            <p className="teaching-cue" role="status">
              {homeworkHelp(task, h.state.support.at(-1)!)}
            </p>
          )}
          {!!h.state?.responses.length && (
            <p className="caption">
              First response saved. Corrections after feedback remain separate and assisted.
            </p>
          )}
        </>
      )}
      {h.view === 'apply' && (
        <>
          <h3>Use it in the progression</h3>
          {p.chord && (
            <label>
              Change a degree or add an extension
              <select
                className="field-input"
                aria-label="Homework chord quality"
                value={p.chord.quality}
                onChange={(e) => {
                  const changed = defineChord(p.chord!.rootName, e.target.value as ChordQuality);
                  if (changed) {
                    p.setOperation('color');
                    p.targetChord(changed.symbol);
                    p.changeOptions({
                      voiceCount: changed.tones.length > 3 ? 4 : 3,
                      omitFifth: changed.tones.length > 4,
                    });
                  }
                }}
              >
                {CHORD_QUALITIES.map((q) => (
                  <option key={q.quality} value={q.quality}>
                    {q.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {p.chord && (
            <p className="caption">
              Derived harmony: {p.chord.symbol}.{' '}
              {p.chord.tones.map((t) => `${t.noteName} (${t.degree})`).join(' · ')}. Compare these
              degrees with the parent major map; this is a derived voicing.
            </p>
          )}
          {p.working && <p role="status">Finding voicings for the selected harmony…</p>}
          {!p.working && !p.variation && (
            <p role="status">
              No progression fits these constraints. Choose another region or use the full
              progression controls.
            </p>
          )}
          <div className="homework-progression">
            {p.spans.map((span, i) => (
              <button
                className="secondary-button"
                key={span.id}
                aria-pressed={p.selectedIndex === i}
                onClick={() => p.setSelected(i)}
              >
                {span.chord?.symbol ?? 'Confirm harmony'}
              </button>
            ))}
          </div>
          <div className="homework-actions">
            <button className="secondary-button" onClick={() => move(0, 5)}>
              Use frets 0–5
            </button>
            <button className="secondary-button" onClick={() => move(5, 9)}>
              Use frets 5–9
            </button>
            <button
              className="secondary-button"
              disabled={!p.variation}
              onClick={() => p.show(p.variation)}
            >
              Preview in shared player
            </button>
            <button className="secondary-button" onClick={() => p.show(null)}>
              Original
            </button>
            <button
              className="primary-button"
              disabled={!p.variation}
              onClick={() => void p.apply()}
            >
              Apply & save variation
            </button>
          </div>
          {p.event && (
            <p>
              {p.event.voicing.notes.map((n) => `${n.noteName} (${n.degree})`).join(' · ')}. Omitted
              degrees: {p.event.voicing.omittedDegrees.join(', ') || 'none'}.
            </p>
          )}
          <button
            className="text-button"
            disabled={!p.applied}
            onClick={() => {
              const previous = p.previousApplied.current;
              p.previousApplied.current = p.applied;
              p.setApplied(previous);
              if (previous) p.restore(previous, true);
              else p.show(null);
            }}
          >
            Undo saved variation
          </button>
          <p className="caption">
            Use the persistent transport for the same tempo, loop and backing tracks. Preview
            changes accompaniment; the source is preserved. Extended voicings describe chord
            degrees, not canonical CAGED grips.
          </p>
        </>
      )}
      {h.view !== 'recall' && (
        <div className="homework-actions">
          <button
            className="secondary-button"
            disabled={!markers.length}
            onClick={() => onListen(markers.map((m) => noteAt(m.position, tuning, capo)!))}
          >
            Listen to this fragment
          </button>
          <button className="text-button" onClick={onStop}>
            Stop audio
          </button>
          <button className="secondary-button" disabled={!h.state} onClick={h.playing}>
            I tried it on guitar
          </button>
        </div>
      )}
      {h.feedback && (
        <p className="practice-feedback" role="status">
          {h.feedback}
        </p>
      )}
      {!h.active && (
        <div className="homework-start">
          <label className="check-label">
            <input type="checkbox" checked={exact} onChange={(e) => setExact(e.target.checked)} />
            Require octave in note tasks
          </label>
          <button className="primary-button" disabled={!ready} onClick={() => start()}>
            Start homework
          </button>
          <details>
            <summary>Choose a specific task</summary>
            <div className="homework-task-options">
              {(Object.keys(labels) as HomeworkKind[]).map((k) => (
                <button
                  className="secondary-button"
                  key={k}
                  disabled={
                    !ready ||
                    (!symbol && !['name', 'locate'].includes(k)) ||
                    (!supported && ['roots', 'complete', 'neighbor'].includes(k))
                  }
                  onClick={() => start(k)}
                >
                  {labels[k]}
                </button>
              ))}
            </div>
          </details>
        </div>
      )}
      {h.state && (
        <details>
          <summary>Progress & next review</summary>
          {h.state.dueAt && (
            <p>
              Next review: {new Date(h.state.dueAt).toLocaleDateString()}. Review defaults: 1, 3, 7
              days.
            </p>
          )}
          {(Object.keys(labels) as HomeworkKind[]).map((k) => {
            const es = h.observations.filter(
              (e) => e.skill === k && e.kind === 'answer' && e.firstResponse && !e.assisted,
            );
            return (
              <p key={k}>
                {labels[k]}: {es.filter((e) => e.correct).length}/{es.length} correct first
                responses without help.
                {es.length ? ` Last recorded ${new Date(es.at(-1)!.at).toLocaleDateString()}.` : ''}
              </p>
            );
          })}
          <p>
            Playing: {h.observations.filter((e) => e.kind === 'playing').length} self-reports. No
            performance or technique has been assessed.
          </p>
          <label>
            What needed help?
            <textarea
              className="field-input"
              maxLength={1000}
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
            />
          </label>
          <button className="secondary-button" onClick={() => h.reflect(reflection)}>
            Save reflection
          </button>
        </details>
      )}
    </section>
  );
}
