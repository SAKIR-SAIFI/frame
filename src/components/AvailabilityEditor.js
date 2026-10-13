import { useId, useState } from 'react';
import Icon from './Icon';
import Modal from './Modal';
import { dateKey, parseDate, formatDate, formatTimeRange, makeId, validateAvailability, weekdays } from '../utils/marketplace';

function tomorrow() {
  const date = parseDate(dateKey());
  date.setUTCDate(date.getUTCDate() + 1);
  return dateKey(date);
}

export function upcomingAvailability(availability = []) {
  return availability.filter((slot) => !slot.date || slot.date >= dateKey());
}

export default function AvailabilityEditor({ value, onChange, allowWeekly = true, defaultDate = tomorrow(), legend = 'Add comfortable time slots' }) {
  const uniqueId = useId();
  const [draft, setDraft] = useState({ kind: 'date', date: defaultDate, weekday: 1, start: '09:00', end: '17:00' });
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const update = (field, next) => { setDraft((current) => ({ ...current, [field]: next })); setError(''); };

  function addSlot() {
    const slot = { id: editing || makeId('time'), ...(draft.kind === 'weekly' ? { weekday: Number(draft.weekday) } : { date: draft.date }), start: draft.start, end: draft.end };
    const next = editing ? value.map((item) => item.id === editing ? slot : item) : [...value, slot];
    const failure = validateAvailability(next);
    if (failure) { setError(failure); return; }
    onChange(next);
    setEditing(null);
    setError('');
  }

  return <fieldset className="availability-editor"><legend>{legend} <span>IST · UTC +05:30</span></legend>
    {allowWeekly && <div className="schedule-kind"><button type="button" className={draft.kind === 'date' ? 'active' : ''} aria-pressed={draft.kind === 'date'} onClick={() => update('kind', 'date')}>Specific date</button><button type="button" className={draft.kind === 'weekly' ? 'active' : ''} aria-pressed={draft.kind === 'weekly'} onClick={() => update('kind', 'weekly')}>Repeat every week</button></div>}
    <div className="availability-fields">
      {draft.kind === 'weekly' ? <label htmlFor={`${uniqueId}-day`}>Day of the week<select id={`${uniqueId}-day`} value={draft.weekday} onChange={(event) => update('weekday', Number(event.target.value))}>{weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label> : <label htmlFor={`${uniqueId}-date`}>Available date<input id={`${uniqueId}-date`} type="date" min={dateKey()} value={draft.date} onChange={(event) => update('date', event.target.value)} /></label>}
      <label htmlFor={`${uniqueId}-start`}>Start time<input id={`${uniqueId}-start`} type="time" step="60" value={draft.start} onChange={(event) => update('start', event.target.value)} /></label>
      <label htmlFor={`${uniqueId}-end`}>End time<input id={`${uniqueId}-end`} type="time" step="60" value={draft.end} onChange={(event) => update('end', event.target.value)} /></label>
    </div>
    <div className="availability-add"><button className="button button-outline button-small" type="button" onClick={addSlot}><Icon name={editing ? 'check' : 'plus'} size={15} />{editing ? 'Update slot' : 'Add time slot'}</button>{editing && <button type="button" className="text-button" onClick={() => { setEditing(null); setError(''); }}>Cancel edit</button>}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="availability-list">{value.length ? value.map((slot) => <div className="availability-row" key={slot.id}><Icon name="clock" size={17} /><span><strong>{slot.date ? formatDate(slot.date, { weekday: 'short', year: 'numeric' }) : `Every ${weekdays[slot.weekday]}`}</strong><small>{formatTimeRange(slot.start, slot.end)}</small></span><button type="button" className="icon-button" aria-label={`Edit ${slot.date || weekdays[slot.weekday]} ${slot.start} slot`} onClick={() => { setEditing(slot.id); setDraft({ kind: slot.date ? 'date' : 'weekly', date: slot.date || defaultDate, weekday: slot.weekday ?? 1, start: slot.start, end: slot.end }); setError(''); }}><Icon name="edit" size={15} /></button><button type="button" className="icon-button" aria-label={`Remove ${slot.date || weekdays[slot.weekday]} ${slot.start} slot`} onClick={() => { onChange(value.filter((item) => item.id !== slot.id)); if (editing === slot.id) setEditing(null); }}><Icon name="close" size={15} /></button></div>) : <p className="availability-empty">No time slots added yet. Pick your hours and click “Add time slot”.</p>}</div>
    {allowWeekly && <p className="form-hint">Add several windows per day, including evenings and weekends. Specific-date slots replace your weekly hours for that date.</p>}
  </fieldset>;
}

export function AvailabilityModal({ user, availability, onClose, onSubmit }) {
  const [values, setValues] = useState(() => upcomingAvailability(availability));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try { await onSubmit(values); }
    catch (failure) { setError(failure.message); setBusy(false); }
  }
  return <Modal title="Your time. Your comfort." subtitle={user.role === 'client' ? 'Set your preferred hours and see call times that match both schedules. Leave your schedule empty if any time works for you.' : 'Choose the dates and hours you want to work. This schedule applies to all of your gigs.'} onClose={onClose} className="form-modal">
    <form className="modal-form" onSubmit={submit}><AvailabilityEditor value={values} onChange={setValues} legend={user.role === 'client' ? 'My preferred availability' : 'My working availability'} />
      <p className="form-hint">Existing booking requests and confirmed shoots keep their agreed call times. Past dated slots are cleared when you save.</p>
      {error && <p className="form-error" role="alert">{error}</p>}<button className="button button-primary button-full" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save availability'}<Icon name="check" size={17} /></button>
    </form>
  </Modal>;
}
