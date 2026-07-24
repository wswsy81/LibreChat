/**
 * Typed mirror of the C0 contract fixture:
 *   projects/未来线/future-engine-shim/fixtures/life-wheel-contract.v1.json
 *   (contractId: life-wheel-dynamic-state-v1, schemaVersion: 1)
 *
 * The fixture is the source of truth (owned by Codex / future-engine C0). This
 * mirror is verified verbatim by geometry.spec.ts. Do NOT hand-edit the house
 * angles or public names — they are frozen upstream (C 环双层表, 07-24 二次修订).
 */

export type HouseId =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'h7'
  | 'h8'
  | 'h9'
  | 'h10'
  | 'h11'
  | 'h12';

export type Recognition = 'unknown' | 'draft' | 'owned' | 'dismissed';

export type ConditionLevel =
  | 'unknown'
  | 'depleted'
  | 'strained'
  | 'mixed'
  | 'steady'
  | 'energizing';

export type Trend = 'unknown' | 'improving' | 'stable' | 'worsening';

export type VisitMode = 'first_entry' | 'return_entry' | 'continue';

export interface HouseGeometry {
  readonly id: HouseId;
  readonly publicName: string;
  readonly startAngleDeg: number;
  readonly endAngleDeg: number;
  readonly centerAngleDeg: number;
  readonly sweepDeg: number;
  readonly axisBoundary: boolean;
}

export interface HouseState {
  readonly recognition: Recognition;
  readonly conditionLevel: ConditionLevel;
  readonly trend: Trend;
}

export const WHEEL_GEOMETRY = {
  coordinateSystem: 'svg_degrees_clockwise',
  sequence: 'counterclockwise',
  origin: 'three_o_clock',
  h1Boundary: 'nine_o_clock',
  sectorSweepDeg: -30,
} as const;

export const HOUSES: readonly HouseGeometry[] = [
  {
    id: 'h1',
    publicName: '自我呈现',
    startAngleDeg: 180,
    endAngleDeg: 150,
    centerAngleDeg: 165,
    sweepDeg: -30,
    axisBoundary: true,
  },
  {
    id: 'h2',
    publicName: '钱与价值感',
    startAngleDeg: 150,
    endAngleDeg: 120,
    centerAngleDeg: 135,
    sweepDeg: -30,
    axisBoundary: false,
  },
  {
    id: 'h3',
    publicName: '沟通与学习',
    startAngleDeg: 120,
    endAngleDeg: 90,
    centerAngleDeg: 105,
    sweepDeg: -30,
    axisBoundary: false,
  },
  {
    id: 'h4',
    publicName: '家与根',
    startAngleDeg: 90,
    endAngleDeg: 60,
    centerAngleDeg: 75,
    sweepDeg: -30,
    axisBoundary: true,
  },
  {
    id: 'h5',
    publicName: '恋爱与创造',
    startAngleDeg: 60,
    endAngleDeg: 30,
    centerAngleDeg: 45,
    sweepDeg: -30,
    axisBoundary: false,
  },
  {
    id: 'h6',
    publicName: '工作与健康',
    startAngleDeg: 30,
    endAngleDeg: 0,
    centerAngleDeg: 15,
    sweepDeg: -30,
    axisBoundary: false,
  },
  {
    id: 'h7',
    publicName: '亲密与伙伴',
    startAngleDeg: 0,
    endAngleDeg: -30,
    centerAngleDeg: -15,
    sweepDeg: -30,
    axisBoundary: true,
  },
  {
    id: 'h8',
    publicName: '共担与蜕变',
    startAngleDeg: -30,
    endAngleDeg: -60,
    centerAngleDeg: -45,
    sweepDeg: -30,
    axisBoundary: false,
  },
  {
    id: 'h9',
    publicName: '远方与信念',
    startAngleDeg: -60,
    endAngleDeg: -90,
    centerAngleDeg: -75,
    sweepDeg: -30,
    axisBoundary: false,
  },
  {
    id: 'h10',
    publicName: '事业与公众',
    startAngleDeg: -90,
    endAngleDeg: -120,
    centerAngleDeg: -105,
    sweepDeg: -30,
    axisBoundary: true,
  },
  {
    id: 'h11',
    publicName: '朋友与群体',
    startAngleDeg: -120,
    endAngleDeg: -150,
    centerAngleDeg: -135,
    sweepDeg: -30,
    axisBoundary: false,
  },
  {
    id: 'h12',
    publicName: '独处与内心',
    startAngleDeg: -150,
    endAngleDeg: -180,
    centerAngleDeg: -165,
    sweepDeg: -30,
    axisBoundary: false,
  },
];

export const CONDITION_VALUES: Record<ConditionLevel, number | null> = {
  unknown: null,
  depleted: -2,
  strained: -1,
  mixed: 0,
  steady: 1,
  energizing: 2,
};

export const RECOGNITION_LABEL: Record<Recognition, string> = {
  unknown: '还没聊到',
  draft: '有一页草稿',
  owned: '已认领',
  dismissed: '已划掉',
};

export const CONDITION_LABEL: Record<Exclude<ConditionLevel, 'unknown'>, string> = {
  depleted: '明显耗损',
  strained: '比较吃力',
  mixed: '有些拉扯',
  steady: '基本稳定',
  energizing: '明显供能',
};

export const TREND_LABEL: Record<Exclude<Trend, 'unknown'>, string> = {
  improving: '在变好',
  stable: '变化不大',
  worsening: '在变差',
};

export const UNKNOWN_HOUSE_STATE: HouseState = {
  recognition: 'unknown',
  conditionLevel: 'unknown',
  trend: 'unknown',
};
