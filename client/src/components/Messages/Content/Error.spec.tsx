import React from 'react';
import { render, screen } from '@testing-library/react';
import Error from './Error';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => `localized:${key}`,
}));

describe('message error display', () => {
  it('does not expose raw HTTP or architecture errors', () => {
    render(
      <Error text="An error occurred while processing the request: 409 conversationId 未绑定权威领域" />,
    );

    expect(
      screen.getByText('这一回合没有完成。先别重说，直接重试这一条就行。'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/409|conversationId|权威领域/)).not.toBeInTheDocument();
  });

  it('keeps known localized product errors actionable', () => {
    render(<Error text='{"type":"invalid_request_error"}' />);

    expect(screen.getByText('localized:com_error_invalid_request_error')).toBeInTheDocument();
  });
});
