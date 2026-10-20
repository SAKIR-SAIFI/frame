import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { api } from './utils/api';
import { categories } from './data/creators';
import { activeBooking, dateKey, minutes, parseDate } from './utils/marketplace';
import { createSeed } from '../server/test-fixtures';

jest.mock('./utils/api', () => ({ api: Object.fromEntries(['session', 'locationCountries', 'locationCities', 'workspace', 'login', 'register', 'logout', 'saveAvailability', 'saveGig', 'setGigStatus', 'toggleSave', 'book', 'updateBooking', 'postProject', 'closeProject', 'sendMessage', 'acceptOffer', 'savePortfolioProject', 'removePortfolioProject', 'uploadPortfolioFile', 'removePortfolioFile', 'sendContact'].map((name) => [name, jest.fn()])) }));

const seed = createSeed();
const copy = (value) => JSON.parse(JSON.stringify(value));
const profile = (user) => Object.fromEntries(Object.entries(user).filter(([key]) => key !== 'passwordHash'));
const demoClient = profile(seed.users.find((user) => user.role === 'client'));
let currentUser;
let currentWorkspace;
let portfolioCounter;
let fileCounter;

function futureDate(offset = 7) {
  const date = parseDate(dateKey()); date.setUTCDate(date.getUTCDate() + offset);
  return dateKey(date);
}

function workspaceFor(user) {
  const gigs = copy(seed.gigs.filter((gig) => user.role === 'client' || gig.ownerId === user.id)).map((gig) => ({ ...gig, role: categories.find((item) => item.id === gig.category).role, availability: copy(seed.users.find((owner) => owner.id === gig.ownerId).availability), busyTimes: [] }));
  return { user: copy(user), gigs, bookings: [], projects: [], portfolioProjects: [], saved: [], agreedRates: {}, availability: copy(user.availability), messages: copy(seed.messages.filter((message) => user.role === 'client' ? message.clientId === user.id : gigs.some((gig) => gig.id === message.creatorId))), contacts: user.role === 'freelancer' ? [{ id: demoClient.id, name: demoClient.name, role: 'client', location: demoClient.location }] : [] };
}

function useAccount(user) {
  currentUser = copy(user);
  currentWorkspace = workspaceFor(currentUser);
}

function result(extra = {}) { return Promise.resolve({ ...extra, workspace: copy(currentWorkspace) }); }

function syncPortfolio() {
  currentWorkspace.gigs.forEach((gig) => { gig.portfolioProjects = copy(currentWorkspace.portfolioProjects.filter((project) => project.ownerId === gig.ownerId && project.showOnProfile)); });
}

