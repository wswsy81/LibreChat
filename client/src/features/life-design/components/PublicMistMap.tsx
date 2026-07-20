/* eslint-disable i18next/no-literal-string */
import { useLocalize } from '~/hooks';

type TerritoryState = 'dark' | 'dim' | 'lit';

const TERRITORIES: ReadonlyArray<{
  label: string;
  x: number;
  y: number;
  state: TerritoryState;
}> = [
  { label: '日常与身体', x: 150, y: 130, state: 'dim' },
  { label: '独处与内心', x: 222, y: 210, state: 'dark' },
  { label: '钱与资源', x: 512, y: 130, state: 'lit' },
  { label: '事业与公众', x: 664, y: 168, state: 'dim' },
  { label: '自我呈现', x: 560, y: 268, state: 'dark' },
  { label: '创造与玩', x: 170, y: 470, state: 'dark' },
  { label: '学习与同行', x: 258, y: 520, state: 'dim' },
  { label: '家与根', x: 520, y: 470, state: 'dark' },
  { label: '亲密与伙伴', x: 630, y: 500, state: 'lit' },
  { label: '朋友与社群', x: 560, y: 600, state: 'dark' },
];

const TERRITORY_STYLE: Record<TerritoryState, { fill: string; stroke: string; text: string }> = {
  dark: { fill: 'rgba(23,32,26,0.01)', stroke: 'rgba(23,32,26,0.18)', text: '#847d6e' },
  dim: { fill: 'rgba(128,96,45,0.11)', stroke: 'rgba(128,96,45,0.55)', text: '#80602D' },
  lit: { fill: 'rgba(53,91,71,0.18)', stroke: '#355B47', text: '#17201A' },
};

const TERRITORY_STATE_LABEL: Record<TerritoryState, string> = {
  dark: '还没聊到',
  dim: '有一页草稿',
  lit: '已认领',
};

function territoryPath(x: number, y: number) {
  const r = 44;
  return `M ${x - r},${y} Q ${x - r * 0.7},${y - r * 0.9} ${x},${y - r * 0.8} Q ${x + r * 0.9},${y - r * 0.6} ${x + r * 0.85},${y + r * 0.2} Q ${x + r * 0.6},${y + r * 0.9} ${x - r * 0.2},${y + r * 0.85} Q ${x - r * 0.95},${y + r * 0.7} ${x - r},${y} Z`;
}

function Territory({ label, x, y, state }: (typeof TERRITORIES)[number]) {
  const style = TERRITORY_STYLE[state];
  return (
    <g aria-label={`${label} · ${TERRITORY_STATE_LABEL[state]}`}>
      {state === 'dark' && <ellipse cx={x} cy={y} rx="64" ry="42" fill="url(#public-map-fog)" />}
      <path
        d={territoryPath(x, y)}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth="1.5"
        strokeDasharray={state === 'dark' ? '3 5' : undefined}
        filter="url(#public-map-wobble)"
      />
      <text
        x={x}
        y={y + 4}
        textAnchor="middle"
        fill={style.text}
        className="font-life-serif text-[13px] font-semibold"
      >
        {label}
      </text>
    </g>
  );
}

