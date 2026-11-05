import { ArrowUpRight, FlaskConical } from 'lucide-react';
import { ControlledStudy } from './ControlledStudy';
const project = 'https://forge.coreweave.com/wandb/wandb/tab-to-pitch-public-data-research';
const lens = 'https://forge.coreweave.com/agent-lens/wandb/tab-to-pitch-public-data-research';
const studies = [
  {
    id: 'connected-homework',
    title: 'Does the teacher stay with the task you are playing?',
    status: 'Development demo · unqualified',
    metric: '1 / 3',
    measure: 'Reviewed hosted replies in the final walkthrough · two local fallbacks',
    context:
      'A scripted original-song session: inspect a note, connect CAGED shapes, play two regions, investigate F→E, encounter uncertain input and save a return point. All three requests reached the real teacher endpoint.',
    limit:
      'An earlier critic-approved reply contained two wrong fret coordinates. That error is retained. These development examples are not held-out qualification or learner evidence; a local fallback is not an actor success.',
    links: [
      ['Walkthrough and interaction references', '/research/notebook/connected-homework.md'],
      ['Lens · three actual turns', `${lens}/conversations/ff9b2e5e-f499-4b84-ad00-2d419ccb4cb1`],
      ['Weave · recorded outcomes', `${project}/weave/calls/01a1ad69-9d3e-7ca2-86ed-fd86f566bb90`],
      [
        'Tables · retained failures',
        `${project}/runs/connected-homework-development-v1-comparison`,
      ],
    ],
  },
  {
    id: 'voicing',
    title: 'Can a model recover a recorded voicing?',
    status: 'Research candidate',
    metric: '0.690 vs 0.398',
    measure: 'Recording-macro reciprocal rank · learned vs minimum movement',
    context:
      'GuitarSet: 4,317 transitions from 168 recordings. Eighteen folds hold out both a performer and a progression family. The previous shape and next pitch-class multiset are supplied.',
    limit:
      'Agreement with recorded choices—not comfort, teaching value, or autonomous arrangement quality. Deterministic ranking remains the default; model weights are not bundled.',
    links: [
      ['Models · held-out fits', `${project}/runs/voicing-ranking-v1`],
      ['Downloaded-artifact replay', `${project}/runs/voicing-artifact-replay-v1`],
      [
        'Registry · research only',
        'https://forge.coreweave.com/registry/TabToPitch%20Research?selectionPath=wandb32%2Fwandb-registry-TabToPitch+Research%2FObserved+voicing+ranker&view=versions',
      ],
    ],
  },
  {
    id: 'arrangement',
    title: 'Can the agent follow an arrangement request?',
    status: 'Release gate missed',
    metric: '46 / 64',
    measure: 'Request-correct model responses · deterministic parser: 24 / 32',
    context:
      'Thirty-two authored requests in eight musical contexts, repeated in two 20B trials. Fresh confirmation is separate from the older regression cohort.',
    limit:
      '71.9% misses the 90% cloud-release gate. An output can contain valid notes while still misunderstanding the request.',
    links: [
      ['Weave · trial 1', `${project}/weave/calls/01a18de3-269c-7b54-81d1-c34a3ab02697`],
      ['Lens · retained failure', `${lens}/conversations/01a18ddf-3fbe-7831-b854-19fe8500aba0`],
    ],
  },
  {
    id: 'listening',
    title: 'Can the teacher use the listening workspace?',
    status: 'Experimental · unqualified',
    metric: '45 / 96',
    measure: 'Hosted replies on ordinary checkpoints · 51 local fallbacks',
    context:
      'Forty-eight authored checkpoints across twelve held-out harmony contexts, with two trials. Adaptive episodes and boundary cases are reported separately. These are scripted learners.',
    limit:
      'The independent reviewer scored 52/60 factual fixtures correctly but detected only 40% of critical unsupported claims. It failed qualification. An unsupported “you just heard” claim survived runtime review; conversation quality remains unqualified.',
    links: [
      ['Tables · every case', `${project}/runs/listening-agent-003-comparison`],
      ['Weave · recorded outcomes', `${project}/weave/calls/01a1a8f7-bd86-7f38-ab90-0728c6688a11`],
      ['Lens · accepted error', `${lens}/conversations/93c8126f-a7b8-4e0e-9c87-996260dd936a`],
    ],
  },
  {
    id: 'ear-lab',
    title: 'Can confidence flag a misleading transcription?',
    status: 'Candidate not promoted',
    metric: '0.207 vs 0.165',
    measure: 'Recording-macro Brier score · learned vs fixed rules · lower is better',
    context:
      'Ear Lab’s small held-out reliability check: 185 independently labeled notes in four recordings. It estimates transcription reliability, not learner knowledge.',
    limit:
      'The learned estimator is worse on this calibration measure. Neither Ear Lab teacher model qualified. Correlated model agreement cannot create a grading key.',
    links: [['Local experiment report', '/research/notebook/ear-lab-results.md']],
  },
];
export function ForgeEvidence() {
  return (
    <section id="forge-evidence" className="forge-evidence" aria-label="Forge experiment evidence">
      <div className="lab-heading">
        <FlaskConical size={22} />
        <div>
          <span className="studio-kicker">THE LAB / REAL RUNS, RETAINED FAILURES</span>
          <h2>What the experiments actually showed</h2>
        </div>
      </div>
      <p>
        The game is the practice surface. Forge records how the models behave behind it. A good game
        score, a valid tool call, and better learning are different outcomes.
      </p>
      <ControlledStudy />
      <div className="evidence-studies">
        {studies.map((s) => (
          <article key={s.id}>
            <span className={`evidence-status evidence-${s.id}`}>{s.status}</span>
            <h3>{s.title}</h3>
            <strong className="evidence-metric">{s.metric}</strong>
            <span className="evidence-measure">{s.measure}</span>
            <p>{s.context}</p>
            <p className="evidence-limit">{s.limit}</p>
            <div className="evidence-links">
              {s.links.map(([label, url]) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  {label}
                  <ArrowUpRight size={13} />
                </a>
              ))}
            </div>
          </article>
        ))}
      </div>
      <details className="evidence-walkthrough">
        <summary>Watch the connected homework session</summary>
        <p>
          Original study, scripted learner, synthetic input. This silent walkthrough uses the
          on-device guide. The separate Forge recording retains its waiting time and failed replies.
        </p>
        <video
          controls
          preload="none"
          poster="/demos/connected-homework/poster.png"
          aria-label="Original homework walkthrough with the on-device guide"
        >
          <source src="/demos/connected-homework/local-guide.mp4" type="video/mp4" />
          <a href="/demos/connected-homework/local-guide.mp4">Open the local-guide video</a>
        </video>
        <p>
          Find a note → compare a CAGED fragment → play two progression regions → hear F→E → inspect
          an unassessed input → save and resume.
        </p>
        <a href="/demos/connected-homework/forge-walkthrough.mp4" target="_blank" rel="noreferrer">
          Watch the full real Forge run, including two fallbacks ↗
        </a>
      </details>
      <div className="evidence-footnote">
        <strong>What hasn’t run</strong>
        <p>
          The practice-stage, guitar-homework and CAGED behavior suites include local checks. They
          do not add a qualified cloud-teacher result. Hardware audio qualification and human
          learning studies remain outstanding.
        </p>
        <a href="/research/notebook/evidence-audit.md" target="_blank" rel="noreferrer">
          Read the dated evidence audit, accounting and verification scope ↗
        </a>
        <p>
          Dashboards are private and require project access. No learner recording or private score
          was uploaded for this work. The connected-homework demonstration used eight new
          actor/critic calls across three development runs; its report reconciles the shared budget.
        </p>
      </div>
    </section>
  );
}
