import { useSyncExternalStore } from 'react';

/**
 * Hash routing works on GitHub Pages without server rewrites:
 *   #/               workspace
 *   #/shader/<id>    workspace with a project
 *   #/gallery        variant gallery
 *   #/compare        A/B comparison
 */
export type Route = { view: 'workspace' | 'gallery' | 'compare'; shaderId?: string };

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  const [head, ...rest] = h.split('/');
  if (head === 'gallery') return { view: 'gallery' };
  if (head === 'compare') return { view: 'compare' };
  if (head === 'shader' && rest.length) return { view: 'workspace', shaderId: decodeURIComponent(rest.join('/')) };
  return { view: 'workspace' };
}

export function useHashRoute(): Route {
  const hash = useSyncExternalStore(
    (cb) => {
      window.addEventListener('hashchange', cb);
      return () => window.removeEventListener('hashchange', cb);
    },
    () => window.location.hash,
    () => '',
  );
  return parseHash(hash);
}

export function navigate(view: Route['view'], shaderId?: string): void {
  window.location.hash = view === 'workspace' ? (shaderId ? `#/shader/${encodeURIComponent(shaderId)}` : '#/') : `#/${view}`;
}
