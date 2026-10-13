import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

export default function Modal({ title, subtitle, onClose, children, className = '' }) {
  const dialog = useRef(null);
  const closeButton = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const app = document.querySelector('.app');
    const previousInert = app?.inert;
    const previousAriaHidden = app?.getAttribute('aria-hidden');
    document.body.style.overflow = 'hidden';
    if (app) {
      app.inert = true;
      app.setAttribute('aria-hidden', 'true');
    }
    closeButton.current?.focus();
    const handleKey = (event) => {
      if (event.key === 'Escape') onCloseRef.current();
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.current.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      if (app) {
        app.inert = previousInert || false;
        if (previousAriaHidden === null) app.removeAttribute('aria-hidden');
        else app.setAttribute('aria-hidden', previousAriaHidden);
      }
      document.removeEventListener('keydown', handleKey);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialog} className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header className="modal-header">
          <div><h2 id="modal-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button ref={closeButton} className="icon-button modal-close" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button>
        </header>
        {children}
      </section>
    </div>, document.body,
  );
}
