const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createMarketplaceServer } = require('./index');
const { createSeed, demoPassword } = require('./test-fixtures');
const { createTestStore } = require('./test-store');
const { dateKey, parseDate, validDate, availableSlots, validateAvailability } = require('../src/utils/scheduling');
const { MAX_PROJECT_FILE_SIZE } = require('../src/utils/portfolio');

const seed = createSeed();

function futureDate(offset = 7) {
  const date = parseDate(dateKey());
  date.setUTCDate(date.getUTCDate() + offset);
  return dateKey(date);
}

async function setup(t, providedStore, countriesNow, serverOptions = {}) {
  const store = providedStore || createTestStore(seed);
  const server = createMarketplaceServer({ ...serverOptions, store, countriesNow, buildDirectory: `${__dirname.replace(/\\/g, '/')}/../public` });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  async function request(route, { method = 'GET', body, cookie } = {}) {
    const response = await fetch(`${base}/api${route}`, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0], setCookie: response.headers.get('set-cookie') };
  }
  async function login(role, email) {
    const result = await request('/auth/login', { method: 'POST', body: { role, email, password: demoPassword } });
    assert.equal(result.status, 200);
    return result;
  }
  async function register(role, email) {
    const result = await request('/auth/register', { method: 'POST', body: { role, email, password: 'MyIndiaPass123!', name: role === 'client' ? 'Aditi Verma' : 'Dev Verma', location: 'Bangalore', phone: '9876543210', specialty: 'camera' } });
    assert.equal(result.status, 200);
    return result;
  }
  return { base, request, login, register, db: store.data };
}

test('public contact form validates, suppresses honeypot submissions, and forwards messages to the mailer', async (t) => {
  const delivered = [];
  const { request } = await setup(t, undefined, undefined, { sendContactEmail: async (message) => delivered.push(message) });
  const body = { name: 'Aditi Verma', email: 'Aditi@example.in', type: 'Complaint', subject: 'Trouble updating my profile', message: 'I cannot update the city on my profile after saving.' };
  const sent = await request('/contact', { method: 'POST', body });
  assert.equal(sent.status, 200);
  assert.deepEqual(delivered, [{ ...body, email: 'aditi@example.in' }]);

  const invalid = await request('/contact', { method: 'POST', body: { ...body, type: 'Unwanted message' } });
  assert.equal(invalid.status, 400);
  const spam = await request('/contact', { method: 'POST', body: { website: 'https://spam.example' } });
  assert.equal(spam.status, 200);
  assert.equal(delivered.length, 1);
});

test('public contact form limits repeated submissions', async (t) => {
  let delivered = 0;
  const { request } = await setup(t, undefined, undefined, { sendContactEmail: async () => { delivered += 1; } });
  const body = { name: 'Aditi Verma', email: 'aditi@example.in', type: 'General query', subject: 'A question', message: 'I have a question about using the marketplace.' };
  const results = await Promise.all(Array.from({ length: 6 }, () => request('/contact', { method: 'POST', body })));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 200, 200, 200, 200, 429]);
  assert.equal(delivered, 5);
});

test('client and freelancer authentication is separate, passwords are hashed, and logout invalidates the session', async (t) => {
  const { request, register, db } = await setup(t);
  assert.equal((await request('/workspace')).status, 401);
  assert.equal((await request('/gigs/aarav')).status, 401);
  const client = await register('client', 'same-person@example.in');
  assert.equal(client.data.user.role, 'client');
  assert.equal(client.data.user.location, 'Bengaluru, Karnataka');
  assert.equal(client.data.user.passwordHash, undefined);
  assert.match(client.setCookie, /HttpOnly/);
  assert.match(client.setCookie, /SameSite=Lax/);
  const stored = db.users.find((user) => user.id === client.data.user.id);
  assert.notEqual(stored.passwordHash, 'MyIndiaPass123!');
  assert.equal((await request('/auth/login', { method: 'POST', body: { role: 'freelancer', email: 'same-person@example.in', password: 'MyIndiaPass123!' } })).status, 401);

  const freelancer = await register('freelancer', 'same-person@example.in');
  assert.notEqual(freelancer.data.user.id, client.data.user.id);
  assert.equal(freelancer.data.workspace.gigs.length, 0);
  assert.equal((await request('/auth/register', { method: 'POST', body: { role: 'client', email: 'outside@example.in', password: 'MyIndiaPass123!', name: 'Aditi Verma', location: 'New York', phone: '9876543210' } })).status, 400);
  await request('/auth/logout', { method: 'POST', body: {}, cookie: client.cookie });
  assert.equal((await request('/workspace', { cookie: client.cookie })).status, 401);
  assert.equal((await request('/workspace', { cookie: freelancer.cookie })).status, 200);
});

