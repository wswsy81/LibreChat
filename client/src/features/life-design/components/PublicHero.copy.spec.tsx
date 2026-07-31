/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import PublicHero from './PublicHero';

const mockTranslation: Record<string, string> = jest.requireActual('~/locales/en/translation.json');

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => mockTranslation[key] ?? '',
}));

jest.mock('./PublicMistMap', () => {
  const actual = jest.requireActual('./PublicMistMap');
  return {
    __esModule: true,
    ...actual,
    default: () => <div data-testid="public-mist-map" />,
  };
});

test('公开首页三条未来线与报告共用唯一名称，不再暴露内部或旧奥德赛术语', () => {
  render(
    <MemoryRouter>
      <PublicHero />
    </MemoryRouter>,
  );

  for (const label of ['照现在这样走', '先试一小步', '彻底转向']) {
    expect(screen.getByText(label)).toBeInTheDocument();
  }
  expect(screen.queryByText('惯性线')).not.toBeInTheDocument();
  expect(screen.queryByText('干预线')).not.toBeInTheDocument();
  expect(screen.queryByText('断裂线')).not.toBeInTheDocument();
  expect(screen.queryByText('当前延展')).not.toBeInTheDocument();
  expect(screen.queryByText('如果这条没了')).not.toBeInTheDocument();
  expect(screen.queryByText('不计代价')).not.toBeInTheDocument();
});
