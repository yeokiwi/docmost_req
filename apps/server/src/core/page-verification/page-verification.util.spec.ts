import { addPeriod, computeVerificationState } from './page-verification.util';

const now = new Date('2026-06-15T12:00:00Z');
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

describe('addPeriod', () => {
  it('adds calendar units', () => {
    const from = new Date('2026-01-31T00:00:00Z');
    expect(addPeriod(from, 2, 'day').toISOString()).toBe('2026-02-02T00:00:00.000Z');
    expect(addPeriod(from, 1, 'week').toISOString()).toBe('2026-02-07T00:00:00.000Z');
    expect(addPeriod(from, 1, 'year').toISOString()).toBe('2027-01-31T00:00:00.000Z');
    expect(addPeriod(new Date('2026-03-15T00:00:00Z'), 3, 'month').toISOString()).toBe(
      '2026-06-15T00:00:00.000Z',
    );
  });
});

describe('computeVerificationState', () => {
  const exp = (verifiedAt: Date | null, expiresAt: Date | null) => ({
    type: 'expiring',
    status: verifiedAt ? 'verified' : null,
    verifiedAt,
    expiresAt,
  });

  it('expiring verification lifecycle', () => {
    expect(computeVerificationState(exp(null, null), null, now)).toBe('unverified');
    expect(computeVerificationState(exp(days(-1), null), null, now)).toBe('verified');
    expect(computeVerificationState(exp(days(-1), days(30)), null, now)).toBe('verified');
    expect(computeVerificationState(exp(days(-1), days(3)), null, now)).toBe('expiring_soon');
    expect(computeVerificationState(exp(days(-40), days(-1)), null, now)).toBe('expired');
  });

  it('approval workflow states', () => {
    const q = (status: string | null, verifiedAt: Date | null = null) => ({
      type: 'qms',
      status,
      verifiedAt,
      expiresAt: null,
    });
    expect(computeVerificationState(q(null), null, now)).toBe('draft');
    expect(computeVerificationState(q('pending'), null, now)).toBe('pending');
    expect(computeVerificationState(q('rejected'), null, now)).toBe('rejected');
    expect(computeVerificationState(q('approved', days(-2)), days(-2), now)).toBe('approved');
    expect(computeVerificationState(q('approved', days(-2)), days(-1), now)).toBe('changed');
  });
});