beforeEach(() => {
  jest.resetAllMocks();
  window.history.replaceState({}, '', '/');
  window.scrollTo = jest.fn();
  HTMLElement.prototype.scrollIntoView = jest.fn();
  currentUser = null; currentWorkspace = null;
  portfolioCounter = 0; fileCounter = 0;
  api.session.mockImplementation(() => Promise.resolve({ user: copy(currentUser) }));
  api.locationCountries.mockResolvedValue({ countries: [{ name: 'India', code: 'IN' }, { name: 'Canada', code: 'CA' }] });
  api.locationCities.mockImplementation((country) => Promise.resolve({ country, cities: country === 'Canada' ? ['Toronto', 'Vancouver'] : ['Bangalore', 'Mumbai', 'Delhi', 'Pune', 'Jaipur', 'Chennai', 'Kolkata'] }));
  api.workspace.mockImplementation(() => Promise.resolve(copy(currentWorkspace)));
  api.login.mockImplementation(({ role, email }) => {
    useAccount(profile(seed.users.find((user) => user.role === role && user.email === email)));
    return result({ user: copy(currentUser) });
  });
  api.register.mockImplementation((values) => {
    useAccount({ ...values, id: 'new-account', availability: [], demo: false });
    return result({ user: copy(currentUser) });
  });
  api.logout.mockImplementation(() => { currentUser = null; currentWorkspace = null; return Promise.resolve({ user: null }); });
  api.sendContact.mockResolvedValue({ sent: true });
  api.toggleSave.mockImplementation((id) => {
    currentWorkspace.saved = currentWorkspace.saved.includes(id) ? currentWorkspace.saved.filter((value) => value !== id) : [...currentWorkspace.saved, id];
    return result();
  });
  api.saveAvailability.mockImplementation((values) => {
    currentUser.availability = copy(values); currentWorkspace.user = copy(currentUser); currentWorkspace.availability = copy(values);
    if (currentUser.role === 'freelancer') currentWorkspace.gigs.forEach((gig) => { gig.availability = copy(values); });
    return result();
  });
  api.saveGig.mockImplementation((values) => {
    const gig = { ...values, id: values.id || 'new-gig', ownerId: currentUser.id, name: currentUser.name, role: categories.find((item) => item.id === values.category).role, availability: copy(currentUser.availability), cover: seed.gigs[0].cover, busyTimes: [], status: 'published', reviews: 0, rating: 0 };
    currentWorkspace.gigs = [...currentWorkspace.gigs.filter((item) => item.id !== gig.id), gig];
    return result({ gig });
  });
  api.book.mockImplementation((values) => {
    const gig = currentWorkspace.gigs.find((item) => item.id === values.creatorId);
    const rate = currentWorkspace.agreedRates[`${currentUser.id}:${gig.id}`] || gig.rate;
    const booking = { ...values, id: 'new-booking', status: 'requested', creatorName: gig.name, clientName: currentUser.name, clientId: currentUser.id, freelancerId: gig.ownerId, dayRate: rate, total: Math.round(rate * (minutes(values.end) - minutes(values.start)) / 480), gigTitle: gig.title };
    currentWorkspace.bookings.push(booking);
    currentWorkspace.gigs.filter((item) => item.ownerId === gig.ownerId).forEach((item) => item.busyTimes.push({ date: values.date, start: values.start, end: values.end }));
    return result({ booking });
  });
  api.updateBooking.mockImplementation((id, status) => {
    currentWorkspace.bookings = currentWorkspace.bookings.map((booking) => booking.id === id ? { ...booking, status } : booking);
    currentWorkspace.gigs.forEach((gig) => { gig.busyTimes = currentWorkspace.bookings.filter((booking) => booking.freelancerId === gig.ownerId && activeBooking(booking)).map(({ date, start, end }) => ({ date, start, end })); });
    return result();
  });
  api.postProject.mockImplementation((values) => {
    const project = { ...values, id: 'new-project', clientId: currentUser.id, status: 'open' };
    currentWorkspace.projects.push(project); return result({ project });
  });
  api.acceptOffer.mockImplementation((id) => {
    const offer = currentWorkspace.messages.find((message) => message.id === id);
    offer.offerStatus = 'accepted';
    currentWorkspace.agreedRates[`${offer.clientId}:${offer.creatorId}`] = offer.offer;
    return result();
  });
  api.savePortfolioProject.mockImplementation((values) => {
    const existing = currentWorkspace.portfolioProjects.find((project) => project.id === values.id);
    const portfolioProject = { description: '', yourRole: '', projectDate: '', driveUrl: '', showOnProfile: true, ...existing, ...values, id: values.id || `portfolio-${++portfolioCounter}`, ownerId: currentUser.id, assets: existing?.assets || [], updatedAt: Date.now() };
    currentWorkspace.portfolioProjects = [...currentWorkspace.portfolioProjects.filter((project) => project.id !== portfolioProject.id), portfolioProject];
    syncPortfolio(); return result({ portfolioProject: copy(portfolioProject) });
  });
  api.uploadPortfolioFile.mockImplementation((id, file, type) => {
    const portfolioProject = currentWorkspace.portfolioProjects.find((project) => project.id === id);
    const fileId = `file-${++fileCounter}`;
    portfolioProject.assets.push({ id: fileId, name: file.name, type, size: file.size, url: `/api/portfolio-assets/${fileId}` });
    syncPortfolio(); return result({ portfolioProject: copy(portfolioProject) });
  });
  api.removePortfolioFile.mockImplementation((id, fileId) => {
    const portfolioProject = currentWorkspace.portfolioProjects.find((project) => project.id === id);
    portfolioProject.assets = portfolioProject.assets.filter((asset) => asset.id !== fileId);
    syncPortfolio(); return result({ portfolioProject: copy(portfolioProject) });
  });
  api.removePortfolioProject.mockImplementation((id) => {
    currentWorkspace.portfolioProjects = currentWorkspace.portfolioProjects.filter((project) => project.id !== id);
    syncPortfolio(); return result();
  });
});

