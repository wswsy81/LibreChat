/**
 * @jest-environment @happy-dom/jest-environment
 */
import { render, screen } from '@testing-library/react';
import PublicMistMap, { CONTINENTS } from './PublicMistMap';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

test('工作停点的人物视觉仍落在工作地块，不贴到独立健康雾块', () => {
  render(<PublicMistMap selectedIsland="h6" />);

  const marker = screen.getByRole('img', { name: 'com_life_map_you_are_here' });
  const transform = marker.getAttribute('transform') ?? '';
  const coordinates = /^translate\(([^,]+),([^)]+)\)$/.exec(transform);
  const markerX = Number(coordinates?.[1]);
  const markerY = Number(coordinates?.[2]);
  const work = CONTINENTS.flatMap((continent) => continent.domains).find(
    (domain) => domain.id === 'h6',
  );
  const health = { x: 674, y: 270 };

  expect(work).toBeDefined();
  expect(Math.hypot(markerX - work!.x, markerY - work!.y)).toBeLessThan(
    Math.hypot(markerX - health.x, markerY - health.y),
  );
});
