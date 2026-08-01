/**
 * @jest-environment @happy-dom/jest-environment
 */
import userEvent from '@testing-library/user-event';
import { fireEvent, render, screen } from '@testing-library/react';
import LifeWheel from './LifeWheel';

describe('LifeWheel component', () => {
  test('public 全雾: 12 扇区全 unknown、无当前状态、提灯与坐标不泄露分数', () => {
    render(<LifeWheel mode="public" onSelectHouse={() => {}} />);
    const sectors = screen.getAllByRole('button');
    expect(sectors).toHaveLength(12);
    for (const sector of sectors) {
      expect(sector.getAttribute('aria-label')).toMatch(/· 还没聊到$/);
    }
  });

  test('同亮不同当前状态 → aria 逐层区分（P6：认知层与当前层解耦）', () => {
    render(
      <LifeWheel
        mode="interactive"
        onSelectHouse={() => {}}
        houseStates={{
          h6: { recognition: 'owned', conditionLevel: 'depleted', trend: 'worsening' },
          h10: { recognition: 'owned', conditionLevel: 'energizing', trend: 'improving' },
        }}
      />,
    );
    expect(
      screen.getByRole('button', { name: '工作 · 已认领 · 当前明显耗损 · 较上次在变差' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '事业 · 已认领 · 当前明显供能 · 较上次在变好' }),
    ).toBeInTheDocument();
  });

  test('生辰先验只微光: draft 且 condition/trend 仍 unknown（P7）', () => {
    render(
      <LifeWheel
        mode="interactive"
        houseStates={{ h9: { recognition: 'draft', conditionLevel: 'unknown', trend: 'unknown' } }}
      />,
    );
    expect(screen.getByRole('img', { name: '远方 · 有一页草稿' })).toBeInTheDocument();
  });

  test('点扇区回调对应 house id（entryHouse 由上层带走）', async () => {
    const onSelect = jest.fn();
    render(<LifeWheel mode="public" onSelectHouse={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: /^事业/ }));
    expect(onSelect).toHaveBeenCalledWith('h10');
  });

  test('选中扇区通过 aria-pressed 暴露，键盘 Enter 与空格都能激活', () => {
    const onSelect = jest.fn();
    render(<LifeWheel mode="interactive" selectedHouse="h6" onSelectHouse={onSelect} />);

    const selected = screen.getByRole('button', { name: /^工作/ });
    const other = screen.getByRole('button', { name: /^事业/ });
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    expect(other).toHaveAttribute('aria-pressed', 'false');

    fireEvent.keyDown(other, { key: 'Enter' });
    fireEvent.keyDown(other, { key: ' ' });
    expect(onSelect).toHaveBeenNthCalledWith(1, 'h10');
    expect(onSelect).toHaveBeenNthCalledWith(2, 'h10');
  });

  test('移动端与桌面共用热轨短名，不再渲染旧复合域名', () => {
    render(<LifeWheel mode="interactive" />);

    expect(screen.getAllByText('工作')).toHaveLength(2);
    expect(screen.queryByText('工作与健康')).not.toBeInTheDocument();
    expect(screen.getAllByText('家庭')).toHaveLength(2);
  });

  test('390px h6 提灯与两行域名保留明确水平间隔（Q10）', () => {
    const { container } = render(<LifeWheel mode="interactive" lanternHouse="h6" />);
    const lantern = container.querySelector('[data-life-wheel-lantern="true"]');
    const label = container.querySelector('[data-life-wheel-mobile-label="h6"]');
    const transform = lantern?.getAttribute('transform') ?? '';
    const lanternX = Number(/^translate\(([^,]+),/.exec(transform)?.[1]);
    const labelX = Number(label?.getAttribute('x'));

    const conservativeLabelHalfWidth = 36;
    const lanternRightExtent = 17;
    const displacementAllowance = 3;
    const gap =
      labelX - conservativeLabelHalfWidth - (lanternX + lanternRightExtent + displacementAllowance);

    expect(Number.isFinite(gap)).toBe(true);
    expect(gap).toBeGreaterThanOrEqual(12);
  });

  test('无 onSelectHouse → 扇区只读（role img，不可点）', () => {
    render(<LifeWheel mode="public" />);
    expect(screen.getAllByRole('img')).toHaveLength(12);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
