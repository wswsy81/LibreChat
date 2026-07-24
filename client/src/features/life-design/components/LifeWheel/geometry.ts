import { HOUSES } from './contract';
import type { HouseGeometry, HouseId } from './contract';

export interface Point {
  x: number;
  y: number;
}

/**
 * Map a contract angle (svg_degrees_clockwise, origin at three o'clock) to a
 * point on a circle. SVG y points down, so increasing degrees run clockwise:
 * 0°=3 o'clock, 90°=6 o'clock, 180°=9 o'clock, 270°=12 o'clock.
 */
export function polarPoint(cx: number, cy: number, r: number, angleDeg: number): Point {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * Annular sector path for one house, leaving the wheel centre open (人物志=圆心).
 * Houses sweep counterclockwise on screen (decreasing degrees), so the outer arc
 * uses sweep-flag 0 and the inner return arc uses sweep-flag 1.
 */
export function sectorPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startAngleDeg: number,
  endAngleDeg: number,
): string {
  const oStart = polarPoint(cx, cy, outerR, startAngleDeg);
  const oEnd = polarPoint(cx, cy, outerR, endAngleDeg);
  const iEnd = polarPoint(cx, cy, innerR, endAngleDeg);
  const iStart = polarPoint(cx, cy, innerR, startAngleDeg);
  const largeArc = Math.abs(startAngleDeg - endAngleDeg) > 180 ? 1 : 0;
  return [
    `M ${oStart.x} ${oStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 0 ${oEnd.x} ${oEnd.y}`,
    `L ${iEnd.x} ${iEnd.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 1 ${iStart.x} ${iStart.y}`,
    'Z',
  ].join(' ');
}

export function houseById(id: HouseId): HouseGeometry {
  const found = HOUSES.find((house) => house.id === id);
  if (!found) {
    throw new Error(`Unknown house id: ${id}`);
  }
  return found;
}