test('CountriesNow country and city suggestions are exposed and server-validated for registration', async (t) => {
  const countriesNow = {
    async getCountries() { return [{ name: 'Canada', code: 'CA' }, { name: 'India', code: 'IN' }]; },
    async getCities(country) { return country === 'Canada' ? ['Toronto', 'Vancouver'] : ['Bangalore']; },
  };
  const { request } = await setup(t, createTestStore(seed), countriesNow);
  const countries = await request('/locations/countries');
  assert.equal(countries.status, 200);
  assert.deepEqual(countries.data.countries.map((item) => item.name), ['Canada', 'India']);
  const cities = await request('/locations/cities?country=Canada');
  assert.deepEqual(cities.data, { country: 'Canada', cities: ['Toronto', 'Vancouver'] });

  const registered = await request('/auth/register', { method: 'POST', body: {
    role: 'client', name: 'Aditi Verma', email: 'aditi-canada@example.in', password: 'MyIndiaPass123!',
    location: 'Toronto, Canada', phone: '9876543210',
  } });
  assert.equal(registered.status, 200);
  assert.equal(registered.data.user.location, 'Toronto, Canada');
});

test('clients see all live gigs, while two freelancers cannot read or edit each other’s gigs', async (t) => {
  const { request, login } = await setup(t);
  const client = await login('client', 'client@frame.in');
  const aarav = await login('freelancer', 'aarav@frame.in');
  const priya = await login('freelancer', 'priya@frame.in');
  assert.equal(client.data.workspace.gigs.length, 8);
  assert.ok(client.data.workspace.gigs.every((gig) => gig.rate >= 8000 && !gig.passwordHash && !gig.email));
  assert.deepEqual(aarav.data.workspace.gigs.map((gig) => gig.id), ['aarav']);
  assert.deepEqual(priya.data.workspace.gigs.map((gig) => gig.id), ['priya']);
  assert.equal((await request('/gigs/priya', { cookie: aarav.cookie })).status, 404);
  assert.equal((await request('/gigs/aarav', { cookie: priya.cookie })).status, 404);
  assert.equal((await request('/gigs/priya', { method: 'PATCH', body: { rate: 1 }, cookie: aarav.cookie })).status, 404);
  assert.equal((await request('/projects', { method: 'POST', body: {}, cookie: aarav.cookie })).status, 403);
  assert.equal((await request('/bookings', { method: 'POST', body: {}, cookie: priya.cookie })).status, 403);
  assert.equal((await request('/gigs', { method: 'POST', body: {}, cookie: client.cookie })).status, 403);

  const paused = await request('/gigs/aarav', { method: 'PATCH', body: { status: 'paused', ownerId: 'freelancer-priya' }, cookie: aarav.cookie });
  assert.equal(paused.data.gig.ownerId, 'freelancer-aarav');
  assert.equal(paused.data.workspace.gigs[0].status, 'paused');
  assert.equal((await request('/workspace', { cookie: client.cookie })).data.gigs.length, 7);
  assert.equal((await request('/gigs/aarav', { cookie: client.cookie })).status, 200);
  const clientWorkspace = (await request('/workspace', { cookie: client.cookie })).data;
  assert.deepEqual(clientWorkspace.relatedGigs.map((gig) => gig.id), ['aarav']);
  assert.ok(clientWorkspace.messages.some((message) => message.creatorId === 'aarav'));
});

