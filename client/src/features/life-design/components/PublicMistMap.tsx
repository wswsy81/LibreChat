import { useState } from 'react';
import { useLocalize } from '~/hooks';
import type { TranslationKeys } from '~/hooks';
import type { HouseId } from './LifeWheel';

/**
 * 公开首页手绘迷雾舆图：四大块（象限分组 1-3/4-6/7-9/10-12），每块里三小块。
 * 大块名=生活语言导航壳；小块名逐字用十二域前台名（HOUSES 契约）。
 * 4×3 分块降低选择压力：先扫四组，再在组里挑一块。
 */

interface ContinentDomain {
  readonly id: HouseId;
  readonly x: number;
  readonly y: number;
}

export interface Continent {
  readonly key: string;
  readonly nameKey: TranslationKeys;
  readonly path: string;
  readonly labelX: number;
  readonly labelY: number;
  readonly domains: readonly ContinentDomain[];
}

export const CONTINENTS: readonly Continent[] = [
  {
    key: 'self',
    nameKey: 'com_life_map_continent_self',
    path: 'M 60,120 Q 40,80 90,64 Q 150,40 226,58 Q 296,72 312,130 Q 326,190 282,236 Q 240,282 168,278 Q 92,274 66,214 Q 48,168 60,120 Z',
    labelX: 88,
    labelY: 96,
    domains: [
      { id: 'h1', x: 180, y: 122 },
      { id: 'h2', x: 192, y: 172 },
      { id: 'h3', x: 168, y: 222 },
    ],
  },
  {
    key: 'living',
    nameKey: 'com_life_map_continent_living',
    path: 'M 440,80 Q 492,32 584,42 Q 682,52 722,112 Q 756,170 734,244 Q 710,318 620,330 Q 524,340 470,284 Q 420,232 424,158 Q 428,106 440,80 Z',
    labelX: 478,
    labelY: 70,
    domains: [
      { id: 'h4', x: 566, y: 128 },
      { id: 'h5', x: 592, y: 182 },
      { id: 'h6', x: 556, y: 240 },
    ],
  },
  {
    key: 'bonds',
    nameKey: 'com_life_map_continent_bonds',
    path: 'M 88,470 Q 60,420 116,398 Q 190,372 262,392 Q 330,410 336,478 Q 340,544 278,576 Q 208,608 136,580 Q 76,554 78,506 Q 78,486 88,470 Z',
    labelX: 110,
    labelY: 426,
    domains: [
      { id: 'h7', x: 196, y: 452 },
      { id: 'h8', x: 214, y: 502 },
      { id: 'h9', x: 178, y: 550 },
    ],
  },
  {
    key: 'world',
    nameKey: 'com_life_map_continent_world',
    path: 'M 430,430 Q 470,384 556,390 Q 650,396 700,450 Q 748,502 728,576 Q 706,652 616,668 Q 520,682 462,626 Q 408,574 412,500 Q 414,458 430,430 Z',
    labelX: 456,
    labelY: 420,
    domains: [
      { id: 'h10', x: 560, y: 462 },
      { id: 'h11', x: 592, y: 516 },
      { id: 'h12', x: 548, y: 572 },
    ],
  },
];

export const PUBLIC_MAP_LABEL_KEYS: Readonly<Record<HouseId, TranslationKeys>> = {
  h1: 'com_life_map_house_h1',
  h2: 'com_life_map_house_h2',
  h3: 'com_life_map_house_h3',
  h4: 'com_life_map_house_h4',
  h5: 'com_life_map_house_h5',
  h6: 'com_life_map_house_h6',
  h7: 'com_life_map_house_h7',
  h8: 'com_life_map_house_h8',
  h9: 'com_life_map_house_h9',
  h10: 'com_life_map_house_h10',
  h11: 'com_life_map_house_h11',
  h12: 'com_life_map_house_h12',
};

export const ACTIVE_PUBLIC_HOUSES: ReadonlySet<HouseId> = new Set<HouseId>([
  'h2',
  'h6',
  'h7',
  'h10',
]);

