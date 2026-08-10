/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
  useLocalize: () => (key: string) =>
    ({
      com_life_birth_unset: '不填',
      com_life_birth_pick: '请选择',
      com_life_basics_city: '当前居住城市',
      com_life_birth_city: '出生城市',
    })[key] ?? key,
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

test('首次进入同时提供自由聊天和领域模式', () => {
  render(
    <MemoryRouter>
      <FirstArchiveSetup />
    </MemoryRouter>,
  );

  expect(screen.getByRole('link', { name: /com_life_free_chat_action/ })).toHaveAttribute(
    'href',
    '/c/new',
  );
  expect(screen.getByText('com_life_or_choose_domain')).toBeInTheDocument();
  expect(screen.getByText('com_life_choose_house')).toBeInTheDocument();
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

test('“说件新事”不重复首次建档承诺，并沿用原来的人物档案名', () => {
  render(
    <MemoryRouter>
      <FirstArchiveSetup
        mode="new_matter"
        archiveName="修文"
        domainConversations={[{ entryHouse: 'h6', conversationId: 'work-conversation' }]}
      />
    </MemoryRouter>,
  );

  expect(screen.getByText('com_life_new_matter_title')).toBeInTheDocument();
  expect(screen.queryByText('com_life_setup_promise_title')).not.toBeInTheDocument();
  expect(screen.queryByText('com_life_setup_lines_title')).not.toBeInTheDocument();

  fireEvent.click(mapButton('com_life_map_house_h6') as HTMLButtonElement);
  expect(screen.getByText('com_life_new_matter_selected_existing')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /com_life_new_matter_resume/ }));

  expect(mockEnterHouse).toHaveBeenCalledWith({ archiveName: '修文', entryHouse: 'h6' });
});

test('“说件新事”选择没聊过的领域时从新的一页开始', () => {
  render(
    <MemoryRouter>
      <FirstArchiveSetup mode="new_matter" archiveName="修文" />
    </MemoryRouter>,
  );

  fireEvent.click(mapButton('com_life_map_house_h2') as HTMLButtonElement);
  expect(screen.getByText('com_life_new_matter_selected_new')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /com_life_new_matter_start/ }));

  expect(mockEnterHouse).toHaveBeenCalledWith({ archiveName: '修文', entryHouse: 'h2' });
});

test('关于我允许用 null 明确清除已保存文本', () => {
  mockArchiveData = {
    profile: { basics: { occupation: '顾问', city: '厦门' } },
  };
  render(<BasicsForm />);

  fireEvent.change(screen.getByLabelText('com_life_basics_occupation'), {
    target: { value: '' },
  });
  fireEvent.change(screen.getByLabelText('当前居住城市'), { target: { value: '' } });
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
  fireEvent.change(screen.getByLabelText('当前居住城市'), {
    target: { value: '杭州' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'com_life_basics_save' }));

  expect(mockBasicsMutate).toHaveBeenCalledWith({ age: '38', city: '杭州' }, expect.any(Object));
});

test('出生日期与时间统一使用普通选择提示', () => {
  render(<BasicsForm />);

  const birthFields = screen.getByRole('group', { name: 'com_life_birth_legend' });
  expect(screen.queryByText('不填')).not.toBeInTheDocument();
  expect(within(birthFields).getAllByText('请选择')).toHaveLength(5);
  expect(screen.queryByText('时辰不确定')).not.toBeInTheDocument();
  expect(screen.queryByText('分钟不确定')).not.toBeInTheDocument();
});

test('出生信息复用基本资料性别且不重复展示', () => {
  mockArchiveData = {
    profile: { basics: { gender: '男' } },
  };
  render(<BasicsForm />);

  expect(screen.getByLabelText('com_auth_gender_optional')).toHaveValue('男');
  expect(screen.queryByLabelText('com_life_birth_gender')).not.toBeInTheDocument();
  expect(screen.getByLabelText('当前居住城市')).toBeInTheDocument();
  expect(screen.getByLabelText('出生城市')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('com_life_birth_year'), { target: { value: '1981' } });
  fireEvent.change(screen.getByLabelText('com_life_birth_month'), { target: { value: '12' } });
  fireEvent.change(screen.getByLabelText('com_life_birth_day'), { target: { value: '23' } });
  fireEvent.click(screen.getByRole('button', { name: 'com_life_basics_save' }));

  expect(mockBirthMutate).toHaveBeenCalledWith(
    expect.objectContaining({ gender: 'male' }),
    expect.any(Object),
  );
});

test('关于我在前端拒绝不存在的公历日期', () => {
  mockArchiveData = {
    profile: { basics: { gender: '男' } },
  };
  render(<BasicsForm />);

  fireEvent.change(screen.getByLabelText('com_life_birth_year'), { target: { value: '2021' } });
  fireEvent.change(screen.getByLabelText('com_life_birth_month'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('com_life_birth_day'), { target: { value: '31' } });
  fireEvent.click(screen.getByRole('button', { name: 'com_life_basics_save' }));

  expect(mockBirthMutate).not.toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledWith({
    message: 'com_life_birth_invalid_date',
    status: 'error',
  });
});