test('arbitrary client and freelancer hours intersect, rates are prorated, and conflicts apply across an owner’s gigs', async (t) => {
  const { request, login } = await setup(t);
  const client = await login('client', 'client@frame.in');
  const aarav = await login('freelancer', 'aarav@frame.in');
  const priya = await login('freelancer', 'priya@frame.in');
  const date = futureDate();
  const ownerTimes = [{ date, start: '09:35', end: '12:20' }, { date, start: '18:30', end: '22:10' }];
  assert.equal((await request('/availability', { method: 'PUT', body: { availability: ownerTimes }, cookie: aarav.cookie })).status, 200);
  assert.equal((await request('/availability', { method: 'PUT', body: { availability: [{ date, start: '10:10', end: '11:55' }, { date, start: '19:10', end: '21:30' }] }, cookie: client.cookie })).status, 200);
  assert.equal((await request('/availability', { method: 'PUT', body: { availability: [{ date, start: '18:00', end: '17:00' }] }, cookie: aarav.cookie })).status, 400);
  const secondGig = await request('/gigs', { method: 'POST', cookie: aarav.cookie, body: { ownerId: 'freelancer-priya', name: 'Someone Else', category: 'camera', location: 'Mumbai', rate: 16000, title: 'Camera operation for your next brand film', bio: 'Experienced camera specialist for brand films and wedding productions.', equipment: ['Sony FX3'], skills: ['Hindi'] } });
  assert.equal(secondGig.status, 201);
  assert.equal(secondGig.data.gig.ownerId, 'freelancer-aarav');
  assert.equal(secondGig.data.gig.name, 'Aarav Sharma');

  const booked = await request('/bookings', { method: 'POST', cookie: client.cookie, body: { creatorId: 'aarav', date, start: '10:25', end: '11:40', total: 1, dayRate: 1 } });
  assert.equal(booked.status, 201);
  assert.equal(booked.data.booking.total, 2813);
  assert.equal(booked.data.booking.dayRate, 18000);
  assert.equal(booked.data.booking.status, 'requested');
  assert.equal((await request('/bookings', { method: 'POST', cookie: client.cookie, body: { creatorId: secondGig.data.gig.id, date, start: '10:30', end: '11:00' } })).status, 409);
  assert.equal((await request('/bookings', { method: 'POST', cookie: client.cookie, body: { creatorId: 'aarav', date, start: '09:35', end: '10:00' } })).status, 409);
  assert.equal((await request('/bookings', { method: 'POST', cookie: client.cookie, body: { creatorId: 'aarav', date, start: '11:40', end: '11:55' } })).status, 201);
  assert.equal((await request(`/bookings/${booked.data.booking.id}`, { method: 'PATCH', cookie: priya.cookie, body: { status: 'confirmed' } })).status, 404);
  assert.equal((await request(`/bookings/${booked.data.booking.id}`, { method: 'PATCH', cookie: client.cookie, body: { status: 'confirmed' } })).status, 400);
  assert.equal((await request(`/bookings/${booked.data.booking.id}`, { method: 'PATCH', cookie: aarav.cookie, body: { status: 'confirmed' } })).status, 200);
  assert.equal((await request(`/bookings/${booked.data.booking.id}`, { method: 'PATCH', cookie: client.cookie, body: { status: 'cancelled' } })).status, 200);
  assert.equal((await request('/bookings', { method: 'POST', cookie: client.cookie, body: { creatorId: secondGig.data.gig.id, date, start: '10:25', end: '11:40' } })).status, 201);

  const concurrent = await Promise.all([1, 2].map(() => request('/bookings', { method: 'POST', cookie: client.cookie, body: { creatorId: 'aarav', date, start: '19:30', end: '20:30' } })));
  assert.deepEqual(concurrent.map((result) => result.status).sort(), [201, 409]);
});

