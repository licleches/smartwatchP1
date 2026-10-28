export const weekdayLabels = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
export const weekdayNames = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
};

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function partsFromFormat(date: Date, timeZone?: string): DateParts {
  if (!timeZone) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
    };
  }

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const values = Object.fromEntries(
      parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]),
    );
    return {
      year: values.year,
      month: values.month,
      day: values.day,
      hour: values.hour,
      minute: values.minute,
      second: values.second,
    };
  } catch {
    return partsFromFormat(date);
  }
}

export function getDeviceTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function getSafeTimeZone(timeZone?: string | null) {
  if (!timeZone) return getDeviceTimeZone();
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
    return timeZone;
  } catch {
    return getDeviceTimeZone();
  }
}

export function getDateKey(date = new Date(), timeZone = getDeviceTimeZone()) {
  const parts = partsFromFormat(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function addDays(dateKey: string, amount: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function getDateKeys(startDateKey: string, amount: number) {
  return Array.from({ length: amount }, (_, index) => addDays(startDateKey, index));
}

export function getWeekday(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function dateForTimeZone(dateKey: string, time: string, timeZone = getDeviceTimeZone()) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const safeHour = Number.isFinite(hour) ? hour : 0;
  const safeMinute = Number.isFinite(minute) ? minute : 0;

  if (!timeZone) {
    return new Date(year, month - 1, day, safeHour, safeMinute, 0, 0);
  }

  try {
    const guess = new Date(Date.UTC(year, month - 1, day, safeHour, safeMinute, 0, 0));
    const local = partsFromFormat(guess, timeZone);
    const localAsUtc = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour ?? 0,
      local.minute ?? 0,
      local.second ?? 0,
    );
    return new Date(guess.getTime() - (localAsUtc - guess.getTime()));
  } catch {
    return new Date(year, month - 1, day, safeHour, safeMinute, 0, 0);
  }
}

export function formatLongDate(dateKey: string, timeZone = getDeviceTimeZone()) {
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'long',
    timeZone,
  }).format(dateForTimeZone(dateKey, '12:00', timeZone));
}

export function formatShortDate(dateKey: string, timeZone = getDeviceTimeZone()) {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'short',
    day: 'numeric',
    timeZone,
  })
    .format(dateForTimeZone(dateKey, '12:00', timeZone))
    .replace('.', '');
}

export function formatTime(value: string, timeZone = getDeviceTimeZone()) {
  if (/^\d{1,2}:\d{2}/.test(value)) {
    return value.slice(0, 5);
  }

  try {
    return new Intl.DateTimeFormat('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone,
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function normalizeDate(value: string) {
  return value.slice(0, 10);
}

export function dateKeyFromLocalDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dateFromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function addCalendarMonths(date: Date, amount: number) {
  const target = new Date(date.getFullYear(), date.getMonth() + amount, 1, 12, 0, 0, 0);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), lastDay), 12, 0, 0, 0);
}

export function formatDateForDisplay(dateKey: string) {
  const [year, month, day] = dateKey.split('-');
  return `${day}/${month}/${year}`;
}

export function normalizeTime(value: string) {
  const [hour, minute] = value.slice(0, 5).split(':').map(Number);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

export function dateFromTime(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return new Date(2000, 0, 1, hour || 0, minute || 0, 0, 0);
}

export function timeFromDate(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:00`;
}

export function formatTime12(value: string | Date) {
  const date = typeof value === 'string' ? dateFromTime(value) : value;
  return new Intl.DateTimeFormat('es-MX', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}
