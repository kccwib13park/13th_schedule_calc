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

export const VALIDATION_CODES = Object.freeze({
  PERIOD_INVALID: 'PERIOD_INVALID',
  WORKERS_INVALID: 'WORKERS_INVALID',
  HOLIDAYS_INVALID: 'HOLIDAYS_INVALID',
  WEEKLY_OFF_INVALID: 'WEEKLY_OFF_INVALID',
  HOLIDAYS_EXCEED_PERIOD: 'HOLIDAYS_EXCEED_PERIOD',
  STAFFING_INVALID: 'STAFFING_INVALID',
  STAFFING_EXCEEDS_WORKERS: 'STAFFING_EXCEEDS_WORKERS',
  NO_FEASIBLE_STATE: 'NO_FEASIBLE_STATE'
});

const validationError = (code, field, message) => ({ code, field, message });

export function validateScheduleInput(config, suppliedWeeksCount, suppliedTotalDays) {
  const startTime = config.startDate instanceof Date ? config.startDate.getTime() : Number.NaN;
  const endTime = config.endDate instanceof Date ? config.endDate.getTime() : Number.NaN;
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime > endTime) {
    return validationError(VALIDATION_CODES.PERIOD_INVALID, 'period', '계산 기간이 올바르지 않습니다. 월을 다시 선택해 주세요.');
  }
  if (config.startDate.getUTCDay() !== 1 || config.endDate.getUTCDay() !== 0) {
    return validationError(VALIDATION_CODES.PERIOD_INVALID, 'period', '계산 기간은 월요일에 시작해 일요일에 끝나야 합니다.');
  }

  const period = suppliedTotalDays === undefined ? buildPeriod(config.startDate, config.endDate) : null;
  const totalDays = suppliedTotalDays ?? period.length;
  const weeksCount = suppliedWeeksCount ?? period.filter((day) => day.isWeekEnd).length;

  if (!Number.isInteger(config.workers) || config.workers < 1) {
    return validationError(VALIDATION_CODES.WORKERS_INVALID, 'workers', '총인원은 1명 이상의 정수로 입력해 주세요.');
  }
  if (!Number.isInteger(config.basic) || !Number.isInteger(config.bonus) || config.basic < 0 || config.bonus < 0) {
    return validationError(VALIDATION_CODES.HOLIDAYS_INVALID, 'holidays', '1인당 휴일과 공휴는 0일 이상의 정수여야 합니다.');
  }
  if (config.basic < weeksCount || config.basic > weeksCount * 2) {
    return validationError(
      VALIDATION_CODES.WEEKLY_OFF_INVALID,
      'holidays',
      `기본휴일 ${config.basic}일은 ${weeksCount}주 동안 주당 1~2회 규칙을 충족하지 않습니다. ${weeksCount}~${weeksCount * 2}일이어야 합니다.`
    );
  }
  if (config.basic + config.bonus > totalDays) {
    return validationError(VALIDATION_CODES.HOLIDAYS_EXCEED_PERIOD, 'holidays', '1인당 전체 휴일이 계산 기간의 전체 일수보다 많습니다.');
  }
  if (!Array.isArray(config.required) || config.required.length !== 7 || config.required.some((count) => count < 0 || !Number.isInteger(count))) {
    return validationError(VALIDATION_CODES.STAFFING_INVALID, 'staffing', '최소 근무자는 0명 이상의 정수로 선택해 주세요.');
  }
  if (config.required.some((count) => count > config.workers)) {
    return validationError(VALIDATION_CODES.STAFFING_EXCEEDS_WORKERS, 'staffing', '최소 근무자는 총인원을 초과할 수 없습니다. 총인원 또는 최소 근무자를 조정해 주세요.');
  }
  return null;
}

export function validateInput(config, weeksCount, totalDays) {
  return validateScheduleInput(config, weeksCount, totalDays)?.message ?? '';
}

