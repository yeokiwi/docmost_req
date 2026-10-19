import { normaliseIssuer, safeRedirect, toClaims } from './sso.util';

describe('SSO helpers', () => {
  it('normalises claims from different IdPs', () => {
    expect(
      toClaims({
        sub: 'abc',
        email: ' Jane@Example.COM ',
        email_verified: 'true',
        given_name: 'Jane',
        family_name: 'Doe',
        groups: ['/eng/platform', 'Design'],
      }),
    ).toEqual({
      sub: 'abc',
      email: 'jane@example.com',
      emailVerified: true,
      name: 'Jane Doe',
      groups: ['platform', 'Design'],
    });
    const c = toClaims({ sub: 1, preferred_username: 'jd', roles: 'a, b' });
    expect(c).toMatchObject({
      sub: '1',
      name: 'jd',
      groups: ['a', 'b'],
      emailVerified: undefined,
    });
    expect(toClaims({ sub: 'x', email_verified: false }).emailVerified).toBe(
      false,
    );
  });

  it('only redirects to same-site paths', () => {
    expect(safeRedirect('/s/eng/p/abc?x=1')).toBe('/s/eng/p/abc?x=1');
    expect(safeRedirect('https://evil.example')).toBe('/home');
    expect(safeRedirect('//evil.example')).toBe('/home');
    expect(safeRedirect('/\\evil')).toBe('/home');
    expect(safeRedirect(undefined)).toBe('/home');
  });

  it('accepts issuer or discovery URLs', () => {
    expect(normaliseIssuer('https://idp.example/realms/x/')).toBe(
      'https://idp.example/realms/x',
    );
    expect(
      normaliseIssuer(
        'https://idp.example/realms/x/.well-known/openid-configuration',
      ),
    ).toBe('https://idp.example/realms/x');
  });
});
