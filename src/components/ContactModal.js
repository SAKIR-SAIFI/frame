import { useState } from 'react';
import Icon from './Icon';
import Modal from './Modal';

const contactTypes = ['General query', 'Complaint', 'Suggestion', 'Account or booking support', 'Partnership', 'Other'];

export default function ContactModal({ user, onClose, onSubmit }) {
  const [values, setValues] = useState({ name: user?.name || '', email: user?.email || '', type: 'General query', subject: '', message: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  function update(event) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit(values);
      setSent(true);
    } catch (failure) {
      setError(failure.message || 'Your message could not be sent. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return <Modal title={sent ? 'Thanks for reaching out.' : 'We’re listening.'} subtitle={sent ? '' : 'Send us a query, complaint, suggestion, or anything else on your mind.'} onClose={onClose} className="contact-modal">
    {sent ? <div className="contact-success" role="status">
      <span className="contact-success-icon"><Icon name="check" size={28} /></span>
      <h3>Your message is on its way.</h3>
      <p>We’ll follow up at <strong>{values.email}</strong>. Thanks for helping us make perfectlens. better.</p>
      <button className="button button-primary" onClick={onClose}>Done<Icon name="arrowRight" size={16} /></button>
    </div> : <form className="modal-form contact-form" onSubmit={submit}>
      <fieldset className="contact-fields" disabled={busy}>
        <div className="form-row">
          <label htmlFor="contact-name">Your name<input id="contact-name" name="name" autoComplete="name" value={values.name} onChange={update} minLength={2} maxLength={80} required /></label>
          <label htmlFor="contact-email">Email address for reply<input id="contact-email" name="email" type="email" autoComplete="email" value={values.email} onChange={update} maxLength={254} required /></label>
        </div>
        <div className="form-row">
          <label htmlFor="contact-type">What can we help with?<select id="contact-type" name="type" value={values.type} onChange={update}>{contactTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label htmlFor="contact-subject">Subject<input id="contact-subject" name="subject" value={values.subject} onChange={update} minLength={3} maxLength={120} required /></label>
        </div>
        <label htmlFor="contact-message">Your message<textarea id="contact-message" name="message" value={values.message} onChange={update} minLength={10} maxLength={5000} rows={5} placeholder="Tell us a little more…" required /></label>
        <div className="contact-honeypot" aria-hidden="true"><label htmlFor="contact-website">Leave this field empty<input id="contact-website" name="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={update} /></label></div>
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="form-hint">Your message will be emailed to enquiry@perfectlens.in. We’ll reply to the address you provide.</p>
      <button className="button button-primary button-full" type="submit" disabled={busy}>{busy ? 'Sending message…' : 'Send message'}<Icon name="send" size={16} /></button>
    </form>}
  </Modal>;
}
