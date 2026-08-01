/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FirstArchiveSetup from '../FirstArchiveSetup';
import BasicsForm from '../BasicsForm';

const mockEnterHouse = jest.fn();
const mockBasicsMutate = jest.fn();
const mockBirthMutate = jest.fn();
const mockToast = jest.fn();

let mockArchiveData: Record<string, unknown> | undefined;

const mapButton = (label: string) =>
  screen
    .getAllByText(label)
    .map((node) => node.closest('button'))
    .find((node): node is HTMLButtonElement => node instanceof HTMLButtonElement);

jest.mock('@librechat/client', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  useToastContext: () => ({ showToast: mockToast }),
}));

jest.mock('~/data-provider', () => ({
  useLifeArchiveQuery: () => ({ data: mockArchiveData }),
  useLifeBasicsMutation: () => ({ mutate: mockBasicsMutate, isLoading: false }),
  useLifeBirthMutation: () => ({ mutate: mockBirthMutate, isLoading: false }),
}));

jest.mock('../../hooks/useEntry', () => () => ({
  enterHouse: mockEnterHouse,
  isLoading: false,
  error: null,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/utils/track', () => ({ track: jest.fn() }));
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 6, 25, 14, 36));
  mockArchiveData = { profile: { basics: {} } };
});

afterEach(() => {
  jest.useRealTimers();
});

test('首次建档未选领域时不能继续', () => {
  render(
    <MemoryRouter>
      <FirstArchiveSetup />
    </MemoryRouter>,
  );

  expect(screen.getByRole('button', { name: /com_life_enter_studio/ })).toBeDisabled();
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
});

test('首次进入只选领域，不显示存档名输入框', () => {
  render(
    <MemoryRouter>
      <FirstArchiveSetup />
    </MemoryRouter>,
  );

  expect(screen.getByText('com_life_choose_house')).toBeInTheDocument();
  expect(screen.queryByText('com_life_archive_name')).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

test('首次建档按所选领域和本地分钟自动命名', () => {
  render(
    <MemoryRouter>
      <FirstArchiveSetup />
    </MemoryRouter>,
  );

  fireEvent.click(mapButton('com_life_map_house_h6') as HTMLButtonElement);
  fireEvent.click(screen.getByRole('button', { name: /com_life_enter_studio/ }));

  expect(mockEnterHouse).toHaveBeenCalledWith({
    archiveName: 'com_life_map_house_h6 · 2026-07-25 14:36',
    entryHouse: 'h6',
  });
});

test('公开页带来的 entryHouse 会预选但仍由用户确认提交', () => {
  render(
    <MemoryRouter>
      <FirstArchiveSetup initialEntryHouse="h10" />
    </MemoryRouter>,
  );

  expect(screen.getByRole('button', { name: /com_life_enter_studio/ })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: /com_life_enter_studio/ }));

  expect(mockEnterHouse).toHaveBeenCalledWith({
    archiveName: 'com_life_map_house_h10 · 2026-07-25 14:36',
    entryHouse: 'h10',
  });
});

test('入口只开放财务、工作、情感、事业，健康单独留在雾里', () => {
  render(
    <MemoryRouter>
      <FirstArchiveSetup />
    </MemoryRouter>,
  );

  for (const key of ['h2', 'h6', 'h7', 'h10']) {
    expect(mapButton(`com_life_map_house_${key}`)).not.toBeDisabled();
  }
  expect(mapButton('com_life_map_health')).toBeDisabled();
  expect(mapButton('com_life_map_house_h1')).toBeDisabled();
});

test('承诺屏五句与三张前台示例卡同屏，内部线名不出现', () => {
  render(
    <MemoryRouter>
      <FirstArchiveSetup />
    </MemoryRouter>,
  );

  for (const key of [
    'com_life_setup_promise_1',
    'com_life_setup_promise_2',
    'com_life_setup_promise_3',
    'com_life_setup_promise_4',
    'com_life_setup_promise_5',
    'com_life_line_inertia',
    'com_life_line_intervention',
    'com_life_line_rupture',
    'com_life_setup_line_inertia_help',
    'com_life_setup_line_intervention_help',
    'com_life_setup_line_rupture_help',
  ]) {
    expect(screen.getByText(key)).toBeInTheDocument();
  }
  expect(screen.queryByText('惯性线')).not.toBeInTheDocument();
  expect(screen.queryByText('干预线')).not.toBeInTheDocument();
  expect(screen.queryByText('断裂线')).not.toBeInTheDocument();
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

test('关于我可修改注册时填写的性别、年龄和城市', () => {
  mockArchiveData = {
    profile: { basics: { gender: '女', age: '30多岁', city: '厦门' } },
  };
  render(<BasicsForm />);

  expect(screen.getByLabelText('com_auth_gender_optional')).toHaveValue('女');
  expect(screen.getByLabelText('com_auth_age_optional')).toHaveValue('30多岁');
  fireEvent.change(screen.getByLabelText('com_auth_age_optional'), {
    target: { value: '38' },
  });
  fireEvent.change(screen.getByLabelText('com_life_basics_city'), {
    target: { value: '杭州' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_life_basics_save' }));

  expect(mockBasicsMutate).toHaveBeenCalledWith({ age: '38', city: '杭州' }, expect.any(Object));
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
