import { describe, expect, it } from 'vitest';
import { migrationState } from '../systemHealth';

describe('migrationState', () => {
  it('compares the applied migration with the build', () => {
    expect(migrationState('20261113004000', '20261113004000')).toBe('ok');
    expect(migrationState('20261113003000', '20261113004000')).toBe('behind');
    expect(migrationState('20261114000000', '20261113004000')).toBe('ahead');
    expect(migrationState(null, '20261113004000')).toBe('unknown');
  });
});