const HEALTH_SPOT = { x: 674, y: 270 } as const;

function territoryPath(x: number, y: number) {
  const r = 46;
  return `M ${x - r},${y} Q ${x - r * 0.7},${y - r * 0.55} ${x},${y - r * 0.48} Q ${x + r * 0.9},${y - r * 0.38} ${x + r * 0.85},${y + r * 0.12} Q ${x + r * 0.6},${y + r * 0.55} ${x - r * 0.2},${y + r * 0.5} Q ${x - r * 0.95},${y + r * 0.42} ${x - r},${y} Z`;
}

function mobileDomainClass(active: boolean, available: boolean) {
  if (active) {
    return 'font-semibold text-life-ink underline decoration-life-cinnabar underline-offset-4';
  }
  return available ? 'text-life-ink/75' : 'cursor-not-allowed text-life-muted/55';
}

function territoryStroke(active: boolean, available: boolean) {
  if (active) {
    return '#B94831';
  }
  return available ? 'rgba(23,32,26,0.3)' : 'rgba(23,32,26,0.16)';
}

function territoryDash(active: boolean, available: boolean) {
  if (active) {
    return undefined;
  }
  return available ? '3 5' : '2 7';
}

function territoryLabelFill(active: boolean, available: boolean) {
  if (active) {
    return '#17201A';
  }
  return available ? '#5d5648' : '#948d80';
}

interface PublicMistMapProps {
  selectedIsland?: HouseId | null;
  onSelectIsland?: (id: HouseId) => void;
}

