/**
 * @jest-environment @happy-dom/jest-environment
 */
import { render } from '@testing-library/react';
import type { LifeWheelView } from 'librechat-data-provider';
import ArchiveMistMap from './ArchiveMistMap';

let capturedProps: Record<string, unknown> | null = null;

jest.mock('./PublicMistMap', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    capturedProps = props;
    return <div data-testid="personal-mist-map" />;
  },
}));

test('档案迷雾图用 lanternHouse 标当前位置，并按真实领域状态点亮', () => {
  const wheel = {
    lanternHouse: 'h6',
    houses: [
      {
        id: 'h6',
        recognition: 'owned',
        condition: { level: 'strained', currentSnapshotId: 'snapshot-1' },
      },
      {
        id: 'h7',
        recognition: 'draft',
        condition: { level: 'unknown', currentSnapshotId: null },
      },
      {
        id: 'h10',
        recognition: 'unknown',
        condition: { level: 'unknown', currentSnapshotId: null },
      },
    ],
  } as LifeWheelView;

  render(<ArchiveMistMap wheel={wheel} />);
  expect(capturedProps?.selectedIsland).toBe('h6');
  expect([...(capturedProps?.litIslands as Set<string>)]).toEqual(['h6', 'h7']);
  expect(capturedProps).not.toHaveProperty('onSelectIsland');
});
