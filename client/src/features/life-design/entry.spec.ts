/**
 * @jest-environment @happy-dom/jest-environment
 */
import {
  LIFE_ENTRY_HOUSE_STORAGE_KEY,
  clearStoredEntryHouse,
  getEntryHouseFromSearch,
  getStoredEntryHouse,
  homePathForEntryHouse,
  parseEntryHouse,
  storeEntryHouse,
} from './entry';

beforeEach(() => {
  sessionStorage.clear();
});

test('entryHouse only accepts h1 through h12', () => {
  expect(parseEntryHouse('h1')).toBe('h1');
  expect(parseEntryHouse('h12')).toBe('h12');
  expect(parseEntryHouse('h0')).toBeNull();
  expect(parseEntryHouse('h13')).toBeNull();
  expect(parseEntryHouse('work')).toBeNull();
});

test('entryHouse survives registration and clears only after house entry', () => {
  storeEntryHouse('h10');

  expect(sessionStorage.getItem(LIFE_ENTRY_HOUSE_STORAGE_KEY)).toBe('h10');
  expect(getStoredEntryHouse()).toBe('h10');
  expect(homePathForEntryHouse(getStoredEntryHouse())).toBe('/home?entryHouse=h10');

  clearStoredEntryHouse();
  expect(getStoredEntryHouse()).toBeNull();
});

test('entryHouse query parsing fails closed', () => {
  expect(getEntryHouseFromSearch('?entryHouse=h8')).toBe('h8');
  expect(getEntryHouseFromSearch('?entryHouse=h99')).toBeNull();
  expect(getEntryHouseFromSearch('?entryHouse=health')).toBeNull();
});
