/**
 * @jest-environment @happy-dom/jest-environment
 */
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import MobilePrimaryNav from './MobilePrimaryNav';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

test('移动底栏固定为今天、直接说、生活地图、我四项', () => {
  render(
    <MemoryRouter initialEntries={['/map']}>
      <MobilePrimaryNav />
    </MemoryRouter>,
  );

  const links = screen.getAllByRole('link');
  const navigation = screen.getByRole('navigation');
  expect(links).toHaveLength(4);
  expect(navigation).toHaveClass(
    'grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)_minmax(0,1.5fr)_minmax(0,0.5fr)]',
  );
  expect(links.map((link) => link.getAttribute('href'))).toEqual([
    '/home',
    '/c/new',
    '/map',
    '/me',
  ]);
  expect(screen.getByRole('link', { name: /com_life_nav_map/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
});
