import type { LifeHouseId } from 'librechat-data-provider';

export const LIFE_ENTRY_HOUSE_STORAGE_KEY = 'life_entry_house';

export function parseEntryHouse(value?: string | null): LifeHouseId | null {
  if (!value || !/^h(?:[1-9]|1[0-2])$/.test(value)) {
    return null;
  }
  return value as LifeHouseId;
}

export function getEntryHouseFromSearch(search: string): LifeHouseId | null {
  return parseEntryHouse(new URLSearchParams(search).get('entryHouse'));
}

export function getStoredEntryHouse(): LifeHouseId | null {
  try {
    return parseEntryHouse(sessionStorage.getItem(LIFE_ENTRY_HOUSE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function storeEntryHouse(entryHouse: LifeHouseId): void {
  try {
    sessionStorage.setItem(LIFE_ENTRY_HOUSE_STORAGE_KEY, entryHouse);
  } catch {
    return;
  }
}

export function clearStoredEntryHouse(): void {
  try {
    sessionStorage.removeItem(LIFE_ENTRY_HOUSE_STORAGE_KEY);
  } catch {
    return;
  }
}

export function homePathForEntryHouse(entryHouse: LifeHouseId | null): string {
  return entryHouse ? `/home?entryHouse=${entryHouse}` : '/home';
}
