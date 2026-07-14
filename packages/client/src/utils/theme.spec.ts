import { getInitialTheme } from './theme';

describe('getInitialTheme', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('restores a saved dark theme preference', () => {
    window.localStorage.setItem('color-theme', 'dark');

    expect(getInitialTheme()).toBe('dark');
  });
});
