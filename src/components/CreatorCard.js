import Icon from './Icon';
import { dateKey, formatDate, money, nextAvailableDate } from '../utils/marketplace';

export function Avatar({ creator, className = '' }) {
  return creator.avatar ? <img className={`avatar ${className}`} src={creator.avatar} alt="" loading="lazy" /> : <span className={`avatar avatar-initials ${className}`} style={{ background: creator.color || '#e2eacb' }}>{creator.name.split(' ').map((name) => name[0]).slice(0, 2).join('')}</span>;
}

export default function CreatorCard({ creator, saved, onSave, onOpen, bookings, availability = [] }) {
  const nextDate = nextAvailableDate(creator, bookings, availability);
  const now = nextDate === dateKey();

  return (
    <article className="creator-card">
      <div className="card-photo-wrap">
        <button className="card-photo-button" onClick={() => onOpen(creator)} aria-label={`View ${creator.name}'s profile and availability`}>
          <img src={creator.cover} alt={`${creator.role} portfolio by ${creator.name}`} className={`card-photo photo-${creator.id}`} loading="lazy" />
        </button>
        <span className={`availability-badge ${now ? 'is-now' : ''}`}><span className="status-dot" />{now ? 'Available today' : nextDate ? `Available ${formatDate(nextDate)}` : 'No matching hours'}</span>
        <button className={`save-button ${saved ? 'is-saved' : ''}`} aria-label={`${saved ? 'Unsave' : 'Save'} ${creator.name}`} aria-pressed={saved} onClick={() => onSave(creator.id)}><Icon name="heart" size={18} /></button>
        <span className="photo-category">{creator.role}</span>
      </div>
      <div className="card-content">
        <div className="creator-identity">
          <Avatar creator={creator} />
          <div className="identity-copy"><button className="creator-name" onClick={() => onOpen(creator)}>{creator.name}{creator.verified !== false && <Icon name="verified" size={15} />}</button><span><Icon name="pin" size={12} />{creator.location}</span></div>
          <span className="creator-rating">{creator.reviews ? <><Icon name="star" size={13} /><strong>{creator.rating.toFixed(1)}</strong></> : <strong>New</strong>}</span>
        </div>
        <button className="card-title" onClick={() => onOpen(creator)}>{creator.title}</button>
        <div className="equipment-tags">{creator.equipment.slice(0, 2).map((item) => <span key={item}>{item}</span>)}</div>
        <div className="card-footer"><div className="card-rate"><strong>{money(creator.rate)}</strong><span> / day</span></div><button className="availability-link" onClick={() => onOpen(creator)}>Choose hours<Icon name="arrowUpRight" size={15} /></button></div>
      </div>
    </article>
  );
}