test('visitors can send a query through the public contact form', async () => {
  render(<App />);
  await screen.findByRole('heading', { name: /your vision. the right crew/i });
  userEvent.click(screen.getByRole('button', { name: 'Contact / feedback' }));
  const dialog = screen.getByRole('dialog');
  userEvent.type(within(dialog).getByLabelText('Your name'), 'Aditi Verma');
  userEvent.type(within(dialog).getByLabelText('Email address for reply'), 'aditi@example.in');
  userEvent.selectOptions(within(dialog).getByLabelText('What can we help with?'), 'Suggestion');
  userEvent.type(within(dialog).getByLabelText('Subject'), 'A thought about the marketplace');
  userEvent.type(within(dialog).getByLabelText('Your message'), 'It would be helpful to add a way to share favorite gigs.');
  userEvent.click(within(dialog).getByRole('button', { name: 'Send message' }));
  await screen.findByRole('heading', { name: 'Thanks for reaching out.' });
  expect(api.sendContact).toHaveBeenCalledWith({ name: 'Aditi Verma', email: 'aditi@example.in', type: 'Suggestion', subject: 'A thought about the marketplace', message: 'It would be helpful to add a way to share favorite gigs.', website: '' });
});

test('separate registration offers keyboard-accessible Indian city suggestions and validates matching passwords', async () => {
  render(<App />);
  await screen.findByRole('heading', { name: /your vision. the right crew/i });
  userEvent.click(screen.getByRole('button', { name: 'Client login', exact: true }));
  expect(screen.getByRole('heading', { name: /^Client login\s*\.$/ })).toBeInTheDocument();
  userEvent.click(screen.getByRole('button', { name: 'Register as a client', exact: true }));
  userEvent.type(screen.getByLabelText('Full name'), 'Aditi Verma');
  userEvent.type(screen.getByLabelText('Email address'), 'aditi@example.in');
  userEvent.type(screen.getByLabelText(/mobile number/i), '9876543210');
  const location = screen.getByRole('combobox', { name: 'Your city' });
  userEvent.type(location, 'Bang');
  expect(await screen.findByRole('option', { name: /Bengaluru.*Karnataka/i })).toBeInTheDocument();
  fireEvent.keyDown(location, { key: 'ArrowDown' });
  fireEvent.keyDown(location, { key: 'Enter' });
  expect(location).toHaveValue('Bengaluru');
  userEvent.type(screen.getByLabelText('Password', { exact: true }), 'IndiaPass2026!');
  userEvent.type(screen.getByLabelText('Confirm password'), 'DifferentPass!');
  userEvent.click(screen.getByRole('button', { name: 'Create client account' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Your passwords do not match.');
  expect(api.register).not.toHaveBeenCalled();
  userEvent.clear(screen.getByLabelText('Confirm password'));
  userEvent.type(screen.getByLabelText('Confirm password'), 'IndiaPass2026!');
  userEvent.click(screen.getByRole('button', { name: 'Create client account' }));
  await screen.findByRole('heading', { name: /^Hello, Aditi\s*\.$/ });
  expect(api.register).toHaveBeenCalledWith(expect.objectContaining({ role: 'client', name: 'Aditi Verma', location: 'Bengaluru, Karnataka', phone: '9876543210' }));
});

test('location forms fetch cities for the selected country through CountriesNow', async () => {
  render(<App />);
  await screen.findByRole('heading', { name: /your vision. the right crew/i });
  userEvent.click(screen.getByRole('button', { name: 'Client login', exact: true }));
  userEvent.click(screen.getByRole('button', { name: 'Register as a client', exact: true }));
  await screen.findByRole('option', { name: 'Canada' });
  userEvent.selectOptions(screen.getByRole('combobox', { name: 'Your city country' }), 'Canada');
  const city = screen.getByRole('combobox', { name: 'Your city' });
  userEvent.click(city);
  expect(await screen.findByRole('option', { name: /Toronto.*Canada/ })).toBeInTheDocument();
  userEvent.type(city, 'Tor');
  userEvent.click(screen.getByRole('option', { name: /Toronto.*Canada/ }));
  expect(screen.getByRole('combobox', { name: 'Your city' })).toHaveValue('Toronto');
  expect(api.locationCities).toHaveBeenCalledWith('Canada');
});

test('a client can see all eight Indian gigs, filter specialties, search, and keep a personal shortlist in Strict Mode', async () => {
  useAccount(demoClient);
  render(<StrictMode><App /></StrictMode>);
  await screen.findByRole('heading', { name: /discover your next great gig/i });
  expect(screen.getAllByRole('button', { name: /View .*'s profile and availability/ })).toHaveLength(8);
  expect(screen.getAllByText('₹18,000').length).toBeGreaterThan(0);
  userEvent.click(screen.getByRole('button', { name: 'Save Aarav Sharma' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Unsave Aarav Sharma' })).toHaveAttribute('aria-pressed', 'true'));
  expect(api.toggleSave).toHaveBeenCalledWith('aarav');
  userEvent.click(screen.getByRole('button', { name: 'Drone pilots' }));
  expect(screen.getByRole('button', { name: 'Priya Nair', exact: true })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Aarav Sharma', exact: true })).not.toBeInTheDocument();
  userEvent.type(screen.getByRole('textbox', { name: /search gigs/i }), 'Wedding films');
  userEvent.click(screen.getByRole('button', { name: 'Find gigs', exact: true }));
  expect(screen.getByRole('button', { name: 'Aarav Sharma', exact: true })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ananya Iyer', exact: true })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Priya Nair', exact: true })).not.toBeInTheDocument();
});

test('an empty marketplace explains that the first freelancer gigs are not published yet', async () => {
  useAccount(demoClient);
  currentWorkspace.gigs = [];
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'The crew is getting ready.' })).toBeInTheDocument();
  expect(screen.getByText('There are no published gigs yet. Freelancers can register and publish the first listing.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Explore all gigs' })).not.toBeInTheDocument();
});

test('clients book custom hours within both schedules and cancellation releases those hours', async () => {
  const date = futureDate();
  useAccount({ ...demoClient, availability: [{ id: 'client-hours', date, start: '10:00', end: '14:00' }] });
  render(<App />);
  await screen.findByRole('heading', { name: /discover your next great gig/i });
  userEvent.click(screen.getByRole('button', { name: /view aarav sharma.s profile and availability/i }));
  let dialog = screen.getByRole('dialog');
  expect(within(dialog).getByLabelText('Your start time')).toHaveValue('10:00');
  expect(within(dialog).getByLabelText('Your end time')).toHaveValue('14:00');
  fireEvent.change(within(dialog).getByLabelText('Your start time'), { target: { value: '09:30' } });
  expect(within(dialog).getByRole('button', { name: 'Request booking' })).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText('Your start time'), { target: { value: '11:20' } });
  fireEvent.change(within(dialog).getByLabelText('Your end time'), { target: { value: '12:50' } });
  expect(within(dialog).getByText('₹3,375')).toBeInTheDocument();
  userEvent.click(within(dialog).getByRole('button', { name: 'Request booking' }));
  await screen.findByText('Your booking request is in.');
  expect(api.book).toHaveBeenCalledWith({ creatorId: 'aarav', date, start: '11:20', end: '12:50', projectId: '' });
  expect(screen.getByText('11:20 AM – 12:50 PM IST')).toBeInTheDocument();
  userEvent.click(screen.getByRole('button', { name: 'View my projects' }));
  userEvent.click(screen.getByRole('button', { name: 'Cancel booking' }));
  await screen.findByText('Cancelled', { exact: true });
  userEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
  userEvent.click(screen.getByRole('button', { name: /view aarav sharma.s profile and availability/i }));
  dialog = screen.getByRole('dialog');
  expect(within(dialog).getByLabelText('Your start time')).toHaveValue('10:00');
  expect(within(dialog).getByLabelText('Your end time')).toHaveValue('14:00');
});

test('freelancers see only their own gigs and client conversations, including after switching accounts', async () => {
  useAccount(profile(seed.users.find((user) => user.id === 'freelancer-aarav')));
  render(<App />);
  await screen.findByRole('heading', { name: /^Hello, Aarav\s*\.$/ });
  expect(screen.getByRole('heading', { name: /^My gigs\s*\.$/ })).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Edit gig' })).toHaveLength(1);
  expect(screen.getByRole('heading', { name: 'Your vision, brought to life in every frame.' })).toBeInTheDocument();
  expect(screen.queryByText('Priya Nair')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Browse gigs', exact: true })).not.toBeInTheDocument();
  userEvent.click(screen.getByRole('button', { name: 'Open my inbox' }));
  expect(within(screen.getByRole('dialog')).getAllByText('Ishita Kapoor').length).toBeGreaterThan(0);
  expect(within(screen.getByRole('dialog')).queryByText('Priya Nair')).not.toBeInTheDocument();
  userEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
  userEvent.click(screen.getByRole('button', { name: 'Log out', exact: true }));
  await screen.findByRole('button', { name: 'Freelancer login', exact: true });
  userEvent.click(screen.getByRole('button', { name: 'Freelancer login', exact: true }));
  userEvent.type(screen.getByLabelText('Email address'), 'priya@perfectlens.in');
  userEvent.type(screen.getByLabelText('Password'), 'PerfectLensIndia2026!');
  userEvent.click(screen.getByRole('button', { name: 'Log in as freelancer' }));
  await screen.findByRole('heading', { name: /^Hello, Priya\s*\.$/ });
  expect(screen.getByRole('heading', { name: 'A different perspective. An unforgettable shot.' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Your vision, brought to life in every frame.' })).not.toBeInTheDocument();
});

test('a freelancer publishes a gig with an evening date and custom repeating weekly hours', async () => {
  useAccount({ id: 'freelancer-new', role: 'freelancer', name: 'Tanvi Deshmukh', specialty: 'gimbal', location: 'Mumbai, Maharashtra', availability: [] });
  render(<App />);
  await screen.findByRole('heading', { name: /^Hello, Tanvi\s*\.$/ });
  userEvent.click(screen.getByRole('button', { name: 'Create a gig', exact: true }));
  userEvent.type(screen.getByLabelText(/Your day rate \(₹\)/), '15000');
  userEvent.type(screen.getByLabelText('Your gig headline'), 'Smooth cinematic movement for Indian brand films.');
  userEvent.type(screen.getByLabelText('A little about you'), 'Experienced camera specialist for music videos, weddings, and brand stories.');
  userEvent.type(screen.getByLabelText(/what.s in your kit/i), 'Sony FX3, DJI Ronin');
  userEvent.type(screen.getByLabelText(/Skills and languages/), 'Music videos, Hindi, Marathi');
  const date = futureDate();
  fireEvent.change(screen.getByLabelText('Available date'), { target: { value: date } });
  fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '18:15' } });
  fireEvent.change(screen.getByLabelText('End time'), { target: { value: '22:45' } });
  userEvent.click(screen.getByRole('button', { name: 'Add time slot' }));
  userEvent.click(screen.getByRole('button', { name: 'Repeat every week' }));
  userEvent.selectOptions(screen.getByLabelText('Day of the week'), '3');
  fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '06:10' } });
  fireEvent.change(screen.getByLabelText('End time'), { target: { value: '08:20' } });
  userEvent.click(screen.getByRole('button', { name: 'Add time slot' }));
  userEvent.click(screen.getByRole('button', { name: 'Publish my gig' }));
  await screen.findByRole('heading', { name: 'Smooth cinematic movement for Indian brand films.' });
  expect(api.saveAvailability).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ date, start: '18:15', end: '22:45' }), expect.objectContaining({ weekday: 3, start: '06:10', end: '08:20' })]));
  expect(api.saveGig).toHaveBeenCalledWith(expect.objectContaining({ rate: 15000, category: 'gimbal', equipment: ['Sony FX3', 'DJI Ronin'], location: 'Mumbai, Maharashtra' }));
});

