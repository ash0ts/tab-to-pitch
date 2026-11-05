import results from './guitar-teacher-results.json';

/** Measured data generated only after Lens, Weave and Table readback. */
export function ControlledStudy() {
  const current = results.arms.current;
  const revised = results.arms['evidence-first'];
  return (
    <article className="controlled-study">
      <span className="studio-kicker">NEW / FROZEN COMPARISON / 36 GUITARSET RECORDINGS</span>
      <h3>Can the teacher give you a musical example to play?</h3>
      <p>
        We asked it to show a chord tone or move a three-chord passage. Two trials per request, the
        same model and tools, and independent checks of every returned position and voicing. These
        use recorded-guitar annotations and authored learner requests.
      </p>
      <div className="controlled-study-table">
        <table>
          <caption>Accepted demonstrations, including failed turns in the denominator</caption>
          <thead>
            <tr>
              <th>Policy</th>
              <th>Chord role</th>
              <th>Progression</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ['Current teacher', current],
                ['Evidence-first prompt', revised],
              ] as const
            ).map(([name, arm]) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                <td>
                  {arm.taskSlices.role.delivered}/{arm.taskSlices.role.n}
                </td>
                <td>
                  {arm.taskSlices.move.delivered}/{arm.taskSlices.move.n}
                </td>
                <td>
                  {arm.primarySuccesses}/{arm.executed}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        The engine control generated {results.engine.successes}/{results.engine.n} valid examples.
        The teacher often lost them during formatting, validation or review. The prompt variant
        improved delivery, but remains unqualified. The local policy also added unwanted quizzes;
        changing “not a quiz” to “no quiz” exposed a brittle language rule.
      </p>
      <div className="evidence-links">
        <a
          className="controlled-study-primary"
          href="/research/guitar-teacher/index.html"
          target="_blank"
          rel="noreferrer"
        >
          Inspect all 72 requests, trials and returned notes ↗
        </a>
        <a href={results.tableUrl} target="_blank" rel="noreferrer">
          W&B comparison Table ↗
        </a>
        <a href={results.weaveUrl} target="_blank" rel="noreferrer">
          Weave replay ↗
        </a>
        <a href={results.lensUrl} target="_blank" rel="noreferrer">
          An actual failed Lens turn ↗
        </a>
      </div>
      <p className="evidence-limit">
        {results.calls} evaluation inference requests, including retained failures. The separate
        reviewer diagnostic passed {results.critic.correct}/{results.critic.executed} fixtures; it
        does not replace the broader failed qualification. No audio-perception, playing-quality or
        learning-effectiveness result is claimed.
      </p>
    </article>
  );
}
