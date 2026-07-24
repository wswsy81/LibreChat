import { useCallback, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  HOUSES,
  RECOGNITION_LABEL,
  CONDITION_LABEL,
  TREND_LABEL,
  UNKNOWN_HOUSE_STATE,
} from './contract';
import type { ConditionLevel, HouseId, HouseState, Recognition, Trend } from './contract';
import { houseById, polarPoint, sectorPath } from './geometry';

export type LifeWheelMode = 'public' | 'interactive';

export interface LifeWheelProps {
  /** public = 全雾（12 域全 unknown），点选只用于引导注册；interactive = 按 houseStates 渲染三层状态。 */
  mode?: LifeWheelMode;
  houseStates?: Partial<Record<HouseId, HouseState>>;
  /** 提灯位置（D17 由上层算好传入）；null = 停在圆心（全新用户）。 */
  lanternHouse?: HouseId | null;
  selectedHouse?: HouseId | null;
  onSelectHouse?: (id: HouseId) => void;
  /** 无障碍标题，读屏用。 */
  title?: string;
  className?: string;
}

const VIEW = 440;
const CENTER = VIEW / 2;
const OUTER_R = 196;
const INNER_R = 104;
const LABEL_R = (OUTER_R + INNER_R) / 2;
const MARKER_R = OUTER_R - 15;

const RECOGNITION_FILL: Record<Recognition, string> = {
  unknown: 'rgba(23,32,26,0.015)',
  dismissed: 'rgba(23,32,26,0.015)',
  draft: 'rgba(128,96,45,0.12)',
  owned: 'rgba(53,91,71,0.17)',
};

const RECOGNITION_STROKE: Record<Recognition, string> = {
  unknown: 'rgba(23,32,26,0.16)',
  dismissed: 'rgba(23,32,26,0.16)',
  draft: 'rgba(128,96,45,0.55)',
  owned: '#355B47',
};

const RECOGNITION_TEXT: Record<Recognition, string> = {
  unknown: '#847d6e',
  dismissed: '#847d6e',
  draft: '#80602D',
  owned: '#17201A',
};

const CONDITION_COLOR: Record<Exclude<ConditionLevel, 'unknown'>, string> = {
  depleted: '#B94831',
  strained: '#80602D',
  mixed: '#847D6E',
  steady: '#355B47',
  energizing: '#2C5B41',
};

function trendGlyph(trend: Trend): string | null {
  if (trend === 'improving') {
    return 'M 0 4 L 0 -5 M -3 -1 L 0 -5 L 3 -1';
  }
  if (trend === 'worsening') {
    return 'M 0 -4 L 0 5 M -3 1 L 0 5 L 3 1';
  }
  if (trend === 'stable') {
    return 'M -4 0 L 4 0';
  }
  return null;
}

function sectorStrokeWidth(active: boolean, axisBoundary: boolean): number {
  if (active) {
    return 2.4;
  }
  if (axisBoundary) {
    return 1.8;
  }
  return 1;
}

function houseAriaLabel(name: string, state: HouseState): string {
  const parts = [name, RECOGNITION_LABEL[state.recognition]];
  if (state.conditionLevel !== 'unknown') {
    parts.push(`当前${CONDITION_LABEL[state.conditionLevel]}`);
  }
  if (state.trend !== 'unknown') {
    parts.push(`较上次${TREND_LABEL[state.trend]}`);
  }
  return parts.join(' · ');
}

function houseLabelLines(name: string): string[] {
  if (name.length <= 3) {
    return [name];
  }
  const conjunction = name.indexOf('与');
  if (conjunction > 0) {
    return [name.slice(0, conjunction + 1), name.slice(conjunction + 1)];
  }
  const midpoint = Math.ceil(name.length / 2);
  return [name.slice(0, midpoint), name.slice(midpoint)];
}