test('a client saves flexible weekly availability and is shown a clear error for reversed hours', async () => {
  useAccount(demoClient);
  render(<App />);
  await screen.findByRole('heading', { name: /discover your next great gig/i });
  userEvent.click(screen.getByRole('button', { name: 'My availability', exact: true }));
  userEvent.click(screen.getByRole('button', { name: 'Repeat every week' }));
  userEvent.selectOptions(screen.getByLabelText('Day of the week'), '6');
  fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '18:30' } });
  fireEvent.change(screen.getByLabelText('End time'), { target: { value: '17:30' } });
  userEvent.click(screen.getByRole('button', { name: 'Add time slot' }));
  expect(screen.getByRole('alert')).toHaveTextContent('End time must be after start time.');
  fireEvent.change(screen.getByLabelText('End time'), { target: { value: '22:15' } });
  userEvent.click(screen.getByRole('button', { name: 'Add time slot' }));
  expect(screen.getByText('Every Saturday')).toBeInTheDocument();
  userEvent.click(screen.getByRole('button', { name: 'Save availability' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(api.saveAvailability).toHaveBeenCalledWith([expect.objectContaining({ weekday: 6, start: '18:30', end: '22:15' })]);
});

test('clients post private rupee-budget briefs with multiple preferred call times and find matching gigs', async () => {
  useAccount(demoClient);
  render(<App />);
  await screen.findByRole('heading', { name: /discover your next great gig/i });
  userEvent.click(screen.getByRole('button', { name: 'Post a project', exact: true }));
  userEvent.type(screen.getByLabelText('Give your project a name'), 'Aerial launch for a homegrown brand');
  userEvent.selectOptions(screen.getByLabelText('Who do you need?'), 'drone');
  userEvent.type(screen.getByLabelText('Your budget (₹)'), '16000');
  userEvent.clear(screen.getByLabelText('Shoot city'));
  userEvent.type(screen.getByLabelText('Shoot city'), 'Beng');
  userEvent.click(await screen.findByRole('option', { name: /Bengaluru.*Karnataka/i }));
  userEvent.type(screen.getByLabelText('Tell us a little about the vision'), 'We need cinematic aerial footage for a new Indian homegrown brand launch.');
  fireEvent.change(screen.getByLabelText('Available date'), { target: { value: futureDate() } });
  fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '18:30' } });
  fireEvent.change(screen.getByLabelText('End time'), { target: { value: '20:45' } });
  userEvent.click(screen.getByRole('button', { name: 'Add time slot' }));
  userEvent.click(screen.getByRole('button', { name: 'Post my project' }));
  await screen.findByRole('heading', { name: 'Aerial launch for a homegrown brand' });
  expect(api.postProject).toHaveBeenCalledWith(expect.objectContaining({ budget: 16000, location: 'Bengaluru, Karnataka', preferredTimes: expect.arrayContaining([expect.objectContaining({ start: '18:30', end: '20:45' })]) }));
  expect(currentWorkspace.projects[0].preferredTimes).toHaveLength(2);
  userEvent.click(screen.getByRole('button', { name: 'Find matching crew' }));
  expect(screen.getByRole('button', { name: 'Priya Nair', exact: true })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Aarav Sharma', exact: true })).not.toBeInTheDocument();
});

