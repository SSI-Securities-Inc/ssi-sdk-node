/** Datetime formatting utilities for SSI SDK. */

function pad(num: number, length = 2): string {
  return String(num).padStart(length, '0');
}

/** Format a Date object (or timestamp/date string) into 'YYYY/MM/DD HH:mm:ss' format. */
export function convertToDatetimeStr(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

/** Get today's date as a 'YYYY/MM/DD' string. */
export function todayDateStr(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return `${year}/${month}/${day}`;
}

/** Get the start of the current day as a 'YYYY/MM/DD 00:00:00' string. */
export function fromBeginningOfDay(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return `${year}/${month}/${day} 00:00:00`;
}

/** Get the end of the current day as a 'YYYY/MM/DD 23:59:59' string. */
export function fromEndOfDay(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return `${year}/${month}/${day} 23:59:59`;
}
