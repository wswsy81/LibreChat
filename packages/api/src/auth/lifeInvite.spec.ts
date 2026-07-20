import {
  formatLifeInviteCode,
  generateLifeInviteCode,
  normalizeLifeInviteCode,
} from './lifeInvite';

test('generates an unambiguous ten-character invite code', () => {
  const code = generateLifeInviteCode();

  expect(code).toMatch(/^YW[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/);
  expect(code).not.toMatch(/[01ILO]/);
});

test('normalizes formatted lowercase invite codes', () => {
  expect(normalizeLifeInviteCode('yw-7k9p-2m8q')).toBe('YW7K9P2M8Q');
  expect(formatLifeInviteCode('yw7k9p2m8q')).toBe('YW-7K9P-2M8Q');
});

test('rejects malformed and ambiguous invite codes', () => {
  expect(normalizeLifeInviteCode('YW-7K9P-2M8')).toBeNull();
  expect(normalizeLifeInviteCode('YW-7K9P-2M8O')).toBeNull();
});
