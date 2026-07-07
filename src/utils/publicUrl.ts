/** Prefija rutas públicas con la base de Vite (dev, preview local y GitHub Pages). */
export function publicUrl(path: string): string {
  if (!path || /^https?:\/\//i.test(path) || /^data:/i.test(path)) return path;

  const base = import.meta.env.BASE_URL;
  if (base !== './' && path.startsWith(base)) return path;

  const rel = path.startsWith('/') ? path.slice(1) : path;
  return `${base}${rel}`;
}

/** Reescribe rutas /assets y /room-layouts que apuntan a la raíz del dominio. */
export function resolveAssetUrl(url: string): string {
  if (!url || /^data:/i.test(url)) return url;

  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      const onSite =
        typeof window !== 'undefined' &&
        parsed.origin === window.location.origin;
      if (
        onSite &&
        (parsed.pathname.startsWith('/assets/') || parsed.pathname.startsWith('/room-layouts/'))
      ) {
        return publicUrl(parsed.pathname + parsed.search);
      }
    } catch {
      /* ignore */
    }
    return url;
  }

  if (url.startsWith('/assets/') || url.startsWith('/room-layouts/')) {
    return publicUrl(url);
  }

  return url;
}
