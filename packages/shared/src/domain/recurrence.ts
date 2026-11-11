/** Days are plain calendar dates written as YYYY-MM-DD. */
export interface Recurrence {
  from: string;
  to: string;
  /** 1 = Monday ... 7 = Sunday. */
  weekdays: readonly number[];
}

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(day: string): number {
  if (!dayPattern.test(day)) throw new RangeError(`not a calendar date: ${day}`);
  const time = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== day) throw new RangeError(`not a calendar date: ${day}`);
  return time;
}

/** Expands "every Tuesday and Thursday from A to B" into the single days it means. */
export function expandRecurrence(recurrence: Recurrence, limit = 366): string[] {
  const start = parseDay(recurrence.from);
  const end = parseDay(recurrence.to);
  if (end < start) throw new RangeError('the period ends before it starts');
  const wanted = new Set(recurrence.weekdays);
  for (const weekday of wanted) {
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw new RangeError('weekdays go from 1 (Monday) to 7 (Sunday)');
  }
  const days: string[] = [];
  for (let time = start; time <= end; time += 86_400_000) {
    const date = new Date(time);
    if (wanted.has(date.getUTCDay() === 0 ? 7 : date.getUTCDay())) days.push(date.toISOString().slice(0, 10));
    if (days.length > limit) throw new RangeError(`a recurrence can produce at most ${limit} days`);
  }
  return days;
}
