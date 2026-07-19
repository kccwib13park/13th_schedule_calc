export const FIXED_HOLIDAYS_2026 = new Set([
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-02',
  '2026-05-05', '2026-05-25', '2026-06-03', '2026-07-17', '2026-08-17',
  '2026-09-24', '2026-09-25', '2026-10-05', '2026-10-09', '2026-12-25'
]);

export const MONTH_PRESETS_2026 = Object.freeze({
  1: { start: '2026-01-05', weeks: 4 },
  2: { start: '2026-02-02', weeks: 4 },
  3: { start: '2026-03-02', weeks: 5 },
  4: { start: '2026-04-06', weeks: 4 },
  5: { start: '2026-05-04', weeks: 4 },
  6: { start: '2026-06-01', weeks: 5 },
  7: { start: '2026-07-06', weeks: 4 },
  8: { start: '2026-08-03', weeks: 5 },
  9: { start: '2026-09-07', weeks: 4 },
  10: { start: '2026-10-05', weeks: 4 },
  11: { start: '2026-11-02', weeks: 5 },
  12: { start: '2026-12-07', weeks: 4 }
});

export const toDate = (value) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

export const addDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

export const formatDateUTC = (date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const toMonday = (date) => {
  const dayOfWeek = date.getUTCDay();
  return addDays(date, dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
};

export const getMonthPreset = (month) => MONTH_PRESETS_2026[Number(month)] ?? null;

export const getAdjacentMonth = (month, direction) => {
  const current = Number(month);
  if (!Number.isInteger(current) || current < 1 || current > 12) return null;
  return Math.min(12, Math.max(1, current + Math.sign(Number(direction) || 0)));
};

export const detectMonthSwipe = ({ deltaX, deltaY, threshold = 48, dominance = 1.25 }) => {
  const horizontal = Math.abs(deltaX);
  const vertical = Math.abs(deltaY);
  if (horizontal < threshold || horizontal <= vertical * dominance) return 0;
  return deltaX < 0 ? 1 : -1;
};

export const createPeriodRange = (startValue, weeks) => {
  const startDate = toDate(startValue);
  const endDate = addDays(startDate, weeks * 7 - 1);
  return {
    startDate,
    endDate,
    start: formatDateUTC(startDate),
    end: formatDateUTC(endDate),
    weeks
  };
};

export const calculateHolidaySummary = (
  startDate,
  endDate,
  holidaySet = FIXED_HOLIDAYS_2026
) => {
  let weekendCount = 0;
  let holidayCount = 0;
  const monthly = {};

  for (let current = new Date(startDate); current <= endDate; current = addDays(current, 1)) {
    const dayOfWeek = current.getUTCDay();
    const key = formatDateUTC(current);
    const yearMonth = key.slice(0, 7);
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (isWeekend) {
      weekendCount += 1;
    } else if (holidaySet.has(key)) {
      holidayCount += 1;
      monthly[yearMonth] = (monthly[yearMonth] || 0) + 1;
    }
  }

  return { weekendCount, holidayCount, monthly };
};

export const getStaffingOptions = (workers) => {
  const max = Math.max(1, Number(workers) - 1);
  return Array.from({ length: max }, (_, index) => index + 1);
};

export const getStaffingSelection = (
  workers,
  current = {},
  { initialize = false } = {}
) => {
  const options = getStaffingOptions(workers);
  const max = options.at(-1);
  const choose = (value, preferred) => {
    if (!initialize && Number.isInteger(value) && options.includes(value)) return value;
    return Math.min(preferred, max);
  };

  return {
    options,
    monSat: choose(Number(current.monSat), 4),
    sun: choose(Number(current.sun), 2)
  };
};

export function buildPeriod(startDate, endDate) {
  const days = [];
  for (let current = new Date(startDate); current <= endDate; current = addDays(current, 1)) {
    const dayOfWeek = current.getUTCDay();
    days.push({
      dow: dayOfWeek,
      isWeekEnd: dayOfWeek === 0 || current.getTime() === endDate.getTime()
    });
  }
  return days;
}

export function validateInput(config, weeksCount, totalDays) {
  if (!Number.isInteger(config.workers) || config.workers < 1) {
    return '총 인원 수는 1 이상 정수여야 합니다.';
  }
  if (config.basic < 0 || config.bonus < 0) {
    return '휴일 수는 0 이상이어야 합니다.';
  }
  if (config.basic < weeksCount || config.basic > weeksCount * 2) {
    return `기본휴일 ${config.basic}일은 기간 내 ${weeksCount}주 규칙(주당 1~2회)과 맞지 않습니다. (${weeksCount}~${weeksCount * 2}일 필요)`;
  }
  if (config.basic + config.bonus > totalDays) {
    return '1인당 전체 휴일(기본+공휴)이 기간 일수보다 많습니다.';
  }
  if (config.required.some((count) => count < 0 || !Number.isInteger(count))) {
    return '요일별 필수 인원은 0 이상 정수여야 합니다.';
  }
  if (config.required.some((count) => count > config.workers)) {
    return '요일별 필수 인원은 총 인원 수를 초과할 수 없습니다.';
  }
  return '';
}

export function analyzeSchedule(config) {
  const period = buildPeriod(config.startDate, config.endDate);
  const totalDays = period.length;
  const totalReq = period.reduce((sum, day) => sum + config.required[day.dow], 0);
  const weeksCount = period.filter((day) => day.isWeekEnd).length;
  const inputError = validateInput(config, weeksCount, totalDays);

  if (inputError) {
    return {
      ok: false,
      inputError,
      totalDays,
      totalReq,
      maxCovered: 0,
      shortage: totalReq,
      weeksCount
    };
  }

  const totalOff = config.workers * (config.basic + config.bonus);
  const totalBasic = config.workers * config.basic;
  let states = new Map([['0|0|0', 0]]);

  const upsert = (map, key, value) => {
    const previous = map.get(key);
    if (previous === undefined || value < previous) map.set(key, value);
  };

  for (const day of period) {
    const slack = config.workers - config.required[day.dow];
    const next = new Map();

    for (const [key, currentShortage] of states) {
      const [usedOff, weekOff, cap] = key.split('|').map(Number);
      for (let off = 0; off <= config.workers; off += 1) {
        const nextUsed = usedOff + off;
        if (nextUsed > totalOff) continue;

        let nextWeekOff = weekOff + off;
        let nextCap = cap;
        if (day.isWeekEnd) {
          if (nextWeekOff < config.workers) continue;
          nextCap += Math.min(config.workers * 2, nextWeekOff);
          nextWeekOff = 0;
        }

        // Each unit is one worker unavailable beyond the day's staffing slack.
        const shortage = currentShortage + Math.max(0, off - slack);
        upsert(next, `${nextUsed}|${nextWeekOff}|${nextCap}`, shortage);
      }
    }
    states = next;
  }

  let minimumShortage = Number.POSITIVE_INFINITY;
  for (const [key, shortage] of states) {
    const [usedOff, weekOff, cap] = key.split('|').map(Number);
    if (usedOff !== totalOff || weekOff !== 0 || cap < totalBasic) continue;
    minimumShortage = Math.min(minimumShortage, shortage);
  }

  if (!Number.isFinite(minimumShortage)) {
    return {
      ok: false,
      inputError: '주당 기본휴일(1~2회) 제약을 만족하는 배치가 존재하지 않습니다.',
      totalDays,
      totalReq,
      maxCovered: 0,
      shortage: totalReq,
      weeksCount
    };
  }

  const shortage = Math.max(0, minimumShortage);
  return {
    ok: shortage === 0,
    totalDays,
    totalReq,
    maxCovered: totalReq - shortage,
    shortage,
    weeksCount,
    inputError: ''
  };
}
