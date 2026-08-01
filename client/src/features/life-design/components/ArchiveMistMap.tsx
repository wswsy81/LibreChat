import { useMemo } from 'react';
import type { LifeHouseId, LifeWheelView } from 'librechat-data-provider';
import PublicMistMap from './PublicMistMap';

const isLit = (house: LifeWheelView['houses'][number]) =>
  house.recognition !== 'unknown' ||
  house.condition.level !== 'unknown' ||
  house.condition.currentSnapshotId != null;

export default function ArchiveMistMap({ wheel }: { wheel?: LifeWheelView }) {
  const litIslands = useMemo(() => {
    const lit = new Set<LifeHouseId>();
    for (const house of wheel?.houses ?? []) {
      if (isLit(house)) lit.add(house.id);
    }
    if (wheel?.lanternHouse) lit.add(wheel.lanternHouse);
    return lit;
  }, [wheel]);

  return <PublicMistMap selectedIsland={wheel?.lanternHouse ?? null} litIslands={litIslands} />;
}
