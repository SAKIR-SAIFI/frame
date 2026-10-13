import { useState } from 'react';
import Modal from './Modal';
import Calendar from './Calendar';
import Icon from './Icon';
import { Avatar } from './CreatorCard';
import { PortfolioShowcase } from './PortfolioProjects';
import { availableSlots, bookingFits, dateKey, formatDate, formatTimeRange, minutes, money, nextAvailableDate } from '../utils/marketplace';

export default function BookingModal({ creator, bookings, projects, availability, initialDate, agreedRate, onClose, onBook, onNegotiate, onMessage, onAvailability }) {
  const [date, setDate] = useState(() => initialDate && availableSlots(creator, initialDate, bookings, availability).length ? initialDate : nextAvailableDate(creator, bookings, availability));
  const [slotId, setSlotId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [projectId, setProjectId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const slots = date ? availableSlots(creator, date, bookings, availability) : [];
  const selectedSlot = slots.find((slot) => slot.id === slotId) || slots[0];
  const chosenStart = start || selectedSlot?.start || '';
  const chosenEnd = end || selectedSlot?.end || '';
  const validTime = Boolean(date && bookingFits(creator, date, chosenStart, chosenEnd, bookings, availability));
  const rate = agreedRate || creator.rate;
  const total = validTime ? Math.round(rate * (minutes(chosenEnd) - minutes(chosenStart)) / (8 * 60)) : 0;

  async function handleBooking() {
    if (!validTime || busy) return;
    setBusy(true); setError('');
    try { await onBook({ creatorId: creator.id, date, start: chosenStart, end: chosenEnd, projectId }); }
    catch (failure) { setError(failure.message); setBusy(false); }
  }

  return <Modal title="Your next creative partner." subtitle="Get to know the person behind the lens, then choose your own call time." onClose={onClose} className="profile-modal">
    <div className="profile-layout"><div className="profile-overview">
      <img className="profile-cover" src={creator.cover} alt={`${creator.name}'s filmmaking portfolio`} />
      <div className="profile-identity"><Avatar creator={creator} /><div><h3>{creator.name}{creator.verified && <Icon name="verified" size={20} />}</h3><p>{creator.role} <span>·</span> {creator.location}</p></div></div>
      <div className="profile-meta"><span><Icon name="star" size={16} />{creator.reviews ? `${creator.rating.toFixed(1)} (${creator.reviews} reviews)` : 'New to frame.'}</span><span><span className="status-dot" />{date === dateKey() ? 'Open hours today' : date ? 'Open for bookings' : 'No matching open hours'}</span>{creator.remote && <span><Icon name="globe" size={14} />Remote across India</span>}</div>
      {creator.status === 'paused' && <p className="form-error">This gig is paused for new bookings. Your existing booking and conversation are still available.</p>}
      <h4>{creator.title}</h4><p className="profile-bio">{creator.bio}</p><h5>What’s in the kit</h5><div className="profile-tags">{creator.equipment.map((gear) => <span key={gear}><Icon name="camera" size={14} />{gear}</span>)}</div><h5>Skills and languages</h5><div className="profile-tags skill-tags">{creator.skills.map((skill) => <span key={skill}>{skill}</span>)}</div>
      <PortfolioShowcase projects={creator.portfolioProjects} />
      <button className="button button-outline profile-message" onClick={() => onMessage(creator)}><Icon name="message" size={17} />Let’s talk about your project</button>
    </div><aside className="booking-panel"><div className="booking-title"><div><span className="eyebrow">MAKE IT HAPPEN · INDIA</span><h3>Find your call time.</h3></div><div className="booking-rate">{agreedRate && agreedRate !== creator.rate && <s>{money(creator.rate)}</s>}<strong>{money(rate)}</strong><span>/ 8-hour day</span></div></div>
      <Calendar creator={creator} selectedDate={date} onSelect={(value) => { setDate(value); setSlotId(''); setStart(''); setEnd(''); setError(''); }} bookings={bookings} clientAvailability={availability} />
      <div className="schedule-match-note"><Icon name="clock" size={15} /><p>{availability.length ? 'Showing hours that match both your schedules.' : 'Have preferred hours? Add your availability to find a mutual fit.'}<button onClick={onAvailability}>Edit my availability</button></p></div>
      <div className="slot-heading"><h5>Available time windows</h5><span>{date ? formatDate(date, { weekday: 'short' }) : 'No matching dates'}</span></div>
      <div className="time-slots">{slots.length ? slots.map((slot) => <button key={slot.id} className={`time-slot ${selectedSlot?.id === slot.id ? 'selected' : ''}`} aria-pressed={selectedSlot?.id === slot.id} onClick={() => { setSlotId(slot.id); setStart(slot.start); setEnd(slot.end); setError(''); }}><span><strong>{slot.time}</strong><small>Choose any start and end time within this window</small></span>{selectedSlot?.id === slot.id && <Icon name="check" size={14} />}</button>) : <p className="no-slots">No matching open hours. Update your availability or message the freelancer to discuss another date.</p>}</div>
      {selectedSlot && <div className="custom-call-time"><div className="form-row"><label htmlFor="booking-start">Your start time<input id="booking-start" type="time" step="60" value={chosenStart} onChange={(event) => { setStart(event.target.value); setError(''); }} /></label><label htmlFor="booking-end">Your end time<input id="booking-end" type="time" step="60" value={chosenEnd} onChange={(event) => { setEnd(event.target.value); setError(''); }} /></label></div><p className="form-hint">All times are IST. Price is prorated from an 8-hour day.</p>{!validTime && <p className="form-error" role="alert">Choose an end time after the start, within an available window.</p>}</div>}
      {projects.some((project) => project.status === 'open') && <label className="booking-project-label" htmlFor="booking-project">Attach a project brief <small>(optional)</small><select id="booking-project" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">No brief attached</option>{projects.filter((project) => project.status === 'open').map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>}
      {error && <p className="form-error" role="alert">{error}</p>}<div className="booking-total"><span>Booking total</span><strong>{money(total)}</strong></div><button className="button button-primary button-full" disabled={!validTime || busy} onClick={handleBooking}>{busy ? 'Sending…' : 'Request booking'}<Icon name="arrowUpRight" size={18} /></button>
      <button className="negotiate-button" onClick={() => onNegotiate(creator, { date, start: chosenStart, end: chosenEnd })}><Icon name="message" size={15} />Have a budget in mind? Make an offer</button><p className="booking-note"><Icon name="shield" size={13} />Freelancer confirmation required. No payment collected.</p>
    </aside></div>
  </Modal>;
}

export function BookingConfirmation({ booking, onClose, onProjects }) {
  return <Modal title="Your next story is taking shape." onClose={onClose} className="confirmation-modal"><div className="confirmation-content"><span className="confirmation-icon"><Icon name="check" size={34} /></span><h3>Your booking request is in.</h3><p>Your chosen hours with <strong>{booking.creatorName}</strong> are held while the freelancer reviews your request. Track their confirmation in My projects.</p><div className="confirmation-details"><span><Icon name="calendar" size={18} />{formatDate(booking.date, { weekday: 'long', year: 'numeric' })}</span><span><Icon name="clock" size={18} />{formatTimeRange(booking.start, booking.end)}</span><span><Icon name="briefcase" size={18} />{money(booking.total)} · awaiting confirmation</span></div><button className="button button-primary button-full" onClick={onProjects}>View my projects<Icon name="arrowRight" size={18} /></button><p className="form-hint">No payment has been collected.</p></div></Modal>;
}
