import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import Icon from './Icon';
import { Avatar } from './CreatorCard';
import { formatDate, formatTimeRange, money } from '../utils/marketplace';

export default function MessagesModal({ user, creators, contacts, bookings, messages, initialCreator, initialClientId, offerMode = false, context, agreedRates, onClose, onSend, onOffer, onAccept, onBook, onBookings }) {
  const freelancer = user.role === 'freelancer';
  const conversations = useMemo(() => {
    const threads = new Map();
    function add(creatorId, clientId) {
      const creator = creators.find((person) => person.id === creatorId);
      const person = freelancer ? contacts.find((client) => client.id === clientId) : creator;
      if (!creator || !person) return;
      const key = `${clientId}:${creatorId}`;
      threads.set(key, { key, creator, clientId, person });
    }
    if (initialCreator) add(initialCreator.id, freelancer ? initialClientId : user.id);
    messages.forEach((message) => add(message.creatorId, message.clientId));
    bookings.forEach((booking) => add(booking.creatorId, booking.clientId));
    if (!freelancer) creators.slice(0, 4).forEach((creator) => add(creator.id, user.id));
    return [...threads.values()];
  }, [bookings, contacts, creators, freelancer, initialClientId, initialCreator, messages, user.id]);
  const [selectedId, setSelectedId] = useState(() => conversations[0]?.key);
  const [text, setText] = useState('');
  const [makingOffer, setMakingOffer] = useState(offerMode);
  const [offer, setOffer] = useState('');
  const [offerNote, setOfferNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bottom = useRef(null);
  const selected = conversations.find((thread) => thread.key === selectedId) || conversations[0];
  const thread = selected ? messages.filter((message) => message.creatorId === selected.creator.id && message.clientId === selected.clientId) : [];
  const rate = selected && (agreedRates[selected.key] || selected.creator.rate);

  useEffect(() => { bottom.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, [messages.length, selectedId]);

  async function handleSend(event) {
    event.preventDefault();
    if (!text.trim() || busy || !selected) return;
    setBusy(true); setError('');
    try { await onSend(selected, text.trim()); setText(''); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  async function handleOffer(event) {
    event.preventDefault();
    if (busy || !selected) return;
    setBusy(true); setError('');
    try {
      await onOffer(selected, Number(offer), offerNote.trim(), selected.creator.id === initialCreator?.id ? context : undefined);
      setMakingOffer(false); setOffer(''); setOfferNote('');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  async function accept(message) {
    setBusy(true); setError('');
    try { await onAccept(message); } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  return <Modal title="Let’s talk creative." subtitle="Private conversations with your clients and collaborators." onClose={onClose} className="messages-modal">
    {selected ? <div className="messages-layout"><aside className="conversation-list"><span className="conversation-label">YOUR CONVERSATIONS</span>{conversations.map((conversation) => {
      const last = messages.filter((message) => message.creatorId === conversation.creator.id && message.clientId === conversation.clientId).at(-1);
      return <button key={conversation.key} className={`conversation ${selected.key === conversation.key ? 'active' : ''}`} onClick={() => { setSelectedId(conversation.key); setMakingOffer(false); setText(''); setOffer(''); setError(''); }}><Avatar creator={conversation.person} /><span><strong>{conversation.person.name}</strong><small>{last?.text || conversation.creator.title}</small></span></button>;
    })}<p className="conversation-disclaimer"><Icon name="shield" size={15} />Conversations are visible only to the client and the gig’s owner.</p></aside><section className="message-thread"><header className="thread-header"><Avatar creator={selected.person} /><div><strong>{selected.person.name}</strong><span>{freelancer ? selected.creator.title : `${selected.creator.role} · ${money(rate)}/day`}</span></div>{freelancer ? <button className="button button-outline button-small" onClick={onBookings}>View bookings<Icon name="calendar" size={15} /></button> : <button className="button button-outline button-small" onClick={() => onBook(selected.creator)}>View availability<Icon name="calendar" size={15} /></button>}</header>
      <div className="thread-messages" aria-live="polite">{!thread.length && <div className="thread-welcome"><span><Icon name="message" size={30} /></span><h3>The start of a good collaboration.</h3><p>Say hello, share your idea, or suggest a day rate.</p></div>}{thread.map((message) => {
        const from = message.senderId === 'system' ? 'system' : message.senderId === user.id ? 'you' : 'other';
        return <div key={message.id} className={`chat-message from-${from}`}><div className="chat-bubble">{message.offer && <span className="offer-label"><Icon name="briefcase" size={13} />{from === 'you' ? 'YOUR OFFER' : 'RATE PROPOSAL'} · {money(message.offer)}/DAY</span>}<p>{message.text}</p>{message.context?.date && <span className="offer-date"><Icon name="calendar" size={11} />{formatDate(message.context.date, { weekday: 'short' })}{message.context.start && ` · ${formatTimeRange(message.context.start, message.context.end)}`}</span>}{message.offer && message.offerStatus === 'pending' && from !== 'you' && <button className="button button-primary button-small accept-offer" disabled={busy} onClick={() => accept(message)}>Accept {money(message.offer)}/day<Icon name="check" size={14} /></button>}{message.offerStatus === 'accepted' && <button className="button button-outline button-small accept-offer" disabled>Rate agreed<Icon name="check" size={14} /></button>}{message.offerStatus === 'superseded' && <small className="offer-superseded">Replaced by a newer proposal</small>}</div><time dateTime={new Date(message.timestamp).toISOString()}>{new Date(message.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })} IST</time></div>;
      })}<div ref={bottom} /></div>
      {error && <p className="form-error" role="alert">{error}</p>}{makingOffer ? <form className="offer-composer" onSubmit={handleOffer}><div className="offer-composer-heading"><strong>Find a fair rate together.</strong><button className="icon-button" type="button" aria-label="Close offer form" onClick={() => setMakingOffer(false)}><Icon name="close" size={17} /></button></div><div className="offer-form-row"><label htmlFor="offer-amount">Your offer (₹ / day)<input id="offer-amount" type="number" min="1" max="1000000" required placeholder="15000" value={offer} onChange={(event) => setOffer(event.target.value)} /></label><label htmlFor="offer-note">A little context<input id="offer-note" maxLength="2000" placeholder="Tell them about your budget and project" value={offerNote} onChange={(event) => setOfferNote(event.target.value)} /></label></div><button className="button button-primary button-small" disabled={busy} type="submit">{busy ? 'Sending…' : 'Send offer'}<Icon name="send" size={15} /></button></form> : <div className="message-composer-wrap"><button className="text-button offer-toggle" onClick={() => setMakingOffer(true)}><Icon name="briefcase" size={14} />Suggest a day rate<span>{money(rate)}/day currently</span></button><form className="message-composer" onSubmit={handleSend}><input aria-label="Your message" placeholder="Share your idea, preferred hours, or a question…" maxLength="2000" value={text} onChange={(event) => setText(event.target.value)} /><button className="icon-button" type="submit" disabled={!text.trim() || busy} aria-label="Send message"><Icon name="send" size={16} /></button></form></div>}
    </section></div> : <div className="empty-state"><span><Icon name="message" size={33} /></span><h3>Your next good conversation starts here.</h3><p>{freelancer ? 'Messages from clients interested in your gigs will appear here.' : 'Open a gig to talk about your project and preferred call times.'}</p></div>}
  </Modal>;
}
