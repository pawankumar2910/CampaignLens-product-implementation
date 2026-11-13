/**
 * Timestamps (when something was imported, finalized or shared) are shown in UTC
 * with the zone stated, so the server and every viewer render the same text.
 * Calendar dates of campaign data are separate and never pass through here.
 */
const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

export function formatTimestamp(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${formatter.format(date)} UTC`;
}
