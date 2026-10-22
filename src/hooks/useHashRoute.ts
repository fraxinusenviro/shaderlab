import { useSyncExternalStore } from 'react';

/**
 * Hash routing works on GitHub Pages without server rewrites:
 *   #/                  editor workspace
 *   #/shader/<id>       editor with a project
 *   #/gallery           variant gallery
 *   #/compare           A/B comparison
 *   #/view[/<id>]       simple full-screen viewer   (?slideshow=20&ui=off)
 *   #/landscape         landscape & waterscape studio
 */
export type View = 'workspace' | 'gallery' | 'compare' | 'view' | 'landscape';
export type Route = { view: View; shaderId?: string; query: Record<string, string> };

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path, qs = ''] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs));
  const [head, ...rest] = path.split('/');
  const id = rest.length && rest.join('/') ? decodeURIComponent(rest.join('/')) : undefined;
  if (head === 'gallery') return { view: 'gallery', query };
  if (head === 'compare') return { view: 'compare', query };
  if (head === 'landscape') return { view: 'landscape', query };
  if (head === 'view') return { view: 'view', shaderId: id, query };
  if (head === 'shader' && id) return { view: 'workspace', shaderId: id, query };
  return { view: 'workspace', query };
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

export function navigate(view: View, shaderId?: string): void {
  if (view === 'workspace') window.location.hash = shaderId ? `#/shader/${encodeURIComponent(shaderId)}` : '#/';
  else if (view === 'view') window.location.hash = shaderId ? `#/view/${encodeURIComponent(shaderId)}` : '#/view';
  else window.location.hash = `#/${view}`;
}
