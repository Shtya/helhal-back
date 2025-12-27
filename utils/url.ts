

export function resolveUrl(u?: string): string {
    if (!u) return '';
    if (/^(https?:|blob:|data:)/i.test(u)) return u;

    const base = process.env.BACKEND_URL || '';
    // remove trailing slash from base
    const normalizedBase = base.replace(/\/+$/, '');
    // remove leading slash from u
    const normalizedPath = u.replace(/^\/+/, '');

    return `${normalizedBase}/${normalizedPath}`;
}
