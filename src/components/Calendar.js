import { useState } from 'react';
import Icon from './Icon';
import { availableSlots, dateKey, parseDate } from '../utils/marketplace';

export default function Calendar({ creator, selectedDate, onSelect, bookings, clientAvailability = [] }) {
  const [month, setMonth] = useState(() => {
    const date = parseDate(selectedDate || dateKey());
    return new Date(date.getUTCFullYear(), date.getUTCMonth(), 1);
  });
  const indiaToday = parseDate(dateKey());
  const today = new Date(indiaToday.getUTCFullYear(), indiaToday.getUTCMonth(), indiaToday.getUTCDate());
  const firstDay = (month.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const canGoBack = month.getFullYear() > today.getFullYear() || (month.getFullYear() === today.getFullYear() && month.getMonth() > today.getMonth());

  return (
    <div className="calendar">
      <div className="calendar-heading">
        <strong>{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</strong>
        <div className="calendar-arrows">
          <button className="icon-button" aria-label="Previous month" disabled={!canGoBack} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Icon name="chevronLeft" size={17} /></button>
          <button className="icon-button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Icon name="chevronRight" size={17} /></button>
        </div>
      </div>
      <div className="calendar-grid">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <span key={`weekday-${index}`} className="calendar-weekday">{day}</span>)}
        {Array.from({ length: firstDay }, (_, index) => <span key={`blank-${index}`} />)}
        {Array.from({ length: days }, (_, index) => {
          const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`;
          const enabled = availableSlots(creator, key, bookings, clientAvailability).length > 0;
          return <button type="button" key={key} className={`calendar-day ${selectedDate === key ? 'selected' : ''} ${key === dateKey() ? 'today' : ''}`} disabled={!enabled} aria-pressed={selectedDate === key} aria-label={parseDate(key).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'long', day: 'numeric', year: 'numeric' })} onClick={() => onSelect(key)}>{index + 1}{enabled && <i />}</button>;
        })}
      </div>
      <div className="calendar-key"><span className="status-dot" /> {clientAvailability.length ? 'Matches both schedules' : 'Available to book'} <span className="calendar-key-divider">·</span> IST (UTC +05:30)</div>
    </div>
  );
}
