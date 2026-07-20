const INVITE_CODE_PATTERN = /^YW[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/;

export const LIFE_INVITE_STORAGE_KEY = 'life_invite_code';

export function formatLifeInviteCode(value: string): string | null {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!INVITE_CODE_PATTERN.test(normalized)) {
    return null;
  }
  return `${normalized.slice(0, 2)}-${normalized.slice(2, 6)}-${normalized.slice(6)}`;
}

export function getInviteCodeFromHash(hash: string): string | null {
  const value = new URLSearchParams(hash.replace(/^#/, '')).get('invite');
  return value ? formatLifeInviteCode(value) : null;
}

export function getStoredInviteCode(): string {
  try {
    return formatLifeInviteCode(sessionStorage.getItem(LIFE_INVITE_STORAGE_KEY) || '') || '';
  } catch {
    return '';
  }
}

export function storeInviteCode(code: string): void {
  try {
    sessionStorage.setItem(LIFE_INVITE_STORAGE_KEY, code);
  } catch {
    return;
  }
}

export function clearStoredInviteCode(): void {
  try {
    sessionStorage.removeItem(LIFE_INVITE_STORAGE_KEY);
  } catch {
    return;
  }
}
