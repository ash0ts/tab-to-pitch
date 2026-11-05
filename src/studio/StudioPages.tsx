import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  Guitar,
  Home,
  Library,
  Music2,
  Play,
  Plus,
  Settings2,
  TrendingUp,
} from 'lucide-react';
import { ACTIVITIES, activity, REFERENCES, type ActivityId } from './catalog';
import type { StudioController, Destination } from './useStudio';
import type { AttemptRecord } from '../engine/types';
import { reviewDueAt } from '../engine/scheduler';
import { getLessonData, getMemoryLessonData } from '../storage';
import type { LessonData } from '../lesson-storage';
import { Modal } from '../ui/Modal';
import { ForgeEvidence } from './ForgeEvidence';
const NAV: { page: Destination; label: string; icon: typeof Home }[] = [
  { page: 'studio', label: 'Studio', icon: Home },
  { page: 'library', label: 'Songs & exercises', icon: Library },
  { page: 'progress', label: 'Progress', icon: TrendingUp },
  { page: 'research', label: 'How this teaches', icon: BookOpen },
];
export function StudioHeader({
  studio,
  onSettings,
  onImport,
}: {
  studio: StudioController;
  onSettings: () => void;
  onImport: () => void;
}) {
  return (
    <header className="studio-nav">
      <a className="studio-wordmark" href="#/studio">
        <span className="studio-logo">
          <Music2 size={23} />
        </span>
        Tab<span>to</span>Pitch<small>YOUR PRACTICE STUDIO</small>
      </a>
      <nav aria-label="Main navigation">
        {NAV.map(({ page, label, icon: Icon }) => (
          <a
            key={page}
            href={`#/${page}`}
            aria-current={studio.route.page === page ? 'page' : undefined}
          >
            <Icon size={16} />
            <span>{label}</span>
          </a>
        ))}
      </nav>
      <div className="studio-nav-tools">
        <button className="text-button" aria-label="Import tab" onClick={onImport}>
          <Plus size={17} />
          <span>Import tab</span>
        </button>
        <button className="icon-button" aria-label="Settings and progress" onClick={onSettings}>
          <Settings2 size={18} />
        </button>
      </div>
    </header>
  );
}
export function StudioHome({
  studio,
  onStart,
  source,
  ready,
  attempts,
}: {
  studio: StudioController;
  attempts: AttemptRecord[];
  onStart: (id: ActivityId) => void;
  source: string;
  ready: boolean;
}) {
  const due = [...new Set(attempts.map((a) => a.exerciseId))].filter((id) => {
    const at = reviewDueAt(id, attempts);
    return at !== null && at <= Date.now();
  }).length;
  const resume = studio.set.bookmark;
  const [selected, setSelected] = useState<ActivityId | null>(null);
  const [preferences, setPreferences] = useState(false);
  const choices = [...new Set([...(resume ? [resume.activity] : []), ...studio.set.activities])];
  const current = activity(selected && choices.includes(selected) ? selected : choices[0]!);
  const continuing = resume?.activity === current.id;
  const instructions: Partial<Record<ActivityId, string>> = {
    homework:
      'Pick up your guitar. Find a note, connect a shape, then use it in a chord change. We’ll keep one thing on screen at a time.',
    progression:
      'Keep the harmony. Change where you play it. Start with one chord, then hear the whole progression in its new position.',
    listening:
      'Listen first. Make a guess, then investigate the change you’re unsure about. Replaying is always welcome.',
    knowledge:
      'Try a short recall question. Ask for a cue whenever you need one; your first answer stays in the record.',
  };
  return (
    <main className="studio-home game-lobby">
      <img className="livehouse-scene" src="/art/live-house.png" alt="" />
      <div className="livehouse-vignette" />
      <div className="room-title">
        <span className="studio-kicker">TABTOPITCH / REHEARSAL ROOM</span>
        <h1>Sound check.</h1>
        <p>Your guitar. One good change.</p>
      </div>
      <section className="game-setlist" aria-label="Your next practice session">
        <header className="setlist-heading">
          <div>
            <span className="studio-kicker">TONIGHT’S SETLIST</span>
            <h2>What are we playing?</h2>
          </div>
          <span className="setlist-count">
            {String(choices.length).padStart(2, '0')}
            <small>IDEAS</small>
          </span>
        </header>
        <div className="setlist-choices" aria-label="Choose a practice activity">
          {choices.map((id, i) => {
            const a = activity(id);
            return (
              <button key={id} aria-pressed={id === current.id} onClick={() => setSelected(id)}>
                <span className="setlist-cursor" aria-hidden="true">
                  {id === current.id ? '▶' : String(i + 1).padStart(2, '0')}
                </span>
                <span>
                  <strong>{a.title}</strong>
                  <small>{a.category}</small>
                </span>
                {resume?.activity === id && <span className="saved-slot">SAVED</span>}
              </button>
            );
          })}
        </div>
        <div className="selected-mission">
          <div className="mission-label">{continuing ? 'CONTINUE FROM HERE' : 'THE IDEA'}</div>
          <p className="mission-goal">{continuing ? resume.next : current.objective}</p>
          <div className="session-size">
            <span>How much time?</span>
            <div className="workload" aria-label="Suggested practice workload">
              {([5, 15, 30] as const).map((n) => (
                <button
                  key={n}
                  aria-pressed={studio.set.workload === n}
                  onClick={() => studio.change({ workload: n })}
                >
                  {n} min
                </button>
              ))}
            </div>
          </div>
          <button className="studio-cta" disabled={!ready} onClick={() => onStart(current.id)}>
            <Play size={18} fill="currentColor" />
            {continuing ? 'Continue practicing' : 'Start practicing'}
            <ArrowRight size={20} />
          </button>
          <div className="setlist-footer">
            <span>No countdown. Repeat as much as you like.</span>
            <a href={`#/research/${current.id}`}>Why this?</a>
          </div>
        </div>
        <button className="setlist-library" onClick={() => studio.go('library')}>
          <Plus size={16} /> All exercises / edit your set <ChevronRight size={17} />
        </button>
      </section>
      <section
        className={`room-companion ${studio.set.bandmate ? '' : 'without-character'}`}
        aria-label="Practice introduction"
      >
        {studio.set.bandmate && (
          <img className="bandmate-sprite" src="/art/pixel-guide.png" alt="" />
        )}
        <div className="game-dialogue">
          <span className="dialogue-name">
            {studio.set.bandmate ? 'YOUR BANDMATE' : 'YOUR PRACTICE'}
            <small>{studio.set.bandmate ? 'AI teacher · optional' : 'At your pace'}</small>
          </span>
          <p>{instructions[current.id] ?? current.objective}</p>
          <div className="dialogue-route">
            <span>01 Hear / find</span>
            <i>→</i>
            <span>02 Pick up / play</span>
            <i>→</i>
            <span>03 Save a next step</span>
          </div>
        </div>
      </section>
      <footer className="room-console">
        <div className="loaded-passage">
          <span className="pixel-signal" />
          <span>
            <small>ON THE MUSIC STAND</small>
            {source}
          </span>
        </div>
        {due > 0 && (
          <button onClick={() => onStart('knowledge')}>
            {due} due review{due === 1 ? '' : 's'}
          </button>
        )}
        <button onClick={() => onStart('live')} disabled={!ready}>
          <Guitar size={17} />
          Connect guitar <small>optional</small>
        </button>
        <a href="#/research">
          <BookOpen size={17} />
          Teaching & Forge lab
        </a>
        <button aria-label="Room settings & weekly intention" onClick={() => setPreferences(true)}>
          <Settings2 size={17} />
          <span>Room settings</span>
        </button>
      </footer>
      <Modal
        open={preferences}
        onOpenChange={setPreferences}
        title="Your room"
        description="Choose how you want to practice. Nothing is locked behind a streak."
      >
        <div className="room-options">
          <label>
            <input
              type="checkbox"
              checked={studio.set.bandmate}
              onChange={(e) => studio.change({ bandmate: e.target.checked })}
            />
            Show the optional AI bandmate
          </label>
          <label>
            <input
              type="checkbox"
              checked={studio.set.staticStage}
              onChange={(e) => studio.change({ staticStage: e.target.checked })}
            />
            Use a static stage
          </label>
          <label>
            My weekly intention (optional)
            <input
              className="field-input"
              maxLength={300}
              value={studio.set.weeklyIntention}
              onChange={(e) => studio.change({ weeklyIntention: e.target.value })}
              placeholder="Play the C to F change without stopping"
            />
          </label>
        </div>
      </Modal>
    </main>
  );
}

