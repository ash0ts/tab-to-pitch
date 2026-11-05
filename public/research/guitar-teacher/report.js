const $ = (id) => document.getElementById(id),
  pct = (n) => (n * 100).toFixed(1) + '%',
  seconds = (n) => (n / 1000).toFixed(1) + 's';
const el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
const link = (text, url) => {
  const n = el('a', text);
  n.href = url;
  n.target = '_blank';
  n.rel = 'noreferrer';
  return n;
};
try {
  const response = await fetch('./results.json');
  if (!response.ok) throw new Error('Results unavailable');
  const d = await response.json(),
    a = d.analysis,
    names = {
      local: 'Local policy',
      current: 'Current teacher',
      'evidence-first': 'Evidence-first',
    };
  const current = a.arms.current,
    revised = a.arms['evidence-first'];
  $('headline').textContent =
    `The revised prompt delivered ${revised.primarySuccesses}/${revised.executed} accepted demonstrations (${pct(revised.recordingMacroPrimary)}); the current teacher delivered ${current.primarySuccesses}/${current.executed} (${pct(current.recordingMacroPrimary)}). Fallbacks and failed turns remain in the denominator.`;
  for (const arm of ['current', 'evidence-first', 'local']) {
    const r = a.arms[arm],
      barline = el('div', undefined, 'barline'),
      track = el('div', undefined, 'track'),
      bar = el('div', undefined, 'bar ' + arm);
    bar.style.width = pct(r.recordingMacroPrimary);
    track.append(bar);
    barline.append(
      el('span', names[arm]),
      track,
      el('strong', `${r.primarySuccesses}/${r.executed}`),
    );
    $('chart').append(barline);
    const tr = el('tr');
    [
      names[arm],
      `${r.taskSlices.role.delivered}/${r.taskSlices.role.n}`,
      `${r.taskSlices.move.delivered}/${r.taskSlices.move.n}`,
      `${r.primarySuccesses}/${r.executed}`,
      `${r.productDeliveryIncludingFallback}/${r.executed}`,
      `${seconds(r.latencyMedianMs)} / ${seconds(r.latencyP95Ms)}`,
    ].forEach((v) => tr.append(el('td', v)));
    $('outcomes').append(tr);
  }
  const points = (n) => (100 * n).toFixed(1);
  $('paired').textContent =
    `Paired difference: ${points(a.paired.difference)} percentage points; recording-bootstrap 95% interval ${points(a.paired.recordingBootstrap95[0])} to ${points(a.paired.recordingBootstrap95[1])}. ${a.paired.recordings} recording groups; two hosted trials for each of two task types.`;
  $('ceiling').textContent =
    `Engine control: ${a.engineCeiling.successes}/${a.engineCeiling.n} requested artifacts passed independent checks when the deterministic tool was invoked directly. This control does not interpret learner language.`;
  $('tool-use').textContent =
    `Observed tools: current ${JSON.stringify(d.toolUse.current)}; revised ${JSON.stringify(d.toolUse['evidence-first'])}. The revised agent rarely followed the requested inspection sequence; the comparison does not isolate evidence inspection as the cause.`;
  const key = (r) => (r.scores.actorDelivered ? 1 : 0);
  function eligible(c) {
    if ($('task-filter').value !== 'all' && c.kind !== $('task-filter').value) return false;
    const x = c.rows.filter((r) => r.arm === 'current').reduce((n, r) => n + key(r), 0),
      y = c.rows.filter((r) => r.arm === 'evidence-first').reduce((n, r) => n + key(r), 0);
    return (
      $('outcome-filter').value === 'all' ||
      ($('outcome-filter').value === 'improved' && y > x) ||
      ($('outcome-filter').value === 'worse' && x > y) ||
      ($('outcome-filter').value === 'neither' && !x && !y)
    );
  }
  function renderCase() {
    const c = d.cases.find((c) => c.id === $('case-select').value);
    $('context').replaceChildren();
    $('responses').replaceChildren();
    if (!c) {
      $('context').textContent = 'No cases match these filters. Choose another outcome.';
      return;
    }
    const p = c.passage;
    const url = new URL(location.href);
    url.searchParams.set('case', c.id);
    history.replaceState(null, '', url);
    $('context').append(
      el('div', p.recording, 'eyebrow'),
      el('p', p.spans.map((s) => s.symbol).join(' → '), 'chords'),
      el('p', c.request),
      el(
        'p',
        `Source window: ${p.spans[0].time.toFixed(2)}–${(p.spans.at(-1).time + p.spans.at(-1).duration).toFixed(2)} seconds. Selected span ${p.selected + 1}. Stable note: ${p.tone.name}, ${p.tone.degree} in ${p.spans[p.selected].symbol}; annotated MIDI ${p.note.midi}, source string ${p.note.position.string}, inferred fret ${p.note.position.fret}.`,
        'muted',
      ),
    );
    const provenance = el('details'),
      sum = el('summary', 'Annotation provenance');
    provenance.append(
      sum,
      el(
        'pre',
        JSON.stringify(
          {
            sourceSha256: p.sourceSha256,
            noteAnnotation: p.note.annotation,
            noteObservation: p.note.observation,
            spans: p.spans.map((s) => ({
              annotation: s.annotation,
              observation: s.observation,
              label: s.label,
              time: s.time,
              duration: s.duration,
            })),
          },
          null,
          2,
        ),
      ),
    );
    $('context').append(provenance);
    for (const arm of ['current', 'evidence-first', 'local'])
      for (const r of c.rows.filter((r) => r.arm === arm).sort((a, b) => a.trial - b.trial)) {
        const card = el('article', undefined, 'response'),
          ok = arm === 'local' ? r.scores.requestedActionDelivered : r.scores.actorDelivered;
        card.append(
          el('h3', names[arm] + (arm === 'local' ? '' : ` · trial ${r.trial + 1}`)),
          el(
            'span',
            ok
              ? 'Requested artifact delivered'
              : r.failure
                ? `Fallback · ${r.failure}`
                : 'Requested artifact not delivered',
            'status ' + (ok ? 'ok' : 'bad'),
          ),
          el('p', r.message),
          el(
            'p',
            `${r.actorCalls} actor calls · ${r.criticCalls} critic calls · ${r.tools.length} tools · ${seconds(r.elapsedMs)}`,
            'muted',
          ),
        );
        const details = el('details');
        details.append(
          el('summary', 'Actions, resolved music and independent checks'),
          el(
            'pre',
            JSON.stringify(
              { actions: r.actions, resolved: r.resolved, scores: r.scores, tools: r.tools },
              null,
              2,
            ),
          ),
        );
        card.append(details);
        const coordinates = [];
        r.actions.forEach((action, index) => {
          const result = r.resolved[index];
          if (action.type === 'highlight') {
            const chord = p.spans[action.spanIndex];
            const tone = chord?.tones.find((t) => t.degree === action.degree);
            for (const position of result?.positions ?? [])
              coordinates.push([
                chord?.symbol ?? '',
                tone?.name ?? '',
                action.degree ?? 'all',
                position.string,
                position.fret,
              ]);
          }
          for (const [i, event] of (result?.variation?.events ?? []).entries()) {
            for (const note of event.voicing.notes)
              coordinates.push([
                event.voicing.chord.symbol,
                p.spans[i]?.tones.find((t) => t.degree === note.degree)?.name ?? '',
                note.degree,
                note.position.string,
                note.position.fret,
              ]);
          }
        });
        if (coordinates.length) {
          const musical = el('details'),
            wrap = el('div', undefined, 'table-wrap'),
            table = el('table'),
            head = el('thead'),
            header = el('tr'),
            body = el('tbody');
          ['Chord', 'Note', 'Degree', 'String', 'Fret'].forEach((name) =>
            header.append(el('th', name)),
          );
          head.append(header);
          for (const cells of coordinates) {
            const row = el('tr');
            cells.forEach((value) => row.append(el('td', String(value))));
            body.append(row);
          }
          table.append(head, body);
          wrap.append(table);
          musical.append(el('summary', 'Inspect the returned fretboard coordinates'), wrap);
          card.append(musical);
        }
        if (r.attemptedReplies?.length) {
          const raw = el('details');
          raw.append(
            el('summary', 'Original actor replies before validation or fallback'),
            el(
              'pre',
              JSON.stringify(
                { attemptedReplies: r.attemptedReplies, runtimeReview: r.review },
                null,
                2,
              ),
            ),
          );
          card.append(raw);
        }
        if (r.lensUrl)
          card.append(link('Actual Agent Lens turn ↗', r.lensUrl), document.createTextNode(' · '));
        card.append(link('Recorded Weave evaluation ↗', d.publications[arm].url));
        $('responses').append(card);
      }
  }
  function filter(preferred) {
    const list = d.cases.filter(eligible);
    $('case-select').replaceChildren(
      ...list.map((c) => {
        const o = el('option', c.passage.recording + ' · ' + c.kind);
        o.value = c.id;
        return o;
      }),
    );
    if (list.some((c) => c.id === preferred)) $('case-select').value = preferred;
    $('case-count').textContent =
      `${list.length} of ${d.cases.length} checkpoints shown. Each hosted policy has two trials.`;
    renderCase();
  }
  for (const id of ['task-filter', 'outcome-filter'])
    $(id).addEventListener('change', () => filter());
  $('case-select').addEventListener('change', renderCase);
  filter(new URL(location.href).searchParams.get('case'));
  $('local-summary').textContent =
    `With the original wording “not a quiz” or “not take a quiz,” the local policy proposed a quiz in ${d.localChoice.original.unrequestedQuiz}/${d.localChoice.original.n} requests. With the equivalent wording “no quiz,” it proposed ${d.localChoice['no-quiz'].unrequestedQuiz}/${d.localChoice['no-quiz'].n}. That change delivered ${d.localChoice['no-quiz'].delivered}/${d.localChoice['no-quiz'].n} requested artifacts; the remaining tasks still failed.`;
  const kinds = {
    correct: 'Correct musical claim',
    'wrong-role': 'Wrong chord role',
    'wrong-position': 'Wrong coordinate pitch',
    'invented-playing': 'Invented playing / fingering observation',
  };
  for (const [kind, r] of Object.entries(a.critic.byKind)) {
    const tr = el('tr');
    [kinds[kind], `${r.correct}/${r.n}`, r.unavailable].forEach((v) =>
      tr.append(el('td', String(v))),
    );
    $('critic').append(tr);
  }
  $('critic-summary').textContent =
    `${a.critic.correct}/${a.critic.executed} classifications were correct. It rejected ${a.critic.unsupportedDetected}/${a.critic.unsupportedTotal} unsupported claims and accepted ${a.critic.correctAccepted}/${a.critic.correctTotal} correct claims.`;
  for (const r of d.critic) {
    const details = el('details');
    details.append(
      el(
        'summary',
        `${r.correct ? 'Correct classification' : 'Failed classification'} · ${r.kind} · ${r.fixtureId}`,
      ),
      el('p', r.prose),
      el(
        'pre',
        JSON.stringify(
          { expectedApproved: r.expectedApproved, review: r.output, failure: r.failure },
          null,
          2,
        ),
      ),
      link('Actual reviewer trace ↗', r.lensUrl),
    );
    $('critic-cases').append(details);
  }
  $('accounting').textContent =
    `Evaluation: ${a.accounting.calls} actual actor/critic requests; $${a.accounting.usageUSD.toFixed(5)} accounted, ${a.accounting.unknownUsage} unknown-usage calls. Development is reported separately: ${d.development.calls} requests, $${d.development.cost.toFixed(5)}. No model was trained or promoted. Models/Registry retain the earlier voicing-model lineage.`;
  for (const [arm, r] of Object.entries(d.publications))
    $('remote-links').append(
      link(`${arm === 'critic' ? 'Reviewer diagnostic' : names[arm]} · Weave ↗`, r.url),
    );
  $('remote-links').append(link('Every case · W&B Table ↗', d.table.url));
  $('readback').textContent =
    `Remote readback matched ${d.readback.conversations} Lens conversations, ${d.readback.spans} spans, ${d.readback.rows} evaluation outputs and scores, and all ${d.table.rows} Table rows. Readback confirms publication integrity; it does not establish educational effectiveness.`;
  $('results').hidden = false;
  $('loading').remove();
} catch (error) {
  $('loading').textContent =
    'The research results could not be loaded. Please reload or open the plain-text report.';
  $('loading').className = 'error';
  console.error(error);
}
