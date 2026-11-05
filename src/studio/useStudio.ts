import { useEffect, useRef, useState } from 'react';
import { readSetting, writeSetting } from '../storage';
import { activity, type ActivityId } from './catalog';
import { defaultPracticeSet, practiceSetSchema, type PracticeSet } from './contracts';
export type Destination = 'studio' | 'library' | 'stage' | 'progress' | 'research';
export function readRoute() {
  const [part, id] = location.hash.replace(/^#\/?/, '').split('/');
  const page = (
    ['studio', 'library', 'stage', 'progress', 'research'].includes(part ?? '') ? part : 'studio'
  ) as Destination;
  return { page, activity: activity(id ?? 'homework').id };
}
export function useStudio() {
  const [route, setRoute] = useState(readRoute);
  const [set, setSet] = useState(defaultPracticeSet);
  const value = useRef(set);
  const writes = useRef(Promise.resolve());
  const revision = useRef(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const restore = () => {
      const at = revision.current;
      void readSetting('studio-v1', null)
        .then((stored) => {
          if (!active || at !== revision.current) return;
          const parsed = practiceSetSchema.safeParse(stored);
          const next = parsed.success ? parsed.data : defaultPracticeSet();
          value.current = next;
          setSet(next);
        })
        .catch(() => {
          if (active)
            setError('Your studio is working in memory. Saving a bookmark needs browser storage.');
        })
        .finally(() => {
          if (active) setReady(true);
        });
    };
    restore();
    const update = () => setRoute(readRoute());
    window.addEventListener('hashchange', update);
    window.addEventListener('studio-restored', restore);
    return () => {
      active = false;
      window.removeEventListener('hashchange', update);
      window.removeEventListener('studio-restored', restore);
    };
  }, []);
  function change(patch: Partial<PracticeSet>) {
    const next = practiceSetSchema.parse({ ...value.current, ...patch });
    value.current = next;
    setSet(next);
    const current = ++revision.current;
    writes.current = writes.current
      .catch(() => {})
      .then(() => writeSetting('studio-v1', next))
      .then(() => {
        if (current === revision.current) setError('');
      })
      .catch(() => setError('This change is kept in memory. Browser storage could not save it.'));
  }
  function go(page: Destination, id: ActivityId = route.activity) {
    location.hash = `/${page}${page === 'stage' || page === 'research' ? `/${id}` : ''}`;
  }
  function visit(id: ActivityId, kind: PracticeSet['visits'][number]['kind']) {
    change({
      visits: [...value.current.visits, { at: Date.now(), activity: id, kind }].slice(-1000),
    });
  }
  return { route, set, ready, error, change, go, visit, flush: () => writes.current };
}
export type StudioController = ReturnType<typeof useStudio>;
