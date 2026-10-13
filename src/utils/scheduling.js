/* Shared by the browser and API so both enforce the same IST scheduling rules. */
const TIME_ZONE = 'Asia/Kolkata';
const DAY_MINUTES = 8 * 60;
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const indiaDate = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

function dateKey(date = new Date()) {
  const parts = Object.fromEntries(indiaDate.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parseDate(value) {
  return new Date(`${value}T12:00:00Z`);
}

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(parseDate(value).getTime()) && dateKey(parseDate(value)) === value;
}

function minutes(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return NaN;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function timeValue(value) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function formatTime(value) {
  const total = minutes(value);
  if (!Number.isFinite(total)) return '';
  const hour = Math.floor(total / 60);
  return `${hour % 12 || 12}:${String(total % 60).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function formatTimeRange(start, end) {
  return `${formatTime(start)} – ${formatTime(end)} IST`;
}

function currentMinute() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

function overlaps(a, b) {
  return minutes(a.start) < minutes(b.end) && minutes(b.start) < minutes(a.end);
}

function validateAvailability(value) {
  if (!Array.isArray(value) || value.length > 150) return 'Please use up to 150 availability slots.';
  for (let index = 0; index < value.length; index += 1) {
    const slot = value[index];
    if (!slot || !Number.isFinite(minutes(slot.start)) || !Number.isFinite(minutes(slot.end)) || minutes(slot.end) <= minutes(slot.start)) {
      return 'End time must be after start time. Split overnight availability across two dates.';
    }
    if (slot.date ? !validDate(slot.date) || slot.date < dateKey() : !Number.isInteger(slot.weekday) || slot.weekday < 0 || slot.weekday > 6) {
      return 'Choose an upcoming date or a valid day of the week.';
    }
    if (value.slice(0, index).some((previous) => (slot.date ? previous.date === slot.date : !previous.date && previous.weekday === slot.weekday) && overlaps(slot, previous))) {
      return 'These hours overlap another slot on the same day. Choose separate time windows.';
    }
  }
  return '';
}

function mergeWindows(windows) {
  const result = [];
  windows.map((slot) => ({ start: minutes(slot.start), end: minutes(slot.end) }))
    .sort((a, b) => a.start - b.start).forEach((slot) => {
      const previous = result[result.length - 1];
      if (previous && previous.end >= slot.start) previous.end = Math.max(previous.end, slot.end);
      else result.push({ ...slot });
    });
  return result;
}

function windowsForDate(availability = [], date) {
  if (!validDate(date)) return [];
  const dated = availability.filter((slot) => slot.date === date);
  const weekday = parseDate(date).getUTCDay();
  return mergeWindows(dated.length ? dated : availability.filter((slot) => !slot.date && slot.weekday === weekday));
}

function activeBooking(booking) {
  return booking.status === 'requested' || booking.status === 'confirmed';
}

function availableSlots(creator, date, bookings = [], clientAvailability = []) {
  if (!creator || creator.status === 'paused' || !validDate(date) || date < dateKey()) return [];
  let windows = windowsForDate(creator.availability, date);
  if (clientAvailability.length) {
    const preferred = windowsForDate(clientAvailability, date);
    windows = windows.flatMap((window) => preferred.map((slot) => ({ start: Math.max(window.start, slot.start), end: Math.min(window.end, slot.end) })).filter((slot) => slot.end > slot.start));
  }
  const busyTimes = [
    ...(creator.busyTimes || []).filter((slot) => slot.date === date),
    ...bookings.filter((booking) => booking.creatorId === creator.id && booking.date === date && activeBooking(booking)),
  ];
  busyTimes.forEach((busy) => {
    const start = minutes(busy.start);
    const end = minutes(busy.end);
    windows = windows.flatMap((window) => {
      if (start >= window.end || end <= window.start) return [window];
      return [{ start: window.start, end: Math.min(start, window.end) }, { start: Math.max(end, window.start), end: window.end }].filter((slot) => slot.end > slot.start);
    });
  });
  if (date === dateKey()) {
    const earliest = currentMinute() + 1;
    windows = windows.map((window) => ({ ...window, start: Math.max(window.start, earliest) })).filter((slot) => slot.end > slot.start);
  }
  return windows.map((slot) => {
    const start = timeValue(slot.start);
    const end = timeValue(slot.end);
    return { id: `${start}-${end}`, start, end, label: 'Available window', time: formatTimeRange(start, end), factor: (slot.end - slot.start) / DAY_MINUTES };
  });
}

function bookingFits(creator, date, start, end, bookings = [], clientAvailability = []) {
  if (!Number.isFinite(minutes(start)) || !Number.isFinite(minutes(end)) || minutes(end) <= minutes(start)) return false;
  return availableSlots(creator, date, bookings, clientAvailability).some((slot) => minutes(start) >= minutes(slot.start) && minutes(end) <= minutes(slot.end));
}

function nextAvailableDate(creator, bookings = [], clientAvailability = []) {
  const today = parseDate(dateKey());
  for (let offset = 0; offset < 90; offset += 1) {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() + offset);
    const key = dateKey(day);
    if (availableSlots(creator, key, bookings, clientAvailability).length) return key;
  }
  return [...(creator?.availability || []), ...clientAvailability].map((slot) => slot.date).filter((day) => day && day >= dateKey()).sort()
    .find((day) => availableSlots(creator, day, bookings, clientAvailability).length) || null;
}

module.exports = { TIME_ZONE, DAY_MINUTES, weekdays, dateKey, parseDate, validDate, minutes, formatTime, formatTimeRange, overlaps, validateAvailability, windowsForDate, activeBooking, availableSlots, bookingFits, nextAvailableDate };