export function ActivityLibrary({
  studio,
  onStart,
  children,
  onFiles,
}: {
  studio: StudioController;
  onStart: (id: ActivityId) => void;
  children: ReactNode;
  onFiles: () => void;
}) {
  const [filter, setFilter] = useState('');
  return (
    <main className="studio-page">
      <div className="page-intro">
        <span className="studio-kicker">THE WHOLE ROOM IS OPEN</span>
        <h1>Songs & exercises</h1>
        <p>Choose one musical idea. Every activity is available without unlocks.</p>
      </div>
      <div className="library-actions">
        <input
          className="field-input"
          aria-label="Find an exercise"
          placeholder="Find an exercise, skill or input…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button className="secondary-button" onClick={onFiles}>
          My imported scores & studies
        </button>
      </div>
      <div className="activity-grid">
        {ACTIVITIES.filter((a) =>
          `${a.title} ${a.category} ${a.objective} ${a.inputs.join(' ')}`
            .toLowerCase()
            .includes(filter.toLowerCase()),
        ).map((a) => (
          <article className="activity-card" key={a.id}>
            <span className="card-category">{a.category}</span>
            <h2>{a.title}</h2>
            <p>{a.objective}</p>
            <small>{a.inputs.join(' · ')}</small>
            <div>
              <button
                className="primary-button"
                disabled={!a.available}
                onClick={() => onStart(a.id)}
              >
                {a.available ? 'Open activity' : 'Awaiting integration'}
                <ArrowRight size={15} />
              </button>
              <button
                className="text-button"
                disabled={
                  !a.available ||
                  (studio.set.activities.includes(a.id)
                    ? studio.set.activities.every((id) => id === a.id)
                    : studio.set.activities.length >= 12)
                }
                onClick={() =>
                  studio.change({
                    activities: studio.set.activities.includes(a.id)
                      ? studio.set.activities.filter((id) => id !== a.id)
                      : [...studio.set.activities, a.id],
                  })
                }
              >
                {studio.set.activities.includes(a.id) ? 'Remove from set' : 'Add to set'}
              </button>
            </div>
            <a href={`#/research/${a.id}`}>Why this exercise?</a>
          </article>
        ))}
      </div>
      <section className="song-catalog">
        <h2>Learn from your songs</h2>
        <p>
          Choose a verified passage or match a song list. Recording availability and annotation
          status are shown before you start.
        </p>
        {children}
      </section>
    </main>
  );
}
export function ResearchPage({
  studio,
  onStart,
}: {
  studio: StudioController;
  onStart: (id: ActivityId) => void;
}) {
  const a = activity(studio.route.activity);
  return (
    <main className="studio-page research-page">
      <div className="page-intro">
        <span className="studio-kicker">THE IDEAS BEHIND THE EXERCISES</span>
        <h1>How this teaches</h1>
        <p>What we ask you to do, what your response can show, and what we still need to learn.</p>
      </div>
      <nav className="research-index" aria-label="Teaching library">
        <a
          href="#forge-evidence"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById('forge-evidence')?.scrollIntoView({ behavior: 'instant' });
          }}
        >
          Forge experiments
        </a>
        <a
          href="#exercise-guide"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById('exercise-guide')?.scrollIntoView({ behavior: 'instant' });
          }}
        >
          Exercise guide
        </a>
        <a
          href="#learning-approach"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById('learning-approach')?.scrollIntoView({ behavior: 'instant' });
          }}
        >
          Learning approach
        </a>
        <a
          href="#research-notebook"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById('research-notebook')?.scrollIntoView({ behavior: 'instant' });
          }}
        >
          Research notebook
        </a>
      </nav>
      <section id="exercise-guide" className="exercise-guide">
        <div>
          <span className="studio-kicker">WHY THIS EXERCISE?</span>
          <h2>{a.title}</h2>
          <label>
            Choose an activity
            <select
              value={a.id}
              onChange={(e) => studio.go('research', e.target.value as ActivityId)}
            >
              {ACTIVITIES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title}
                </option>
              ))}
            </select>
          </label>
          <button className="primary-button" disabled={!a.available} onClick={() => onStart(a.id)}>
            Try this activity <ArrowRight size={15} />
          </button>
        </div>
        <dl>
          <dt>The musical ability</dt>
          <dd>{a.objective}</dd>
          <dt>What your response demonstrates</dt>
          <dd>{a.demonstrates}</dd>
          <dt>What it does not establish</dt>
          <dd>{a.unmeasured}</dd>
          <dt>Available support</dt>
          <dd>{a.support}</dd>
          <dt>A useful next application</dt>
          <dd>
            <a href={`#/stage/${a.next}`}>{activity(a.next).title}</a>
          </dd>
        </dl>
      </section>
      <ForgeEvidence />
      <section id="learning-approach">
        <h2>Learning approach</h2>
        <p>
          Listen, predict, inspect, try again, or make something. You choose the order. Retrieval
          and delayed reviews help us observe independent recall; the current 1/3/7-day schedule is
          a product default to evaluate.
        </p>
        <div className="reference-grid">
          {REFERENCES.map((r) => (
            <article
              key={r.id}
              className={a.references.includes(r.id) ? 'reference relevant' : 'reference'}
            >
              <span className="card-category">
                {r.design} · {r.date}
              </span>
              <h3>
                <a href={r.url} target="_blank" rel="noreferrer">
                  {r.title} ↗
                </a>
              </h3>
              <p>
                <strong>{r.authors}</strong> · {r.population}
              </p>
              <p>{r.finding}</p>
              <p>
                <strong>In this app:</strong> {r.consequence}
              </p>
              <p className="reference-limit">
                <strong>Limit:</strong> {r.limit}
              </p>
            </article>
          ))}
        </div>
      </section>
      <section id="research-notebook" className="research-notebook">
        <span className="studio-kicker">ENGINEERING EVIDENCE ≠ LEARNING OUTCOMES</span>
        <h2>Research notebook</h2>
        <p>
          Our experiments test musical validity, agent behavior and agreement with recorded
          voicings. They do not establish better hearing, playing or retention.
        </p>
        <div className="notebook-links">
          {[
            ['Arrangement agent', 'arrangement-results.md'],
            ['Music teacher', 'teacher-results.md'],
            ['Listening teacher', 'listening-results.md'],
            ['Ear Lab', 'ear-lab-results.md'],
            ['Voicing ranking', 'voicing-results.md'],
            ['Practice stage protocol', 'practice-stage.md'],
          ].map(([name, file]) => (
            <a key={file} href={`/research/notebook/${file}`} target="_blank" rel="noreferrer">
              <BookOpen size={18} />
              <span>
                {name}
                <small>Protocol, measured scope & retained limitations</small>
              </span>
              <ChevronRight size={18} />
            </a>
          ))}
        </div>
        <details>
          <summary>Forge, Agent Lens, Weave, Models & Registry</summary>
          <p>
            These services retain the private research evidence. Access remains controlled by the
            project. No user score, recording or learning history is added to a public example.
          </p>
          <a href="/research/notebook/dashboard-tour.md" target="_blank" rel="noreferrer">
            Open the recorded dashboard tour and access notes ↗
          </a>
          <p>
            Historical receipts describe those campaigns. This presentation change has not made paid
            model calls or requalified a teacher or detector.
          </p>
        </details>
      </section>
      <section className="research-note">
        <h2>Designed for independent practice</h2>
        <p>
          Supportive feedback can make the next attempt easier. Independent recall after a delay and
          application in a new context tell us something different. Human usability and learner
          studies are not yet complete.
        </p>
        <p>
          Motion can be disabled. Meaningful graphical controls use text and contrast alongside
          color.{' '}
          <a
            href="https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html"
            target="_blank"
            rel="noreferrer"
          >
            W3C graphical contrast
          </a>{' '}
          ·{' '}
          <a
            href="https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html"
            target="_blank"
            rel="noreferrer"
          >
            User-controlled motion
          </a>
        </p>
      </section>
    </main>
  );
}
export function ProgressPage({
  studio,
  attempts,
}: {
  studio: StudioController;
  attempts: AttemptRecord[];
}) {
  const [data, setData] = useState<LessonData | null>(null);
  useEffect(() => {
    let active = true;
    getLessonData()
      .then((d) => {
        if (active) setData(d);
      })
      .catch(() => {
        if (active) setData(getMemoryLessonData());
      });
    return () => {
      active = false;
    };
  }, []);
  const groups = [
    ['note-name', 'Note names'],
    ['note-location', 'Locations'],
    ['interval', 'Intervals'],
    ['chord-tone', 'Chord roles'],
    ['voice-connection', 'Chord connections'],
  ] as const;
  const days = Array.from({ length: 28 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 27 + i);
    return d;
  });
  return (
    <main className="studio-page">
      <div className="page-intro">
        <span className="studio-kicker">EVIDENCE, NOT A MASTERY METER</span>
        <h1>Your practice, so far.</h1>
        <p>
          Each response says something specific. Naming, hearing, finding and playing stay separate.
        </p>
      </div>
      <div className="progress-grid">
        {groups.map(([kind, label]) => {
          const all = attempts.filter((a) => a.kind === kind && a.evidence === 'answer');
          const first = all.filter(
            (a) =>
              !a.assisted &&
              (a.responseIndex ?? 0) === 0 &&
              ['correct', 'incorrect'].includes(a.outcome),
          );
          return (
            <article key={kind}>
              <h2>{label}</h2>
              <strong>
                {first.filter((a) => a.outcome === 'correct').length}
                <span> / {first.length}</span>
              </strong>
              <p>correct first responses without hints</p>
              <small>
                {first.length
                  ? `Last response ${new Date(first.at(-1)!.answeredAt).toLocaleDateString()}`
                  : 'No unassisted evidence yet'}
              </small>
              <p>
                {all.filter((a) => a.assisted).length} assisted ·{' '}
                {all.filter((a) => a.outcome === 'revealed').length} revealed ·{' '}
                {all.filter((a) => a.outcome === 'interrupted').length} interrupted
              </p>
            </article>
          );
        })}
      </div>
      <section className="progress-context">
        <h2>Guitar homework</h2>
        <p>
          {data?.lessonEvents.filter((e) => e.playing?.kind === 'self-report').length ?? 0}{' '}
          self-reported passes. These describe how playing felt; they are not verified correctness.
        </p>
        <p>
          {data?.lessonEvents.filter((e) => e.live?.attempt?.outcome === 'match').length ?? 0}{' '}
          supported sound matches ·{' '}
          {data?.lessonEvents.filter((e) => e.live?.attempt?.outcome === 'discrepancy').length ?? 0}{' '}
          supported discrepancies ·{' '}
          {data?.lessonEvents.filter((e) => e.live?.attempt?.outcome === 'unassessed').length ?? 0}{' '}
          unassessed. Input is experimental. No string, fret, technique or precise timing was
          verified.
        </p>
        <button className="secondary-button" onClick={() => studio.go('stage', 'homework')}>
          Return to guitar homework
        </button>
      </section>
      <section className="progress-context">
        <h2>Other evidence stays with its activity</h2>
        <p>
          Listening: {data?.listeningAttempts.length ?? '—'} recorded responses. Homework,
          construction and detected audio retain their own task-level evidence; open the activity to
          inspect it.
        </p>
        <p>
          Playing: {attempts.filter((a) => a.evidence === 'self-report').length} self-reports in the
          note exercises. These do not establish a verified performance.
        </p>
        <button className="secondary-button" onClick={() => studio.go('library')}>
          Open the activity library
        </button>
      </section>
      <section className="practice-history">
        <h2>Time in the studio</h2>
        <p>Last four weeks. Visits are participation, not proof of learning.</p>
        <div className="history-calendar">
          {days.map((d) => {
            const visits = studio.set.visits.filter(
              (v) => new Date(v.at).toDateString() === d.toDateString(),
            );
            return (
              <div
                key={d.toDateString()}
                className={visits.length ? 'visited' : ''}
                title={`${d.toLocaleDateString()}: ${visits.length} practice events`}
              >
                <span>{d.getDate()}</span>
                <small>{visits.length ? 'Practiced' : '—'}</small>
              </div>
            );
          })}
        </div>
        {studio.set.weeklyIntention && <p>My intention: {studio.set.weeklyIntention}</p>}
        {studio.set.reflection && <blockquote>{studio.set.reflection}</blockquote>}
      </section>
    </main>
  );
}