test('bookings, briefs, shortlists, conversations, and negotiated rates are scoped to their participants', async (t) => {
  const { request, login, register } = await setup(t);
  const client = await login('client', 'client@frame.in');
  const otherClient = await register('client', 'another-client@example.in');
  const aarav = await login('freelancer', 'aarav@frame.in');
  const priya = await login('freelancer', 'priya@frame.in');
  const date = futureDate();
  const project = await request('/projects', { method: 'POST', cookie: client.cookie, body: { title: 'A cinematic Indian brand launch', category: 'cinematography', budget: 25000, location: 'Mumbai', description: 'Product close-ups and a warm launch film for our Indian homegrown brand.', preferredTimes: [{ date, start: '09:00', end: '17:00' }] } });
  assert.equal(project.status, 201);
  const offer = await request('/messages', { method: 'POST', cookie: client.cookie, body: { creatorId: 'aarav', clientId: otherClient.data.user.id, offer: 15000, text: 'Would this work for our launch film?' } });
  assert.equal(offer.data.message.clientId, client.data.user.id);
  assert.equal((await request(`/messages/${offer.data.message.id}/accept`, { method: 'POST', cookie: client.cookie, body: {} })).status, 400);
  assert.equal((await request(`/messages/${offer.data.message.id}/accept`, { method: 'POST', cookie: otherClient.cookie, body: {} })).status, 404);
  assert.equal((await request(`/messages/${offer.data.message.id}/accept`, { method: 'POST', cookie: priya.cookie, body: {} })).status, 404);
  assert.equal((await request(`/messages/${offer.data.message.id}/accept`, { method: 'POST', cookie: aarav.cookie, body: {} })).status, 200);
  assert.equal((await request('/messages', { method: 'POST', cookie: priya.cookie, body: { creatorId: 'aarav', clientId: client.data.user.id, text: 'Trying to access another gig.' } })).status, 404);

  const booking = await request('/bookings', { method: 'POST', cookie: client.cookie, body: { creatorId: 'aarav', date, start: '09:00', end: '10:00', projectId: project.data.project.id } });
  assert.equal(booking.data.booking.total, 1875);
  await request('/shortlist/aarav', { method: 'POST', cookie: client.cookie, body: {} });
  const ownerWorkspace = (await request('/workspace', { cookie: aarav.cookie })).data;
  assert.equal(ownerWorkspace.projects.length, 1);
  assert.equal(ownerWorkspace.projects[0].id, project.data.project.id);
  assert.equal(ownerWorkspace.bookings.length, 1);
  assert.deepEqual(ownerWorkspace.contacts.map((person) => person.id), ['client-demo']);
  assert.ok(ownerWorkspace.contacts.every((person) => !person.email && !person.phone && !person.passwordHash));
  const otherWorkspace = (await request('/workspace', { cookie: otherClient.cookie })).data;
  assert.deepEqual(otherWorkspace.bookings, []);
  assert.deepEqual(otherWorkspace.projects, []);
  assert.deepEqual(otherWorkspace.messages, []);
  assert.deepEqual(otherWorkspace.saved, []);
  assert.deepEqual(otherWorkspace.agreedRates, {});
  assert.ok(otherWorkspace.gigs.find((gig) => gig.id === 'aarav').busyTimes.every((slot) => Object.keys(slot).sort().join(',') === 'date,end,start'));
  assert.equal((await request(`/projects/${project.data.project.id}`, { method: 'PATCH', cookie: otherClient.cookie, body: { status: 'closed' } })).status, 404);
  const otherBooking = await request('/bookings', { method: 'POST', cookie: otherClient.cookie, body: { creatorId: 'aarav', date, start: '10:00', end: '11:00' } });
  assert.equal(otherBooking.data.booking.total, 2250);
  const unrelated = (await request('/workspace', { cookie: priya.cookie })).data;
  assert.deepEqual(unrelated.bookings, []);
  assert.deepEqual(unrelated.projects, []);
  assert.deepEqual(unrelated.messages, []);
});

test('IST dates, weekly repeats, dated overrides, and adjacent custom windows work consistently', () => {
  assert.equal(dateKey(new Date('2026-10-09T20:00:00Z')), '2026-10-10');
  assert.equal(validDate('2026-02-30'), false);
  const date = futureDate();
  const weekday = parseDate(date).getUTCDay();
  const creator = { id: 'test', availability: [{ weekday, start: '08:00', end: '17:00' }, { date, start: '18:15', end: '20:00' }, { date, start: '20:00', end: '22:45' }] };
  const preferred = [{ date, start: '19:05', end: '21:20' }];
  assert.deepEqual(availableSlots(creator, date, [], preferred).map(({ start, end }) => ({ start, end })), [{ start: '19:05', end: '21:20' }]);
  assert.deepEqual(availableSlots(creator, date, [{ creatorId: 'test', date, start: '19:30', end: '20:10', status: 'confirmed' }], preferred).map(({ start, end }) => ({ start, end })), [{ start: '19:05', end: '19:30' }, { start: '20:10', end: '21:20' }]);
  assert.equal(availableSlots(creator, date, [{ creatorId: 'test', date, start: '18:15', end: '22:45', status: 'declined' }]).length, 1);
  assert.match(validateAvailability([{ date, start: '10:00', end: '12:00' }, { date, start: '11:30', end: '13:00' }]), /overlap/);
  assert.equal(validateAvailability([{ weekday, start: '05:35', end: '08:10' }, { weekday, start: '18:30', end: '23:45' }]), '');
});

