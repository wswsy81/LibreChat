/**
 * @jest-environment @happy-dom/jest-environment
 */
import { render, screen } from '@testing-library/react';
import ArchiveMap from './ArchiveMap';

const mockNavigate = jest.fn();
const mockMutate = jest.fn();
const mockShowToast = jest.fn();
const mockFullRefetch = jest.fn();

let mockFullState: { data?: string; isLoading: boolean; isError: boolean };
let mockSimpleState: { data?: string; isLoading: boolean; isError: boolean };
let capturedOnFrameMessage: ((data: unknown) => void) | undefined;

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: mockShowToast }),
}));

jest.mock('~/data-provider', () => ({
  useLifeMapHtmlQuery: (view?: 'full') =>
    view === 'full'
      ? { ...mockFullState, refetch: mockFullRefetch }
      : { ...mockSimpleState, refetch: jest.fn() },
  useLifeMapHouseAnnotateMutation: () => ({ mutate: mockMutate }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('./LifeFrame', () => ({
  __esModule: true,
  default: ({
    html,
    onFrameMessage,
  }: {
    html: string;
    onFrameMessage?: (data: unknown) => void;
  }) => {
    capturedOnFrameMessage = onFrameMessage;
    return <div data-testid="life-map-frame">{html}</div>;
  },
}));

describe('ArchiveMap(N1 全图)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnFrameMessage = undefined;
    mockFullState = { data: '<html>full-map</html>', isLoading: false, isError: false };
    mockSimpleState = { data: undefined, isLoading: false, isError: false };
  });

  it('渲染全图 HTML', () => {
    render(<ArchiveMap />);
    expect(screen.getByTestId('life-map-frame').textContent).toContain('full-map');
  });

  it('全图失败时回退简版', () => {
    mockFullState = { data: undefined, isLoading: false, isError: true };
    mockSimpleState = { data: '<html>simple-map</html>', isLoading: false, isError: false };
    render(<ArchiveMap />);
    expect(screen.getByTestId('life-map-frame').textContent).toContain('simple-map');
  });

  it('keep/strike 动作转成领地批注请求', () => {
    render(<ArchiveMap />);
    capturedOnFrameMessage?.({
      type: 'life-map-action',
      payload: { action: 'keep', houseId: 'h2' },
    });
    expect(mockMutate).toHaveBeenCalledWith(
      { houseKey: 'h2', action: 'keep', text: undefined },
      expect.anything(),
    );
  });

  it('rewrite 无文本不发请求;带文本发请求', () => {
    render(<ArchiveMap />);
    capturedOnFrameMessage?.({
      type: 'life-map-action',
      payload: { action: 'rewrite', houseId: 'h2', text: '   ' },
    });
    expect(mockMutate).not.toHaveBeenCalled();
    capturedOnFrameMessage?.({
      type: 'life-map-action',
      payload: { action: 'rewrite', houseId: 'h2', text: '用我的话说' },
    });
    expect(mockMutate).toHaveBeenCalledWith(
      { houseKey: 'h2', action: 'rewrite', text: '用我的话说' },
      expect.anything(),
    );
  });

  it('birth 动作回到对话;非法领地键不发请求', () => {
    render(<ArchiveMap />);
    capturedOnFrameMessage?.({
      type: 'life-map-action',
      payload: { action: 'birth', houseId: 'h5' },
    });
    expect(mockNavigate).toHaveBeenCalledWith('/resume');
    capturedOnFrameMessage?.({
      type: 'life-map-action',
      payload: { action: 'keep', houseId: 'h13' },
    });
    expect(mockMutate).not.toHaveBeenCalled();
  });
});
