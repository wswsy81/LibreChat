/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FirstArchiveSetup from '../FirstArchiveSetup';
import BasicsForm from '../BasicsForm';

const mockOnboardingMutate = jest.fn();
const mockDiagnosticMutate = jest.fn();
const mockBasicsMutate = jest.fn();
const mockBirthMutate = jest.fn();
const mockToast = jest.fn();

let mockArchiveData: Record<string, unknown> | undefined;

jest.mock('@librechat/client', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  useToastContext: () => ({ showToast: mockToast }),
}));

jest.mock('~/data-provider', () => ({
  useLifeOnboardingMutation: () => ({
    mutate: mockOnboardingMutate,
    isLoading: false,
    error: null,
  }),
  useLifeDiagnosticMutation: () => ({
    mutate: mockDiagnosticMutate,
    isLoading: false,
    error: null,
  }),
  useLifeArchiveQuery: () => ({ data: mockArchiveData }),
  useLifeBasicsMutation: () => ({ mutate: mockBasicsMutate, isLoading: false }),
  useLifeBirthMutation: () => ({ mutate: mockBirthMutate, isLoading: false }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/utils/track', () => ({ track: jest.fn() }));
jest.mock('../../oneShot', () => ({ isConsumed: () => false, markConsumed: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  mockArchiveData = { profile: { basics: {} } };
});

test('两字注册姓名拨动一条血条后可以继续建档', () => {
  render(
    <MemoryRouter>
      <FirstArchiveSetup initialName="张东" />
    </MemoryRouter>,
  );

  fireEvent.change(screen.getByLabelText('com_life_health'), { target: { value: '4' } });

  expect(screen.getByRole('button', { name: /com_life_enter_studio/ })).toBeEnabled();
});

test('首次建档只提交用户实际拨动的血条', () => {
  render(
    <MemoryRouter>
      <FirstArchiveSetup initialName="张东东" />
    </MemoryRouter>,
  );

  fireEvent.change(screen.getByLabelText('com_life_health'), { target: { value: '4' } });
  fireEvent.click(screen.getByRole('button', { name: /com_life_enter_studio/ }));

  expect(mockOnboardingMutate).toHaveBeenCalledWith(
    { archiveName: '张东东', dashboards: { health: 4 } },
    expect.any(Object),
  );
});

test('重新诊断也不会把缺省刻度补成用户回答', () => {
  render(
    <MemoryRouter>
      <FirstArchiveSetup initialName="张东" initialDashboards={{ health: 4 }} diagnostic />
    </MemoryRouter>,
  );

  fireEvent.click(screen.getByRole('button', { name: /com_life_save_snapshot/ }));

  expect(mockDiagnosticMutate).toHaveBeenCalledWith(
    { dashboards: { health: 4 } },
    expect.any(Object),
  );
});

test('关于我允许用 null 明确清除已保存文本', () => {
  mockArchiveData = {
    profile: { basics: { occupation: '顾问', city: '厦门' } },
  };
  render(<BasicsForm />);

  fireEvent.change(screen.getByLabelText('com_life_basics_occupation'), {
    target: { value: '' },
  });
  fireEvent.change(screen.getByLabelText('com_life_basics_city'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'com_life_basics_save' }));

  expect(mockBasicsMutate).toHaveBeenCalledWith(
    { occupation: null, city: null },
    expect.any(Object),
  );
});

test('关于我在前端拒绝不存在的公历日期', () => {
  render(<BasicsForm />);

  fireEvent.change(screen.getByLabelText('com_life_birth_year'), { target: { value: '2021' } });
  fireEvent.change(screen.getByLabelText('com_life_birth_month'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('com_life_birth_day'), { target: { value: '31' } });
  fireEvent.change(screen.getByLabelText('com_life_birth_gender'), {
    target: { value: 'male' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_life_basics_save' }));

  expect(mockBirthMutate).not.toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledWith({
    message: 'com_life_birth_invalid_date',
    status: 'error',
  });
});

// FB-003:量表歧义修复(以为 5 分是满分)。未拨动前不显示预设 5;拨动后显示 n/10;端点带数字。
test('FB-003:未拨动血条时显示「还没打分」,不把预设 5 当作用户答案', () => {
  render(
    <MemoryRouter>
      <FirstArchiveSetup initialName="张东" />
    </MemoryRouter>,
  );
  // 四条血条初始都未拨动 → 均显示未答态,页面上不出现独立的 "5"
  const unset = screen.getAllByText('com_life_bar_unset');
  expect(unset.length).toBe(4);
  expect(screen.queryByText('5')).toBeNull();
});

test('FB-003:拨动后显示带 /10 刻度的读数,端点带 0/10 数字', () => {
  render(
    <MemoryRouter>
      <FirstArchiveSetup initialName="张东" />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText('com_life_health'), { target: { value: '4' } });
  // 只这一条变为读数;其余仍未答
  expect(screen.getByText('com_life_bar_value')).toBeInTheDocument();
  expect(screen.getAllByText('com_life_bar_unset').length).toBe(3);
  // 端点用带数字的刻度键,替代无数字的旧标签
  expect(screen.getAllByText('com_life_bar_scale_low').length).toBe(4);
  expect(screen.getAllByText('com_life_bar_scale_high').length).toBe(4);
});
