export type OidcClaims = {
  sub: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  groups: string[];
};

export function toClaims(raw: Record<string, any>): OidcClaims {
  const email =
    typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : undefined;
  const name =
    raw.name ||
    [raw.given_name, raw.family_name].filter(Boolean).join(' ') ||
    raw.preferred_username ||
    undefined;
  let groups: string[] = [];
  const g = raw.groups ?? raw.roles;
  if (Array.isArray(g)) groups = g.filter((x) => typeof x === 'string');
  else if (typeof g === 'string')
    groups = g
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  // some IdPs send "/team/sub-team" paths; keep the last segment
  groups = groups.map((x) => x.split('/').filter(Boolean).pop() ?? x);
  return {
    sub: String(raw.sub),
    email,
    emailVerified:
      raw.email_verified === undefined
        ? undefined
        : raw.email_verified === true || raw.email_verified === 'true',
    name: typeof name === 'string' ? name.slice(0, 50) : undefined,
    groups,
  };
}

/** Only same-site relative paths are accepted as post-login targets. */
export function safeRedirect(path: unknown): string {
  if (typeof path !== 'string') return '/home';
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\'))
    return '/home';
  return path.slice(0, 1000);
}

export function normaliseIssuer(issuer: string): string {
  return issuer
    .trim()
    .replace(/\/\.well-known\/openid-configuration\/?$/, '')
    .replace(/\/+$/, '');
}
