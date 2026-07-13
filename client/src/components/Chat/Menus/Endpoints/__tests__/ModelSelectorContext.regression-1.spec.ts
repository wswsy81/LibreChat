import { shouldLoadAgentChoices } from '../ModelSelectorContext';

describe('ModelSelector agent query gate', () => {
  it('stays disabled when the permission-filtered agents map is unavailable', () => {
    expect(shouldLoadAgentChoices(undefined)).toBe(false);
  });

  it('loads choices for authorized users even when their agents map is empty', () => {
    expect(shouldLoadAgentChoices({})).toBe(true);
  });
});
