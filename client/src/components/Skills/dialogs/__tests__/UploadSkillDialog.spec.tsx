import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type { FileConfigInput } from 'librechat-data-provider';
import UploadSkillDialog from '../UploadSkillDialog';

const mockMutate = jest.fn();
const mockNavigate = jest.fn();
const mockSetIsOpen = jest.fn();
const mockShowToast = jest.fn();
const megabyte = 1024 * 1024;
let mockFileConfigInput: FileConfigInput | undefined = {
  skills: {
    fileSizeLimit: 1,
  },
};

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock(
  '@librechat/client',
  () => {
    const React = jest.requireActual<typeof import('react')>('react');
    return {
      OGDialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
        open ? React.createElement('div', null, children) : null,
      OGDialogContent: ({ children }: { children: ReactNode }) =>
        React.createElement('div', { role: 'dialog' }, children),
      Spinner: () => React.createElement('div', { 'data-testid': 'spinner' }),
      useToastContext: () => ({
        showToast: mockShowToast,
      }),
    };
  },
  { virtual: true },
);

jest.mock('~/data-provider', () => ({
  useGetFileConfig: ({ select }: { select?: (data: FileConfigInput | undefined) => unknown }) => ({
    data: select != null ? select(mockFileConfigInput) : mockFileConfigInput,
  }),
  useImportSkillMutation: () => ({
    mutate: mockMutate,
    isLoading: false,
  }),
}));

jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string, params?: Record<string, string | number | undefined>): string => {
      const translations: Record<string, string> = {
        com_ui_skill_upload_title: 'Upload skill',
        com_ui_skill_upload_drag: 'Drag and drop or click to upload',
        com_ui_skill_upload_requirements: 'File requirements',
        com_ui_skill_upload_req_md:
          '.md file must contain skill name and description formatted in YAML',
        com_ui_skill_upload_req_zip: '.zip or .skill file must include a SKILL.md file',
        com_ui_skill_upload_req_size: `File size must not exceed ${params?.[0]} MB`,
        com_ui_skill_upload_size_error: `Skill import must not exceed ${params?.[0]} MB`,
        com_ui_skill_created: 'Skill created',
        com_ui_create_skill_upload_error: 'Failed to read the uploaded file',
      };
      return translations[key] ?? key;
    },
}));

jest.mock('~/utils', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
}));

function getFileInput(): HTMLInputElement {
  const dialog = screen.getByRole('dialog');
  const input = within(dialog).queryByLabelText<HTMLInputElement>(
    'Drag and drop or click to upload',
  );
  if (input == null) {
    throw new Error('Upload input was not rendered');
  }
  return input;
}

function makeSkillFile(name: string, size: number): File {
  const file = new File(['skill'], name, { type: 'application/zip' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('UploadSkillDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFileConfigInput = {
      skills: {
        fileSizeLimit: 1,
      },
    };
  });

  it('renders the configured skill import size limit', () => {
    render(<UploadSkillDialog isOpen={true} setIsOpen={mockSetIsOpen} />);

    expect(screen.getByText('File size must not exceed 1 MB')).toBeInTheDocument();
  });

  it('renders fractional configured skill import size limits exactly', () => {
    mockFileConfigInput = {
      skills: {
        fileSizeLimit: 1.06,
      },
    };

    render(<UploadSkillDialog isOpen={true} setIsOpen={mockSetIsOpen} />);

    expect(screen.getByText('File size must not exceed 1.06 MB')).toBeInTheDocument();
  });

  it('rejects files above the configured skill import limit before upload', async () => {
    const user = userEvent.setup();
    render(<UploadSkillDialog isOpen={true} setIsOpen={mockSetIsOpen} />);
    const file = makeSkillFile('too-large.zip', megabyte + 1);

    await user.upload(getFileInput(), file);

    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith({
      status: 'error',
      message: 'Skill import must not exceed 1 MB',
    });
  });

  it('uploads files exactly at the configured skill import limit', async () => {
    const user = userEvent.setup();
    const appendSpy = jest.spyOn(FormData.prototype, 'append');
    render(<UploadSkillDialog isOpen={true} setIsOpen={mockSetIsOpen} />);
    const file = makeSkillFile('exact-limit.skill', megabyte);

    await user.upload(getFileInput(), file);

    expect(mockShowToast).not.toHaveBeenCalled();
    expect(appendSpy).toHaveBeenCalledWith('file', file, file.name);
    expect(mockMutate).toHaveBeenCalledWith(expect.any(FormData));
    appendSpy.mockRestore();
  });

  it('uploads files under the configured skill import limit', async () => {
    const user = userEvent.setup();
    const appendSpy = jest.spyOn(FormData.prototype, 'append');
    render(<UploadSkillDialog isOpen={true} setIsOpen={mockSetIsOpen} />);
    const file = makeSkillFile('small.skill', 1024);

    await user.upload(getFileInput(), file);

    expect(mockShowToast).not.toHaveBeenCalled();
    expect(appendSpy).toHaveBeenCalledWith('file', file, file.name);
    expect(mockMutate).toHaveBeenCalledWith(expect.any(FormData));
    appendSpy.mockRestore();
  });
});
