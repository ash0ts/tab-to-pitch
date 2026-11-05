import { HOMEWORK_SOURCE_ID } from '../player/demo';
import { useLiveGuitar } from '../hooks/useLiveGuitar';
import { LiveGuitarPanel } from './LiveGuitarPanel';
import { liveTasks } from '../live/assessment';
import { useHomeworkSession } from '../hooks/useHomeworkSession';
import { HomeworkWorkspace } from './HomeworkWorkspace';
import type { MutableRefObject } from 'react';
import type { SupportKind } from '../shared/practice';
import { useEffect, useLayoutEffect, useState } from 'react';
import { useDesktopLayout } from '../useMediaQuery';
import { usePracticeSession } from '../hooks/usePracticeSession';
import { PracticeWorkspace } from './PracticeWorkspace';
import type { TimedStudy } from '../engine/musicianship';
import { passageForSource } from '../songs/catalog';
import { useLessonSession } from '../hooks/useLessonSession';
import { useListeningSession } from '../hooks/useListeningSession';
import { ListeningPanel } from './ListeningPanel';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Music2,
  RotateCcw,
  Volume2,
} from 'lucide-react';
import {
  CHORD_QUALITIES,
  defineChord,
  harmonicFunction,
  MODE_NAMES,
  parseChordSymbol,
  romanNumeral,
  type ChordQuality,
  type ModeName,
} from '../engine/harmony';
import { DEGREE_LABELS } from '../engine/harmony-exercises';
import { formatPitch } from '../engine/exploration';
import { executeArrangementIntent, type ArrangementConstraints } from '../shared/arrangements';
import { exportVariations } from '../storage';
import {
  useProgressionSession,
  type ProgressionSession,
  type ProgressionSessionInput,
} from '../hooks/useProgressionSession';
import { Fretboard, type FretboardMarker } from './Fretboard';
import { ArrangementPrompt } from './ArrangementPrompt';
import { RecordedChoiceExplorer } from './RecordedChoiceExplorer';
import { RecordedArrangement } from './RecordedArrangement';
import { TeacherPanel, type TeacherPanelProps } from './TeacherPanel';
import './progression.css';

const TONICS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
const modeLabel = (mode: string) =>
  mode === 'ionian'
    ? 'Major / Ionian'
    : mode === 'aeolian'
      ? 'Natural minor / Aeolian'
      : mode[0]!.toUpperCase() + mode.slice(1);
const role = (degree: string): FretboardMarker['role'] =>
  degree === '1'
    ? 'root'
    : ['3', 'b3'].includes(degree)
      ? 'third'
      : ['5', 'b5', '#5'].includes(degree)
        ? 'fifth'
        : degree.includes('7')
          ? 'seventh'
          : 'extension';
const colorFamilies: ChordQuality[][] = [
  ['major', 'maj7', '6', 'add9', '6/9', 'maj9', 'maj13'],
  ['minor', 'm7', 'm6', 'madd9', 'm9', 'm11', 'mMaj7'],
  ['7', '9', '13'],
];

