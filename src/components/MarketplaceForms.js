import { useState } from 'react';
import Modal from './Modal';
import Icon from './Icon';
import LocationInput from './LocationInput';
import AvailabilityEditor, { upcomingAvailability } from './AvailabilityEditor';
import { categories } from '../data/creators';
import { dateKey, parseDate, formatDate, formatTimeRange, makeId, money, activeBooking } from '../utils/marketplace';

export function FiltersModal({ filters, onApply, onClose }) {
  const [values, setValues] = useState(filters);
  const update = (field, value) => setValues((current) => ({ ...current, [field]: value }));
  return <Modal title="Find your perfect fit." subtitle="Find the right gig for your city, schedule, and budget." onClose={onClose} className="form-modal">
    <form className="modal-form" onSubmit={(event) => { event.preventDefault(); onApply(values); }}>
      <LocationInput id="filter-location" label="City or location" value={values.location} onChange={(value) => update('location', value)} allowRemote placeholder="Any city" />
      <div className="form-row"><label htmlFor="filter-date">Shoot date<input id="filter-date" type="date" min={dateKey()} value={values.date} onChange={(event) => update('date', event.target.value)} /></label><label htmlFor="filter-budget">Maximum day rate (₹)<input id="filter-budget" type="number" min="1" max="1000000" placeholder="Any budget" value={values.budget} onChange={(event) => update('budget', event.target.value)} /></label></div>
      <label className="checkbox-label"><input type="checkbox" checked={values.availableNow} onChange={(event) => update('availableNow', event.target.checked)} /><span><strong>Available today</strong><small>Show open hours that match your availability, in IST.</small></span><Icon name="bolt" size={21} /></label>
      <div className="form-actions"><button className="text-button" type="button" onClick={() => setValues({ location: '', date: '', budget: '', availableNow: false })}>Reset filters</button><button className="button button-primary" type="submit">Show gigs<Icon name="arrowRight" size={17} /></button></div>
    </form>
  </Modal>;
}

