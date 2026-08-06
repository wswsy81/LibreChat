import { render } from '@testing-library/react';
import SplitText from './SplitText';

describe('SplitText', () => {
  it('renders emojis correctly', () => {
    const emojis = ['🚧', '❤️‍🔥', '💜', '🦎', '❌', '✅', '⚠️'];
    const originalText = emojis.join('');

    const { container } = render(<SplitText text={originalText} />);
    const textSpans = container.querySelectorAll('p > span > span.inline-block');

    // Reconstruct the text by joining all span contents
    const reconstructedText = Array.from(textSpans)
      .map((span) => span.textContent)
      .join('')
      .trim();
    // Compare the reconstructed text with the original
    expect(reconstructedText).toBe(originalText);

    // Check the first character specifically as the reconstructed text could hide issues
    for (let i = 0; i < emojis.length; i++) {
      expect(Array.from(textSpans)[i].textContent).toBe(emojis[i]);
    }
  });

  it('allows long text without spaces to wrap inside its container', () => {
    const { container } = render(
      <SplitText text="是什么把你带到这里来的？从哪儿说起都行" className="w-full max-w-full" />,
    );

    const paragraph = container.querySelector('p.split-parent');
    const word = paragraph?.querySelector(':scope > span');

    expect(paragraph).toHaveClass('block', 'w-full', 'max-w-full');
    expect(word).toHaveStyle({
      maxWidth: '100%',
      overflowWrap: 'anywhere',
      whiteSpace: 'normal',
    });
  });
});