test('a rate accepted in a private conversation is used when the client chooses booking hours', async () => {
  useAccount(demoClient);
  currentWorkspace.messages.push({ id: 'rate-proposal', creatorId: 'aarav', clientId: currentUser.id, senderId: 'freelancer-aarav', text: 'Let’s agree on this day rate for your film.', offer: 15000, offerStatus: 'pending', timestamp: Date.now() });
  render(<App />);
  await screen.findByRole('heading', { name: /discover your next great gig/i });
  userEvent.click(screen.getByRole('button', { name: 'Inbox', exact: true }));
  userEvent.click(screen.getByRole('button', { name: 'Accept ₹15,000/day' }));
  await screen.findByRole('button', { name: 'Rate agreed' });
  userEvent.click(screen.getByRole('button', { name: 'View availability', exact: true }));
  expect(within(screen.getByRole('dialog')).getAllByText('₹15,000', { exact: true })).not.toHaveLength(0);
  expect(api.acceptOffer).toHaveBeenCalledWith('rate-proposal');
});

test('freelancers add and edit Google Drive projects, validate links, and have a dedicated Projects navigation entry', async () => {
  useAccount(profile(seed.users.find((user) => user.id === 'freelancer-aarav')));
  render(<App />);
  await screen.findByRole('heading', { name: /^Hello, Aarav\s*\.$/ });
  userEvent.click(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('button', { name: 'Projects', exact: true }));
  expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  userEvent.click(screen.getByRole('button', { name: 'Add Google Drive link', exact: true }));
  userEvent.type(screen.getByLabelText('Project title'), 'Jaipur wedding film');
  userEvent.type(screen.getByLabelText('Your role in this project'), 'Cinematographer');
  userEvent.type(screen.getByLabelText(/Google Drive link/), 'https://example.in/wedding-film');
  userEvent.click(screen.getByRole('button', { name: 'Add to my projects' }));
  expect(screen.getByRole('alert')).toHaveTextContent('drive.google.com');
  expect(api.savePortfolioProject).not.toHaveBeenCalled();
  userEvent.clear(screen.getByLabelText(/Google Drive link/));
  const driveUrl = 'https://drive.google.com/file/d/wedding-film/view?usp=sharing';
  userEvent.type(screen.getByLabelText(/Google Drive link/), driveUrl);
  userEvent.click(screen.getByRole('button', { name: 'Add to my projects' }));
  await screen.findByRole('heading', { name: 'Jaipur wedding film' });
  let card = screen.getByRole('article', { name: 'Jaipur wedding film' });
  expect(within(card).getByRole('link', { name: 'Open Google Drive' })).toHaveAttribute('href', driveUrl);
  expect(within(card).getByRole('link', { name: 'Open Google Drive' })).toHaveAttribute('rel', 'noopener noreferrer');
  userEvent.click(within(card).getByRole('button', { name: 'Edit Jaipur wedding film' }));
  expect(screen.getByLabelText('Project title')).toHaveValue('Jaipur wedding film');
  userEvent.clear(screen.getByLabelText('Project title'));
  userEvent.type(screen.getByLabelText('Project title'), 'Jaipur wedding highlights');
  userEvent.clear(screen.getByLabelText(/Google Drive link/));
  userEvent.type(screen.getByLabelText(/Google Drive link/), 'https://drive.google.com/drive/folders/wedding-project');
  userEvent.click(screen.getByLabelText(/Show this project to clients/));
  userEvent.click(screen.getByRole('button', { name: 'Save project changes' }));
  await screen.findByRole('heading', { name: 'Jaipur wedding highlights' });
  card = screen.getByRole('article', { name: 'Jaipur wedding highlights' });
  expect(within(card).getByText('Only visible to me')).toBeInTheDocument();
  expect(currentWorkspace.portfolioProjects).toHaveLength(1);
  expect(api.savePortfolioProject).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'portfolio-1', title: 'Jaipur wedding highlights', showOnProfile: false }));
  userEvent.click(within(card).getByRole('button', { name: 'Remove Jaipur wedding highlights' }));
  userEvent.click(within(card).getByRole('button', { name: 'Keep project' }));
  expect(api.removePortfolioProject).not.toHaveBeenCalled();
  userEvent.click(within(card).getByRole('button', { name: 'Remove Jaipur wedding highlights' }));
  userEvent.click(within(card).getByRole('button', { name: 'Remove project', exact: true }));
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Jaipur wedding highlights' })).not.toBeInTheDocument());
  expect(api.removePortfolioProject).toHaveBeenCalledWith('portfolio-1');
});

