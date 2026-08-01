import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLocalize } from '~/hooks';
import type { TranslationKeys } from '~/hooks';
import PublicMistMap, { PUBLIC_MAP_LABEL_KEYS } from './PublicMistMap';
import type { HouseId } from './LifeWheel';

/**
 * 公开首页 hero：左=承诺文案 + 选中块的三条未来线**示例**（脱敏占位）+ CTA；
 * 右=手绘迷雾舆图（四大块×三小块，12 块任点）。点一块换示例卡，注册带 entryHouse。
 * 真三条线在登录后由揭晓引擎按证据生成——这里只勾好奇，不假装算出本人结果。
 */

const DEFAULT_ISLAND: HouseId = 'h6';

const SAMPLE_LINE_KEYS: Record<
  HouseId,
  readonly [TranslationKeys, TranslationKeys, TranslationKeys]
> = {
  h1: ['com_life_public_sample_h1_1', 'com_life_public_sample_h1_2', 'com_life_public_sample_h1_3'],
  h2: ['com_life_public_sample_h2_1', 'com_life_public_sample_h2_2', 'com_life_public_sample_h2_3'],
  h3: ['com_life_public_sample_h3_1', 'com_life_public_sample_h3_2', 'com_life_public_sample_h3_3'],
  h4: ['com_life_public_sample_h4_1', 'com_life_public_sample_h4_2', 'com_life_public_sample_h4_3'],
  h5: ['com_life_public_sample_h5_1', 'com_life_public_sample_h5_2', 'com_life_public_sample_h5_3'],
  h6: ['com_life_public_sample_h6_1', 'com_life_public_sample_h6_2', 'com_life_public_sample_h6_3'],
  h7: ['com_life_public_sample_h7_1', 'com_life_public_sample_h7_2', 'com_life_public_sample_h7_3'],
  h8: ['com_life_public_sample_h8_1', 'com_life_public_sample_h8_2', 'com_life_public_sample_h8_3'],
  h9: ['com_life_public_sample_h9_1', 'com_life_public_sample_h9_2', 'com_life_public_sample_h9_3'],
  h10: [
    'com_life_public_sample_h10_1',
    'com_life_public_sample_h10_2',
    'com_life_public_sample_h10_3',
  ],
  h11: [
    'com_life_public_sample_h11_1',
    'com_life_public_sample_h11_2',
    'com_life_public_sample_h11_3',
  ],
  h12: [
    'com_life_public_sample_h12_1',
    'com_life_public_sample_h12_2',
    'com_life_public_sample_h12_3',
  ],
};

/** 前台名必须与报告里的三条线一字不差:惯性/干预/断裂是内部术语,不上前台。 */
const LINE_TAG_KEYS = [
  'com_life_line_inertia',
  'com_life_line_intervention',
  'com_life_line_rupture',
] as const satisfies readonly TranslationKeys[];

export default function PublicHero({
  children,
}: {
  children?: (selectedHouse: HouseId) => React.ReactNode;
}) {
  const localize = useLocalize();
  const [selectedId, setSelectedId] = useState<HouseId>(DEFAULT_ISLAND);
  const selectedDisplayName = localize(PUBLIC_MAP_LABEL_KEYS[selectedId]);

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14">
      <section className="min-w-0">
        <p className="inline-flex border border-life-cinnabar/35 px-3 py-1.5 font-life-mono text-life-meta tracking-[0.13em] text-life-cinnabar">
          {localize('com_life_public_kicker')}
        </p>
        <h1 className="mt-4 max-w-[15em] font-life-serif text-life-title font-black sm:text-life-display">
          {localize('com_life_public_title')}
        </h1>
        <p className="mt-4 max-w-[30em] font-life-sans text-life-sm leading-7 text-life-muted dark:text-[#c8bdad] sm:text-life-body sm:leading-8">
          {localize('com_life_public_description')}
        </p>

        <div className="mt-6 border border-life-ink/45 bg-[#F7F4EB] p-5 dark:border-white/20 dark:bg-white/5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-life-serif text-life-lead font-black">{selectedDisplayName}</h2>
            <span className="flex-none border border-life-brass/50 px-2 py-0.5 font-life-mono text-life-meta tracking-[0.1em] text-life-brass">
              {localize('com_life_public_example')}
            </span>
          </div>
          <ul className="mt-4 space-y-3">
            {SAMPLE_LINE_KEYS[selectedId].map((textKey, index) => (
              <li key={LINE_TAG_KEYS[index]} className="flex gap-3">
                <span className="mt-[3px] flex-none font-life-mono text-life-meta tracking-[0.08em] text-life-cinnabar">
                  {localize(LINE_TAG_KEYS[index])}
                </span>
                <span className="font-life-kai text-life-sm leading-7 text-life-ink dark:text-[#e7ddcf]">
                  {localize(textKey)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-life-rule pt-3 dark:border-white/10">
            <p className="font-life-mono text-life-meta leading-6 text-life-muted dark:text-[#a99f92]">
              {localize('com_life_line_sample_note')}
            </p>
            <Link
              to={`/register?entryHouse=${selectedId}`}
              className="inline-flex items-center gap-1 font-life-sans text-life-sm font-semibold text-life-moss underline decoration-life-moss/40 underline-offset-4 transition hover:text-life-moss-deep"
            >
              {localize('com_life_public_see_yours', { 0: selectedDisplayName })}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {children?.(selectedId)}
      </section>

      <PublicMistMap selectedIsland={selectedId} onSelectIsland={setSelectedId} />
    </div>
  );
}