export function analyzeSchedule(config) {
  const periodIsValid = config.startDate instanceof Date
    && config.endDate instanceof Date
    && Number.isFinite(config.startDate.getTime())
    && Number.isFinite(config.endDate.getTime())
    && config.startDate <= config.endDate;
  const period = periodIsValid ? buildPeriod(config.startDate, config.endDate) : [];
  const totalDays = period.length;
  const hasNumericRequirements = Array.isArray(config.required)
    && config.required.length === 7
    && config.required.every(Number.isFinite);
  const totalReq = hasNumericRequirements
    ? period.reduce((sum, day) => sum + config.required[day.dow], 0)
    : 0;
  const weeksCount = period.filter((day) => day.isWeekEnd).length;
  const validation = validateScheduleInput(config, weeksCount, totalDays);

  if (validation) {
    return {
      ok: false,
      inputError: validation.message,
      inputErrorCode: validation.code,
      inputErrorField: validation.field,
      totalDays,
      totalReq,
      maxCovered: 0,
      shortage: totalReq,
      weeksCount
    };
  }

  const totalOff = config.workers * (config.basic + config.bonus);
  const maximumExtraOff = config.workers * config.bonus;
  const weekSlacks = [];
  for (let offset = 0; offset < period.length; offset += 7) {
    weekSlacks.push(period.slice(offset, offset + 7).reduce(
      (sum, day) => sum + config.workers - config.required[day.dow],
      0
    ));
  }

  // A weekly total of q days off can be distributed with a minimum shortage of
  // max(0, q - weeklySlack). The basic-off cap is equivalent to limiting the
  // total amount above two days off per worker to workers * bonus.
  const stateWidth = maximumExtraOff + 1;
  let states = new Map([[0, 0]]);

  const upsert = (map, key, value) => {
    const previous = map.get(key);
    if (previous === undefined || value < previous) map.set(key, value);
  };

  weekSlacks.forEach((weeklySlack, weekIndex) => {
    const next = new Map();
    const remainingWeeks = weekSlacks.length - weekIndex - 1;

    for (const [key, currentShortage] of states) {
      const usedOff = Math.floor(key / stateWidth);
      const extraOff = key % stateWidth;
      const minimumThisWeek = Math.max(
        config.workers,
        totalOff - usedOff - remainingWeeks * config.workers * 7
      );
      const maximumThisWeek = Math.min(
        config.workers * 7,
        totalOff - usedOff - remainingWeeks * config.workers
      );

      for (let weekOff = minimumThisWeek; weekOff <= maximumThisWeek; weekOff += 1) {
        const nextExtraOff = extraOff + Math.max(0, weekOff - config.workers * 2);
        if (nextExtraOff > maximumExtraOff) continue;

        const nextUsedOff = usedOff + weekOff;
        const shortage = currentShortage + Math.max(0, weekOff - weeklySlack);
        upsert(next, nextUsedOff * stateWidth + nextExtraOff, shortage);
      }
    }
    states = next;
  });

  let minimumShortage = Number.POSITIVE_INFINITY;
  for (let extraOff = 0; extraOff <= maximumExtraOff; extraOff += 1) {
    const shortage = states.get(totalOff * stateWidth + extraOff);
    if (shortage !== undefined) minimumShortage = Math.min(minimumShortage, shortage);
  }

  if (!Number.isFinite(minimumShortage)) {
    return {
      ok: false,
      inputError: '주당 기본휴일(1~2회) 제약을 만족하는 배치가 존재하지 않습니다.',
      inputErrorCode: VALIDATION_CODES.NO_FEASIBLE_STATE,
      inputErrorField: 'general',
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

export function buildResultSummaryModel(config, scheduleResult, month) {
  const period = `${formatDateUTC(config.startDate)} ~ ${formatDateUTC(config.endDate)}`;
  const monSat = config.required[1];
  const sunday = config.required[0];
  const baseMetrics = [
    ['계산 기간', period],
    ['주차', `${scheduleResult.weeksCount}주`],
    ['총인원', `${config.workers}명`],
    ['1인당 기본휴일', `${config.basic}일`],
    ['1인당 공휴', `${config.bonus}일`],
    ['월~토 최소 근무자', `${monSat}명`],
    ['일요일 최소 근무자', `${sunday}명`],
    ['전체 기간', `${scheduleResult.totalDays}일`],
    ['필요 근무량', `${scheduleResult.totalReq}인·일`],
    ['최대 충족 가능량', `${scheduleResult.maxCovered}인·일`]
  ];

  if (scheduleResult.ok) {
    return {
      status: 'success',
      icon: '✓',
      title: `2026년 ${month}월은 현재 조건으로 스케줄 작성이 가능합니다.`,
      description: '설정한 최소 근무자와 휴일 규칙을 모두 충족할 수 있습니다.',
      metrics: baseMetrics
    };
  }

  return {
    status: 'infeasible',
    icon: '!',
    title: `2026년 ${month}월은 현재 조건으로 스케줄 작성이 어렵습니다.`,
    description: `필수 근무 인원 조건을 충족하지 못하는 총 부족량: ${scheduleResult.shortage}인·일`,
    metrics: [...baseMetrics, ['총 부족량', `${scheduleResult.shortage}인·일`]]
  };
}
