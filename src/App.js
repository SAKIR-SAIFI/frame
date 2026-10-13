import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import Icon from './components/Icon';
import CreatorCard, { Avatar } from './components/CreatorCard';
import Modal from './components/Modal';
import AuthPage from './components/AuthPage';
import LocationInput from './components/LocationInput';
import { AvailabilityModal } from './components/AvailabilityEditor';
import { ClientDashboard, FreelancerDashboard } from './components/Dashboards';
import { PortfolioProjectModal } from './components/PortfolioProjects';
import BookingModal, { BookingConfirmation } from './components/BookingModal';
import MessagesModal from './components/MessagesModal';
import { FiltersModal, GigFormModal, PostProjectModal, ProjectsModal } from './components/MarketplaceForms';
import { categories, image } from './data/creators';
import { availableSlots, dateKey, formatDate, makeId, money } from './utils/marketplace';
import { api } from './utils/api';

const emptyFilters = { location: '', date: '', budget: '', availableNow: false };
const emptyWorkspace = { gigs: [], relatedGigs: [], saved: [], bookings: [], projects: [], portfolioProjects: [], messages: [], agreedRates: {}, availability: [], contacts: [] };

function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [user, setUser] = useState(null);
  const [workspace, setWorkspace] = useState(emptyWorkspace);
  const [booting, setBooting] = useState(true);
  const [retry, setRetry] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchLocation, setSearchLocation] = useState('');
  const [filters, setFilters] = useState(emptyFilters);
  const [sort, setSort] = useState('recommended');
  const [visibleCount, setVisibleCount] = useState(8);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const listingRef = useRef(null);
  const portfolioRef = useRef(null);
  const userRef = useRef(user);
  const revision = useRef(0);
  userRef.current = user;
  const { gigs: allCreators, saved, bookings, projects, messages, agreedRates, availability, contacts } = workspace;
  const portfolioProjects = workspace.portfolioProjects || [];
  const conversationCreators = useMemo(() => [...allCreators, ...(workspace.relatedGigs || [])], [allCreators, workspace.relatedGigs]);
  const client = user?.role === 'client';
  const freelancer = user?.role === 'freelancer';
  const authRoute = path.match(/^\/(client|freelancer)\/(login|register)\/?$/);
  const notify = (text) => setToast({ id: makeId('toast'), text });
  const closeModal = () => setModal(null);

  const navigate = useCallback((nextPath) => {
    if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath);
    setPath(nextPath); setModal(null); setMobileMenu(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const applyWorkspace = useCallback((next) => {
    if (userRef.current && userRef.current.id !== next.user.id) {
      setModal(null); setFilters(emptyFilters); setQuery(''); setSearchInput(''); setSearchLocation('');
    }
    userRef.current = next.user;
    setUser(next.user); setWorkspace(next); setLoadError('');
  }, []);

  const expireSession = useCallback(() => {
    const role = userRef.current?.role || 'client';
    revision.current += 1;
    userRef.current = null; setUser(null); setWorkspace(emptyWorkspace); setModal(null);
    navigate(`/${role}/login`);
  }, [navigate]);

  useEffect(() => {
    const controller = new AbortController();
    setBooting(true);
    async function restoreSession() {
      try {
        const result = await api.session(controller.signal);
        if (result.user) applyWorkspace(await api.workspace(controller.signal));
        else { userRef.current = null; setUser(null); setWorkspace(emptyWorkspace); setLoadError(''); }
      } catch (failure) { if (failure.name !== 'AbortError') setLoadError(failure.message); }
      finally { if (!controller.signal.aborted) setBooting(false); }
    }
    restoreSession();
    return () => controller.abort();
  }, [applyWorkspace, retry]);

  useEffect(() => {
    const handlePopState = () => { setPath(window.location.pathname); setModal(null); setMobileMenu(false); };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (booting) return;
    if (user && path !== `/${user.role}`) navigate(`/${user.role}`);
    else if (!user && ['/client', '/freelancer'].includes(path)) navigate(`${path}/login`);
    else if (!user && path !== '/' && !/^\/(client|freelancer)\/(login|register)\/?$/.test(path)) navigate('/');
  }, [booting, navigate, path, user]);

  const refreshWorkspace = useCallback(async (showProgress = false) => {
    if (!userRef.current) return;
    const requestRevision = ++revision.current;
    const accountId = userRef.current.id;
    if (showProgress) setRefreshing(true);
    try {
      const next = await api.workspace();
      if (requestRevision === revision.current && userRef.current?.id === accountId) applyWorkspace(next);
    } catch (failure) {
      if (userRef.current?.id !== accountId) return;
      if (failure.status === 401) expireSession();
      else setLoadError(failure.message);
    } finally { if (showProgress) setRefreshing(false); }
  }, [applyWorkspace, expireSession]);

  useEffect(() => {
    if (!user?.id) return undefined;
    const refresh = () => { if (!document.hidden) refreshWorkspace(); };
    const timer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [refreshWorkspace, user?.id]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function authenticate(values, mode) {
    const result = await api[mode](values);
    revision.current += 1; applyWorkspace(result.workspace);
    resetSearch(); navigate(`/${result.user.role}`);
    notify(`Hello, ${result.user.name.split(' ')[0]}. Your ${result.user.role} workspace is ready.`);
  }

  async function logout() {
    try { await api.logout(); }
    catch (failure) { notify(failure.message); return; }
    revision.current += 1; userRef.current = null;
    setUser(null); setWorkspace(emptyWorkspace); setLoadError(''); resetSearch(); navigate('/');
    notify('You’re signed out. See you on the next shoot.');
  }

  async function perform(action) {
    const accountId = userRef.current?.id;
    revision.current += 1;
    try {
      const result = await action();
      if (userRef.current?.id !== accountId) throw new Error('Your account changed. Please try again from your current workspace.');
      revision.current += 1;
      if (result.workspace) applyWorkspace(result.workspace);
      return result;
    } catch (failure) {
      if (failure.status === 401) expireSession();
      throw failure;
    }
  }

  const filteredCreators = useMemo(() => {
    let result = allCreators.filter((creator) => {
      const content = [creator.name, creator.role, creator.category, creator.location, creator.title, creator.bio, ...creator.equipment, ...creator.skills].join(' ').toLowerCase();
      const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
      if (words.length && !words.every((word) => content.includes(word))) return false;
      if (category !== 'all' && creator.category !== category) return false;
      if (filters.location) {
        const remoteSearch = filters.location.toLowerCase().startsWith('remote');
        const remoteGig = creator.remote || creator.location.startsWith('Remote');
        if (remoteSearch ? !remoteGig : !remoteGig && !creator.location.toLowerCase().includes(filters.location.toLowerCase())) return false;
      }
      if (filters.budget && creator.rate > Number(filters.budget)) return false;
      if (filters.availableNow && !availableSlots(creator, dateKey(), bookings, availability).length) return false;
      if (filters.date && !availableSlots(creator, filters.date, bookings, availability).length) return false;
      return true;
    });
    if (sort === 'price-low') result = result.slice().sort((a, b) => a.rate - b.rate);
    if (sort === 'price-high') result = result.slice().sort((a, b) => b.rate - a.rate);
    if (sort === 'rating') result = result.slice().sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
    return result;
  }, [allCreators, availability, bookings, category, filters, query, sort]);

  const nowCount = allCreators.filter((creator) => availableSlots(creator, dateKey(), bookings, availability).length).length;
  const filterCount = Object.values(filters).filter(Boolean).length;
  const hasSearch = Boolean(query || filterCount || category !== 'all');
  const currentCreator = conversationCreators.find((creator) => creator.id === modal?.creatorId);
  const currentPortfolioProject = portfolioProjects.find((project) => project.id === modal?.projectId);
  const scrollToCrew = () => listingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const scrollToPortfolio = () => { setMobileMenu(false); portfolioRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  function openModal(value) {
    if (!user) { navigate('/client/login'); return; }
    const permitted = user.role === 'client' ? ['profile', 'projects', 'messages', 'saved', 'filters', 'post', 'availability'] : ['projects', 'messages', 'gig', 'availability', 'portfolio-project'];
    if (!permitted.includes(value.type)) return;
    setMobileMenu(false); setModal(value);
  }

  function search(event, popularQuery) {
    event?.preventDefault();
    if (!client) { navigate('/client/login'); return; }
    const nextQuery = popularQuery ?? searchInput;
    setQuery(nextQuery.trim()); setSearchInput(nextQuery);
    setFilters((current) => ({ ...current, location: searchLocation }));
    setCategory('all'); setVisibleCount(8); scrollToCrew();
  }

  function resetSearch() {
    setQuery(''); setSearchInput(''); setSearchLocation(''); setFilters(emptyFilters); setCategory('all'); setVisibleCount(8);
  }

  async function toggleSave(gigId) {
    const willSave = !saved.includes(gigId);
    try { await perform(() => api.toggleSave(gigId)); notify(willSave ? 'Added to your shortlist.' : 'Removed from your shortlist.'); }
    catch (failure) { notify(failure.message); }
  }

  async function book(details) {
    const { booking } = await perform(() => api.book(details));
    setModal({ type: 'confirmation', booking });
  }

  async function toggleGigStatus(gig) {
    try { await perform(() => api.setGigStatus(gig.id, gig.status === 'published' ? 'paused' : 'published')); notify(gig.status === 'published' ? 'Your gig is paused.' : 'Your gig is live on the marketplace.'); }
    catch (failure) { notify(failure.message); }
  }

  function findImmediateCrew() {
    if (!client) { navigate('/client/login'); return; }
    setFilters({ ...emptyFilters, availableNow: true }); setCategory('all'); setQuery(''); setSearchInput(''); setSearchLocation(''); setVisibleCount(8); scrollToCrew();
  }

  function openCreator(creator) {
    if (!client) return;
    if (!creator) { notify('This gig is currently paused or unavailable.'); return; }
    openModal({ type: 'profile', creatorId: creator.id });
  }

  const showProjects = () => openModal({ type: 'projects' });
  const showAvailability = () => openModal({ type: 'availability' });
  const showInbox = () => openModal({ type: 'messages' });
  const showPost = () => user ? openModal({ type: 'post' }) : navigate('/client/register');

  return <div className="app">
    <header className="site-header"><div className="header-inner">
      <a href={user ? `/${user.role}` : '/'} className="wordmark" aria-label="frame. India home" onClick={(event) => { event.preventDefault(); resetSearch(); navigate(user ? `/${user.role}` : '/'); }}>frame<span>.</span><i /></a>
      {user && <nav className="desktop-nav" aria-label="Main navigation"><button className="nav-link active" onClick={() => freelancer ? window.scrollTo({ top: 0, behavior: 'smooth' }) : scrollToCrew()}>{freelancer ? 'My gigs' : 'Browse gigs'}</button>{freelancer && <button className="nav-link" onClick={scrollToPortfolio}>Projects</button>}<button className="nav-link" onClick={showProjects}>{freelancer ? 'Bookings' : 'My projects'}</button><button className="nav-link nav-inbox" onClick={showInbox}>Inbox<Icon name="message" size={14} /></button></nav>}
      <div className="header-actions">{user ? <>
        <span className="account-badge"><span className="status-dot" />{freelancer ? 'Freelancer' : 'Client'}<strong>{user.name.split(' ')[0]}</strong></span>
        <button className="icon-button refresh-button" aria-label="Refresh workspace" disabled={refreshing} onClick={() => refreshWorkspace(true)}><Icon name="refresh" size={18} /></button>
        {client && <><button className="icon-button shortlist-button" aria-label={`Your shortlist, ${saved.length} saved gigs`} onClick={() => openModal({ type: 'saved' })}><Icon name="heart" size={20} />{saved.length > 0 && <span>{saved.length}</span>}</button><button className="button button-dark post-project-button" onClick={showPost}>Post a project<Icon name="plus" size={17} /></button></>}
        <button className="text-button logout-button" onClick={logout}>Log out<Icon name="logOut" size={15} /></button>
      </> : <><button className="button button-outline auth-header-button" onClick={() => navigate('/client/login')}>Client login</button><button className="button button-dark auth-header-button" onClick={() => navigate('/freelancer/login')}>Freelancer login<Icon name="arrowUpRight" size={15} /></button></>}
        <button className="icon-button mobile-menu-button" aria-label="Toggle navigation" aria-expanded={mobileMenu} onClick={() => setMobileMenu(!mobileMenu)}><Icon name={mobileMenu ? 'close' : 'menu'} /></button>
      </div>
    </div>{mobileMenu && <nav className="mobile-nav" aria-label="Mobile navigation">{user ? <><button onClick={() => { setMobileMenu(false); freelancer ? window.scrollTo({ top: 0, behavior: 'smooth' }) : scrollToCrew(); }}>{freelancer ? 'My gigs' : 'Browse gigs'}</button>{freelancer && <button onClick={scrollToPortfolio}>Projects</button>}<button onClick={showProjects}>{freelancer ? 'My bookings' : 'My projects'}</button><button onClick={showAvailability}>My availability</button><button onClick={showInbox}>Inbox</button><button onClick={logout}>Log out</button></> : <><button onClick={() => navigate('/client/register')}>Register as a client</button><button onClick={() => navigate('/freelancer/register')}>Register as a freelancer</button></>}</nav>}</header>

    {loadError && <div className="connection-banner page-width" role="alert"><p>{loadError}</p><button className="text-button" onClick={() => user ? refreshWorkspace(true) : setRetry((current) => current + 1)}>Try again<Icon name="refresh" size={14} /></button></div>}
    {booting ? <main className="loading-workspace page-width" role="status"><Icon name="aperture" size={35} /><h1>Getting your frame ready…</h1></main>
      : authRoute && !user ? <AuthPage key={`${authRoute[1]}-${authRoute[2]}`} role={authRoute[1]} mode={authRoute[2]} onNavigate={navigate} onAuthenticate={authenticate} />
        : freelancer ? <FreelancerDashboard user={user} gigs={allCreators} bookings={bookings} portfolioProjects={portfolioProjects} portfolioRef={portfolioRef} onCreate={() => openModal({ type: 'gig' })} onEdit={(gig) => openModal({ type: 'gig', creatorId: gig.id })} onAvailability={showAvailability} onBookings={showProjects} onMessages={showInbox} onToggleStatus={toggleGigStatus} onAddProject={(mode) => openModal({ type: 'portfolio-project', mode })} onEditProject={(project) => openModal({ type: 'portfolio-project', projectId: project.id })} onRemoveProject={async (id) => { await perform(() => api.removePortfolioProject(id)); notify('Project removed from your portfolio.'); }} />
          : <main>
            {client && <ClientDashboard user={user} gigs={allCreators} bookings={bookings} saved={saved} onAvailability={showAvailability} onProjects={showProjects} onPost={showPost} />}
            <section className="hero page-width"><div className="hero-copy"><div className="hero-eyebrow"><span />BIG IDEAS. LOCAL TALENT. ACROSS INDIA.</div><h1>Your vision.<br />The right <span className="hero-word">crew<svg viewBox="0 0 244 14" fill="none" aria-hidden="true"><path d="M3 9C56 2 157 0 240 6M29 12c62-5 123-5 170-3" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg></span>.</h1><p className="hero-description">Find exceptional camera talent across India.<br className="desktop-break" /> Local stories. Fair rupee rates. Hours that fit both of you.</p>
              <form className="hero-search" onSubmit={search}><div className="search-field"><Icon name="search" size={20} /><label htmlFor="talent-search" className="sr-only">Search gigs, skills, or equipment</label><input id="talent-search" placeholder="What are you creating?" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></div><div className="search-location"><Icon name="pin" size={17} /><LocationInput compact id="search-location" label="Search location" value={searchLocation} onChange={setSearchLocation} allowRemote placeholder="City" /></div><button className="search-submit" type="submit" aria-label="Find gigs"><Icon name="arrowUpRight" size={22} /></button></form><div className="popular-searches"><span>A little inspiration:</span>{['Wedding films', 'Brand films', 'Drone footage'].map((term) => <button key={term} onClick={() => search(null, term)}>{term}</button>)}</div>
            </div><div className="hero-visual"><div className="hero-photo"><img src={image('photo-1601506521937-0121a7fc2a6b', 1200)} alt="A filmmaker working with a professional cinema camera on set" fetchPriority="high" /><div className="hero-photo-shade" /><span className="hero-photo-label"><Icon name="aperture" size={15} />FOR THE LOVE OF THE CRAFT</span><div className="hero-photo-caption"><p>Behind every great story,<br />there’s a great crew.</p><button aria-label="Explore gigs across India" onClick={() => client ? scrollToCrew() : navigate('/client/login')}><Icon name="arrowUpRight" size={24} /></button></div><span className="photo-coordinate">MUMBAI, INDIA &nbsp; 19°04′ N &nbsp; 72°52′ E</span></div><button className="live-crew-card" onClick={findImmediateCrew}>{client ? <span className="avatar-stack">{allCreators.slice(0, 3).map((creator) => <Avatar key={creator.id} creator={creator} />)}</span> : <span className="india-community-icon"><Icon name="users" size={26} /></span>}<span><strong>Ready when you are.</strong><small><span className="status-dot" />{client ? `${nowCount} gigs with open hours today` : 'Made for India’s creative community'}</small></span><Icon name="arrowUpRight" size={18} /></button><div className="hero-scribble" aria-hidden="true"><svg viewBox="0 0 85 52" fill="none"><path d="M4 5c20 32 59 31 67 16 6-12-20-10-20-2s11 27 27 25m-15-1 16 2-4-15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg><span>your people<br />are out there.</span></div></div></section>

            <section className="creative-values page-width" aria-label="The frame India experience"><div><Icon name="globe" size={21} /><span>Local talent. <strong>Across India.</strong></span></div><div><Icon name="calendar" size={21} /><span>Your shoot. <strong>Flexible hours.</strong></span></div><div><Icon name="message" size={21} /><span>Good conversations. <strong>Rupee rates.</strong></span></div><div><Icon name="shield" size={21} /><span>Your work. <strong>Your workspace.</strong></span></div></section>

            {client ? <section id="creatives" ref={listingRef} className="discovery page-width"><div className="section-heading"><div><h2>Discover your next great gig<span>.</span></h2><p>Browse every live gig. Compare the craft, kit, and budget, then choose your own hours.</p></div><div className="listing-actions"><label className="available-toggle"><input type="checkbox" checked={filters.availableNow} onChange={(event) => { setFilters((current) => ({ ...current, availableNow: event.target.checked })); setVisibleCount(8); }} /><span className="toggle-track"><i /></span><span>Available today</span><Icon name="bolt" size={14} /></label><button className={`filter-button ${filterCount ? 'has-filters' : ''}`} onClick={() => openModal({ type: 'filters' })}><Icon name="sliders" size={17} />Filters{filterCount > 0 && <span>{filterCount}</span>}</button></div></div>
              <div className="category-list" aria-label="Creative specialties">{categories.map((item) => <button key={item.id} className={`category-button ${category === item.id ? 'selected' : ''}`} aria-pressed={category === item.id} onClick={() => { setCategory(item.id); setVisibleCount(8); }}><Icon name={item.icon} size={17} />{item.label}</button>)}</div>
              <div className="results-toolbar"><div className="results-description">{hasSearch ? <><strong>{filteredCreators.length} {filteredCreators.length === 1 ? 'gig' : 'gigs'}</strong>{query && <> for “{query}”</>}{filters.date && <> · {formatDate(filters.date)}</>}{filters.location && <> · {filters.location}</>}<button className="clear-search" onClick={resetSearch}>Clear all<Icon name="close" size={12} /></button></> : <><span className="status-dot" />{allCreators.length} live gigs from India’s independent creatives.</>}</div><label className="sort-select">Sort by:<select aria-label="Sort gigs" value={sort} onChange={(event) => setSort(event.target.value)}><option value="recommended">Recommended</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="rating">Top rated</option></select><Icon name="chevronDown" size={13} /></label></div>
              {filteredCreators.length ? <div className="creator-grid">{filteredCreators.slice(0, visibleCount).map((creator) => <CreatorCard key={creator.id} creator={creator} saved={saved.includes(creator.id)} onSave={toggleSave} onOpen={openCreator} bookings={bookings} availability={availability} />)}</div> : <div className="empty-state search-empty"><span><Icon name={allCreators.length ? 'search' : 'users'} size={34} /></span><h3>{allCreators.length ? 'Your perfect crew might be one filter away.' : 'The crew is getting ready.'}</h3><p>{allCreators.length ? 'Try a different specialty, date, location, or budget.' : 'There are no published gigs yet. Freelancers can register and publish the first listing.'}</p>{allCreators.length > 0 && <button className="button button-primary" onClick={resetSearch}>Explore all gigs<Icon name="arrowRight" size={17} /></button>}</div>}
              {filteredCreators.length > visibleCount && <div className="explore-more"><button className="button button-outline" onClick={() => setVisibleCount((current) => current + 8)}>Explore more gigs<Icon name="arrowRight" size={17} /></button></div>}
            </section> : <section className="role-entry page-width"><div className="section-heading"><div><span className="eyebrow">TWO SIDES. ONE CREATIVE COMMUNITY.</span><h2>Find your place in the frame<span>.</span></h2><p>A dedicated workspace for the way you work.</p></div><span className="india-pill"><Icon name="pin" size={14} />India · INR · IST</span></div><div className="role-entry-grid"><article><span className="role-entry-icon"><Icon name="briefcase" size={27} /></span><h3>I’m hiring a crew.</h3><p>Explore all live gigs, save your favourites, post a project brief, and pick hours that fit both schedules.</p><button className="button button-primary" onClick={() => navigate('/client/register')}>Get started as a client<Icon name="arrowUpRight" size={17} /></button><button className="text-button" onClick={() => navigate('/client/login')}>Already a client? Log in</button></article><article><span className="role-entry-icon"><Icon name="camera" size={27} /></span><h3>I’m a freelancer.</h3><p>Publish your own gigs, set fair rates, manage flexible availability, and connect with your clients in a private workspace.</p><button className="button button-dark" onClick={() => navigate('/freelancer/register')}>Get started as a freelancer<Icon name="arrowUpRight" size={17} /></button><button className="text-button" onClick={() => navigate('/freelancer/login')}>Already a freelancer? Log in</button></article></div></section>}

            <section className="how-it-works page-width" id="how-it-works"><div className="how-heading"><span className="eyebrow">LESS ADMIN. MORE ACTION.</span><h2>From “what if”<br />to “that’s a wrap.”</h2><button className="text-button" onClick={showPost}>Start with your idea<Icon name="arrowUpRight" size={17} /></button></div><div className="how-step"><span className="step-number">01</span><div className="step-icon"><Icon name="users" size={26} /></div><h3>Find your people.</h3><p>Browse Indian creatives who get your vision, with the right skills, languages, and gear.</p></div><div className="how-step"><span className="step-number">02</span><div className="step-icon"><Icon name="clock" size={26} /></div><h3>Make time together.</h3><p>Add comfortable hours, find a mutual slot in IST, and agree on a fair rupee rate.</p></div><div className="how-step"><span className="step-number">03</span><div className="step-icon"><Icon name="film" size={26} /></div><h3>Make something great.</h3><p>Your freelancer confirms the shoot. Your vision is shared. All that’s left? Roll camera.</p></div></section>
            <section className="instant-banner page-width"><div className="banner-art" aria-hidden="true"><Icon name="bolt" size={70} /><i /><i /></div><div className="instant-copy"><span><span className="status-dot" />FOR THE LAST-MINUTE BRILLIANT IDEA</span><h2>Great talent. Without the wait.</h2><p>From a Mumbai brand shoot to a Jaipur wedding. Find your next creative collaborator.</p></div><button className="button button-lime" onClick={findImmediateCrew}>Find available gigs<Icon name="arrowUpRight" size={20} /></button></section>
          </main>}

    <footer className="site-footer page-width"><div className="footer-main"><a className="wordmark" href={user ? `/${user.role}` : '/'} onClick={(event) => { event.preventDefault(); navigate(user ? `/${user.role}` : '/'); }}>frame<span>.</span><i /></a><p>Made for the people behind India’s stories.</p></div><div className="footer-links">{freelancer ? <button onClick={showAvailability}>My availability<Icon name="clock" size={13} /></button> : <><a href="#how-it-works">How it works</a>{!user && <button onClick={() => navigate('/freelancer/register')}>Join the crew<Icon name="arrowUpRight" size={13} /></button>}</>}<span>© {new Date().getFullYear()} frame. India · ₹ INR · IST</span></div></footer>

    {client && modal?.type === 'profile' && currentCreator && <BookingModal key={currentCreator.id} creator={currentCreator} bookings={bookings} projects={projects} availability={availability} initialDate={filters.date} agreedRate={agreedRates[`${user.id}:${currentCreator.id}`]} onClose={closeModal} onBook={book} onAvailability={showAvailability} onNegotiate={(creator, context) => setModal({ type: 'messages', creatorId: creator.id, offerMode: true, context })} onMessage={(creator) => setModal({ type: 'messages', creatorId: creator.id })} />}
    {client && modal?.type === 'confirmation' && <BookingConfirmation booking={modal.booking} onClose={closeModal} onProjects={showProjects} />}
    {client && modal?.type === 'filters' && <FiltersModal filters={filters} onClose={closeModal} onApply={(next) => { setFilters(next); setSearchLocation(next.location); setVisibleCount(8); closeModal(); }} />}
    {client && modal?.type === 'post' && <PostProjectModal user={user} onClose={closeModal} onSubmit={async (project) => { await perform(() => api.postProject(project)); setModal({ type: 'projects', tab: 'briefs' }); notify('Your project brief is ready. Let’s find the right crew.'); }} />}
    {freelancer && modal?.type === 'gig' && <GigFormModal key={currentCreator?.id || 'new'} user={user} gig={currentCreator} availability={availability} onClose={closeModal} onSubmit={async (gig, times) => { await perform(() => api.saveAvailability(times)); await perform(() => api.saveGig(gig)); closeModal(); notify(gig.id ? 'Your gig is updated.' : 'Your gig is live. Welcome to the call sheet!'); }} />}
    {freelancer && modal?.type === 'portfolio-project' && (!modal.projectId || currentPortfolioProject) && <PortfolioProjectModal key={currentPortfolioProject?.id || modal.mode || 'new'} user={user} project={currentPortfolioProject} mode={modal.mode} onClose={closeModal} onSave={(project) => perform(() => api.savePortfolioProject(project))} onUpload={(projectId, file, type) => perform(() => api.uploadPortfolioFile(projectId, file, type))} onRemoveFile={(projectId, fileId) => perform(() => api.removePortfolioFile(projectId, fileId))} onDone={(edited) => { closeModal(); scrollToPortfolio(); notify(edited ? 'Your portfolio project is updated.' : 'Project added to your portfolio.'); }} />}
    {user && modal?.type === 'availability' && <AvailabilityModal key={user.id} user={user} availability={availability} onClose={closeModal} onSubmit={async (times) => { await perform(() => api.saveAvailability(times)); closeModal(); notify('Your comfortable hours are saved in IST.'); }} />}
    {user && modal?.type === 'projects' && <ProjectsModal user={user} initialTab={modal.tab} bookings={bookings} projects={projects} onClose={closeModal} onPost={showPost} onUpdateBooking={async (id, status) => { await perform(() => api.updateBooking(id, status)); notify({ confirmed: 'Booking confirmed. You’re on the call sheet.', cancelled: 'Booking cancelled. Those hours are available again.', declined: 'Request declined. Those hours are available again.' }[status]); }} onCloseProject={async (id) => { await perform(() => api.closeProject(id)); notify('Project brief closed.'); }} onFindCrew={(project) => { setCategory(project.category); setFilters({ ...emptyFilters, date: project.preferredTimes[0]?.date || '', location: project.location, budget: String(project.budget), availableNow: project.urgent }); setQuery(''); setSearchInput(''); setSearchLocation(project.location); setVisibleCount(8); closeModal(); scrollToCrew(); }} onOpenCreator={(id) => openCreator(conversationCreators.find((person) => person.id === id))} onMessage={(booking) => setModal({ type: 'messages', creatorId: booking.creatorId, clientId: booking.clientId })} />}
    {user && modal?.type === 'messages' && <MessagesModal key={user.id} user={user} creators={conversationCreators} contacts={contacts} bookings={bookings} messages={messages} initialCreator={currentCreator} initialClientId={modal.clientId} offerMode={modal.offerMode} context={modal.context} agreedRates={agreedRates} onClose={closeModal} onSend={(thread, text) => perform(() => api.sendMessage({ creatorId: thread.creator.id, clientId: thread.clientId, text }))} onOffer={(thread, offer, text, context) => perform(() => api.sendMessage({ creatorId: thread.creator.id, clientId: thread.clientId, offer, text, context }))} onAccept={async (message) => { await perform(() => api.acceptOffer(message.id)); notify(`Rate agreed: ${money(message.offer)}/day.`); }} onBook={openCreator} onBookings={showProjects} />}
    {client && modal?.type === 'saved' && <Modal title="Your kind of people." subtitle="Keep your favourite gigs close for your next great idea." onClose={closeModal} className="saved-modal">{saved.length ? <div className="saved-grid">{allCreators.filter((creator) => saved.includes(creator.id)).map((creator) => <CreatorCard key={creator.id} creator={creator} saved onSave={toggleSave} onOpen={openCreator} bookings={bookings} availability={availability} />)}</div> : <div className="empty-state"><span><Icon name="heart" size={34} /></span><h3>A shortlist worth getting excited about.</h3><p>Tap the heart on a gig to keep it here.</p><button className="button button-primary" onClick={closeModal}>Meet the creatives<Icon name="arrowRight" size={17} /></button></div>}</Modal>}
    {toast && <div className="toast" role="status" key={toast.id}><span><Icon name="check" size={17} /></span><p>{toast.text}</p><button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast(null)}><Icon name="close" size={16} /></button></div>}
  </div>;
}

export default App;
