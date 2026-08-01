/**
 * Typed mirror of the C0 contract fixture:
 *   projects/未来线/future-engine-shim/fixtures/life-wheel-contract.v1.json
 *   (contractId: life-wheel-dynamic-state-v1, schemaVersion: 1)
 *
 * The fixture is the source of truth (owned by Codex / future-engine C0). This
 * mirror is verified verbatim by geometry.spec.ts. Do NOT hand-edit the house
 * angles. User-facing names live in translation keys so CopyPanel remains the
 * single hot-copy source.
 */

import type { TranslationKeys } from '~/hooks';

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
    startAngleDeg: 180,
    endAngleDeg: 150,
    centerAngleDeg: 165,
    sweepDeg: -30,
    axisBoundary: true,
  },
  {
    id: 'h2',
    startAngleDeg: 150,
    endAngleDeg: 120,
    centerAngleDeg: 135,
    sweepDeg: -30,
    axisBoundary: false,
  },
  {
    id: 'h3',
    startAngleDeg: 120,
    endAngleDeg: 90,
    centerAngleDeg: 105,
    sweepDeg: -30,
    axisBoundary: false,
  },
  {
    id: 'h4',
    startAngleDeg: 90,
    endAngleDeg: 60,
    centerAngleDeg: 75,
    sweepDeg: -30,
    axisBoundary: true,
  },
  {
    id: 'h5',
    startAngleDeg: 60,
    endAngleDeg: 30,
    centerAngleDeg: 45,
    sweepDeg: -30,
    axisBoundary: false,
  },
  {
    id: 'h6',
    startAngleDeg: 30,
    endAngleDeg: 0,
    centerAngleDeg: 15,
    sweepDeg: -30,
    axisBoundary: false,
  },
  {
    id: 'h7',
    startAngleDeg: 0,
    endAngleDeg: -30,
    centerAngleDeg: -15,
    sweepDeg: -30,
    axisBoundary: true,
  },
  {
    id: 'h8',
    startAngleDeg: -30,
    endAngleDeg: -60,
    centerAngleDeg: -45,
    sweepDeg: -30,
    axisBoundary: false,
  },
  {
    id: 'h9',
    startAngleDeg: -60,
    endAngleDeg: -90,
    centerAngleDeg: -75,
    sweepDeg: -30,
    axisBoundary: false,
  },
  {
    id: 'h10',
    startAngleDeg: -90,
    endAngleDeg: -120,
    centerAngleDeg: -105,
    sweepDeg: -30,
    axisBoundary: true,
  },
  {
    id: 'h11',
    startAngleDeg: -120,
    endAngleDeg: -150,
    centerAngleDeg: -135,
    sweepDeg: -30,
    axisBoundary: false,
  },
  {
    id: 'h12',
    startAngleDeg: -150,
    endAngleDeg: -180,
    centerAngleDeg: -165,
    sweepDeg: -30,
    axisBoundary: false,
  },
];

export const HOUSE_LABEL_KEYS: Readonly<Record<HouseId, TranslationKeys>> = {
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

export const CONDITION_VALUES: Record<ConditionLevel, number | null> = {
  unknown: null,
  depleted: -2,
  strained: -1,
  mixed: 0,
  steady: 1,
  energizing: 2,
};

export const RECOGNITION_LABEL_KEYS: Record<Recognition, TranslationKeys> = {
  unknown: 'com_life_recognition_unknown',
  draft: 'com_life_recognition_draft',
  owned: 'com_life_recognition_owned',
  dismissed: 'com_life_recognition_dismissed',
};

export const CONDITION_LABEL_KEYS: Record<Exclude<ConditionLevel, 'unknown'>, TranslationKeys> = {
  depleted: 'com_life_condition_depleted',
  strained: 'com_life_condition_strained',
  mixed: 'com_life_condition_mixed',
  steady: 'com_life_condition_steady',
  energizing: 'com_life_condition_energizing',
};

export const TREND_LABEL_KEYS: Record<Exclude<Trend, 'unknown'>, TranslationKeys> = {
  improving: 'com_life_trend_improving',
  stable: 'com_life_trend_stable',
  worsening: 'com_life_trend_worsening',
};

export const UNKNOWN_HOUSE_STATE: HouseState = {
  recognition: 'unknown',
  conditionLevel: 'unknown',
  trend: 'unknown',
};