test('freelancers upload project images and PDFs and stage file removal until saving project changes', async () => {
  useAccount(profile(seed.users.find((user) => user.id === 'freelancer-aarav')));
  render(<App />);
  await screen.findByRole('heading', { name: /^Hello, Aarav\s*\.$/ });
  userEvent.click(screen.getByRole('button', { name: 'Add project', exact: true }));
  userEvent.type(screen.getByLabelText('Project title'), 'Homegrown brand campaign');
  userEvent.type(screen.getByLabelText('About this project'), 'A warm brand film with product close-ups and a launch campaign.');
  const photo = new File(['photo'], 'brand-shot.png', { type: 'image/png' });
  const pdf = new File(['%PDF-project'], 'project-treatment.pdf', { type: 'application/pdf' });
  userEvent.upload(screen.getByLabelText('Upload project files', { exact: true }), [photo, pdf]);
  expect(screen.getByText('brand-shot.png')).toBeInTheDocument();
  userEvent.click(screen.getByRole('button', { name: 'Add to my projects' }));
  await screen.findByRole('heading', { name: 'Homegrown brand campaign' });
  expect(api.uploadPortfolioFile).toHaveBeenCalledWith('portfolio-1', photo, 'image/png');
  expect(api.uploadPortfolioFile).toHaveBeenCalledWith('portfolio-1', pdf, 'application/pdf');
  let card = screen.getByRole('article', { name: 'Homegrown brand campaign' });
  expect(within(card).getByRole('link', { name: 'Open brand-shot.png in a new tab' })).toHaveAttribute('href', '/api/portfolio-assets/file-1');
  userEvent.click(within(card).getByRole('button', { name: 'Edit Homegrown brand campaign' }));
  userEvent.click(screen.getByRole('button', { name: 'Remove brand-shot.png', exact: true }));
  expect(api.removePortfolioFile).not.toHaveBeenCalled();
  userEvent.click(screen.getByRole('button', { name: 'Save project changes' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  card = screen.getByRole('article', { name: 'Homegrown brand campaign' });
  expect(within(card).queryByRole('link', { name: 'Open brand-shot.png in a new tab' })).not.toBeInTheDocument();
  expect(within(card).getByRole('link', { name: 'Open project-treatment.pdf in a new tab' })).toBeInTheDocument();
  expect(api.removePortfolioFile).toHaveBeenCalledWith('portfolio-1', 'file-1');
});

test('retrying a failed upload finishes the existing project instead of creating a duplicate', async () => {
  useAccount(profile(seed.users.find((user) => user.id === 'freelancer-aarav')));
  api.uploadPortfolioFile.mockRejectedValueOnce(new Error('Upload unavailable. Please try again.'));
  render(<App />);
  await screen.findByRole('heading', { name: /^Hello, Aarav\s*\.$/ });
  userEvent.click(screen.getByRole('button', { name: 'Add project', exact: true }));
  userEvent.type(screen.getByLabelText('Project title'), 'A music video project');
  userEvent.upload(screen.getByLabelText('Upload project files', { exact: true }), new File(['film'], 'music-video.mp4', { type: 'video/mp4' }));
  userEvent.click(screen.getByRole('button', { name: 'Add to my projects' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('alert')).toHaveTextContent('Upload unavailable');
  userEvent.click(screen.getByRole('button', { name: 'Add to my projects' }));
  await screen.findByRole('heading', { name: 'A music video project' });
  expect(api.savePortfolioProject).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'portfolio-1' }));
  expect(currentWorkspace.portfolioProjects).toHaveLength(1);
  expect(currentWorkspace.portfolioProjects[0].assets).toHaveLength(1);
});

test('clients can open a freelancer’s shared project portfolio from a gig without project management controls', async () => {
  useAccount(demoClient);
  currentWorkspace.gigs.find((gig) => gig.id === 'aarav').portfolioProjects = [{ id: 'shared-project', title: 'A shared brand film', category: 'cinematography', description: 'A cinematic launch for an Indian brand.', yourRole: 'Cinematographer', driveUrl: 'https://drive.google.com/drive/folders/brand-film', assets: [] }];
  render(<App />);
  await screen.findByRole('heading', { name: /discover your next great gig/i });
  userEvent.click(screen.getByRole('button', { name: /view aarav sharma.s profile and availability/i }));
  const card = within(screen.getByRole('dialog')).getByRole('article', { name: 'A shared brand film' });
  expect(within(card).getByRole('link', { name: 'Open Google Drive' })).toHaveAttribute('href', 'https://drive.google.com/drive/folders/brand-film');
  expect(within(card).queryByRole('button', { name: /Edit project/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add Google Drive link', exact: true })).not.toBeInTheDocument();
});
