import type { Request } from 'express';
import type { ParsedQs } from 'qs';
import { config } from '../config';

export const DAY_MS = 24 * 60 * 60 * 1000;

export const getPartValue = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((p) => p.type === type)?.value;
    return value ? parseInt(value, 10) : 0;
};

export const getUtcMsFromTimeZoneView = (date: Date, timeZone: string): number => {
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

    return Date.UTC(
        getPartValue(parts, 'year'),
        getPartValue(parts, 'month') - 1,
        getPartValue(parts, 'day'),
        getPartValue(parts, 'hour'),
        getPartValue(parts, 'minute'),
        getPartValue(parts, 'second'),
    );
};

export const isValidTimeZone = (value: string | null | undefined): value is string => {
    if (typeof value !== 'string') return false;
    const tz = value.trim();
    if (!tz) return false;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
        return true;
    } catch {
        return false;
    }
};

export const resolveTimeZone = (...candidates: Array<string | undefined | null>): string => {
    for (const candidate of candidates) {
        if (!candidate) continue;
        const trimmed = candidate.trim();
        if (isValidTimeZone(trimmed)) {
            return trimmed;
        }
    }
    return 'UTC';
};

export const isValidDateKey = (value: string | null | undefined): value is string => {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
    const date = new Date(`${trimmed}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === trimmed;
};

export const parseUtcOffsetMinutes = (
    ...candidates: Array<string | number | ParsedQs | (string | ParsedQs)[] | null | undefined>
): number | undefined => {
    for (const candidate of candidates) {
        if (candidate === null || candidate === undefined) continue;
        const parsed = typeof candidate === 'number'
            ? candidate
            : typeof candidate === 'string'
                ? Number(candidate.trim())
                : NaN;
        if (!Number.isFinite(parsed)) continue;
        const minutes = Math.trunc(parsed);
        if (minutes >= -840 && minutes <= 840) return minutes;
    }
    return undefined;
};

export const getDateKeyInTimeZone = (date: Date, timeZone: string): string => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const year = getPartValue(parts, 'year');
    const month = String(getPartValue(parts, 'month')).padStart(2, '0');
    const day = String(getPartValue(parts, 'day')).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const getDateKeyFromUtcOffset = (date: Date, offsetMinutes: number): string =>
    new Date(date.getTime() - offsetMinutes * 60 * 1000).toISOString().slice(0, 10);

export const addDaysToDateKey = (dateKey: string, days: number): string => {
    const date = new Date(`${dateKey}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
};

export const diffDateKeys = (startDateKey: string, endDateKey: string): number =>
    Math.floor((Date.parse(`${endDateKey}T00:00:00Z`) - Date.parse(`${startDateKey}T00:00:00Z`)) / DAY_MS);

export const getDayRangeUtc = (referenceDate: Date, timeZone: string): {
    dateKey: string;
    startUtc: Date;
    endUtc: Date;
} => {
    const dateKey = getDateKeyInTimeZone(referenceDate, timeZone);
    const offsetMs =
        getUtcMsFromTimeZoneView(referenceDate, timeZone) - getUtcMsFromTimeZoneView(referenceDate, 'UTC');
    const startUtc = new Date(Date.parse(`${dateKey}T00:00:00Z`) - offsetMs);
    const endUtc = new Date(startUtc.getTime() + DAY_MS);
    return { dateKey, startUtc, endUtc };
};

export const getDayRangeUtcFromOffset = (
    referenceDate: Date,
    offsetMinutes: number,
    preferredDateKey?: string
): {
    dateKey: string;
    startUtc: Date;
    endUtc: Date;
} => {
    const dateKey = isValidDateKey(preferredDateKey)
        ? preferredDateKey
        : getDateKeyFromUtcOffset(referenceDate, offsetMinutes);
    const startUtc = new Date(Date.parse(`${dateKey}T00:00:00Z`) + offsetMinutes * 60 * 1000);
    const endUtc = new Date(startUtc.getTime() + DAY_MS);
    return { dateKey, startUtc, endUtc };
};

type DayBoundaryRequest = Pick<Request, 'body' | 'query' | 'header'>;

const getStringCandidate = (
    value: string | ParsedQs | (string | ParsedQs)[] | null | undefined
): string | undefined => {
    if (typeof value === 'string') return value;
    if (!Array.isArray(value) || value.length === 0) return undefined;
    const [first] = value;
    return typeof first === 'string' ? first : undefined;
};

export const getChallengeTimeZone = (): string => {
    const configuredTimeZone = config.challengeDay.timezone;
    return isValidTimeZone(configuredTimeZone) ? configuredTimeZone : 'Asia/Kolkata';
};

export const parseDateInputInTimeZone = (value: string, timeZone: string): Date => {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
        throw new Error('Date value is required');
    }

    if (isValidDateKey(trimmedValue)) {
        const referenceDate = new Date(`${trimmedValue}T12:00:00Z`);
        const dayRange = getDayRangeUtc(referenceDate, timeZone);
        if (dayRange.dateKey !== trimmedValue) {
            throw new Error(`Date value "${trimmedValue}" is not valid for timezone ${timeZone}`);
        }
        return dayRange.startUtc;
    }

    const parsedDate = new Date(trimmedValue);
    if (!Number.isFinite(parsedDate.getTime())) {
        throw new Error(`Invalid date value: ${value}`);
    }

    return parsedDate;
};