export default function PublicMistMap() {
  const localize = useLocalize();

  return (
    <figure className="relative overflow-hidden border border-life-ink/45 bg-[#F7F4EB] p-4 shadow-[0_18px_70px_rgba(23,32,26,0.08)] dark:border-white/20 sm:p-6">
      <div className="flex items-baseline justify-between gap-4 border-b border-life-rule pb-3 font-life-mono text-[10px] tracking-[0.12em] text-life-muted">
        <strong className="font-semibold text-life-brass">
          {localize('com_life_public_map_kicker')}
        </strong>
        <span>ATLAS / 迷雾图</span>
      </div>
      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-life-serif text-life-lead font-black">
            {localize('com_life_public_map_title')}
          </h2>
          <p className="mt-1 max-w-[28em] font-life-kai text-life-sm leading-7 text-life-muted">
            {localize('com_life_public_map_description')}
          </p>
        </div>
        <span className="hidden flex-none font-life-mono text-[9px] tracking-[0.12em] text-life-cinnabar sm:block">
          YOU ARE HERE
        </span>
      </div>

      <div className="relative mt-5 grid grid-cols-2 gap-3 sm:hidden" aria-hidden="true">
        <div className="min-h-[126px] rounded-[46%_54%_42%_58%/38%_48%_52%_62%] border border-life-ink/25 bg-[#E9E3D5]/65 px-4 py-5">
          <p className="font-life-mono text-[9px] tracking-[0.15em] text-life-brass">健康大洲</p>
          <p className="mt-3 font-life-serif text-[13px] font-semibold text-life-brass">
            ◐ 日常与身体
          </p>
          <p className="mt-2 font-life-serif text-[12px] text-life-muted">○ 独处与内心</p>
        </div>
        <div className="relative min-h-[126px] rounded-[55%_45%_58%_42%/48%_38%_62%_52%] border border-life-moss/55 bg-life-moss/10 px-4 py-5">
          <p className="font-life-mono text-[9px] tracking-[0.15em] text-life-brass">工作大洲</p>
          <p className="mt-3 font-life-serif text-[13px] font-semibold text-life-moss">
            ● 钱与资源
          </p>
          <p className="mt-2 font-life-serif text-[12px] text-life-brass">◐ 事业与公众</p>
          <span className="absolute -bottom-2 right-2 bg-life-paper px-2 py-1 font-life-mono text-[8px] tracking-[0.08em] text-life-cinnabar">
            ◇ 您在此处
          </span>
        </div>
        <div className="min-h-[126px] rounded-[50%_50%_46%_54%/44%_56%_44%_56%] border border-life-ink/20 bg-[#E9E3D5]/55 px-4 py-5">
          <p className="font-life-mono text-[9px] tracking-[0.15em] text-life-brass">玩之大洲</p>
          <p className="mt-3 font-life-serif text-[12px] text-life-muted">○ 创造与玩</p>
          <p className="mt-2 font-life-serif text-[13px] font-semibold text-life-brass">
            ◐ 学习与同行
          </p>
        </div>
        <div className="min-h-[126px] rounded-[42%_58%_52%_48%/56%_44%_58%_42%] border border-life-moss/45 bg-life-moss/10 px-4 py-5">
          <p className="font-life-mono text-[9px] tracking-[0.15em] text-life-brass">爱之大洲</p>
          <p className="mt-3 font-life-serif text-[13px] font-semibold text-life-moss">
            ● 亲密与伙伴
          </p>
          <p className="mt-2 font-life-serif text-[12px] text-life-muted">○ 家与根</p>
        </div>
      </div>

      <svg
        viewBox="0 0 780 670"
        role="img"
        aria-label={localize('com_life_public_map_aria')}
        className="mt-3 hidden h-auto w-full sm:block"
      >
        <defs>
          <filter id="public-map-wobble" x="-8%" y="-8%" width="116%" height="116%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.014"
              numOctaves="2"
              seed="7"
              result="noise"
            />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="4.5" />
          </filter>
          <filter id="public-map-grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.55 0 0 0 0 0.5 0 0 0 0 0.4 0 0 0 0.045 0"
            />
          </filter>
          <radialGradient id="public-map-fog">
            <stop offset="0%" stopColor="#DAD3C2" stopOpacity="0.88" />
            <stop offset="100%" stopColor="#F2EFE6" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="public-map-glow">
            <stop offset="0%" stopColor="#E8B84B" stopOpacity="0.62" />
            <stop offset="100%" stopColor="#E8B84B" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="780" height="670" fill="#F2EFE6" />
        <rect width="780" height="670" filter="url(#public-map-grain)" />
        <g
          fill="rgba(229,223,209,0.52)"
          stroke="#17201A"
          strokeWidth="1.6"
          filter="url(#public-map-wobble)"
        >
          <path d="M 60,120 Q 40,80 90,64 Q 150,40 226,58 Q 296,72 312,130 Q 326,190 282,236 Q 240,282 168,278 Q 92,274 66,214 Q 48,168 60,120 Z" />
          <path d="M 440,80 Q 492,32 584,42 Q 682,52 722,112 Q 756,170 734,244 Q 710,318 620,330 Q 524,340 470,284 Q 420,232 424,158 Q 428,106 440,80 Z" />
          <path d="M 88,470 Q 60,420 116,398 Q 190,372 262,392 Q 330,410 336,478 Q 340,544 278,576 Q 208,608 136,580 Q 76,554 78,506 Q 78,486 88,470 Z" />
          <path d="M 430,430 Q 470,384 556,390 Q 650,396 700,450 Q 748,502 728,576 Q 706,652 616,668 Q 520,682 462,626 Q 408,574 412,500 Q 414,458 430,430 Z" />
        </g>
        <g fill="#80602D" className="font-life-mono text-[12px] tracking-[0.18em]">
          <text x="88" y="96">
            健康大洲
          </text>
          <text x="478" y="70">
            工作大洲
          </text>
          <text x="110" y="426">
            玩之大洲
          </text>
          <text x="456" y="420">
            爱之大洲
          </text>
        </g>
        <g stroke="rgba(23,32,26,0.1)" strokeWidth="1" fill="none">
          <path d="M 350,330 q 14,-6 28,0 M 60,340 q 14,-6 28,0 M 660,340 q 14,-6 28,0 M 350,620 q 14,-6 28,0" />
          <path d="M 376,344 q 11,-5 22,0 M 96,354 q 11,-5 22,0 M 686,354 q 11,-5 22,0" />
        </g>
        {TERRITORIES.map((territory) => (
          <Territory key={territory.label} {...territory} />
        ))}
        <path
          d="M 530,155 Q 574,186 612,188"
          fill="none"
          stroke="rgba(185,72,49,0.5)"
          strokeWidth="1"
          strokeDasharray="3 6"
        />
        <g transform="translate(580,178)" aria-label="您在此处">
          <circle cx="0" cy="-14" r="5.2" fill="none" stroke="#17201A" strokeWidth="1.6" />
          <path
            d="M 0,-9 L 0,6 M 0,-4 L -7,2 M 0,-4 L 8,-1 M 0,6 L -6,16 M 0,6 L 6,16"
            fill="none"
            stroke="#17201A"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <rect x="10" y="-4" width="7" height="9" rx="1.6" fill="#B94831" />
          <circle cx="13.5" cy="0.5" r="22" fill="url(#public-map-glow)" />
          <text
            x="-2"
            y="32"
            className="font-life-mono text-[9px] tracking-[0.12em]"
            fill="#B94831"
          >
            您在此处
          </text>
        </g>
        <g
          transform="translate(714,55)"
          stroke="#80602D"
          fill="none"
          strokeWidth="1"
          opacity="0.72"
        >
          <circle r="18" />
          <circle r="2.5" fill="#80602D" />
          <path d="M 0,-24 L 4,-6 L 0,-10 L -4,-6 Z" fill="#B94831" stroke="none" />
          <path d="M 0,24 L 0,10 M -24,0 L -10,0 M 24,0 L 10,0" />
        </g>
      </svg>

      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-life-rule pt-3 font-life-mono text-[9.5px] tracking-[0.06em] text-life-muted">
        <span className="text-life-moss">● 亮 · 已认领</span>
        <span className="text-life-brass">◐ 微光 · 有草稿</span>
        <span>○ 暗 · 还没聊到</span>
      </div>
      <figcaption className="mt-3 font-life-kai text-life-sm leading-7 text-life-brass">
        {localize('com_life_public_map_caption')}
      </figcaption>
    </figure>
  );
}
