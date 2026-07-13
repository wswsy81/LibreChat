import React from 'react';
import '@testing-library/jest-dom/extend-expect';
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('~/components/SidePanel/Nav', () => ({
  __esModule: true,
  default: () => <div data-testid="side-panel-nav" />,
}));

jest.mock('../ExpandedPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="expanded-panel" />,
}));

jest.mock('~/utils', () => ({
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}));

import Sidebar from '../Sidebar';

describe('Sidebar resize separator', () => {
  it('exposes its current range and keeps keyboard resizing available', () => {
    const onResizeKeyboard = jest.fn();
    render(
      <Sidebar
        links={[]}
        expanded
        onCollapse={jest.fn()}
        onExpand={jest.fn()}
        onResizeStart={jest.fn()}
        onResizeKeyboard={onResizeKeyboard}
        resizeValue={420}
        resizeMin={360}
        resizeMax={576}
      />,
    );

    const separator = screen.getByRole('separator', { name: 'Resize sidebar' });
    expect(separator).toHaveAttribute('aria-valuenow', '420');
    expect(separator).toHaveAttribute('aria-valuemin', '360');
    expect(separator).toHaveAttribute('aria-valuemax', '576');

    fireEvent.keyDown(separator, { key: 'ArrowLeft' });
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(onResizeKeyboard).toHaveBeenNthCalledWith(1, 'shrink');
    expect(onResizeKeyboard).toHaveBeenNthCalledWith(2, 'grow');
  });
});
