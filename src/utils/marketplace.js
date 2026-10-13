import { parseDate, TIME_ZONE } from './scheduling';
export { dateKey, parseDate, minutes, formatTime, formatTimeRange, weekdays, validateAvailability, activeBooking, availableSlots, bookingFits, nextAvailableDate } from './scheduling';

export function formatDate(value, options = {}) {
  return parseDate(value).toLocaleDateString('en-IN', { timeZone: TIME_ZONE, month: 'short', day: 'numeric', ...options });
}

export function money(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

export function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
