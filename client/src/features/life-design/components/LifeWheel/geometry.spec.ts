import translation from '~/locales/en/translation.json';
import { HOUSES, HOUSE_LABEL_KEYS, WHEEL_GEOMETRY } from './contract';
import { houseById, polarPoint, sectorPath } from './geometry';

const PUBLIC_NAMES = [
  '自我',
  '财务',
  '学习',
  '家庭',
  '创造',
  '工作',
  '情感',
  '共担',
  '远方',
  '事业',
  '朋友',
  '内心',
];

// 废止旧名（含首次修订与旧四大洲标签），前台任何位置都不得出现。
const RETIRED_NAMES = [
  '创造与玩',
  '日常与身体',
  '目标与群体',
  '学习与同行',
  '朋友与社群',
  '钱与资源',
  '学习与兄弟',
  '共享与危机',
];

const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;

describe('LifeWheel geometry contract', () => {
  test('十二域顺序与唯一热轨前台名逐字冻结', () => {
    expect(HOUSES.map((h) => h.id)).toEqual([
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'h7',
      'h8',
      'h9',
      'h10',
      'h11',
      'h12',
    ]);
    expect(HOUSES.map((house) => translation[HOUSE_LABEL_KEYS[house.id]])).toEqual(PUBLIC_NAMES);
    expect(HOUSES.every((house) => !Object.hasOwn(house, 'publicName'))).toBe(true);
  });

  test('无任何废止旧名', () => {
    const names = HOUSES.map((house) => translation[HOUSE_LABEL_KEYS[house.id]]);
    for (const retired of RETIRED_NAMES) {
      expect(names).not.toContain(retired);
    }
  });

  test('十字轴 h1/h4/h7/h10 落在 9/6/3/12 点钟边界', () => {
    expect(houseById('h1').startAngleDeg).toBe(180); // 9 点钟
    expect(houseById('h4').startAngleDeg).toBe(90); // 6 点钟
    expect(houseById('h7').startAngleDeg).toBe(0); // 3 点钟
    expect(houseById('h10').startAngleDeg).toBe(-90); // 12 点钟
    expect(HOUSES.filter((h) => h.axisBoundary).map((h) => h.id)).toEqual([
      'h1',
      'h4',
      'h7',
      'h10',
    ]);
  });

  test('逆时针，每扇 -30°，中心角连续递减', () => {
    expect(WHEEL_GEOMETRY.sequence).toBe('counterclockwise');
    for (const house of HOUSES) {
      expect(house.sweepDeg).toBe(-30);
    }
    HOUSES.reduce<number | null>((prevCenter, house) => {
      if (prevCenter !== null) {
        expect(house.centerAngleDeg).toBe(prevCenter - 30);
      }
      return house.centerAngleDeg;
    }, null);
  });

  test('坐标系: 0°=3点、90°=6点(下)、180°=9点、270°=12点(上)', () => {
    const right = polarPoint(0, 0, 100, 0);
    expect(close(right.x, 100) && close(right.y, 0)).toBe(true);
    const bottom = polarPoint(0, 0, 100, 90);
    expect(close(bottom.x, 0) && close(bottom.y, 100)).toBe(true);
    const left = polarPoint(0, 0, 100, 180);
    expect(close(left.x, -100) && close(left.y, 0)).toBe(true);
    const top = polarPoint(0, 0, 100, 270);
    expect(close(top.x, 0) && close(top.y, -100)).toBe(true);
  });

  test('h1 中心在九点钟半侧（左，x<0）', () => {
    const center = polarPoint(0, 0, 100, houseById('h1').centerAngleDeg);
    expect(center.x).toBeLessThan(0);
  });

  test('sectorPath 生成有效环形路径（内圈留给圆心）', () => {
    const path = sectorPath(220, 220, 104, 196, 180, 150);
    expect(path.startsWith('M ')).toBe(true);
    expect(path).toContain('A 196 196');
    expect(path).toContain('A 104 104');
    expect(path.endsWith('Z')).toBe(true);
  });
});
