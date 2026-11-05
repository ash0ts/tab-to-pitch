import { useSyncExternalStore } from 'react';

const desktop = window.matchMedia('(min-width: 901px)');
const subscribe = (listener: () => void) => {
  desktop.addEventListener('change', listener);
  return () => desktop.removeEventListener('change', listener);
};

/** Match the layout breakpoint so hidden panels do not run a second lifecycle. */
export function useDesktopLayout() {
  return useSyncExternalStore(subscribe, () => desktop.matches);
}
