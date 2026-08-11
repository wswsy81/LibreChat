/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import FaqRoute from '../FaqRoute';

const mockTranslation: Record<string, string> = jest.requireActual('~/locales/en/translation.json');

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => mockTranslation[key] ?? '',
}));

function renderFaq() {
  return render(
    <MemoryRouter initialEntries={['/faq']}>
      <FaqRoute />
    </MemoryRouter>,
  );
}

describe('FaqRoute', () => {
  it('四个分组标题都渲染真实文案', () => {
    renderFaq();
    for (const label of ['了解产品', '它的边界', '你的数据', '安全与信任边界']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('每条问答都有真实文案，不留空键', () => {
    const { container } = renderFaq();
    const terms = container.querySelectorAll('dt');
    const details = container.querySelectorAll('dd');
    expect(terms.length).toBeGreaterThan(0);
    expect(details).toHaveLength(terms.length);
    for (const node of [...terms, ...details]) {
      expect(node.textContent?.trim()).not.toBe('');
      expect(node.textContent).not.toMatch(/com_life_faq_/);
    }
  });

  it('编号按显示顺序连续，不因分组跳号', () => {
    const { container } = renderFaq();
    const numbers = [...container.querySelectorAll('dt > span:first-child')].map(
      (node) => node.textContent,
    );
    expect(numbers).toEqual(numbers.map((_, index) => String(index + 1).padStart(2, '0')));
  });

  it('三条未来线、力度反馈与邀请码收在「了解产品」组', () => {
    const { container } = renderFaq();
    const productList = container.querySelector('dl');
    expect(productList).not.toBeNull();
    const group = within(productList as HTMLElement);
    expect(group.getByText(mockTranslation.com_life_faq_q20)).toBeInTheDocument();
    expect(group.getByText(mockTranslation.com_life_faq_q22)).toBeInTheDocument();
    expect(group.getByText(mockTranslation.com_life_faq_q21)).toBeInTheDocument();
    const questions = [
      ...(productList as HTMLElement).querySelectorAll('dt > span:last-child'),
    ].map((node) => node.textContent?.trim());
    expect(questions.indexOf(mockTranslation.com_life_faq_q20)).toBeGreaterThan(
      questions.indexOf(mockTranslation.com_life_faq_q21),
    );
  });

  it('答案覆盖当前入口模型、三线走法与埋点披露', () => {
    renderFaq();
    expect(screen.getByText(mockTranslation.com_life_faq_a3)).toHaveTextContent(
      '可以直接说一句近况，也可以从生活地图选一块',
    );
    expect(screen.getByText(mockTranslation.com_life_faq_a20)).toHaveTextContent('不是预测');
    expect(screen.getByText(mockTranslation.com_life_faq_a22)).toHaveTextContent('不会自动改变');
    expect(screen.getByText(mockTranslation.com_life_faq_a13)).toHaveTextContent('只记类别编号');
  });
});
