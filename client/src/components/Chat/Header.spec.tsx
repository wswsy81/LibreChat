/**
 * @jest-environment @happy-dom/jest-environment
 */
import { render, screen } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import Header from './Header';
import store from '~/store';

let mockStartupConfig: { lifeUnifiedShell?: boolean } | undefined;
let mockSmallScreen = false;

jest.mock('@librechat/client', () => ({
  useMediaQuery: () => mockSmallScreen,
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: mockStartupConfig }),
}));

jest.mock('~/hooks', () => ({
  useHasAccess: () => false,
}));

jest.mock('./Menus/Endpoints/ModelSelector', () => () => <div data-testid="model-selector" />);
jest.mock('./ExportAndShareMenu', () => () => <div data-testid="export-and-share-menu" />);
jest.mock('./Menus', () => ({
  OpenSidebar: () => <div data-testid="open-sidebar" />,
  PresetsMenu: () => null,
}));
jest.mock('./Menus/BookmarkMenu', () => () => null);
jest.mock('./TemporaryChat', () => ({ TemporaryChat: () => null }));
jest.mock('./AddMultiConvo', () => () => null);

function renderHeader() {
  return render(
    <RecoilRoot initializeState={({ set }) => set(store.sidebarExpanded, false)}>
      <Header />
    </RecoilRoot>,
  );
}

describe('chat header in the unified life shell', () => {
  beforeEach(() => {
    mockStartupConfig = { lifeUnifiedShell: true };
    mockSmallScreen = false;
  });

  it('hides LibreChat share/export on desktop', () => {
    renderHeader();

    expect(screen.queryByTestId('export-and-share-menu')).not.toBeInTheDocument();
  });

  it('hides LibreChat share/export on mobile', () => {
    mockSmallScreen = true;
    renderHeader();

    expect(screen.queryByTestId('export-and-share-menu')).not.toBeInTheDocument();
  });

  it('does not flash the menu before startup config is ready', () => {
    mockStartupConfig = undefined;
    renderHeader();

    expect(screen.queryByTestId('export-and-share-menu')).not.toBeInTheDocument();
  });

  it('keeps the original menu in explicit generic LibreChat mode', () => {
    mockStartupConfig = { lifeUnifiedShell: false };
    renderHeader();

    expect(screen.getByTestId('export-and-share-menu')).toBeInTheDocument();
  });
});
