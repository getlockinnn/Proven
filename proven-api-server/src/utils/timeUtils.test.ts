import {
  getDateKeyInTimeZone,
  getDayRangeUtc,
  getChallengeDayNumber,
  getChallengeTotalDays,
} from './timeUtils';

describe('timeUtils canonical day helpers', () => {
  it('computes IST day boundaries correctly around midnight', () => {
    const referenceDate = new Date('2026-02-21T21:23:00.000Z'); // 2026-02-22 02:53 IST
    const dayRange = getDayRangeUtc(referenceDate, 'Asia/Kolkata');

    expect(dayRange.dateKey).toBe('2026-02-22');
    expect(dayRange.startUtc.toISOString()).toBe('2026-02-21T18:30:00.000Z');
    expect(dayRange.endUtc.toISOString()).toBe('2026-02-22T18:30:00.000Z');
  });

  it('computes day number from canonical date keys', () => {
    const toDateKey = (date: Date) => getDateKeyInTimeZone(date, 'Asia/Kolkata');
    const challengeStart = new Date('2026-02-21T00:00:00.000Z');
    const dayTwoMoment = new Date('2026-02-21T18:31:00.000Z'); // 2026-02-22 00:01 IST

    const dayNumber = getChallengeDayNumber(challengeStart, dayTwoMoment, toDateKey);
    expect(dayNumber).toBe(2);
  });

  it('calculates challenge total days across month boundaries', () => {
    const toDateKey = (date: Date) => getDateKeyInTimeZone(date, 'Asia/Kolkata');
    const start = new Date('2026-01-30T00:00:00.000Z');
    const endExclusive = new Date('2026-02-06T00:00:00.000Z');

    const totalDays = getChallengeTotalDays(start, endExclusive, toDateKey);
    expect(totalDays).toBe(7);
  });

  it('clamps day number to total days when provided', () => {
    const toDateKey = (date: Date) => getDateKeyInTimeZone(date, 'Asia/Kolkata');
    const challengeStart = new Date('2026-02-21T00:00:00.000Z');
    const longAfterEnd = new Date('2026-03-05T12:00:00.000Z');

    const dayNumber = getChallengeDayNumber(challengeStart, longAfterEnd, toDateKey, 7);
    expect(dayNumber).toBe(7);
  });
});
