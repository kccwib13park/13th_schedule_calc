import { buildPeriod, validateScheduleInput, VALIDATION_CODES } from '../assets/schedule-engine.js';

export function analyzeScheduleLegacy(config) {
  const period = buildPeriod(config.startDate, config.endDate);
  const totalDays = period.length;
  const totalReq = period.reduce((sum, day) => sum + config.required[day.dow], 0);
  const weeksCount = period.filter((day) => day.isWeekEnd).length;
  const validation = validateScheduleInput(config, weeksCount, totalDays);

  if (validation) throw new Error(`Legacy comparison requires valid input: ${validation.code}`);

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
      inputErrorCode: VALIDATION_CODES.NO_FEASIBLE_STATE,
      totalDays,
      totalReq,
      maxCovered: 0,
      shortage: totalReq,
      weeksCount
    };
  }

  return {
    ok: minimumShortage === 0,
    inputErrorCode: undefined,
    totalDays,
    totalReq,
    maxCovered: totalReq - minimumShortage,
    shortage: minimumShortage,
    weeksCount
  };
}
