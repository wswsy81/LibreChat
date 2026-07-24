/* eslint-disable i18next/no-literal-string */
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLocalize } from '~/hooks';
import PublicMistMap from './PublicMistMap';
import { HOUSES } from './LifeWheel';
import type { HouseId } from './LifeWheel';

/**
 * 公开首页 hero：左=承诺文案 + 选中块的三条未来线**示例**（脱敏占位）+ CTA；
 * 右=手绘迷雾舆图（四大块×三小块，12 块任点）。点一块换示例卡，注册带 entryHouse。
 * 真三条线在登录后由揭晓引擎按证据生成——这里只勾好奇，不假装算出本人结果。
 */

const DEFAULT_ISLAND: HouseId = 'h6';

interface SampleLine {
  readonly tag: string;
  readonly text: string;
}

const SAMPLE_LINES: Record<HouseId, readonly [string, string, string]> = {
  h1: [
    '照这样下去，别人眼里的你，还是那个「看不太透」的人。',
    '如果把一直藏着的那一面拿出来见一次光，局面会变。',
    '如果你真的按自己的样子活一次……',
  ],
  h2: [
    '照这样下去，钱还是月月过手，存不下的原因一直没变过。',
    '如果把「我不值这个价」那句话换掉，账本会跟着变。',
    '如果你真的开口要了那个数……',
  ],
  h3: [
    '照这样下去，想说的话烂在肚子里，收藏的课在吃灰。',
    '如果把「改天再说」换成今天说半句，事情会松动。',
    '如果那句一直没说出口的话真的说了……',
  ],
  h4: [
    '照这样下去，回家还是那顿沉默的饭，谁也不先开口。',
    '如果先问一句一直没问的事，桌上的空气会变。',
    '如果你真的离开——或者回去——那个家……',
  ],
  h5: [
    '照这样下去，心动还是只发生在别人的故事里。',
    '如果把周末那两小时还给真正想做的事，人会亮起来。',
    '如果你真的对那个人说了……',
  ],
  h6: [
    '照这样下去，还是每天救火，身体会先替你喊停。',
    '如果先停掉最耗神的那一件事——不是辞职，是那件小事——路会岔开。',
    '如果「换一种活法」这个念头真的落了地……',
  ],
  h7: [
    '照这样下去，你们还是「挺好的」，也只是「挺好的」。',
    '如果把那件一直绕开的事摆上桌，关系会换一档。',
    '如果你真的问出那句「我们算什么」……',
  ],
  h8: [
    '照这样下去，那件压在心口的事，还是谁也不提。',
    '如果先把一半的担子说出口，肩膀会轻一格。',
    '如果你真的把底牌摊开……',
  ],
  h9: [
    '照这样下去，那个地方还是只存在于收藏夹里。',
    '如果先去最近的那一站，世界会裂开一条缝。',
    '如果你真的换个地方重新开始……',
  ],
  h10: [
    '照这样下去，五年后你还是「有潜力」的那一个。',
    '如果把手里的东西拿出去见一次人，牌局会重洗。',
    '如果你真的走上那条没人看好的路……',
  ],
  h11: [
    '照这样下去，聚会照旧，散场后还是那阵空。',
    '如果主动约一次真想见的人，圈子会慢慢换血。',
    '如果你真的退出那个待腻了的群……',
  ],
  h12: [
    '照这样下去，那个声音还是只在失眠的夜里出现。',
    '如果每天留十分钟给自己，那个声音会开始说人话。',
    '如果你真的停下来，什么都不做一阵子……',
  ],
};

const LINE_TAGS = ['惯性线', '干预线', '断裂线'] as const;

function sampleLines(id: HouseId): readonly SampleLine[] {
  return SAMPLE_LINES[id].map((text, index) => ({ tag: LINE_TAGS[index], text }));
}

export default function PublicHero({
  children,
}: {
  children?: (selectedHouse: HouseId) => React.ReactNode;
}) {
  const localize = useLocalize();
  const [selectedId, setSelectedId] = useState<HouseId>(DEFAULT_ISLAND);
  const selected = HOUSES.find((house) => house.id === selectedId) ?? HOUSES[0];

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14">
      <section className="min-w-0">
        <p className="inline-flex border border-life-cinnabar/35 px-3 py-1.5 font-life-mono text-[10px] tracking-[0.13em] text-life-cinnabar sm:text-life-meta">
          {localize('com_life_public_kicker')}
        </p>
        <h1 className="mt-4 max-w-[15em] font-life-serif text-[28px] font-black leading-[1.3] sm:text-[36px] sm:leading-[1.25]">
          {localize('com_life_public_title')}
        </h1>
        <p className="mt-4 max-w-[30em] font-life-sans text-life-sm leading-7 text-life-muted dark:text-[#c8bdad] sm:text-life-body sm:leading-8">
          {localize('com_life_public_description')}
        </p>

        <div className="mt-6 border border-life-ink/45 bg-[#F7F4EB] p-5 dark:border-white/20 dark:bg-white/5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-life-serif text-life-lead font-black">{selected.publicName}</h2>
            <span className="flex-none border border-life-brass/50 px-2 py-0.5 font-life-mono text-[10px] tracking-[0.1em] text-life-brass">
              示例
            </span>
          </div>
          <ul className="mt-4 space-y-3">
            {sampleLines(selected.id).map((line) => (
              <li key={line.tag} className="flex gap-3">
                <span className="mt-[3px] flex-none font-life-mono text-[10px] tracking-[0.08em] text-life-cinnabar">
                  {line.tag}
                </span>
                <span className="font-life-kai text-life-sm leading-7 text-life-ink dark:text-[#e7ddcf]">
                  {line.text}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-life-rule pt-3 dark:border-white/10">
            <p className="font-life-mono text-[10.5px] leading-6 text-life-muted dark:text-[#a99f92]">
              示例仅示形态；你自己的三条线，从对话里长出来。
            </p>
            <Link
              to={`/register?entryHouse=${selected.id}`}
              className="inline-flex items-center gap-1 font-life-sans text-life-sm font-semibold text-life-moss underline decoration-life-moss/40 underline-offset-4 transition hover:text-life-moss-deep"
            >
              看你自己的「{selected.publicName}」
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {children?.(selected.id)}
      </section>

      <PublicMistMap selectedIsland={selectedId} onSelectIsland={setSelectedId} />
    </div>
  );
}
