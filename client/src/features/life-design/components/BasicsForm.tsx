import { useEffect, useMemo, useState } from 'react';
import { Button, useToastContext } from '@librechat/client';
import type { LifeBasics, LifeBirthInfo } from 'librechat-data-provider';
import { useLifeArchiveQuery, useLifeBasicsMutation, useLifeBirthMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';

const TEXT_FIELDS = ['nickname', 'occupation', 'city', 'education', 'marital'] as const;
type TextField = (typeof TEXT_FIELDS)[number];

const FIELD_LABELS = {
  nickname: 'com_life_basics_nickname',
  occupation: 'com_life_basics_occupation',
  city: 'com_life_basics_city',
  education: 'com_life_basics_education',
  marital: 'com_life_basics_marital',
} as const satisfies Record<TextField, string>;

const inputClass =
  'w-full rounded-[3px] border border-life-rule bg-life-paper px-3 py-2.5 font-life-sans text-life-sm text-life-ink outline-none transition focus:border-life-ink dark:border-white/20 dark:bg-transparent dark:text-gray-100';
const labelClass =
  'font-life-mono text-[10.5px] tracking-[0.14em] text-life-muted dark:text-gray-500';

function numberOrUndefined(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = range(CURRENT_YEAR - 100, CURRENT_YEAR - 5).reverse();

const CITY_OPTIONS = [
  '北京',
  '上海',
  '广州',
  '深圳',
  '成都',
  '武汉',
  '西安',
  '杭州',
  '南京',
  '厦门',
  '福州',
  '泉州',
  '莆田',
  '仙游',
];

export default function BasicsForm() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const archive = useLifeArchiveQuery();
  const saveBasics = useLifeBasicsMutation();
  const saveBirth = useLifeBirthMutation();

  const stored: LifeBasics = useMemo(() => archive.data?.profile?.basics ?? {}, [archive.data]);
  const [text, setText] = useState<Record<TextField, string>>({
    nickname: '',
    occupation: '',
    city: '',
    education: '',
    marital: '',
  });
  const [birth, setBirth] = useState({
    year: '',
    month: '',
    day: '',
    hour: '',
    minute: '',
    calendar: 'solar',
    gender: '',
    city: '',
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated || !archive.data) return;
    setText({
      nickname: stored.nickname ?? '',
      occupation: stored.occupation ?? '',
      city: stored.city ?? '',
      education: stored.education ?? '',
      marital: stored.marital ?? '',
    });
    if (stored.birth) {
      setBirth({
        year: String(stored.birth.year ?? ''),
        month: String(stored.birth.month ?? ''),
        day: String(stored.birth.day ?? ''),
        hour: stored.birth.hour === undefined ? '' : String(stored.birth.hour),
        minute: stored.birth.minute === undefined ? '' : String(stored.birth.minute),
        calendar: stored.birth.calendar ?? 'solar',
        gender: stored.birth.gender ?? '',
        city: stored.birth.city ?? '',
      });
    }
    setHydrated(true);
  }, [archive.data, hydrated, stored]);

  const busy = saveBasics.isLoading || saveBirth.isLoading;

  const submit = () => {
    const patch: Partial<Record<TextField, string>> = {};
    for (const field of TEXT_FIELDS) {
      const value = text[field].trim();
      if (value && value !== (stored[field] ?? '')) patch[field] = value;
    }

    const year = numberOrUndefined(birth.year);
    const month = numberOrUndefined(birth.month);
    const day = numberOrUndefined(birth.day);
    const birthComplete = year !== undefined && month !== undefined && day !== undefined;
    const birthChanged =
      birthComplete &&
      (stored.birth?.year !== year ||
        stored.birth?.month !== month ||
        stored.birth?.day !== day ||
        (stored.birth?.hour ?? undefined) !== numberOrUndefined(birth.hour) ||
        (stored.birth?.minute ?? undefined) !== numberOrUndefined(birth.minute) ||
        (stored.birth?.calendar ?? 'solar') !== birth.calendar ||
        (stored.birth?.gender ?? '') !== birth.gender ||
        (stored.birth?.city ?? '') !== birth.city.trim());

    if (!Object.keys(patch).length && !birthChanged) {
      showToast({ message: localize('com_life_basics_nothing'), status: 'info' });
      return;
    }
    if (Object.keys(patch).length) {
      saveBasics.mutate(patch, {
        onSuccess: () =>
          showToast({ message: localize('com_life_basics_saved'), status: 'success' }),
        onError: () => showToast({ message: localize('com_life_basics_failed'), status: 'error' }),
      });
    }
    if (birthChanged) {
      const payload: LifeBirthInfo = {
        year: year as number,
        month: month as number,
        day: day as number,
        calendar: birth.calendar as 'solar' | 'lunar',
      };
      const hour = numberOrUndefined(birth.hour);
      const minute = numberOrUndefined(birth.minute);
      if (hour !== undefined) payload.hour = hour;
      if (minute !== undefined) payload.minute = minute;
      if (birth.gender) payload.gender = birth.gender as 'male' | 'female';
      if (birth.city.trim()) payload.city = birth.city.trim();
      saveBirth.mutate(payload, {
        onSuccess: (data) =>
          showToast({
            message: localize('com_life_birth_saved', { 0: String(data.litHouses ?? 0) }),
            status: 'success',
          }),
        onError: () => showToast({ message: localize('com_life_basics_failed'), status: 'error' }),
      });
    }
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {TEXT_FIELDS.map((field) => (
          <label key={field} className="grid gap-1.5">
            <span className={labelClass}>{localize(FIELD_LABELS[field])}</span>
            <input
              type="text"
              maxLength={60}
              value={text[field]}
              onChange={(event) => setText((prev) => ({ ...prev, [field]: event.target.value }))}
              className={inputClass}
            />
          </label>
        ))}
      </div>

      <fieldset className="grid gap-4 border-t border-dashed border-life-rule pt-5 dark:border-white/10">
        <legend className="pr-3 font-life-mono text-[10.5px] tracking-[0.14em] text-life-cinnabar dark:text-[#D98A76]">
          {localize('com_life_birth_legend')}
        </legend>
        <p className="max-w-[34em] font-life-kai text-life-sm leading-7 text-life-muted dark:text-gray-400">
          {localize('com_life_birth_hint')}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1.5">
            <span className={labelClass}>{localize('com_life_birth_calendar')}</span>
            <select
              value={birth.calendar}
              onChange={(event) => setBirth((prev) => ({ ...prev, calendar: event.target.value }))}
              className={inputClass}
            >
              <option value="solar">{localize('com_life_birth_solar')}</option>
              <option value="lunar">{localize('com_life_birth_lunar')}</option>
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className={labelClass}>{localize('com_life_birth_year')}</span>
            <select
              value={birth.year}
              onChange={(event) => setBirth((prev) => ({ ...prev, year: event.target.value }))}
              className={inputClass}
            >
              <option value="">{localize('com_life_birth_unset')}</option>
              {YEARS.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className={labelClass}>{localize('com_life_birth_month')}</span>
            <select
              value={birth.month}
              onChange={(event) => setBirth((prev) => ({ ...prev, month: event.target.value }))}
              className={inputClass}
            >
              <option value="">{localize('com_life_birth_unset')}</option>
              {range(1, 12).map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className={labelClass}>{localize('com_life_birth_day')}</span>
            <select
              value={birth.day}
              onChange={(event) => setBirth((prev) => ({ ...prev, day: event.target.value }))}
              className={inputClass}
            >
              <option value="">{localize('com_life_birth_unset')}</option>
              {range(1, 31).map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className={labelClass}>{localize('com_life_birth_hour')}</span>
            <select
              value={birth.hour}
              onChange={(event) => setBirth((prev) => ({ ...prev, hour: event.target.value }))}
              className={inputClass}
            >
              <option value="">{localize('com_life_birth_hour_unknown')}</option>
              {range(0, 23).map((hour) => (
                <option key={hour} value={hour}>
                  {String(hour)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className={labelClass}>{localize('com_life_birth_minute')}</span>
            <select
              value={birth.minute}
              onChange={(event) => setBirth((prev) => ({ ...prev, minute: event.target.value }))}
              className={inputClass}
            >
              <option value="">{localize('com_life_birth_unset')}</option>
              {range(0, 59).map((minute) => (
                <option key={minute} value={minute}>
                  {String(minute).padStart(2, '0')}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className={labelClass}>{localize('com_life_birth_gender')}</span>
            <select
              value={birth.gender}
              onChange={(event) => setBirth((prev) => ({ ...prev, gender: event.target.value }))}
              className={inputClass}
            >
              <option value="">{localize('com_life_birth_unset')}</option>
              <option value="male">{localize('com_life_birth_male')}</option>
              <option value="female">{localize('com_life_birth_female')}</option>
            </select>
          </label>
          <label className="grid min-w-[10em] flex-1 gap-1.5">
            <span className={labelClass}>{localize('com_life_birth_city')}</span>
            <input
              type="text"
              maxLength={60}
              list="life-birth-cities"
              autoComplete="off"
              value={birth.city}
              onChange={(event) => setBirth((prev) => ({ ...prev, city: event.target.value }))}
              className={inputClass}
            />
            <datalist id="life-birth-cities">
              {CITY_OPTIONS.map((city) => (
                <option key={city} value={city} />
              ))}
            </datalist>
          </label>
        </div>
      </fieldset>

      <div>
        <Button
          type="button"
          disabled={busy}
          onClick={submit}
          className="min-h-12 rounded-[4px] bg-life-moss px-6 font-life-sans text-life-sm text-life-paper hover:bg-life-moss-deep disabled:opacity-50"
        >
          {localize('com_life_basics_save')}
        </Button>
      </div>
    </div>
  );
}