test('website serving normalizes Windows paths, supports direct login links, and does not expose server files', async (t) => {
  const { base } = await setup(t);
  for (const route of ['/', '/client/login', '/freelancer/register']) {
    const response = await fetch(`${base}${route}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(await response.text(), /frame\. India/);
  }
  assert.equal((await fetch(`${base}/favicon.svg`)).status, 200);
  assert.equal((await fetch(`${base}/server/data/marketplace.json`)).status, 404);
  assert.equal((await fetch(`${base}/%2e%2e%2fserver%2fseed.js`)).status, 404);
});

test('freelancer portfolio projects support Drive links, editing, visibility, and strict ownership checks', async (t) => {
  const { request, login, db } = await setup(t);
  const aarav = await login('freelancer', 'aarav@frame.in');
  const priya = await login('freelancer', 'priya@frame.in');
  const client = await login('client', 'client@frame.in');
  const briefCount = db.projects.length;
  assert.equal((await request('/portfolio-projects', { method: 'POST', body: { title: 'A client should not create a freelancer portfolio' }, cookie: client.cookie })).status, 403);
  assert.equal((await request('/portfolio-projects')).status, 401);
  const created = await request('/portfolio-projects', { method: 'POST', cookie: aarav.cookie, body: {
    title: 'A cinematic Jaipur wedding film', category: 'cinematography', description: 'A wedding story filmed in Jaipur with a warm, candid approach.',
    yourRole: 'Cinematographer', projectDate: '2024-11-15', driveUrl: 'https://drive.google.com/file/d/jaipur-film/view?usp=sharing', showOnProfile: true,
    // eslint-disable-next-line no-script-url
    ownerId: 'freelancer-priya', assets: [{ id: 'forged', url: 'javascript:alert(1)' }],
  } });
  assert.equal(created.status, 201);
  const projectId = created.data.portfolioProject.id;
  assert.equal(created.data.portfolioProject.ownerId, 'freelancer-aarav');
  assert.deepEqual(created.data.portfolioProject.assets, []);
  assert.equal(created.data.workspace.portfolioProjects.length, 1);
  assert.equal((await request('/portfolio-projects', { cookie: priya.cookie })).data.portfolioProjects.length, 0);
  assert.equal((await request(`/portfolio-projects/${projectId}`, { cookie: priya.cookie })).status, 404);
  assert.equal((await request(`/portfolio-projects/${projectId}`, { method: 'PATCH', body: { title: 'Trying to edit another portfolio' }, cookie: priya.cookie })).status, 404);
  assert.equal((await request(`/portfolio-projects/${projectId}`, { method: 'DELETE', cookie: priya.cookie })).status, 404);
  assert.equal((await request(`/portfolio-projects/${projectId}`, { method: 'PATCH', body: { title: 'Client edit attempt' }, cookie: client.cookie })).status, 403);
  assert.equal((await request('/workspace', { cookie: priya.cookie })).data.gigs.some((gig) => gig.portfolioProjects.some((project) => project.id === projectId)), false);
  let clientWorkspace = (await request('/workspace', { cookie: client.cookie })).data;
  assert.deepEqual(clientWorkspace.portfolioProjects, []);
  assert.deepEqual(clientWorkspace.gigs.find((gig) => gig.id === 'aarav').portfolioProjects.map((project) => project.id), [projectId]);

  const edited = await request(`/portfolio-projects/${projectId}`, { method: 'PATCH', cookie: aarav.cookie, body: { title: 'Jaipur wedding film and highlights', driveUrl: 'https://drive.google.com/drive/u/0/folders/jaipur-project', ownerId: 'freelancer-priya', showOnProfile: false } });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.portfolioProject.ownerId, 'freelancer-aarav');
  assert.equal(edited.data.portfolioProject.title, 'Jaipur wedding film and highlights');
  assert.match(edited.data.portfolioProject.driveUrl, /folders\/jaipur-project/);
  clientWorkspace = (await request('/workspace', { cookie: client.cookie })).data;
  assert.deepEqual(clientWorkspace.gigs.find((gig) => gig.id === 'aarav').portfolioProjects, []);
  assert.equal((await request(`/portfolio-projects/${projectId}`, { cookie: aarav.cookie })).status, 200);
  assert.equal((await request(`/portfolio-projects/${projectId}`, { method: 'DELETE', cookie: aarav.cookie })).status, 200);
  assert.equal((await request(`/portfolio-projects/${projectId}`, { cookie: aarav.cookie })).status, 404);
  assert.equal(db.projects.length, briefCount);
});

test('Google Drive validation accepts shared file, folder, and document links and rejects unrelated or unsafe URLs', async (t) => {
  const { request, login } = await setup(t);
  const owner = await login('freelancer', 'aarav@frame.in');
  for (const driveUrl of [
    'https://drive.google.com/file/d/showreel/view?usp=sharing',
    'https://drive.google.com/drive/folders/project-folder',
    'https://drive.google.com/open?id=project-file',
    'https://docs.google.com/document/d/project-treatment/edit',
    'https://docs.google.com/presentation/d/project-deck/edit',
  ]) {
    assert.equal((await request('/portfolio-projects', { method: 'POST', cookie: owner.cookie, body: { title: 'Creative project reference', driveUrl } })).status, 201);
  }
  for (const driveUrl of [
    // eslint-disable-next-line no-script-url
    'javascript:alert(1)', 'http://drive.google.com/file/d/project/view', 'https://drive.google.com.evil.example/file/d/project/view',
    'https://drive.google.com@evil.example/file/d/project/view', 'https://example.in/my-work', 'https://drive.google.com/',
  ]) {
    assert.equal((await request('/portfolio-projects', { method: 'POST', cookie: owner.cookie, body: { title: 'Invalid project reference', driveUrl } })).status, 400);
  }
  assert.equal((await request('/portfolio-projects', { method: 'POST', cookie: owner.cookie, body: { title: 'A project with details only', description: 'Shot and edited a short brand film for a homegrown Indian business.' } })).status, 201);
});

test('uploaded project files are accessible only to the owner and permitted clients, with range support and file limits', async (t) => {
  const { base, request, login } = await setup(t);
  const owner = await login('freelancer', 'aarav@frame.in');
  const otherOwner = await login('freelancer', 'priya@frame.in');
  const client = await login('client', 'client@frame.in');
  const created = await request('/portfolio-projects', { method: 'POST', cookie: owner.cookie, body: { title: 'Uploaded brand campaign', showOnProfile: true } });
  const projectId = created.data.portfolioProject.id;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl9xqUAAAAASUVORK5CYII=', 'base64');
  async function upload(bytes, type, name, cookie = owner.cookie) {
    const response = await fetch(`${base}/api/portfolio-projects/${projectId}/assets`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': type, 'X-File-Name': encodeURIComponent(name) }, body: bytes });
    return { status: response.status, data: await response.json() };
  }
  assert.equal((await upload(png, 'image/png', 'brand-shot.png', otherOwner.cookie)).status, 404);
  assert.equal((await upload(png, 'image/png', 'brand-shot.png', client.cookie)).status, 403);
  assert.equal((await upload(Buffer.from('<html>not a project file</html>'), 'text/html', 'work.html')).status, 415);
  assert.equal((await upload(Buffer.alloc(0), 'application/pdf', 'empty.pdf')).status, 400);
  const uploaded = await upload(png, 'image/png', 'Jaipur — colour.png');
  assert.equal(uploaded.status, 201);
  const asset = uploaded.data.portfolioProject.assets[0];
  assert.equal(asset.name, 'Jaipur — colour.png');
  assert.equal(asset.size, png.length);
  let response = await fetch(`${base}${asset.url}`, { headers: { Cookie: owner.cookie } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  assert.equal((await fetch(`${base}${asset.url}`, { headers: { Cookie: otherOwner.cookie } })).status, 404);
  assert.equal((await fetch(`${base}${asset.url}`)).status, 401);
  assert.equal((await fetch(`${base}${asset.url}`, { headers: { Cookie: client.cookie } })).status, 200);
  const video = await upload(Buffer.from('0123456789abcdef'), 'video/mp4', 'brand-film.mp4');
  const videoAsset = video.data.portfolioProject.assets.find((item) => item.name === 'brand-film.mp4');
  response = await fetch(`${base}${videoAsset.url}`, { headers: { Cookie: owner.cookie, Range: 'bytes=4-8' } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 4-8/16');
  assert.equal(await response.text(), '45678');
  assert.equal((await fetch(`${base}${videoAsset.url}`, { headers: { Cookie: owner.cookie, Range: 'bytes=40-80' } })).status, 416);
  await request(`/portfolio-projects/${projectId}`, { method: 'PATCH', cookie: owner.cookie, body: { showOnProfile: false } });
  assert.equal((await fetch(`${base}${asset.url}`, { headers: { Cookie: client.cookie } })).status, 404);
  assert.equal((await fetch(`${base}${asset.url}`, { method: 'HEAD', headers: { Cookie: owner.cookie } })).status, 200);
  const tooLarge = await new Promise((resolve, reject) => {
    const uploadRequest = http.request(`${base}/api/portfolio-projects/${projectId}/assets`, { method: 'POST', headers: { Cookie: owner.cookie, 'Content-Type': 'video/mp4', 'X-File-Name': 'large-film.mp4', 'Content-Length': MAX_PROJECT_FILE_SIZE + 1 } }, (uploadResponse) => { uploadResponse.resume(); uploadResponse.on('end', () => resolve(uploadResponse.statusCode)); });
    uploadRequest.on('error', reject); uploadRequest.end();
  });
  assert.equal(tooLarge, 413);
  for (let index = 0; index < 6; index += 1) assert.equal((await upload(Buffer.from('%PDF-project'), 'application/pdf', `brief-${index}.pdf`)).status, 201);
  assert.equal((await upload(png, 'image/png', 'ninth-file.png')).status, 400);
  assert.equal((await request(`/portfolio-projects/${projectId}/assets/${asset.id}`, { method: 'DELETE', cookie: otherOwner.cookie })).status, 404);
  assert.equal((await request(`/portfolio-projects/${projectId}/assets/${asset.id}`, { method: 'DELETE', cookie: owner.cookie })).status, 200);
  assert.equal((await fetch(`${base}${asset.url}`, { headers: { Cookie: owner.cookie } })).status, 404);
  await request(`/portfolio-projects/${projectId}`, { method: 'DELETE', cookie: owner.cookie });
  assert.equal((await fetch(`${base}${videoAsset.url}`, { headers: { Cookie: owner.cookie } })).status, 404);
});

test('sessions and marketplace records are shared between server instances', async (t) => {
  const store = createTestStore(seed);
  const first = await setup(t, store);
  const owner = await first.login('freelancer', 'aarav@frame.in');
  const created = await first.request('/portfolio-projects', { method: 'POST', cookie: owner.cookie, body: { title: 'A saved Indian brand launch', driveUrl: 'https://drive.google.com/drive/folders/brand-launch', showOnProfile: false } });
  assert.equal(created.status, 201);

  const second = await setup(t, store);
  const sharedSession = await second.request('/workspace', { cookie: owner.cookie });
  assert.equal(sharedSession.status, 200);
  assert.equal(sharedSession.data.portfolioProjects[0].title, 'A saved Indian brand launch');

  const upload = await fetch(`${second.base}/api/portfolio-projects/${created.data.portfolioProject.id}/assets`, { method: 'POST', headers: { Cookie: owner.cookie, 'Content-Type': 'application/pdf', 'X-File-Name': 'project-treatment.pdf' }, body: Buffer.from('%PDF-1.7\nProject treatment') });
  assert.equal(upload.status, 201);
  const saved = (await upload.json()).portfolioProject;
  const response = await fetch(`${first.base}${saved.assets[0].url}`, { headers: { Cookie: owner.cookie } });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '%PDF-1.7\nProject treatment');
});