export function PostProjectModal({ user, onClose, onSubmit }) {
  const [urgent, setUrgent] = useState(false);
  const [location, setLocation] = useState(user.location);
  const [preferredTimes, setPreferredTimes] = useState(() => {
    const day = parseDate(dateKey()); day.setUTCDate(day.getUTCDate() + 1);
    return [{ id: makeId('time'), date: dateKey(day), start: '09:00', end: '17:00' }];
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (!preferredTimes.length) { setError('Add at least one preferred call time.'); return; }
    const data = new FormData(event.currentTarget);
    setError(''); setBusy(true);
    try { await onSubmit({ title: data.get('title'), category: data.get('category'), budget: Number(data.get('budget')), location, description: data.get('description'), preferredTimes, urgent }); }
    catch (failure) { setError(failure.message); setBusy(false); }
  }
  return <Modal title="Big idea? Let’s find your crew." subtitle="Post a private brief, set a rupee budget, and add the call times that suit your team." onClose={onClose} className="form-modal"><form className="modal-form" onSubmit={submit}>
    <label htmlFor="project-title">Give your project a name<input id="project-title" name="title" placeholder="e.g. A launch film for our homegrown brand" required minLength="5" maxLength="100" /></label>
    <div className="form-row"><label htmlFor="project-category">Who do you need?<select id="project-category" name="category">{categories.slice(1).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label htmlFor="project-budget">Your budget (₹)<input id="project-budget" name="budget" type="number" placeholder="25000" min="1" max="1000000" required /></label></div>
    <LocationInput id="project-location" label="Shoot city" value={location} onChange={setLocation} allowRemote required />
    <label htmlFor="project-description">Tell us a little about the vision<textarea id="project-description" name="description" rows="3" placeholder="Share your style, deliverables, languages, and the kit you have in mind." required minLength="15" maxLength="2000" /></label>
    <label className="checkbox-label"><input type="checkbox" checked={urgent} onChange={(event) => { setUrgent(event.target.checked); if (event.target.checked) setPreferredTimes((current) => current.map((slot) => ({ ...slot, date: dateKey() }))); }} /><span><strong>I need someone today</strong><small>Mark your brief as an urgent crew call. Use today’s date in IST.</small></span><Icon name="bolt" size={21} /></label>
    <AvailabilityEditor key={urgent ? 'urgent' : 'planned'} value={preferredTimes} onChange={setPreferredTimes} allowWeekly={false} defaultDate={urgent ? dateKey() : undefined} legend="Your preferred call times" />
    {error && <p className="form-error" role="alert">{error}</p>}<button className="button button-primary button-full" disabled={busy} type="submit">{busy ? 'Posting…' : 'Post my project'}<Icon name="arrowUpRight" size={18} /></button><p className="form-hint centered">Only you and the freelancers booked for this brief can see it.</p>
  </form></Modal>;
}

export function GigFormModal({ user, gig, availability, onClose, onSubmit }) {
  const [location, setLocation] = useState(gig?.location || user.location);
  const [times, setTimes] = useState(() => upcomingAvailability(availability));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (!times.length) { setError('Add at least one available time slot before publishing.'); return; }
    const data = new FormData(event.currentTarget);
    const split = (field) => data.get(field).split(',').map((item) => item.trim()).filter(Boolean);
    setBusy(true); setError('');
    try { await onSubmit({ ...(gig ? { id: gig.id } : {}), category: data.get('category'), location, rate: Number(data.get('rate')), title: data.get('headline'), bio: data.get('bio'), equipment: split('equipment'), skills: split('skills'), remote: data.get('remote') === 'on' }, times); }
    catch (failure) { setError(failure.message); setBusy(false); }
  }
  return <Modal title={gig ? 'Make your gig your own.' : 'Your craft, in the spotlight.'} subtitle={`Published as ${user.name}. Set your rate, kit, and comfortable working hours.`} onClose={onClose} className="form-modal join-modal"><form className="modal-form" onSubmit={submit}>
    <div className="form-row"><label htmlFor="crew-category">Your specialty<select id="crew-category" name="category" defaultValue={gig?.category || user.specialty || 'cinematography'}>{categories.slice(1).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label htmlFor="crew-rate">Your day rate (₹)<input id="crew-rate" name="rate" type="number" placeholder="18000" min="1" max="1000000" defaultValue={gig?.rate} required /><small>Based on an 8-hour working day.</small></label></div>
    <LocationInput id="crew-location" label="Based in (city)" value={location} onChange={setLocation} allowRemote required />
    <label htmlFor="crew-headline">Your gig headline<input id="crew-headline" name="headline" placeholder="A one-liner that captures what you do best" defaultValue={gig?.title} required minLength="10" maxLength="100" /></label>
    <label htmlFor="crew-bio">A little about you<textarea id="crew-bio" name="bio" rows="3" placeholder="Your experience, your approach, and the stories you love to tell." defaultValue={gig?.bio} required minLength="20" maxLength="1200" /></label>
    <label htmlFor="crew-equipment">What’s in your kit?<input id="crew-equipment" name="equipment" placeholder="Sony FX6, DJI Ronin, Cinema lenses" defaultValue={gig?.equipment.join(', ')} required maxLength="700" /><small>Separate each piece of gear with a comma.</small></label>
    <label htmlFor="crew-skills">Skills and languages<input id="crew-skills" name="skills" placeholder="Wedding films, Brand films, Hindi, English" defaultValue={gig?.skills.join(', ')} maxLength="800" /><small>Separate skills and languages with a comma.</small></label>
    <label className="checkbox-label"><input type="checkbox" name="remote" defaultChecked={gig?.remote} /><span><strong>I also work remotely</strong><small>Show my gig to clients across India.</small></span><Icon name="globe" size={20} /></label>
    <AvailabilityEditor value={times} onChange={setTimes} legend="My comfortable working hours" />
    <p className="form-hint">Your availability is shared across your own gigs to prevent overlapping shoots.</p>
    {error && <p className="form-error" role="alert">{error}</p>}<button type="submit" disabled={busy} className="button button-primary button-full">{busy ? 'Saving…' : gig ? 'Save my gig' : 'Publish my gig'}<Icon name="arrowUpRight" size={18} /></button>
  </form></Modal>;
}

export function ProjectsModal({ user, initialTab = 'bookings', bookings, projects, onClose, onPost, onUpdateBooking, onCloseProject, onFindCrew, onOpenCreator, onMessage }) {
  const [tab, setTab] = useState(initialTab);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const freelancer = user.role === 'freelancer';
  async function act(itemId, action) {
    setBusyId(itemId); setError('');
    try { await action(); } catch (failure) { setError(failure.message); }
    finally { setBusyId(null); }
  }
  const statusLabel = (booking) => ({ requested: freelancer ? 'New request' : 'Awaiting freelancer confirmation', confirmed: 'Confirmed', declined: 'Declined', cancelled: 'Cancelled' }[booking.status]);
  return <Modal title="Your stories in the making." subtitle={freelancer ? 'Bookings and attached briefs for your own gigs.' : 'Your bookings, call times, and private project briefs.'} onClose={onClose} className="projects-modal">
    <div className="modal-tabs"><button className={tab === 'bookings' ? 'active' : ''} onClick={() => setTab('bookings')}>My bookings <span>{bookings.filter(activeBooking).length}</span></button><button className={tab === 'briefs' ? 'active' : ''} onClick={() => setTab('briefs')}>{freelancer ? 'Attached briefs' : 'Project briefs'} <span>{projects.length}</span></button></div>
    <div className="projects-content">{error && <p className="form-error" role="alert">{error}</p>}{tab === 'bookings' ? bookings.length ? bookings.slice().reverse().map((booking) => <article className={`project-item ${!activeBooking(booking) ? 'cancelled' : ''}`} key={booking.id}>
      <div className="project-item-icon"><Icon name="video" size={25} /></div><div className="project-item-copy"><span className={`project-status ${!activeBooking(booking) ? 'is-closed' : ''}`}>{statusLabel(booking)}</span><h3>{freelancer ? booking.clientName : booking.creatorName}</h3><p>{booking.projectTitle || booking.gigTitle}</p><p>{formatDate(booking.date, { weekday: 'short', year: 'numeric' })} · {formatTimeRange(booking.start, booking.end)}</p><strong>{money(booking.total)}</strong></div>
      <div className="project-item-actions">{freelancer && booking.status === 'requested' && <><button disabled={busyId === booking.id} className="button button-primary button-small" onClick={() => act(booking.id, () => onUpdateBooking(booking.id, 'confirmed'))}>Confirm booking</button><button disabled={busyId === booking.id} className="text-button" onClick={() => act(booking.id, () => onUpdateBooking(booking.id, 'declined'))}>Decline request</button></>}
        {!freelancer && activeBooking(booking) && <button className="text-button" onClick={() => onOpenCreator(booking.creatorId)}>View gig<Icon name="arrowUpRight" size={14} /></button>}
        <button className="text-button" onClick={() => onMessage(booking)}>Message {freelancer ? 'client' : 'freelancer'}</button>
        {activeBooking(booking) && <button disabled={busyId === booking.id} className="text-button muted" onClick={() => act(booking.id, () => onUpdateBooking(booking.id, 'cancelled'))}>Cancel booking</button>}
      </div>
    </article>) : <div className="empty-state"><span><Icon name="calendar" size={34} /></span><h3>{freelancer ? 'Your next call sheet starts here.' : 'Your next great shoot starts here.'}</h3><p>{freelancer ? 'Client requests for your gigs will appear here.' : 'Book a gig and your call times will appear here.'}</p><button className="button button-primary" onClick={onClose}>{freelancer ? 'Back to my gigs' : 'Explore the gigs'}<Icon name="arrowRight" size={17} /></button></div>
      : projects.length ? projects.slice().reverse().map((project) => <article className="project-item" key={project.id}><div className="project-item-icon"><Icon name={project.urgent ? 'bolt' : 'briefcase'} size={25} /></div><div className="project-item-copy"><span className={`project-status ${project.status === 'closed' ? 'is-closed' : ''}`}>{project.status === 'closed' ? 'Closed' : project.urgent ? 'Urgent crew call' : 'Open brief'}</span><h3>{project.title}</h3><p>{project.location}</p>{project.preferredTimes.map((slot) => <p key={slot.id}>{formatDate(slot.date, { weekday: 'short' })} · {formatTimeRange(slot.start, slot.end)}</p>)}<p className="project-description">{project.description}</p><strong>Budget: {money(project.budget)}</strong></div>{!freelancer && project.status !== 'closed' && <div className="project-item-actions"><button className="text-button" onClick={() => onFindCrew(project)}>Find matching crew<Icon name="arrowUpRight" size={14} /></button><button disabled={busyId === project.id} className="text-button muted" onClick={() => act(project.id, () => onCloseProject(project.id))}>Close brief</button></div>}</article>)
        : <div className="empty-state"><span><Icon name="briefcase" size={34} /></span><h3>{freelancer ? 'Keep the vision close.' : 'Every good story starts with an idea.'}</h3><p>{freelancer ? 'Briefs attached to your bookings will appear here.' : 'Post a project brief and start building your dream crew.'}</p>{!freelancer && <button className="button button-primary" onClick={onPost}>Post a project<Icon name="plus" size={17} /></button>}</div>}
    </div><p className="workspace-note">All call times use Indian Standard Time. Payments are not processed through frame.</p>
  </Modal>;
}
