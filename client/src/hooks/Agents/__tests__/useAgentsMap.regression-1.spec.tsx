/**
 * @jest-environment @happy-dom/jest-environment
 */
import { renderHook } from '@testing-library/react';

import useAgentsMap from '../useAgentsMap';

const mockUseListAgentsQuery = jest.fn();
let mockHasAgentAccess = false;

jest.mock('~/data-provider', () => ({
  useListAgentsQuery: (...args: unknown[]) => mockUseListAgentsQuery(...args),
}));

jest.mock('../../Roles/useHasAccess', () => ({
  __esModule: true,
  default: () => mockHasAgentAccess,
}));

jest.mock('~/utils', () => ({
  mapAgents: (value: unknown) => value,
}));

describe('useAgentsMap permission gate', () => {
  beforeEach(() => {
    mockHasAgentAccess = false;
    mockUseListAgentsQuery.mockReset();
    mockUseListAgentsQuery.mockReturnValue({ data: null });
  });

  it('does not request agents when the product role cannot use them', () => {
    renderHook(() => useAgentsMap({ isAuthenticated: true }));

    expect(mockUseListAgentsQuery).toHaveBeenCalledWith(
      { requiredPermission: 1 },
      expect.objectContaining({ enabled: false }),
    );
  });

  it('keeps the existing query for roles that can use agents', () => {
    mockHasAgentAccess = true;
    renderHook(() => useAgentsMap({ isAuthenticated: true }));

    expect(mockUseListAgentsQuery).toHaveBeenCalledWith(
      { requiredPermission: 1 },
      expect.objectContaining({ enabled: true }),
    );
  });
});
