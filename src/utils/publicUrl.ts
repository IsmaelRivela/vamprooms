/** Prefija rutas públicas con la base de Vite (dev, preview local y GitHub Pages). */
export function publicUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = import.meta.env.BASE_URL;
  const rel = path.startsWith('/') ? path.slice(1) : path;
  return `${base}${rel}`;
}
