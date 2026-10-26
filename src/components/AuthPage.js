import { useEffect, useState } from 'react';
import Icon from './Icon';
import LocationInput from './LocationInput';
import { categories, image } from '../data/creators';

export default function AuthPage({
  role,
  mode,
  onNavigate,
  onLogin,
  onStartRegistration,
  onVerifyRegistration,
  onResendRegistration,
  onCheckEmail,
}) {
  const registering = mode === 'register';
  const freelancer = role === 'freelancer';
  const roleName = freelancer ? 'Freelancer' : 'Client';
  const [email, setEmail] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('details');
  const [pending, setPending] = useState(null);
  const [code, setCode] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [emailStatus, setEmailStatus] = useState(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!registering || step !== 'details') return undefined;
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setEmailStatus(null);
      return undefined;
    }
    let active = true;
    const timer = setTimeout(async () => {
      setEmailStatus({ state: 'checking', message: 'Checking this email…' });
      try {
        const result = await onCheckEmail({ email: normalized, role });
        if (!active) return;
        if (!result.available) {
          setEmailStatus({ state: 'taken', message: `This email already has a ${role} account.`, login: true });
        } else if (result.deliverable === false) {
          setEmailStatus({ state: 'invalid', message: 'This email domain cannot receive messages. Check the address and try again.' });
        } else if (result.checked === false) {
          setEmailStatus({ state: 'unknown', message: 'We could not verify this email right now. You can still continue.' });
        } else {
          setEmailStatus({ state: 'ok', message: 'This email is ready to use.' });
        }
      } catch (failure) {
        if (!active) return;
        setEmailStatus({ state: 'unknown', message: failure.message || 'We could not verify this email right now. You can still continue.' });
      }
    }, 600);
    return () => { active = false; clearTimeout(timer); };
  }, [email, onCheckEmail, registering, role, step]);

  useEffect(() => {
    if (step !== 'otp' || resendIn <= 0) return undefined;
    const timer = setTimeout(() => setResendIn((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendIn, step]);

  async function submitDetails(event) {
    event.preventDefault();
    const values = { ...Object.fromEntries(new FormData(event.currentTarget)), role };
    if (registering) {
      if (values.password !== values.confirmPassword) { setError('Your passwords do not match.'); return; }
      if (emailStatus?.state === 'taken' || emailStatus?.state === 'invalid') { setError(emailStatus.message); return; }
    }
    setError('');
    setNotice('');
    setBusy(true);
    try {
      if (registering) {
        const started = await onStartRegistration(values);
        setPending(started);
        setCode('');
        setResendIn(started.resendAfter || 60);
        setEmailStatus(null);
        setStep('otp');
      } else {
        await onLogin(values);
      }
    } catch (failure) {
      setError(failure.message);
      if (failure.status === 409) setEmailStatus({ state: 'taken', message: failure.message, login: true });
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event) {
    event.preventDefault();
    if (!pending) return;
    if (code.length !== 6) { setError('Enter the 6-digit code from your email.'); return; }
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await onVerifyRegistration({ email: pending.email, role, code });
    } catch (failure) {
      setError(failure.message);
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    if (!pending || resendIn > 0 || busy) return;
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const resent = await onResendRegistration({ email: pending.email, role });
      setPending({ ...pending, expiresAt: resent.expiresAt });
      setResendIn(resent.resendAfter || 60);
      setCode('');
      setNotice('A new code is on its way. Check your inbox.');
    } catch (failure) {
      setError(failure.message);
      const retryAfter = Number(/wait (\d+) seconds/i.exec(failure.message || '')?.[1]);
      if (retryAfter > 0) setResendIn(retryAfter);
      else if (failure.status === 429) setResendIn(30);
    } finally {
      setBusy(false);
    }
  }

  function changeDetails() {
    setStep('details');
    setError('');
    setNotice('');
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
      <span className="eyebrow">{registering ? step === 'otp' ? 'ONE LAST STEP' : 'A NEW CHAPTER STARTS HERE' : 'GOOD TO HAVE YOU BACK'}</span>
      <h1>{registering ? step === 'otp' ? 'Verify your email' : `${roleName} registration` : `${roleName} login`}<span>.</span></h1>
      <p className="auth-intro">{registering ? step === 'otp'
        ? <>We sent a 6-digit code to <strong>{pending?.email}</strong>. Enter it below to finish creating your {role} account.</>
        : `Create your ${role} account and find your place in the frame.`
        : `Sign in to your ${role} workspace.`}</p>
      <form className="modal-form auth-form" onSubmit={submitDetails} hidden={registering && step === 'otp'}>
        {registering && <label htmlFor="auth-name">Full name<input id="auth-name" name="name" autoComplete="name" placeholder="e.g. Aditi Sharma" minLength="2" maxLength="60" required /></label>}
        <label htmlFor="auth-email">Email address<input id="auth-email" name="email" type="email" autoComplete="email" placeholder="you@example.in" maxLength="254" value={email} onChange={(event) => { setEmail(event.target.value); setEmailStatus(null); }} required /></label>
        {registering && emailStatus && <p className={`email-check ${emailStatus.state}`} role={['taken', 'invalid'].includes(emailStatus.state) ? 'alert' : 'status'} aria-live="polite">
          {emailStatus.message}
          {emailStatus.login && <button className="text-button" type="button" onClick={() => onNavigate(`/${role}/login`)}>Log in instead</button>}
        </p>}
        {registering && <>
          <div className="form-row"><label htmlFor="auth-phone">Mobile number<div className="phone-input"><span>+91</span><input id="auth-phone" name="phone" type="tel" inputMode="numeric" autoComplete="tel-national" pattern="[6-9][0-9]{9}" minLength="10" maxLength="10" placeholder="9876543210" title="Enter a 10-digit Indian mobile number starting with 6, 7, 8, or 9" required /></div></label>
            {freelancer ? <label htmlFor="auth-specialty">Your specialty<select id="auth-specialty" name="specialty">{categories.slice(1).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label> : <label htmlFor="auth-company">Company / studio <small>(optional)</small><input id="auth-company" name="company" placeholder="Your team’s name" maxLength="80" /></label>}
          </div>
          <LocationInput id="auth-location" label="Your city" value={location} onChange={setLocation} required />
        </>}
        <label htmlFor="auth-password">Password<input id="auth-password" name="password" type="password" minLength="8" maxLength="128" autoComplete={registering ? 'new-password' : 'current-password'} placeholder={registering ? 'At least 8 characters' : 'Your password'} required /></label>
        {registering && <label htmlFor="auth-confirm">Confirm password<input id="auth-confirm" name="confirmPassword" type="password" minLength="8" maxLength="128" autoComplete="new-password" placeholder="Enter your password again" required /></label>}
        {step === 'details' && error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary button-full" type="submit" disabled={busy}>{busy ? 'Please wait…' : registering ? `Create ${role} account` : `Log in as ${role}`}<Icon name="arrowUpRight" size={18} /></button>
      </form>
      {registering && step === 'otp' && <form className="modal-form auth-form auth-otp-form" onSubmit={submitCode}>
        <label htmlFor="auth-code">Verification code<input id="auth-code" name="code" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength="6" autoComplete="one-time-code" placeholder="000000" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required /></label>
        {notice && <p className="form-note" role="status">{notice}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary button-full" type="submit" disabled={busy || code.length !== 6}>{busy ? 'Verifying…' : 'Verify and create account'}<Icon name="arrowUpRight" size={18} /></button>
        <div className="auth-otp-actions">
          <button className="text-button" type="button" onClick={resendCode} disabled={busy || resendIn > 0}>{resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}</button>
          <button className="text-button" type="button" onClick={changeDetails} disabled={busy}>Change email or details</button>
        </div>
      </form>}
      {step === 'details' && <p className="auth-other">{registering ? 'Already part of the crew?' : 'New to perfectlens.?'} <button className="text-button" disabled={busy} onClick={() => onNavigate(`/${role}/${registering ? 'login' : 'register'}`)}>{registering ? 'Log in' : `Register as a ${role}`}</button></p>}
    </section>
  </main>;
}