export default function PublicMistMap({ selectedIsland, onSelectIsland }: PublicMistMapProps) {
  const localize = useLocalize();
  const [focusedIsland, setFocusedIsland] = useState<HouseId | null>(null);
  const interactive = typeof onSelectIsland === 'function';
  const selectedSpot = CONTINENTS.flatMap((continent) => continent.domains).find(
    (domain) => domain.id === selectedIsland,
  );

  return (
    <figure className="relative overflow-hidden border border-life-ink/45 bg-[#F7F4EB] p-4 shadow-[0_18px_70px_rgba(23,32,26,0.08)] dark:border-white/20 sm:p-5">
      <div className="flex items-baseline justify-between gap-4 border-b border-life-rule pb-3 font-life-mono text-life-meta tracking-[0.12em] text-life-muted">
        <strong className="font-semibold text-life-brass">
          {localize('com_life_public_map_kicker')}
        </strong>
        <span>{localize('com_life_public_map_atlas')}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:hidden">
        {CONTINENTS.map((continent, index) => (
          <div
            key={continent.key}
            className={`min-h-[132px] border px-4 py-4 ${
              index % 3 === 1
                ? 'rounded-[55%_45%_58%_42%/48%_38%_62%_52%] border-life-moss/45 bg-life-moss/10'
                : 'rounded-[46%_54%_42%_58%/38%_48%_52%_62%] border-life-ink/25 bg-[#E9E3D5]/60'
            }`}
          >
            <p className="font-life-mono text-life-meta tracking-[0.15em] text-life-brass">
              {localize(continent.nameKey)}
            </p>
            <ul className="mt-2 space-y-1.5">
              {continent.domains.map((domain) => {
                const active = domain.id === selectedIsland;
                const available = ACTIVE_PUBLIC_HOUSES.has(domain.id);
                const name = localize(PUBLIC_MAP_LABEL_KEYS[domain.id]);
                return (
                  <li key={domain.id}>
                    <button
                      type="button"
                      disabled={!available}
                      onClick={
                        interactive && available ? () => onSelectIsland?.(domain.id) : undefined
                      }
                      aria-label={localize(
                        available ? 'com_life_map_start_here' : 'com_life_map_still_foggy',
                        { 0: name },
                      )}
                      aria-pressed={interactive && available ? active : undefined}
                      className={`min-h-11 w-full text-left font-life-serif text-life-sm ${mobileDomainClass(active, available)}`}
                    >
                      {name}
                    </button>
                  </li>
                );
              })}
              {continent.key === 'living' && (
                <li>
                  <button
                    type="button"
                    disabled
                    aria-label={localize('com_life_map_still_foggy', {
                      0: localize('com_life_map_health'),
                    })}
                    className="min-h-11 w-full cursor-not-allowed text-left font-life-serif text-life-sm text-life-muted/55"
                  >
                    {localize('com_life_map_health')}
                  </button>
                </li>
              )}
            </ul>
          </div>
        ))}
      </div>

      <svg
        viewBox="0 0 780 670"
        role="group"
        aria-label={localize('com_life_public_map_aria')}
        className="mt-3 hidden h-auto w-full sm:block"
      >
        <defs>
          <filter id="mist-map-wobble" x="-8%" y="-8%" width="116%" height="116%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.014"
              numOctaves="2"
              seed="7"
              result="noise"
            />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="4.5" />
          </filter>
          <filter id="mist-map-grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.55 0 0 0 0 0.5 0 0 0 0 0.4 0 0 0 0.045 0"
            />
          </filter>
          <radialGradient id="mist-map-fog">
            <stop offset="0%" stopColor="#DAD3C2" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#F2EFE6" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="mist-map-glow">
            <stop offset="0%" stopColor="#E8B84B" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#E8B84B" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="780" height="670" fill="#F2EFE6" />
        <rect width="780" height="670" filter="url(#mist-map-grain)" />

        <g
          fill="rgba(229,223,209,0.52)"
          stroke="#17201A"
          strokeWidth="1.6"
          filter="url(#mist-map-wobble)"
        >
          {CONTINENTS.map((continent) => (
            <path key={continent.key} d={continent.path} />
          ))}
        </g>

        <g fill="#80602D" className="font-life-mono text-life-lead tracking-[0.18em]">
          {CONTINENTS.map((continent) => (
            <text key={continent.key} x={continent.labelX} y={continent.labelY}>
              {localize(continent.nameKey)}
            </text>
          ))}
        </g>

        <ellipse cx="390" cy="335" rx="88" ry="46" fill="url(#mist-map-fog)" />
        <ellipse cx="72" cy="330" rx="48" ry="36" fill="url(#mist-map-fog)" />
        <ellipse cx="712" cy="352" rx="52" ry="38" fill="url(#mist-map-fog)" />
        <ellipse cx="380" cy="60" rx="70" ry="30" fill="url(#mist-map-fog)" />
        <ellipse cx="370" cy="640" rx="80" ry="30" fill="url(#mist-map-fog)" />

        <g stroke="rgba(23,32,26,0.1)" strokeWidth="1" fill="none">
          <path d="M 350,330 q 14,-6 28,0 M 60,340 q 14,-6 28,0 M 660,340 q 14,-6 28,0 M 350,620 q 14,-6 28,0" />
          <path d="M 376,344 q 11,-5 22,0 M 96,354 q 11,-5 22,0 M 686,354 q 11,-5 22,0" />
          <path d="M 356,42 q 14,-6 28,0 M 40,600 q 14,-6 28,0 M 700,620 q 14,-6 28,0 M 336,148 q 11,-5 22,0" />
          <path d="M 60,52 q 11,-5 22,0 M 742,300 q 11,-5 22,0 M 36,250 q 11,-5 22,0" />
        </g>

        <path
          d="M 322,168 Q 372,210 430,180 M 250,300 Q 300,360 260,420 M 520,344 Q 560,380 540,420 M 340,520 Q 390,540 430,520"
          fill="none"
          stroke="rgba(185,72,49,0.45)"
          strokeWidth="1"
          strokeDasharray="3 6"
        />

        {CONTINENTS.map((continent) =>
          continent.domains.map((domain) => {
            const selected = domain.id === selectedIsland;
            const available = ACTIVE_PUBLIC_HOUSES.has(domain.id);
            const active = available && (selected || domain.id === focusedIsland);
            const name = localize(PUBLIC_MAP_LABEL_KEYS[domain.id]);
            return (
              <g
                key={domain.id}
                role={interactive && available ? 'button' : 'img'}
                aria-label={localize(
                  available ? 'com_life_map_start_here' : 'com_life_map_still_foggy',
                  { 0: name },
                )}
                aria-pressed={interactive && available ? selected : undefined}
                aria-disabled={!available || undefined}
                tabIndex={interactive && available ? 0 : -1}
                className={interactive && available ? 'cursor-pointer outline-none' : undefined}
                onClick={interactive && available ? () => onSelectIsland?.(domain.id) : undefined}
                onFocus={interactive && available ? () => setFocusedIsland(domain.id) : undefined}
                onBlur={
                  interactive && available
                    ? () =>
                        setFocusedIsland((previous) => (previous === domain.id ? null : previous))
                    : undefined
                }
                onKeyDown={
                  interactive && available
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onSelectIsland?.(domain.id);
                        }
                      }
                    : undefined
                }
              >
                <path
                  d={territoryPath(domain.x, domain.y - 4)}
                  fill={active ? 'rgba(128,96,45,0.14)' : 'rgba(23,32,26,0.015)'}
                  stroke={territoryStroke(active, available)}
                  strokeWidth={active ? 1.8 : 1.2}
                  strokeDasharray={territoryDash(active, available)}
                  filter="url(#mist-map-wobble)"
                />
                <text
                  x={domain.x}
                  y={domain.y}
                  textAnchor="middle"
                  fill={territoryLabelFill(active, available)}
                  className="font-life-serif text-life-lead font-semibold"
                >
                  {name}
                </text>
              </g>
            );
          }),
        )}

        <g
          role="img"
          aria-label={localize('com_life_map_still_foggy', { 0: localize('com_life_map_health') })}
        >
          <path
            d={territoryPath(HEALTH_SPOT.x, HEALTH_SPOT.y)}
            fill="rgba(23,32,26,0.01)"
            stroke="rgba(23,32,26,0.16)"
            strokeWidth="1.2"
            strokeDasharray="2 7"
            filter="url(#mist-map-wobble)"
          />
          <text
            x={HEALTH_SPOT.x}
            y={HEALTH_SPOT.y + 4}
            textAnchor="middle"
            fill="#948d80"
            className="font-life-serif text-life-lead font-semibold"
          >
            {localize('com_life_map_health')}
          </text>
        </g>

        {selectedSpot && (
          <g
            transform={`translate(${selectedSpot.x + 74},${selectedSpot.y + 10})`}
            role="img"
            aria-label={localize('com_life_map_you_are_here')}
          >
            <circle cx="0" cy="-14" r="5.2" fill="none" stroke="#17201A" strokeWidth="1.6" />
            <path
              d="M 0,-9 L 0,6 M 0,-4 L -7,2 M 0,-4 L 8,-1 M 0,6 L -6,16 M 0,6 L 6,16"
              fill="none"
              stroke="#17201A"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <rect x="10" y="-4" width="7" height="9" rx="1.6" fill="#B94831" />
            <circle cx="13.5" cy="0.5" r="22" fill="url(#mist-map-glow)" />
          </g>
        )}

        <g
          transform="translate(714,52)"
          stroke="#80602D"
          fill="none"
          strokeWidth="1"
          opacity="0.72"
          aria-hidden="true"
        >
          <circle r="18" />
          <circle r="2.5" fill="#80602D" />
          <path d="M 0,-24 L 4,-6 L 0,-10 L -4,-6 Z" fill="#B94831" stroke="none" />
          <path d="M 0,24 L 0,10 M -24,0 L -10,0 M 24,0 L 10,0" />
        </g>
      </svg>

      <figcaption className="mt-3 border-t border-life-rule pt-3 font-life-kai text-life-sm leading-7 text-life-brass">
        {localize('com_life_public_map_caption')}
      </figcaption>
    </figure>
  );
}
