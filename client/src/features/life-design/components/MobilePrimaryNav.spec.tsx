/**
 * @jest-environment @happy-dom/jest-environment
 */
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import MobilePrimaryNav from './MobilePrimaryNav';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

test('移动底栏固定为今天、直接说、我三项，不再暴露独立生活地图', () => {
  render(
    <MemoryRouter initialEntries={['/me']}>
      <MobilePrimaryNav />
    </MemoryRouter>,
  );

  const links = screen.getAllByRole('link');
  const navigation = screen.getByRole('navigation');
  expect(links).toHaveLength(3);
  expect(navigation).toHaveClass('grid-cols-3');
  expect(links.map((link) => link.getAttribute('href'))).toEqual(['/home', '/c/new', '/me']);
  expect(screen.queryByRole('link', { name: /com_life_nav_map/ })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /com_life_nav_me/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
});
