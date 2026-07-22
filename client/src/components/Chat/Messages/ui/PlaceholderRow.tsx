import { memo } from 'react';

import ResponseProgress from './ResponseProgress';

/** Height matches the SubRow action buttons row (31px) — keep in sync with HoverButtons */
const PlaceholderRow = memo(function PlaceholderRow({
  showProgress = false,
}: {
  showProgress?: boolean;
}) {
  if (showProgress) {
    return <ResponseProgress />;
  }
  return <div className="mt-1 h-[31px] bg-transparent" />;
});
PlaceholderRow.displayName = 'PlaceholderRow';

export default PlaceholderRow;
