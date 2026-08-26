/** Hash routing — GitHub Pages has no server-side rewrite rules, so every
 * route has to live after the `#`. */
export type Route =
  | { name: 'menu' }
  | { name: 'levelSelect'; packId: string }
  | { name: 'campaign'; packId: string; levelIndex: number }
  | { name: 'daily' };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'campaign' && parts[1] && parts[2] !== undefined) {
    const levelIndex = Number(parts[2]);
    if (Number.isFinite(levelIndex)) return { name: 'campaign', packId: parts[1], levelIndex };
  }
  if (parts[0] === 'pack' && parts[1]) return { name: 'levelSelect', packId: parts[1] };
  if (parts[0] === 'daily') return { name: 'daily' };
  return { name: 'menu' };
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'menu':
      return '#/';
    case 'levelSelect':
      return `#/pack/${route.packId}`;
    case 'campaign':
      return `#/campaign/${route.packId}/${route.levelIndex}`;
    case 'daily':
      return '#/daily';
  }
}

export function navigate(route: Route): void {
  location.hash = routeToHash(route);
}

export function onRouteChange(cb: (route: Route) => void): () => void {
  const handler = () => cb(parseHash(location.hash));
  window.addEventListener('hashchange', handler);
  handler();
  return () => window.removeEventListener('hashchange', handler);
}