export const getChallengeDayBoundary = (referenceDate: Date = new Date()) => {
    const challengeTimeZone = getChallengeTimeZone();
    const dayRange = getDayRangeUtc(referenceDate, challengeTimeZone);

    return {
        todayStr: dayRange.dateKey,
        todayMidnightUTC: dayRange.startUtc,
        tomorrowMidnightUTC: dayRange.endUtc,
        getClientDateKey: (date: Date) => getDateKeyInTimeZone(date, challengeTimeZone),
        timeZone: challengeTimeZone,
    };
};

export const getChallengeTotalDays = (startDate: Date, endDateExclusive: Date, toDateKey: (date: Date) => string): number =>
    Math.max(1, diffDateKeys(toDateKey(startDate), toDateKey(endDateExclusive)));

export const getChallengeDayNumber = (
    challengeStartDate: Date,
    targetDate: Date,
    toDateKey: (date: Date) => string,
    totalDays?: number
): number => {
    const rawDayNumber = Math.max(1, diffDateKeys(toDateKey(challengeStartDate), toDateKey(targetDate)) + 1);
    if (typeof totalDays === 'number') {
        return Math.min(totalDays, rawDayNumber);
    }
    return rawDayNumber;
};

export const getClientDayBoundary = (
    req: DayBoundaryRequest,
    timezonePreference: string | null | undefined,
    referenceDate: Date = new Date()
) => {
    if (config.challengeDay.mode === 'CENTRAL_IST') {
        return getChallengeDayBoundary(referenceDate);
    }

    const requestTzBody = getStringCandidate(req.body?.tz) ?? getStringCandidate(req.query?.tz);
    const requestTzHeader = req.header ? req.header('x-timezone') : undefined;

    const hasExplicitRequestTz = isValidTimeZone(requestTzBody) || isValidTimeZone(requestTzHeader);
    const hasNonUtcPreferenceTz = isValidTimeZone(timezonePreference) && timezonePreference !== 'UTC';

    const offsetMinutes = parseUtcOffsetMinutes(
        req.body?.offsetMinutes,
        req.query?.offsetMinutes,
        req.header ? req.header('x-utc-offset-minutes') : undefined
    );

    const requestDateKeyBody = getStringCandidate(req.body?.dateKey);
    const requestDateKeyQuery = getStringCandidate(req.query?.dateKey);
    const requestDateKeyHeader = req.header ? req.header('x-local-date-key') : undefined;

    const providedDateKey = isValidDateKey(requestDateKeyBody)
        ? requestDateKeyBody
        : isValidDateKey(requestDateKeyQuery)
            ? requestDateKeyQuery
            : isValidDateKey(requestDateKeyHeader)
                ? requestDateKeyHeader
                : undefined;

    let todayStr: string;
    let todayMidnightUTC: Date;
    let tomorrowMidnightUTC: Date;
    let getClientDateKey: (date: Date) => string;
    let timeZone: string;

    if (hasExplicitRequestTz) {
        const clientTz = resolveTimeZone(requestTzBody, requestTzHeader);
        const dayRange = getDayRangeUtc(referenceDate, clientTz);
        todayStr = dayRange.dateKey;
        todayMidnightUTC = dayRange.startUtc;
        tomorrowMidnightUTC = dayRange.endUtc;
        getClientDateKey = (date: Date) => getDateKeyInTimeZone(date, clientTz);
        timeZone = clientTz;
    } else if (hasNonUtcPreferenceTz && timezonePreference) {
        const dayRange = getDayRangeUtc(referenceDate, timezonePreference);
        todayStr = dayRange.dateKey;
        todayMidnightUTC = dayRange.startUtc;
        tomorrowMidnightUTC = dayRange.endUtc;
        getClientDateKey = (date: Date) => getDateKeyInTimeZone(date, timezonePreference);
        timeZone = timezonePreference;
    } else if (offsetMinutes !== undefined) {
        const dayRange = getDayRangeUtcFromOffset(referenceDate, offsetMinutes, providedDateKey);
        todayStr = dayRange.dateKey;
        todayMidnightUTC = dayRange.startUtc;
        tomorrowMidnightUTC = dayRange.endUtc;
        getClientDateKey = (date: Date) => getDateKeyFromUtcOffset(date, offsetMinutes);
        timeZone = 'OFFSET';
    } else {
        const clientTz = resolveTimeZone(timezonePreference);
        const dayRange = getDayRangeUtc(referenceDate, clientTz);
        todayStr = dayRange.dateKey;
        todayMidnightUTC = dayRange.startUtc;
        tomorrowMidnightUTC = dayRange.endUtc;
        getClientDateKey = (date: Date) => getDateKeyInTimeZone(date, clientTz);
        timeZone = clientTz;
    }

    return {
        todayStr,
        todayMidnightUTC,
        tomorrowMidnightUTC,
        getClientDateKey,
        timeZone,
    };
};
