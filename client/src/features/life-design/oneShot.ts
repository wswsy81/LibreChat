/** Cross-tab one-shot markers: only the first tab consumes an auto-submit route. */

export const isConsumed = (key: string): boolean => {
  try {
    return localStorage.getItem(key) != null;
  } catch {
    return false;
  }
};

export const markConsumed = (key: string): void => {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    /* storage unavailable: fall back to per-tab guards */
  }
};