export function ProgressionWorkspace(
  props: ProgressionSessionInput & {
    visible: boolean;
    teacherFocusRequest: number;
    onListeningMask(masked: boolean): void;
    supportRecorder: MutableRefObject<(kind: SupportKind, episodeId: string) => boolean>;
    initialListeningDifficulty: 'guided' | 'recall' | 'transfer';
    onTransfer(): void;
    onReplay(bassOnly?: boolean): void;
    audioReady: boolean;
    onStudy(study: TimedStudy): void;
    onStopStudy(): void;
    listOutputs():Promise<{deviceId:string;label:string}[]>;
    selectOutput(id:string):Promise<void>;
    teacher: Pick<
      TeacherPanelProps,
      'attempts' | 'selectedNote' | 'activeQuestion' | 'onExercise' | 'onHelp' | 'onUnderstand'
    >;
  },
) {
  const session = useProgressionSession(props);
  const desktop = useDesktopLayout();

  const passage = passageForSource(props.score.hash);
  const learning = useLessonSession(
    props.score.hash,
    props.track.id,
    session.contextVersion,
    passage
      ? {
          kind: 'catalog-passage',
          passageId: passage.id,
          recordingId: passage.recordingId,
          annotationVersion: passage.version,
        }
      : { kind: 'score', hash: props.score.hash, trackId: props.track.id },
  );
  const listening = useListeningSession(
    passage,
    learning,
    () => {},
    session.contextVersion + String(props.active),
    props.initialListeningDifficulty,
  );
  useEffect(() => {
    props.supportRecorder.current = (support, episodeId) =>
      !!learning.record(
        {},
        [],
        [{ kind: 'practice-support', exposureKeys: [], practice: { support, episodeId } }],
      );
    return () => {
      props.supportRecorder.current = () => false;
    };
  }, [learning.record, props.supportRecorder]);
  const [teacherSheetOpen, setTeacherSheetOpen] = useState(false);
  const [teacherExpanded, setTeacherExpanded] = useState(false);
  const [teacherCloud, setTeacherCloud] = useState(false);
  const [homeworkOpen, setHomeworkOpen] = useState(props.score.hash === HOMEWORK_SOURCE_ID);
  const homework = useHomeworkSession(
    learning,
    session.contextVersion,
    props.track.tuningMidi,
    props.track.capo,
    props.onStopStudy,
    {
      symbol:
        session.span?.confirmation === 'confirmed' ? (session.span.chord?.symbol ?? 'C') : 'C',
      symbols: session.spans.flatMap((span) =>
        span.confirmation === 'confirmed' && span.chord ? [span.chord.symbol] : [],
      ),
      region: { minFret: session.options.minFret, maxFret: session.options.maxFret },
    },
  );
  const practice = usePracticeSession(learning, session.contextVersion, props.onStopStudy);
  const [liveOpen,setLiveOpen]=useState(false);
  const liveBlocked=listening.active || practice.active || homework.active || !!props.teacher.activeQuestion;
  const liveRevision=`${session.contextVersion}:${props.teacher.selectedNote?.soundingMidi??60}:${homework.task?.id??'none'}:${practice.state.episode?.responseCount??0}`;
  const guitar=useLiveGuitar(learning,liveRevision,liveTasks(liveRevision,session.spans.every(s=>s.confirmation==='confirmed'&&s.chord)?session.spans.map(s=>s.chord!.symbol):[],props.teacher.selectedNote?.soundingMidi??60,homework.active?undefined:homework.task,practice.state.episode?.kind==='phrase'?(practice.state.episode.firstResponse?.cells??[]).filter((n):n is number=>n!==null):[]),liveBlocked);
  useLayoutEffect(() => {
    props.onListeningMask(listening.masked || practice.masked || homework.masked || guitar.active);
    return () => props.onListeningMask(false);
  }, [listening.masked, practice.masked, homework.masked, guitar.active, props.onListeningMask]);
  useEffect(() => {
    if (homework.active || practice.active || listening.active || props.teacher.activeQuestion)
      setTeacherSheetOpen(false);
  }, [
    homework.active,
    practice.active,
    listening.active,
    props.teacher.activeQuestion?.exercise.id,
  ]);
  useEffect(() => {
    if (props.teacherFocusRequest) setTeacherSheetOpen(true);
  }, [props.teacherFocusRequest]);
  useEffect(() => {
    if (!props.visible) {
      guitar.stop();
      homework.pause();
      practice.interrupt('The learner returned to the player.');
    }
  }, [props.visible]);
  const teacher = (
    <TeacherPanel
      live={liveOpen ? guitar : undefined}
      focusRequest={props.teacherFocusRequest}
      presentation={{
        expanded: teacherExpanded,
        setExpanded: setTeacherExpanded,
        cloud: teacherCloud,
        setCloud: setTeacherCloud,
      }}
      learning={learning}
      onTransfer={props.onTransfer}
      practice={practice}
      homework={homeworkOpen ? homework : undefined}
      listening={passage ? listening : undefined}
      onReplay={props.onReplay}
      score={props.score}
      track={props.track}
      progression={session}
      {...props.teacher}
      exploring={props.active && !practice.masked && !homework.masked && !guitar.active}
      onOpenStudy={props.onOpenStudy}
      onListen={props.onAudition}
    />
  );
  if (!props.visible) return null;
  return (
    <div className="learning-layout">
      <div className="learning-task-column">
        <nav className="homework-entry" aria-label="Learning activity">
          <button
            className="secondary-button"
            aria-pressed={!liveOpen && !homeworkOpen && !liveOpen}
            onClick={() => {
              guitar.stop();setLiveOpen(false);homework.pause();
              setHomeworkOpen(false);
            }}
          >
            Musical intentions
          </button>
          <button
            className="secondary-button"
            aria-pressed={homeworkOpen}
            disabled={listening.active || !!props.teacher.activeQuestion}
            onClick={() => {
              guitar.stop();setLiveOpen(false);practice.interrupt('The learner selected fretboard homework.');
              setHomeworkOpen(true);
            }}
          >
            Fretboard homework
          </button>
        <button className="secondary-button" aria-pressed={liveOpen} disabled={listening.active || !!props.teacher.activeQuestion} onClick={()=>{homework.pause();practice.interrupt("The learner selected live guitar practice.");setLiveOpen(true);setHomeworkOpen(false);}}>Play with my guitar</button>
        </nav>
        {liveOpen ? <LiveGuitarPanel session={guitar} blocked={liveBlocked} onReplay={props.onReplay} listOutputs={props.listOutputs} selectOutput={props.selectOutput} /> : homeworkOpen ? (
          <HomeworkWorkspace
            homework={homework}
            progression={session}
            tuning={props.track.tuningMidi}
            capo={props.track.capo}
            ready={
              !!learning.lesson &&
              !learning.externalRevision &&
              !listening.active &&
              !props.teacher.activeQuestion
            }
            onListen={props.onAudition}
            onStop={props.onStopStudy}
            onOriginal={() => {
              homework.pause();
              props.onOpenHomework?.();
            }}
            showOctaves={props.showOctaves}
          />
        ) : (
          <PracticeWorkspace
            session={practice}
            ready={
              !!learning.lesson &&
              !learning.externalRevision &&
              !listening.active &&
              !props.teacher.activeQuestion
            }
            onPlay={props.onStudy}
            onStop={props.onStopStudy}
          />
        )}
        {!liveOpen && !homeworkOpen && !practice.active && passage && (
          <ListeningPanel
            onTransfer={props.onTransfer}
            session={listening}
            audioReady={props.audioReady}
            onPlay={(bassOnly) => {
              session.show(null);
              props.onReplay(bassOnly);
            }}
            onAudition={props.onAudition}
            onWorkspace={() => {
              props.teacher.onUnderstand();
              document.getElementById('progression-studio')?.scrollIntoView({ block: 'start' });
            }}
          />
        )}
        {!liveOpen && !homeworkOpen && !listening.masked && !practice.masked && (
          <ProgressionStudio {...props} session={session} />
        )}
      </div>
      {desktop ? (
        <aside className="learning-teacher-column" aria-label="Teacher">
          {teacher}
        </aside>
      ) : (
        <Dialog.Root open={teacherSheetOpen} onOpenChange={setTeacherSheetOpen}>
          <Dialog.Trigger asChild>
            <button className="primary-button teacher-sheet-trigger">Open music teacher</button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="teacher-sheet-overlay" />
            <Dialog.Content className="teacher-sheet">
              <Dialog.Title>Music teacher</Dialog.Title>
              <Dialog.Description>
                Ask about the current task or choose a different approach.
              </Dialog.Description>
              <Dialog.Close className="text-button">Return to my task</Dialog.Close>
              {teacher}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </div>
  );
}

export function ProgressionStudio(
  props: ProgressionSessionInput & { session: ProgressionSession },
) {
  const { score, track, firstBar, lastBar, active, showOctaves } = props;
  const {
    barGrid,
    setBarGrid,
    setSymbols,
    targets,
    setTargets,
    selectedIndex,
    setSelected,
    operation,
    setOperation,
    context,
    setContext,
    options,
    setOptions,
    setMelodyVoice,
    result,
    working,
    path,
    setPath,
    previewing,
    message,
    setMessage,
    saved,
    applied,
    setApplied,
    previousApplied,
    scaleVisible,
    setScaleVisible,
    contextOpen,
    setContextOpen,
    targetsVisible,
    setTargetsVisible,
    preferredPath,
    sourceSpans,
    spans,
    valid,
    rangeValid,
    variation,
    span,
    sourceSpan,
    event,
    chord,
    toneSet,
    monophonic,
    notationTick,
    contextVersion,
    show,
    changeOptions,
    pickChord,
    targetChord,
    apply,
    restore,
    melodyVoice,
  } = props.session;
  if (!active) return null;
  const templates = CHORD_QUALITIES.filter((item) =>
    colorFamilies.some(
      (family) =>
        sourceSpan?.chord &&
        family.includes(sourceSpan.chord.quality) &&
        family.includes(item.quality),
    ),
  );
  const substitutions =
    context?.mode === 'ionian' && sourceSpan?.chord
      ? toneSet
          .map((tone, index) =>
            defineChord(
              tone.noteName,
              (['major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished'] as const)[
                index
              ]!,
            ),
          )
          .filter(
            (item) =>
              item &&
              item.id !== sourceSpan.chord!.id &&
              harmonicFunction(item, context) === harmonicFunction(sourceSpan.chord!, context),
          )
      : [];
  const markers: FretboardMarker[] = [];
  if (scaleVisible && context)
    for (let string = 1; string <= 6; string++)
      for (let fret = options.minFret; fret <= options.maxFret; fret++) {
        const midi = track.tuningMidi[string - 1]! + track.capo + fret;
        const tone = toneSet.find((item) => item.pitchClass === midi % 12);
        if (tone) markers.push({ position: { string, fret }, label: tone.noteName, role: 'scale' });
      }
  const nextChord = spans[selectedIndex + 1]?.chord;
  const nextTargets =
    nextChord?.tones.filter((tone) => ['3', 'b3', '7', 'b7'].includes(tone.degree)) ?? [];
  if (targetsVisible)
    for (let string = 1; string <= 6; string++)
      for (let fret = options.minFret; fret <= options.maxFret; fret++) {
        const midi = track.tuningMidi[string - 1]! + track.capo + fret;
        const tone = nextTargets.find((item) => item.pitchClass === midi % 12);
        if (tone)
          markers.push({ position: { string, fret }, label: tone.noteName, role: 'target' });
      }
  markers.push(
    ...(event?.voicing.notes.map((note) => ({
      position: note.position,
      label: showOctaves ? note.label : note.noteName,
      role: role(note.degree),
    })) ?? []),
  );
  const contextPanel = (
    <>
      <h3>Connect it to the key</h3>
      <label>
        Tonal center
        <select
          aria-label="Tonal center"
          value={context?.tonic ?? ''}
          onChange={(e) =>
            setContext(
              e.target.value ? { tonic: e.target.value, mode: context?.mode ?? 'ionian' } : null,
            )
          }
        >
          <option value="">Choose a key</option>
          {TONICS.map((tonic) => (
            <option key={tonic}>{tonic}</option>
          ))}
        </select>
      </label>
      <label>
        Scale / mode
        <select
          aria-label="Scale mode"
          disabled={!context}
          value={context?.mode ?? 'ionian'}
          onChange={(e) => context && setContext({ ...context, mode: e.target.value as ModeName })}
        >
          {MODE_NAMES.map((mode) => (
            <option value={mode} key={mode}>
              {modeLabel(mode)}
            </option>
          ))}
        </select>
      </label>
      {context && (
        <>
          <p className="scale-note-list">
            {toneSet.map((tone) => (
              <span key={tone.degree}>
                <strong>{tone.noteName}</strong>
                <small>{tone.label}</small>
              </span>
            ))}
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={scaleVisible}
              onChange={(e) => setScaleVisible(e.target.checked)}
            />
            Show scale notes under this voicing
          </label>
          <p className="caption">
            Changing neck position keeps this tonal center and mode. The mode changes when you
            select a different tonal context.
          </p>
          <button
            className="secondary-button"
            onClick={() =>
              props.onAuditionScale(
                48 + toneSet[0]!.pitchClass,
                toneSet.map(
                  (tone) =>
                    60 +
                    toneSet[0]!.pitchClass +
                    ((tone.pitchClass - toneSet[0]!.pitchClass + 12) % 12),
                ),
              )
            }
          >
            <Volume2 size={15} />
            Hear the mode over its tonic
          </button>
          {chord && (
            <p className="function-explanation">
              <strong>{romanNumeral(chord, context) ?? 'Outside selected collection'}</strong>
              <br />
              {harmonicFunction(chord, context).replaceAll('-', ' ')}. Function depends on the
              surrounding phrase and its resolution.
            </p>
          )}
          <details>
            <summary>Move the study around the fifths</summary>
            <p className="caption">
              Open the original ii–V–I–vi lesson in another major key. Guitar and bass transpose
              together. Imported songs and saved variations stay unchanged.
            </p>
            <div className="fifths-controls">
              {TONICS.map((tonic) => (
                <button key={tonic} onClick={() => props.onOpenStudy(tonic)}>
                  {tonic}
                </button>
              ))}
            </div>
          </details>
        </>
      )}
      <div className="exploration-challenge">
        <strong>Make the connection</strong>
        <p>
          Play this voicing. Name its third and seventh, then find a target in the next chord. Try
          it again without looking.
        </p>
      </div>
      <button
        className="secondary-button full-width"
        disabled={!valid}
        onClick={() => {
          setContextOpen(false);
          props.onPractice('chord-tone');
        }}
      >
        Practice chord tones
        <ArrowRight size={15} />
      </button>
      <button
        className="text-button"
        disabled={!valid || spans.length < 2}
        onClick={() => {
          setContextOpen(false);
          props.onPractice('next-target');
        }}
      >
        Find the next target
        <ArrowRight size={15} />
      </button>
      {Object.keys(targets).length > 0 && (
        <button
          className="text-button"
          onClick={() => {
            setContextOpen(false);
            props.onPractice('changed-tone');
          }}
        >
          Compare the added tone
          <ArrowRight size={15} />
        </button>
      )}
    </>
  );
  return (
    <section id="progression-studio" className="progression-studio" aria-label="Progression studio">
      <header className="progression-heading">
        <div>
          <h2>Explore this progression</h2>
          <p>Move the voicing, add a color, then hear the change.</p>
        </div>
        <button className="secondary-button" onClick={() => props.onOpenStudy()}>
          <Music2 size={16} />
          Open ii–V–I study
        </button>
      </header>
      <details className="passage-config">
        <summary>
          Bars {firstBar + 1}–{lastBar + 1} · {track.name} · Change passage
        </summary>
        <div className="passage-picker">
          <label>
            From bar
            <select
              aria-label="Progression first bar"
              value={firstBar}
              onChange={(e) => {
                const value = Number(e.target.value);
                props.onRange(
                  value,
                  Math.min(
                    score.measures.length - 1,
                    Math.max(value + 1, Math.min(lastBar, value + 7)),
                  ),
                );
              }}
            >
              {score.measures.map((m, i) => (
                <option value={i} key={i}>
                  {m.index + 1}
                </option>
              ))}
            </select>
          </label>
          <label>
            Through bar
            <select
              aria-label="Progression last bar"
              value={lastBar}
              onChange={(e) => props.onRange(firstBar, Number(e.target.value))}
            >
              {score.measures.map((m, i) => (
                <option value={i} key={i} disabled={i < firstBar || i > firstBar + 7}>
                  {m.index + 1}
                </option>
              ))}
            </select>
          </label>
          <span className="caption">
            {spans.length} harmonic spans · {track.name}
          </span>
          <label className="check-label">
            <input
              type="checkbox"
              checked={barGrid}
              onChange={(e) => {
                setBarGrid(e.target.checked);
                setSymbols({});
                setTargets({});
              }}
            />
            Set one chord per bar
          </label>
        </div>
      </details>
      {!rangeValid || !spans.length || spans.length > 8 ? (
        <p className="exploration-empty">
          {spans.length > 8
            ? 'This passage has more than eight sounding changes. Shorten it, or set one chord per bar and confirm the harmony.'
            : 'Choose a supported six-string track and a passage of up to eight bars. For an arpeggio or unsupported articulation, set the chords manually with one chord per bar.'}
        </p>
      ) : (
        <>
          <div className="progression-strip" aria-label="Passage chords">
            {spans.map((item, index) => (
              <button
                key={item.id}
                aria-pressed={selectedIndex === index}
                className={
                  notationTick >= item.startTick && notationTick < item.endTick ? 'sounding' : ''
                }
                onClick={() => {
                  setSelected(index);
                  setOperation('move');
                  if (item.sourceNoteIds[0]) props.onSelectNote(item.sourceNoteIds[0]);
                }}
              >
                <span>
                  {index + 1}
                  {item.confirmation === 'confirmed' && <Check size={12} />}
                </span>
                <strong>{item.chord?.symbol ?? 'Set chord'}</strong>
                <small>
                  {context && item.chord
                    ? romanNumeral(item.chord, context)
                    : item.confirmation === 'confirmed'
                      ? item.source === 'manual'
                        ? 'Confirmed'
                        : 'Authored'
                      : 'Needs confirmation'}
                </small>
              </button>
            ))}
          </div>
          {span && (
            <details
              key={span.id}
              className="harmony-source"
              open={span.confirmation !== 'confirmed'}
            >
              <summary>
                {span.source === 'manual'
                  ? 'Learner-confirmed harmony'
                  : span.source === 'catalog'
                    ? 'Verified catalog annotation'
                    : span.source === 'imported'
                      ? 'Harmony from the score'
                      : 'Suggested harmony'}{' '}
                ·{' '}
                {span.confirmation === 'confirmed'
                  ? 'Edit or compare interpretations'
                  : 'Confirmation needed'}
              </summary>
              <div className="harmony-confirmation">
                <label>
                  Chord {selectedIndex + 1}
                  <input
                    key={span.id + span.chord?.id}
                    aria-label="Confirm chord symbol"
                    defaultValue={span.chord?.symbol ?? ''}
                    placeholder="e.g. Cmaj7, Dm9, G13"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (parseChordSymbol(e.currentTarget.value)) {
                          pickChord(e.currentTarget.value);
                          setMessage('');
                        } else
                          setMessage('Enter a supported chord symbol, such as Cmaj7, Dm9 or G13.');
                      }
                    }}
                  />
                </label>
                <button
                  className="secondary-button"
                  onClick={(e) => {
                    const input = e.currentTarget.parentElement?.querySelector('input');
                    if (input && parseChordSymbol(input.value)) {
                      pickChord(input.value);
                      setMessage('');
                    } else setMessage('Enter a supported chord symbol, such as Cmaj7, Dm9 or G13.');
                  }}
                >
                  Confirm chord
                </button>
                <span className="caption">
                  {span.source === 'manual'
                    ? 'Learner-confirmed'
                    : span.source === 'catalog'
                      ? 'From the passage annotation'
                      : span.source === 'imported'
                        ? 'From the score or authored lesson'
                        : 'From overlapping notes'}{' '}
                  · {span.confirmation}
                </span>
                {(sourceSpan?.alternatives?.length ?? 0) > 1 && (
                  <label>
                    Interpretations
                    <select
                      aria-label="Chord interpretation"
                      value=""
                      onChange={(e) => pickChord(e.target.value)}
                    >
                      <option value="">Choose the intended harmony</option>
                      {sourceSpan!.alternatives!.map((item) => (
                        <option value={item.symbol} key={item.id}>
                          {item.symbol}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </details>
          )}
          {!valid && (
            <p className="exploration-empty">
              Confirm each chord before generating a progression. A pitch collection can support
              more than one interpretation.
            </p>
          )}
          <div className="progression-layout">
            <div className="progression-main">
              <div className="exploration-switch" role="group" aria-label="Variation operation">
                {(
                  [
                    ['move', 'Move the voicing'],
                    ['color', 'Add color'],
                    ['substitute', 'Try a substitution'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    aria-pressed={operation === value}
                    onClick={() => setOperation(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {operation === 'color' && (
                <div className="variation-operation">
                  <label>
                    Color for {sourceSpan?.chord?.symbol ?? 'this chord'}
                    <select
                      aria-label="Chord color"
                      value={chord?.quality ?? ''}
                      onChange={(e) => {
                        const changed =
                          sourceSpan?.chord &&
                          defineChord(
                            sourceSpan.chord.rootName,
                            e.target.value as ChordQuality,
                            sourceSpan.chord.bassName,
                          );
                        if (changed) targetChord(changed.symbol);
                      }}
                    >
                      {templates.map((item) => (
                        <option key={item.quality} value={item.quality}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="caption">
                    Extensions change the harmony. An added ninth has no implied seventh. Every
                    omitted tone is listed below.
                  </p>
                </div>
              )}
              {operation === 'substitute' && (
                <div className="variation-operation">
                  <p className="small-muted">
                    Compare a chord from the same major-key function family, then listen to the
                    melody and resolution. Shared notes do not guarantee a suitable replacement.
                  </p>
                  <label>
                    Compare with
                    <select
                      aria-label="Substitution"
                      value={targets[span?.id ?? ''] ?? ''}
                      onChange={(e) => targetChord(e.target.value)}
                    >
                      <option value="">Choose a confirmed major key first</option>
                      {substitutions.map(
                        (item) =>
                          item && (
                            <option value={item.symbol} key={item.id}>
                              {item.symbol} · {context && romanNumeral(item, context)}
                            </option>
                          ),
                      )}
                    </select>
                  </label>
                </div>
              )}
              {Object.keys(targets).length > 0 && (
                <button className="text-button" onClick={() => setTargets({})}>
                  <RotateCcw size={14} /> Restore source harmony
                </button>
              )}
              <div className="neck-presets" role="group" aria-label="Progression neck region">
                {[
                  [0, 5],
                  [5, 9],
                  [9, 12],
                  [12, 17],
                ].map(([min, max]) => (
                  <button
                    key={min}
                    aria-pressed={options.minFret === min && options.maxFret === max}
                    onClick={() => changeOptions({ minFret: min!, maxFret: max! })}
                  >
                    Frets {min}–{max}
                  </button>
                ))}
              </div>
              <details className="advanced-voicings">
                <summary>
                  {options.voiceCount} voices ·{' '}
                  {options.bass === 'any'
                    ? 'any chord tone in bass'
                    : options.bass === 'preserve'
                      ? 'preserve bass'
                      : `${DEGREE_LABELS[options.bass]} in bass`}{' '}
                  · Customize
                </summary>{' '}
                <div className="progression-controls">
                  <label>
                    Lowest fret
                    <input
                      aria-label="Minimum fret"
                      type="number"
                      min={0}
                      max={24}
                      value={options.minFret}
                      onChange={(e) => changeOptions({ minFret: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Highest fret
                    <input
                      aria-label="Maximum fret"
                      type="number"
                      min={0}
                      max={24}
                      value={options.maxFret}
                      onChange={(e) => changeOptions({ maxFret: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Voices
                    <select
                      aria-label="Number of voices"
                      value={options.voiceCount}
                      onChange={(e) =>
                        changeOptions({
                          voiceCount: Number(
                            e.target.value,
                          ) as ArrangementConstraints['voiceCount'],
                        })
                      }
                    >
                      {[2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Bass
                    <select
                      aria-label="Variation bass"
                      value={options.bass}
                      onChange={(e) =>
                        changeOptions({ bass: e.target.value as ArrangementConstraints['bass'] })
                      }
                    >
                      <option value="any">Any chord tone</option>
                      <option value="preserve">Keep chord’s bass note (any octave)</option>
                      {chord?.tones.map((tone) => (
                        <option value={tone.degree} key={tone.degree}>
                          {DEGREE_LABELS[tone.degree]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <fieldset>
                  <legend>Available strings</legend>
                  {[1, 2, 3, 4, 5, 6].map((string) => (
                    <label key={string}>
                      <input
                        type="checkbox"
                        checked={options.strings.includes(string)}
                        onChange={(e) =>
                          changeOptions({
                            strings: e.target.checked
                              ? [...options.strings, string].sort()
                              : options.strings.filter((value) => value !== string),
                          })
                        }
                      />
                      S{string}
                    </label>
                  ))}
                </fieldset>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={options.omitFifth}
                    onChange={(e) => changeOptions({ omitFifth: e.target.checked })}
                  />
                  Allow an optional fifth to be omitted
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={options.rootless}
                    onChange={(e) => changeOptions({ rootless: e.target.checked })}
                  />
                  Rootless, using the confirmed chord context
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={options.allowOpenStrings}
                    onChange={(e) => changeOptions({ allowOpenStrings: e.target.checked })}
                  />
                  Allow open strings within the selected region
                </label>
                <label>
                  Melody voice
                  <select
                    aria-label="Melody voice"
                    value={melodyVoice}
                    onChange={(e) => {
                      setMelodyVoice(e.target.value);
                      changeOptions({ preserveMelody: Boolean(e.target.value) });
                    }}
                  >
                    <option value="">No melody constraint</option>
                    {monophonic.map((voice) => (
                      <option key={voice} value={voice}>
                        Staff {Number(voice.split(':')[0]) + 1}, voice{' '}
                        {Number(voice.split(':')[1]) + 1}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="caption">
                  Only ordinary monophonic voices are eligible. Its pitch and rhythm must remain on
                  top; constraints are never relaxed automatically. Maximum fretted span: four.
                </p>
              </details>
              {working && (
                <p role="status" className="exploration-copy">
                  Finding paths through the chords…
                </p>
              )}
              {result?.issues.map((issue, index) => (
                <p className="exploration-empty" role="status" key={index}>
                  {issue.reason}
                </p>
              ))}
              {variation && event && (
                <div className="variation-detail">
                  <div className="shape-navigation">
                    <button
                      className="round-button"
                      aria-label="Previous progression variation"
                      disabled={path === 0}
                      onClick={() => {
                        show(null);
                        setPath(path - 1);
                      }}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <div>
                      <strong>{event.voicing.chord.symbol}</strong>
                      <span>
                        {event.voicing.inversion} · variation {path + 1} of{' '}
                        {result!.variations.length}
                      </span>
                    </div>
                    <button
                      className="round-button"
                      aria-label="Next progression variation"
                      disabled={path + 1 >= result!.variations.length}
                      onClick={() => {
                        show(null);
                        setPath(path + 1);
                      }}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                  <Fretboard
                    tuning={track.tuningMidi}
                    capo={track.capo}
                    markers={markers}
                    minFret={options.minFret}
                    maxFret={options.maxFret}
                    showOctaves={showOctaves}
                    label={`${event.voicing.chord.symbol} progression voicing`}
                    onChoose={(position) =>
                      props.onAudition([
                        track.tuningMidi[position.string - 1]! + track.capo + position.fret,
                      ])
                    }
                  />
                  {nextChord && (
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={targetsVisible}
                        onChange={(e) => setTargetsVisible(e.target.checked)}
                      />
                      Next {nextChord.symbol}:{' '}
                      {nextTargets
                        .map((tone) => `${tone.noteName} (${DEGREE_LABELS[tone.degree]})`)
                        .join(', ')}
                      . Show targets.
                    </label>
                  )}
                  <div className="chord-role-key">
                    {event.voicing.notes.map((note) => (
                      <span key={note.position.string} className={`role-${role(note.degree)}`}>
                        <strong>{showOctaves ? note.label : note.noteName}</strong>
                        {DEGREE_LABELS[note.degree]}
                      </span>
                    ))}
                  </div>
                  <p className="caption">
                    Guitar bass: {formatPitch(event.voicing.bassMidi, showOctaves)}.{' '}
                    {event.voicing.omittedDegrees.length
                      ? `Omitted: ${event.voicing.omittedDegrees.map((degree) => DEGREE_LABELS[degree]).join(', ')}.`
                      : 'All chord tones present.'}{' '}
                    Other tracks retain their own bass notes.
                  </p>
                  <p className="caption">
                    Across this path: {variation.commonTones} retained common tones; maximum
                    hand-position jump {variation.maxFretJump.toFixed(1)} frets. Ranked by movement,
                    not measured comfort.
                  </p>
                  <div className="comparison-controls">
                    <button
                      className="secondary-button"
                      aria-pressed={!previewing}
                      onClick={() => show(null)}
                    >
                      Original score
                    </button>
                    <button
                      className="secondary-button"
                      aria-pressed={previewing}
                      onClick={() => show(variation)}
                    >
                      Preview variation
                    </button>
                    <button className="primary-button" onClick={() => void apply()}>
                      Apply & save
                    </button>
                    <button
                      className="text-button"
                      disabled={!applied}
                      onClick={() => {
                        const previous = previousApplied.current;
                        previousApplied.current = applied;
                        setApplied(previous);
                        if (previous) restore(previous, true);
                        else show(null);
                        setMessage('Restored the previous variation.');
                      }}
                    >
                      Undo
                    </button>
                  </div>
                  <p className="caption">
                    {previewing ? 'Variation' : 'Original'} in the player below. Use the shared
                    transport to compare at the same tempo and loop. This variation is an
                    accompaniment study. Inspect its notes in this diagram; score-note selection
                    resumes with Original.
                  </p>
                </div>
              )}
            </div>
            {props.compact ? (
              <Dialog.Root open={contextOpen} onOpenChange={setContextOpen}>
                <Dialog.Trigger asChild>
                  <button className="secondary-button context-sheet-trigger">
                    Key, modes and practice
                    <ArrowRight size={16} />
                  </button>
                </Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Overlay className="progression-sheet-overlay" />
                  <Dialog.Content className="progression-context progression-sheet">
                    <Dialog.Title className="sr-only">Key, modes and practice</Dialog.Title>
                    <Dialog.Description className="sr-only">
                      Explore the selected key or start a question about these chords.
                    </Dialog.Description>
                    <Dialog.Close asChild>
                      <button className="secondary-button">Back to the progression</button>
                    </Dialog.Close>
                    {contextPanel}
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            ) : (
              <aside className="progression-context">{contextPanel}</aside>
            )}
          </div>
          {span?.chord && span.confirmation === 'confirmed' && (
            <RecordedChoiceExplorer
              track={track}
              span={span}
              previous={sourceSpans[selectedIndex - 1]}
              options={options}
              onAudition={props.onAudition}
            />
          )}
          <ArrangementPrompt
            context={{
              contextVersion,
              context: {
                tuning: track.tuningMidi,
                capo: track.capo,
                key: context,
                selectedSpan: selectedIndex,
                spans: sourceSpans.map((item) => ({
                  symbol: item.chord?.symbol ?? null,
                  confirmed: item.confirmation === 'confirmed',
                  startTick: item.startTick,
                  endTick: item.endTick,
                  melody: (item.melodyAnchors ?? []).map(({ startTick, endTick, midi }) => ({
                    startTick,
                    endTick,
                    midi,
                  })),
                })),
              },
              constraints: options,
            }}
            onPreview={(response, request) => {
              const execution = executeArrangementIntent(request, response.intent);
              const index =
                execution.result?.variations.findIndex(
                  (item) => item.id === response.candidateId,
                ) ?? -1;
              if (index < 0) return;
              preferredPath.current = index;
              setOptions(response.intent.constraints);
              setTargets(
                Object.fromEntries(
                  execution.spans.map((item, index) => [
                    sourceSpans[index]!.id,
                    item.chord!.symbol,
                  ]),
                ),
              );
              setMessage(
                'Validated proposal loaded into the controls. Preview it, then apply when ready.',
              );
            }}
          />
        </>
      )}
      {message && (
        <p className="exploration-empty" role="status">
          {message}
        </p>
      )}
      <RecordedArrangement onAudition={props.onAudition} />
      {saved.length > 0 && (
        <details className="saved-variations">
          <summary>Saved variations ({saved.length})</summary>
          <button className="secondary-button" onClick={() => exportVariations(saved)}>
            Export variations
          </button>
          {saved.map((item) => (
            <button className="saved-variation" key={item.id} onClick={() => restore(item)}>
              Bars {item.firstBar + 1}–{item.lastBar + 1} · frets {item.options.minFret}–
              {item.options.maxFret} · {new Date(item.savedAt).toLocaleString()}
            </button>
          ))}
        </details>
      )}
    </section>
  );
}
