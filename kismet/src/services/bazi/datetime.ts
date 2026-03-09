const DAY_MS = 86_400_000;

type CivilDateParts = {
  year: number;
  month: number;
  day: number;
};

type CivilTimeParts = {
  hour: number;
  minute: number;
  second: number;
};

export type CivilDateTime = CivilDateParts & CivilTimeParts;

const TIMEZONE_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = TIMEZONE_FORMATTERS.get(timeZone);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  });
  TIMEZONE_FORMATTERS.set(timeZone, formatter);
  return formatter;
}

function normalizeHour(parts: CivilDateTime): CivilDateTime {
  if (parts.hour !== 24) {
    return parts;
  }

  const nextDay = addCivilDays(`${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`, 1);
  const nextDate = parseCivilDateParts(nextDay);
  return {
    ...nextDate,
    hour: 0,
    minute: parts.minute,
    second: parts.second,
  };
}

export function parseCivilDateParts(date: string): CivilDateParts {
  const [year = 2000, month = 1, day = 1] = date.split('-').map((item) => Number(item));
  return { year, month, day };
}

export function parseCivilTimeParts(time: string): CivilTimeParts {
  const [hour = 0, minute = 0, second = 0] = time.split(':').map((item) => Number(item));
  return { hour, minute, second };
}

export function addCivilDays(date: string, days: number): string {
  const { year, month, day } = parseCivilDateParts(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

export function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = getFormatter(timeZone).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;

  const normalized = normalizeHour({
    year: values.year ?? date.getUTCFullYear(),
    month: values.month ?? (date.getUTCMonth() + 1),
    day: values.day ?? date.getUTCDate(),
    hour: values.hour ?? date.getUTCHours(),
    minute: values.minute ?? date.getUTCMinutes(),
    second: values.second ?? date.getUTCSeconds(),
  });

  const asUtc = Date.UTC(
    normalized.year,
    normalized.month - 1,
    normalized.day,
    normalized.hour,
    normalized.minute,
    normalized.second,
  );
  return Math.round((asUtc - date.getTime()) / 60_000);
}

export function zonedCivilToUtc(parts: CivilDateTime, timeZone: string): Date {
  const naiveUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let timestamp = naiveUtc;

  for (let index = 0; index < 4; index += 1) {
    const offset = getTimeZoneOffsetMinutes(new Date(timestamp), timeZone);
    const next = naiveUtc - (offset * 60_000);
    if (next === timestamp) {
      break;
    }
    timestamp = next;
  }

  return new Date(timestamp);
}

export function zonedCivilStringToUtc(date: string, time: string, timeZone: string): Date {
  return zonedCivilToUtc(
    {
      ...parseCivilDateParts(date),
      ...parseCivilTimeParts(time),
    },
    timeZone,
  );
}
