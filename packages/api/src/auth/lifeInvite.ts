import { randomBytes } from 'node:crypto';

const CODE_PREFIX = 'YW';
const CODE_LENGTH = 8;
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function generateLifeInviteCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  const body = Array.from(bytes, (value) => CODE_ALPHABET[value % CODE_ALPHABET.length]).join('');
  return `${CODE_PREFIX}${body}`;
}

export function normalizeLifeInviteCode(value: string): string | null {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const pattern = new RegExp(`^${CODE_PREFIX}[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);
  return pattern.test(normalized) ? normalized : null;
}

export function formatLifeInviteCode(value: string): string {
  const normalized = normalizeLifeInviteCode(value);
  if (!normalized) {
    return value;
  }
  return `${normalized.slice(0, 2)}-${normalized.slice(2, 6)}-${normalized.slice(6)}`;
}