function Lantern({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`} aria-hidden="true">
      <circle cx="0" cy="-14" r="5" fill="none" stroke="#17201A" strokeWidth="1.6" />
      <path
        d="M 0,-9 L 0,6 M 0,-4 L -7,2 M 0,-4 L 8,-1 M 0,6 L -6,16 M 0,6 L 6,16"
        fill="none"
        stroke="#17201A"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <rect x="10" y="-4" width="7" height="9" rx="1.6" fill="#B94831" />
    </g>
  );
}

export default function LifeWheel({
  mode = 'interactive',
  houseStates,
  lanternHouse = null,
  selectedHouse = null,
  onSelectHouse,
  title = '人生之轮',
  className,
}: LifeWheelProps) {
  const [focusedHouse, setFocusedHouse] = useState<HouseId | null>(null);

  const resolveState = useCallback(
    (id: HouseId): HouseState => {
      if (mode === 'public') {
        return UNKNOWN_HOUSE_STATE;
      }
      return houseStates?.[id] ?? UNKNOWN_HOUSE_STATE;
    },
    [mode, houseStates],
  );

  const handleKey = useCallback(
    (event: KeyboardEvent<SVGGElement>, id: HouseId) => {
      if (!onSelectHouse) {
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onSelectHouse(id);
      }
    },
    [onSelectHouse],
  );

  const interactive = typeof onSelectHouse === 'function';
  const lantern = lanternHouse
    ? polarPoint(CENTER, CENTER, LABEL_R, houseById(lanternHouse).centerAngleDeg)
    : { x: CENTER, y: CENTER };

  return (
    <svg viewBox={`0 0 ${VIEW} ${VIEW}`} role="group" aria-label={title} className={className}>
      <defs>
        <filter id="life-wheel-wobble" x="-6%" y="-6%" width="112%" height="112%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.012"
            numOctaves="2"
            seed="7"
            result="n"
          />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3" />
        </filter>
      </defs>

      <circle cx={CENTER} cy={CENTER} r={OUTER_R + 4} fill="#F2EFE6" />

      <g filter="url(#life-wheel-wobble)">
        {HOUSES.map((house) => {
          const state = resolveState(house.id);
          const isFog = state.recognition === 'unknown' || state.recognition === 'dismissed';
          const active = house.id === selectedHouse || house.id === focusedHouse;
          const label = polarPoint(CENTER, CENTER, LABEL_R, house.centerAngleDeg);
          const labelLines = houseLabelLines(house.publicName);
          const marker = polarPoint(CENTER, CENTER, MARKER_R, house.centerAngleDeg);
          const glyph = trendGlyph(state.trend);
          const hasSnapshot = state.conditionLevel !== 'unknown';

          return (
            <g
              key={house.id}
              role={interactive ? 'button' : 'img'}
              aria-label={houseAriaLabel(house.publicName, state)}
              aria-pressed={interactive ? house.id === selectedHouse : undefined}
              tabIndex={interactive ? 0 : -1}
              className={interactive ? 'cursor-pointer outline-none' : undefined}
              onClick={interactive ? () => onSelectHouse?.(house.id) : undefined}
              onKeyDown={(event) => handleKey(event, house.id)}
              onFocus={() => setFocusedHouse(house.id)}
              onBlur={() => setFocusedHouse((prev) => (prev === house.id ? null : prev))}
            >
              <path
                d={sectorPath(
                  CENTER,
                  CENTER,
                  INNER_R,
                  OUTER_R,
                  house.startAngleDeg,
                  house.endAngleDeg,
                )}
                fill={active && isFog ? 'rgba(128,96,45,0.1)' : RECOGNITION_FILL[state.recognition]}
                stroke={active ? '#B94831' : RECOGNITION_STROKE[state.recognition]}
                strokeWidth={sectorStrokeWidth(active, house.axisBoundary)}
                strokeDasharray={isFog && mode === 'interactive' ? '3 5' : undefined}
              />
              <text
                x={label.x}
                y={label.y - (labelLines.length > 1 ? 7 : -4)}
                textAnchor="middle"
                fill={RECOGNITION_TEXT[state.recognition]}
                className="font-life-serif text-life-lead font-semibold sm:hidden"
                pointerEvents="none"
              >
                {labelLines.map((line, index) => (
                  <tspan key={line} x={label.x} dy={index === 0 ? 0 : 22}>
                    {line}
                  </tspan>
                ))}
              </text>
              <text
                x={label.x}
                y={label.y + 4}
                textAnchor="middle"
                fill={RECOGNITION_TEXT[state.recognition]}
                className="hidden font-life-serif text-life-sm font-semibold sm:block"
                pointerEvents="none"
              >
                {house.publicName}
              </text>
              {hasSnapshot && (
                <g transform={`translate(${marker.x},${marker.y})`} pointerEvents="none">
                  <circle r="7" fill={CONDITION_COLOR[state.conditionLevel]} />
                  {glyph && (
                    <path
                      d={glyph}
                      fill="none"
                      stroke="#F7F4EB"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                </g>
              )}
            </g>
          );
        })}
      </g>

      <line
        x1={CENTER - OUTER_R}
        y1={CENTER}
        x2={CENTER + OUTER_R}
        y2={CENTER}
        stroke="rgba(23,32,26,0.12)"
        strokeWidth="1"
      />
      <line
        x1={CENTER}
        y1={CENTER - OUTER_R}
        x2={CENTER}
        y2={CENTER + OUTER_R}
        stroke="rgba(23,32,26,0.12)"
        strokeWidth="1"
      />
      <circle
        cx={CENTER}
        cy={CENTER}
        r={INNER_R - 2}
        fill="#F7F4EB"
        stroke="rgba(23,32,26,0.14)"
        strokeWidth="1"
      />
      <Lantern x={lantern.x} y={lantern.y} />
    </svg>
  );
}
