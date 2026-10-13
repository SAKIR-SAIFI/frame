import { useState } from 'react';
import Icon from './Icon';
import LocationInput from './LocationInput';
import { categories, image } from '../data/creators';

export default function AuthPage({ role, mode, onNavigate, onAuthenticate }) {
  const registering = mode === 'register';
  const freelancer = role === 'freelancer';
  const roleName = freelancer ? 'Freelancer' : 'Client';
  const [location, setLocation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function authenticate(values, action = mode) {
    setError('');
    setBusy(true);
    try { await onAuthenticate({ ...values, role }, action); }
    catch (failure) { setError(failure.message); setBusy(false); }
  }

  function submit(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (registering && data.password !== data.confirmPassword) { setError('Your passwords do not match.'); return; }
    authenticate(data);
  }

  return <main className="auth-page page-width">
    <aside className="auth-story">
      <img src={image('photo-1601506521937-0121a7fc2a6b', 1000)} alt="A filmmaker preparing a professional cinema camera" />
      <div className="auth-story-shade" />
      <div className="auth-story-content"><span className="eyebrow">MADE FOR INDIA’S CREATIVE COMMUNITY</span>
        <h2>{freelancer ? <>Your craft.<br />Your own space.</> : <>Your next idea.<br />An incredible crew.</>}</h2>
        <p>{freelancer ? 'Publish your gigs, set your rates, and choose the hours that work for you. Your workspace is personal to you.' : 'Discover gigs across India, shortlist your favourites, and book a call time that works for both of you.'}</p>
        <div className="auth-story-tags"><span>₹ Indian rupees</span><span>IST scheduling</span><span>Local talent</span></div>
      </div>
    </aside>
    <section className="auth-panel">
      <div className="role-switch" aria-label="Account type"><button className={!freelancer ? 'active' : ''} aria-pressed={!freelancer} onClick={() => onNavigate(`/client/${mode}`)}><Icon name="briefcase" size={17} />I’m a client</button><button className={freelancer ? 'active' : ''} aria-pressed={freelancer} onClick={() => onNavigate(`/freelancer/${mode}`)}><Icon name="camera" size={17} />I’m a freelancer</button></div>
      <span className="eyebrow">{registering ? 'A NEW CHAPTER STARTS HERE' : 'GOOD TO HAVE YOU BACK'}</span>
      <h1>{roleName} {registering ? 'registration' : 'login'}<span>.</span></h1>
      <p className="auth-intro">{registering ? `Create your ${role} account and find your place in the frame.` : `Sign in to your ${role} workspace.`}</p>
      <form className="modal-form auth-form" onSubmit={submit}>
        {registering && <label htmlFor="auth-name">Full name<input id="auth-name" name="name" autoComplete="name" placeholder="e.g. Aditi Sharma" minLength="2" maxLength="60" required /></label>}
        <label htmlFor="auth-email">Email address<input id="auth-email" name="email" type="email" autoComplete="email" placeholder="you@example.in" maxLength="254" required /></label>
        {registering && <>
          <div className="form-row"><label htmlFor="auth-phone">Mobile number<div className="phone-input"><span>+91</span><input id="auth-phone" name="phone" type="tel" inputMode="numeric" autoComplete="tel-national" pattern="[6-9][0-9]{9}" minLength="10" maxLength="10" placeholder="9876543210" title="Enter a 10-digit Indian mobile number starting with 6, 7, 8, or 9" required /></div></label>
            {freelancer ? <label htmlFor="auth-specialty">Your specialty<select id="auth-specialty" name="specialty">{categories.slice(1).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label> : <label htmlFor="auth-company">Company / studio <small>(optional)</small><input id="auth-company" name="company" placeholder="Your team’s name" maxLength="80" /></label>}
          </div>
          <LocationInput id="auth-location" label="Your city" value={location} onChange={setLocation} required />
        </>}
        <label htmlFor="auth-password">Password<input id="auth-password" name="password" type="password" minLength="8" maxLength="128" autoComplete={registering ? 'new-password' : 'current-password'} placeholder={registering ? 'At least 8 characters' : 'Your password'} required /></label>
        {registering && <label htmlFor="auth-confirm">Confirm password<input id="auth-confirm" name="confirmPassword" type="password" minLength="8" maxLength="128" autoComplete="new-password" placeholder="Enter your password again" required /></label>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary button-full" type="submit" disabled={busy}>{busy ? 'Please wait…' : registering ? `Create ${role} account` : `Log in as ${role}`}<Icon name="arrowUpRight" size={18} /></button>
      </form>
      <p className="auth-other">{registering ? 'Already part of the crew?' : 'New to frame.?'} <button className="text-button" disabled={busy} onClick={() => onNavigate(`/${role}/${registering ? 'login' : 'register'}`)}>{registering ? 'Log in' : `Register as a ${role}`}</button></p>
    </section>
  </main>;
}
