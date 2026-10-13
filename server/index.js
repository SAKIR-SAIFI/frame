const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const dotenv = require('dotenv');
const { createMongoStore } = require('./mongo-store');
const { createSessionStore } = require('./session-store');
const { createMongoAssetStore } = require('./mongo-assets');
const { createCountriesNowService } = require('./countriesnow');
const locations = require('../src/data/locations.json');
const specialties = require('../src/data/specialties.json');
const { dateKey, validDate, minutes, activeBooking, bookingFits, validateAvailability, DAY_MINUTES } = require('../src/utils/scheduling');
const { MAX_PROJECT_FILES, MAX_PROJECT_FILE_SIZE, acceptedProjectFileTypes, googleDriveLinkError } = require('../src/utils/portfolio');

dotenv.config({ path: path.resolve(__dirname, '../atlas-credentials.env'), quiet: true });

const scrypt = promisify(crypto.scrypt);
const SESSION_AGE = 7 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'frame_session';
const ACTIVE_BOOKING_STATUSES = ['requested', 'confirmed'];
const covers = {
  cinematography: 'photo-1492691527719-9d1e07e534b4', camera: 'photo-1452587925148-ce544e77e70d',
  drone: 'photo-1506947411487-a56738267384', gimbal: 'photo-1589872307379-0ffdf9829123',
  photography: 'photo-1500530855697-b586d89ba3ee', editing: 'photo-1574717024653-61fd2cf4d44d',
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const fail = (status, message) => { throw new HttpError(status, message); };
const id = (prefix) => `${prefix}-${crypto.randomUUID()}`;
const withoutMongoId = (document) => {
  if (!document) return document;
  const { _id, ...value } = document;
  return value;
};

function text(value, label, min, max) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) fail(400, `${label} must be between ${min} and ${max} characters.`);
  return value.trim();
}

function amount(value, label) {
  if (!Number.isInteger(value) || value < 1 || value > 1000000) fail(400, `${label} must be a whole rupee amount between ₹1 and ₹10,00,000.`);
  return value;
}

async function location(value, allowRemote = false, countriesNow) {
  const query = text(value, 'Location', 2, 100).toLowerCase();
  if (allowRemote && ['remote', 'remote across india'].includes(query)) return 'Remote across India';
  const matchesIndianLocation = (name) => locations.find((item) => [
    item.city, `${item.city}, ${item.state}`,
    ...item.aliases,
    ...item.aliases.map((alias) => `${alias}, ${item.state}`),
  ].some((candidate) => candidate.toLowerCase() === name));
  const localMatch = matchesIndianLocation(query);
  if (localMatch) return `${localMatch.city}, ${localMatch.state}`;
  if (!query.includes(',')) fail(400, 'Select a city and country from the location suggestions.');

  const countries = await countriesNow.getCountries();
  const country = countries
    .filter((item) => query.endsWith(`, ${item.name.toLowerCase()}`))
    .sort((first, second) => second.name.length - first.name.length)[0];
  if (!country) fail(400, 'Select a valid city and country from the location suggestions.');
  const cityName = query.slice(0, -(country.name.length + 2)).trim();
  if (country.name === 'India') {
    const indiaMatch = matchesIndianLocation(cityName);
    if (indiaMatch) return `${indiaMatch.city}, ${indiaMatch.state}`;
  }
  let cities;
  try { cities = await countriesNow.getCities(country.name); }
  catch { fail(503, 'City suggestions are temporarily unavailable. Please try again.'); }
  const city = cities.find((candidate) => candidate.toLowerCase() === cityName);
  if (!city) fail(400, 'Select a valid city from the chosen country.');
  return country.name === 'India' ? `${city}, India` : `${city}, ${country.name}`;
}

function category(value) {
  const match = specialties.find((item) => item.id === value);
  if (!match) fail(400, 'Choose a valid creative specialty.');
  return match;
}

function availability(value, allowWeekly = true) {
  const error = validateAvailability(value);
  if (error) fail(400, error);
  if (!allowWeekly && value.some((slot) => !slot.date)) fail(400, 'Project call times need specific dates.');
  return value.map((slot) => ({ id: id('time'), ...(slot.date ? { date: slot.date } : { weekday: slot.weekday }), start: slot.start, end: slot.end }));
}

function publicUser(user) {
  const { _id, passwordHash, ...profile } = user;
  return profile;
}

function contact(user) {
  return { id: user.id, name: user.name, location: user.location, role: user.role, avatar: '' };
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`;
}

async function verifyPassword(password, hash) {
  const [salt, expected] = hash.split(':');
  const actual = await scrypt(password, salt, 64);
  const stored = Buffer.from(expected, 'hex');
  return stored.length === actual.length && crypto.timingSafeEqual(stored, actual);
}

async function bodyOf(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) fail(415, 'Please send JSON data.');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65536) fail(413, 'That request is too large.');
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Invalid request data.');
    return body;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    fail(400, 'Invalid JSON data.');
  }
}

function send(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  response.end(JSON.stringify(data));
}

function isDuplicateKey(error) {
  return error?.code === 11000 || error?.codeName === 'DuplicateKey';
}

function isDatabaseUnavailable(error) {
  return /^Mongo(ServerSelection|Network|WaitQueue|Topology)/.test(error?.name || '')
    || error?.name === 'MongoTimeoutError';
}

function createMarketplaceServer({ store, buildDirectory = path.resolve(__dirname, '../build'), countriesNow = createCountriesNowService() } = {}) {
  if (!store?.db) throw new Error('A MongoDB database store is required.');
  const db = store.db;
  const users = db.collection('users');
  const gigs = db.collection('gigs');
  const bookings = db.collection('bookings');
  const bookingSlots = db.collection('bookingSlots');
  const portfolioProjects = db.collection('portfolioProjects');
  const projects = db.collection('projects');
  const messages = db.collection('messages');
  const agreedRates = db.collection('agreedRates');
  const shortlists = db.collection('shortlists');
  const sessions = store.sessions || createSessionStore(db.collection('sessions'));
  const portfolioAssets = store.assets || createMongoAssetStore(db);
  const buildRoot = path.resolve(buildDirectory);

  function sessionToken(request) {
    return (request.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  }

  async function sessionUser(request) {
    const token = sessionToken(request);
    const session = token && await sessions.get(token);
    if (!session) return null;
    return users.findOne({ id: session.userId });
  }

  async function authenticate(request, role) {
    const user = await sessionUser(request);
    if (!user) fail(401, 'Please sign in to continue.');
    if (role && user.role !== role) fail(403, `This action is available to ${role} accounts only.`);
    return user;
  }

  function cookie(request, token, maxAge = SESSION_AGE / 1000) {
    const secure = request.socket.encrypted || process.env.COOKIE_SECURE === 'true'
      || (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false');
    return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  }

  async function startSession(request, response, user) {
    const previous = sessionToken(request);
    if (previous) await sessions.delete(previous);
    const token = crypto.randomBytes(32).toString('hex');
    await sessions.create(token, user.id, Date.now() + SESSION_AGE);
    response.setHeader('Set-Cookie', cookie(request, token));
  }

  async function connectedToGig(gig, user) {
    if (user.role !== 'client') return false;
    const [message, booking] = await Promise.all([
      messages.findOne({ creatorId: gig.id, clientId: user.id }),
      bookings.findOne({ creatorId: gig.id, clientId: user.id }),
    ]);
    return Boolean(message || booking);
  }

  function visibleGig(gig, user) {
    return user.role === 'client' ? gig.status === 'published' : gig.ownerId === user.id;
  }

  function portfolioProjectDetails(project) {
    const { assetCount, ...details } = withoutMongoId(project);
    return { ...details, assets: (project.assets || []).map((asset) => ({ ...asset, url: `/api/portfolio-assets/${asset.id}` })) };
  }

  async function gigDetails(gig, context = {}, excludedBookingId) {
    const owner = context.owners?.get(gig.ownerId) || await users.findOne({ id: gig.ownerId });
    const portfolio = context.portfolios?.get(gig.ownerId)
      || await portfolioProjects.find({ ownerId: gig.ownerId, showOnProfile: true }).toArray();
    const busy = context.busy?.get(gig.ownerId)
      || await bookings.find({ freelancerId: gig.ownerId, status: { $in: ACTIVE_BOOKING_STATUSES } }).toArray();
    return {
      ...withoutMongoId(gig),
      name: owner?.name || gig.name,
      role: category(gig.category).role,
      availability: owner?.availability || [],
      portfolioProjects: portfolio.map(portfolioProjectDetails),
      busyTimes: busy.filter((booking) => booking.id !== excludedBookingId).map(({ date, start, end }) => ({ date, start, end })),
    };
  }

  async function ownsThread(user, message) {
    if (user.role === 'client') return message.clientId === user.id;
    return Boolean(await gigs.findOne({ id: message.creatorId, ownerId: user.id }));
  }

  function portfolioProjectValues(body, user, existing = {}) {
    const values = { description: '', yourRole: '', projectDate: '', driveUrl: '', showOnProfile: true, ...existing, ...body };
    const driveUrl = text(values.driveUrl, 'Google Drive link', 0, 2048);
    const error = googleDriveLinkError(driveUrl);
    if (error) fail(400, error);
    if (values.projectDate && (!validDate(values.projectDate) || values.projectDate > dateKey())) fail(400, 'Choose a valid project date up to today.');
    if (typeof values.showOnProfile !== 'boolean') fail(400, 'Choose whether this project is visible to clients.');
    return {
      title: text(values.title, 'Project title', 3, 100), category: category(values.category || user.specialty || 'cinematography').id,
      description: text(values.description, 'Project description', 0, 2000), yourRole: text(values.yourRole, 'Your role', 0, 80),
      projectDate: values.projectDate || '', driveUrl: driveUrl ? new URL(driveUrl).href : '', showOnProfile: values.showOnProfile,
    };
  }

  async function ownerHasConnection(ownerId, user) {
    const ownerGigs = await gigs.find({ ownerId }).toArray();
    const ownerGigIds = ownerGigs.map((gig) => gig.id);
    if (!ownerGigIds.length) return false;
    const [message, booking] = await Promise.all([
      messages.findOne({ clientId: user.id, creatorId: { $in: ownerGigIds } }),
      bookings.findOne({ clientId: user.id, creatorId: { $in: ownerGigIds } }),
    ]);
    return Boolean(message || booking);
  }

  async function workspace(user) {
    const [userBookings, userMessages, baseGigs] = await Promise.all([
      bookings.find(user.role === 'client' ? { clientId: user.id } : { freelancerId: user.id }).toArray(),
      user.role === 'client'
        ? messages.find({ clientId: user.id }).toArray()
        : Promise.resolve(null),
      gigs.find(user.role === 'client' ? { status: 'published' } : { ownerId: user.id }).toArray(),
    ]);
    const ownedGigIds = baseGigs.map((gig) => gig.id);
    const scopedMessages = userMessages || (ownedGigIds.length
      ? await messages.find({ creatorId: { $in: ownedGigIds } }).toArray()
      : []);
    scopedMessages.sort((first, second) => first.timestamp - second.timestamp);
    const connectedGigIds = [...new Set([
      ...userBookings.map((booking) => booking.creatorId),
      ...scopedMessages.map((message) => message.creatorId),
    ])];
    const relatedGigs = user.role === 'client' && connectedGigIds.length
      ? await gigs.find({ id: { $in: connectedGigIds }, status: { $ne: 'published' } }).toArray()
      : [];
    const visibleGigs = [...baseGigs, ...relatedGigs];
    const ownerIds = [...new Set(visibleGigs.map((gig) => gig.ownerId))];
    const [ownerDocuments, profileProjects, activeBookings] = ownerIds.length ? await Promise.all([
      users.find({ id: { $in: ownerIds } }).toArray(),
      portfolioProjects.find({ ownerId: { $in: ownerIds }, showOnProfile: true }).toArray(),
      bookings.find({ freelancerId: { $in: ownerIds }, status: { $in: ACTIVE_BOOKING_STATUSES } }).toArray(),
    ]) : [[], [], []];
    const owners = new Map(ownerDocuments.map((person) => [person.id, person]));
    const portfolios = new Map();
    const busy = new Map();
    for (const ownerId of ownerIds) {
      portfolios.set(ownerId, []);
      busy.set(ownerId, []);
    }
    for (const project of profileProjects) {
      portfolios.get(project.ownerId).push(project);
    }
    for (const booking of activeBookings) {
      busy.get(booking.freelancerId).push(booking);
    }
    const detailsContext = { owners, portfolios, busy };
    const visibleGigDetails = await Promise.all(baseGigs.filter((gig) => visibleGig(gig, user)).map((gig) => gigDetails(gig, detailsContext)));
    const relatedGigDetails = await Promise.all(relatedGigs.map((gig) => gigDetails(gig, detailsContext)));

    const bookingClientIds = [...new Set(userBookings.map((booking) => booking.clientId))];
    const bookingFreelancerIds = [...new Set(userBookings.map((booking) => booking.freelancerId))];
    const bookingCreatorIds = [...new Set(userBookings.map((booking) => booking.creatorId))];
    const bookingProjectIds = [...new Set(userBookings.map((booking) => booking.projectId).filter(Boolean))];
    const contactIds = user.role === 'freelancer'
      ? [...new Set([...bookingClientIds, ...scopedMessages.map((message) => message.clientId)])]
      : [];
    const rateQuery = user.role === 'client' ? { clientId: user.id }
      : ownedGigIds.length ? { creatorId: { $in: ownedGigIds } } : { creatorId: { $in: [] } };
    const [bookingPeople, bookingGigs, bookingProjects, workspaceProjects, userPortfolio, contacts, rateDocuments, shortlist] = await Promise.all([
      users.find({ id: { $in: [...new Set([...bookingClientIds, ...bookingFreelancerIds])] } }).toArray(),
      bookingCreatorIds.length ? gigs.find({ id: { $in: bookingCreatorIds } }).toArray() : [],
      bookingProjectIds.length ? projects.find({ id: { $in: bookingProjectIds } }).toArray() : [],
      user.role === 'client'
        ? projects.find({ clientId: user.id }).toArray()
        : bookingProjectIds.length ? projects.find({ id: { $in: bookingProjectIds } }).toArray() : [],
      user.role === 'freelancer' ? portfolioProjects.find({ ownerId: user.id }).toArray() : [],
      contactIds.length ? users.find({ id: { $in: contactIds } }).toArray() : [],
      agreedRates.find(rateQuery).toArray(),
      user.role === 'client' ? shortlists.findOne({ userId: user.id }) : null,
    ]);
    const peopleById = new Map(bookingPeople.map((person) => [person.id, person]));
    const gigsById = new Map(bookingGigs.map((gig) => [gig.id, gig]));
    const projectsById = new Map(bookingProjects.map((project) => [project.id, project]));
    const detailedBookings = userBookings.map((booking) => ({
      ...withoutMongoId(booking),
      creatorName: peopleById.get(booking.freelancerId)?.name,
      clientName: peopleById.get(booking.clientId)?.name,
      gigTitle: gigsById.get(booking.creatorId)?.title,
      projectTitle: projectsById.get(booking.projectId)?.title,
    }));
    const savedGigIds = (shortlist?.gigIds || []).filter((gigId) => baseGigs.some((gig) => gig.id === gigId && visibleGig(gig, user)));
    return {
      user: publicUser(user),
      gigs: visibleGigDetails,
      bookings: detailedBookings,
      messages: scopedMessages.map(withoutMongoId),
      agreedRates: Object.fromEntries(rateDocuments.map((rate) => [`${rate.clientId}:${rate.creatorId}`, rate.rate])),
      portfolioProjects: userPortfolio.map(portfolioProjectDetails),
      relatedGigs: relatedGigDetails,
      projects: workspaceProjects.map(withoutMongoId),
      contacts: contacts.map(contact),
      saved: savedGigIds,
      availability: user.availability || [],
    };
  }

  async function updated(response, user, result = {}, status = 200) {
    const currentUser = await users.findOne({ id: user.id });
    if (!currentUser) fail(401, 'Please sign in to continue.');
    return send(response, status, { ...result, workspace: await workspace(currentUser) });
  }

  async function reserveBookingSlot(booking) {
    const startMinute = minutes(booking.start);
    const endMinute = minutes(booking.end);
    const lockId = `${booking.freelancerId}:${booking.date}`;
    const filter = {
      _id: lockId,
      reservations: { $not: { $elemMatch: { startMinute: { $lt: endMinute }, endMinute: { $gt: startMinute } } } },
    };
    const update = {
      $setOnInsert: { freelancerId: booking.freelancerId, date: booking.date, createdAt: Date.now() },
      $push: { reservations: { bookingId: booking.id, startMinute, endMinute } },
    };
    let result;
    try {
      result = await bookingSlots.updateOne(filter, update, { upsert: true });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      result = await bookingSlots.updateOne(filter, update);
    }
    return Boolean(result.matchedCount || result.upsertedCount);
  }

  async function releaseBookingSlot(booking) {
    await bookingSlots.updateOne(
      { _id: `${booking.freelancerId}:${booking.date}` },
      { $pull: { reservations: { bookingId: booking.id } } },
    );
  }

  async function handleApi(request, response, pathname) {
    const method = request.method;
    if (pathname === '/api/locations/countries' && method === 'GET') {
      return send(response, 200, { countries: await countriesNow.getCountries() });
    }
    if (pathname === '/api/locations/cities' && method === 'GET') {
      const countryName = new URL(request.url, 'http://localhost').searchParams.get('country');
      if (!countryName) fail(400, 'Choose a country to load its cities.');
      const countries = await countriesNow.getCountries();
      const country = countries.find((item) => item.name.toLowerCase() === countryName.trim().toLowerCase());
      if (!country) fail(400, 'Choose a valid country.');
      try {
        return send(response, 200, { country: country.name, cities: await countriesNow.getCities(country.name) });
      } catch {
        fail(503, 'City suggestions are temporarily unavailable. Please try again.');
      }
    }
    if (pathname === '/api/health' && method === 'GET') {
      try {
        await (store.ping ? store.ping() : db.command({ ping: 1 }));
        return send(response, 200, { status: 'ok' });
      } catch {
        return send(response, 503, { status: 'unavailable' });
      }
    }
    if (pathname === '/api/session' && method === 'GET') {
      const user = await sessionUser(request);
      return send(response, 200, { user: user ? publicUser(user) : null });
    }
    if (pathname === '/api/auth/logout' && method === 'POST') {
      await sessions.delete(sessionToken(request));
      response.setHeader('Set-Cookie', cookie(request, '', 0));
      return send(response, 200, { user: null });
    }
    if (['/api/auth/login', '/api/auth/register'].includes(pathname) && method === 'POST') {
      const body = await bodyOf(request);
      if (!['client', 'freelancer'].includes(body.role)) fail(400, 'Choose a client or freelancer account.');
      const email = text(body.email, 'Email', 3, 254).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address.');
      const password = text(body.password, 'Password', 8, 128);
      let user;
      if (pathname.endsWith('/login')) {
        user = await users.findOne({ email, role: body.role });
        if (!user || !(await verifyPassword(password, user.passwordHash))) fail(401, `The email or password does not match a ${body.role} account.`);
      } else {
        const name = text(body.name, 'Name', 2, 60);
        const basedIn = await location(body.location, false, countriesNow);
        const phone = text(body.phone, 'Mobile number', 10, 10);
        if (!/^[6-9]\d{9}$/.test(phone)) fail(400, 'Enter a valid 10-digit Indian mobile number.');
        const company = body.company ? text(body.company, 'Company', 1, 80) : '';
        const specialty = body.role === 'freelancer' ? category(body.specialty).id : '';
        const passwordHash = await hashPassword(password);
        user = { id: id(body.role), name, email, role: body.role, passwordHash, location: basedIn, phone, company, specialty, availability: [], createdAt: Date.now() };
        try {
          await users.insertOne(user);
        } catch (error) {
          if (isDuplicateKey(error)) fail(409, `A ${body.role} account already exists with that email. Please sign in.`);
          throw error;
        }
      }
      await startSession(request, response, user);
      return send(response, 200, { user: publicUser(user), workspace: await workspace(user) });
    }

    const user = await authenticate(request);
    if (pathname === '/api/workspace' && method === 'GET') return send(response, 200, await workspace(user));
    if (pathname === '/api/availability' && method === 'PUT') {
      const body = await bodyOf(request);
      await users.updateOne({ id: user.id }, { $set: { availability: availability(body.availability) } });
      return updated(response, user);
    }

    if (pathname === '/api/portfolio-projects' && ['GET', 'POST'].includes(method)) {
      await authenticate(request, 'freelancer');
      if (method === 'GET') {
        const records = await portfolioProjects.find({ ownerId: user.id }).toArray();
        return send(response, 200, { portfolioProjects: records.map(portfolioProjectDetails) });
      }
      const body = await bodyOf(request);
      const values = portfolioProjectValues(body, user);
      const project = { ...values, id: id('portfolio'), ownerId: user.id, assets: [], assetCount: 0, createdAt: Date.now(), updatedAt: Date.now() };
      await portfolioProjects.insertOne(project);
      return updated(response, user, { portfolioProject: portfolioProjectDetails(project) }, 201);
    }

    const portfolioMatch = pathname.match(/^\/api\/portfolio-projects\/([^/]+)$/);
    if (portfolioMatch && ['GET', 'PATCH', 'DELETE'].includes(method)) {
      await authenticate(request, 'freelancer');
      const project = await portfolioProjects.findOne({ id: portfolioMatch[1], ownerId: user.id });
      if (!project) fail(404, 'Portfolio project not found.');
      if (method === 'GET') return send(response, 200, { portfolioProject: portfolioProjectDetails(project) });
      if (method === 'DELETE') {
        await portfolioProjects.deleteOne({ id: project.id, ownerId: user.id });
        await Promise.all((project.assets || []).map((asset) => portfolioAssets.remove(asset.id)));
        return updated(response, user);
      }
      const body = await bodyOf(request);
      const values = portfolioProjectValues(body, user, project);
      await portfolioProjects.updateOne({ id: project.id, ownerId: user.id }, { $set: { ...values, updatedAt: Date.now() } });
      const saved = await portfolioProjects.findOne({ id: project.id, ownerId: user.id });
      if (!saved) fail(404, 'Portfolio project not found.');
      return updated(response, user, { portfolioProject: portfolioProjectDetails(saved) });
    }

    const uploadMatch = pathname.match(/^\/api\/portfolio-projects\/([^/]+)\/assets$/);
    if (uploadMatch && method === 'POST') {
      await authenticate(request, 'freelancer');
      const projectId = uploadMatch[1];
      const project = await portfolioProjects.findOne({ id: projectId, ownerId: user.id });
      if (!project) fail(404, 'Portfolio project not found.');
      const type = (request.headers['content-type'] || '').split(';')[0].toLowerCase();
      if (!acceptedProjectFileTypes.includes(type)) fail(415, 'Upload a supported photo, video, or PDF project file.');
      let name;
      try { name = decodeURIComponent(request.headers['x-file-name'] || ''); } catch { fail(400, 'Invalid project file name.'); }
      name = text(path.basename(name.replace(/\\/g, '/')), 'File name', 1, 180);
      if ([...name].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) fail(400, 'Invalid project file name.');
      if (Number(request.headers['content-length']) > MAX_PROJECT_FILE_SIZE) {
        request.resume();
        fail(413, 'Each project file must be 50 MB or smaller. Use a Google Drive link for larger files.');
      }
      if ((project.assetCount || 0) >= MAX_PROJECT_FILES) fail(400, 'A project can have up to 8 uploaded files.');
      const asset = { id: id('asset'), name, type, size: 0, uploadedAt: Date.now() };
      const uploaded = await portfolioAssets.save(asset.id, request, { name, type }, MAX_PROJECT_FILE_SIZE);
      asset.size = uploaded.size;
      let result;
      try {
        result = await portfolioProjects.updateOne(
          { id: projectId, ownerId: user.id, assetCount: { $lt: MAX_PROJECT_FILES } },
          { $push: { assets: asset }, $inc: { assetCount: 1 }, $set: { updatedAt: Date.now() } },
        );
      } catch (error) {
        await portfolioAssets.remove(asset.id).catch(() => {});
        throw error;
      }
      if (!result.modifiedCount) {
        await portfolioAssets.remove(asset.id);
        const current = await portfolioProjects.findOne({ id: projectId, ownerId: user.id });
        if (!current) fail(409, 'This project was removed while the file was uploading.');
        fail(400, 'A project can have up to 8 uploaded files.');
      }
      const saved = await portfolioProjects.findOne({ id: projectId, ownerId: user.id });
      return updated(response, user, { portfolioProject: portfolioProjectDetails(saved) }, 201);
    }

    const removeAssetMatch = pathname.match(/^\/api\/portfolio-projects\/([^/]+)\/assets\/([^/]+)$/);
    if (removeAssetMatch && method === 'DELETE') {
      await authenticate(request, 'freelancer');
      const project = await portfolioProjects.findOne({ id: removeAssetMatch[1], ownerId: user.id });
      const asset = project?.assets?.find((item) => item.id === removeAssetMatch[2]);
      if (!asset) fail(404, 'Project file not found.');
      const removed = await portfolioProjects.updateOne(
        { id: project.id, ownerId: user.id, 'assets.id': asset.id },
        { $pull: { assets: { id: asset.id } }, $inc: { assetCount: -1 }, $set: { updatedAt: Date.now() } },
      );
      if (!removed.modifiedCount) fail(404, 'Project file not found.');
      await portfolioAssets.remove(asset.id);
      return updated(response, user, { portfolioProject: portfolioProjectDetails(await portfolioProjects.findOne({ id: project.id, ownerId: user.id })) });
    }

    const assetMatch = pathname.match(/^\/api\/portfolio-assets\/([^/]+)$/);
    if (assetMatch && ['GET', 'HEAD'].includes(method)) {
      const project = await portfolioProjects.findOne({ 'assets.id': assetMatch[1] });
      let canView = Boolean(project && user.role === 'freelancer' && project.ownerId === user.id);
      if (project && user.role === 'client' && project.showOnProfile) {
        canView = Boolean(await gigs.findOne({ ownerId: project.ownerId, status: 'published' }))
          || await ownerHasConnection(project.ownerId, user);
      }
      if (!canView) fail(404, 'Project file not found.');
      const asset = project.assets.find((item) => item.id === assetMatch[1]);
      if (!(await portfolioAssets.has(asset.id))) fail(404, 'Project file not found.');
      return portfolioAssets.send(request, response, asset);
    }

    if (pathname === '/api/gigs' && method === 'POST') {
      await authenticate(request, 'freelancer');
      const body = await bodyOf(request);
      const specialty = category(body.category);
      if (!(user.availability || []).length) fail(400, 'Add your availability before publishing a gig.');
      const equipment = body.equipment;
      if (!Array.isArray(equipment) || !equipment.length || equipment.length > 12) fail(400, 'Add between 1 and 12 pieces of equipment.');
      const skills = body.skills || [];
      if (!Array.isArray(skills) || skills.length > 20) fail(400, 'Add up to 20 skills.');
      const gig = {
        id: id('gig'), ownerId: user.id, name: user.name, category: specialty.id,
        location: await location(body.location || user.location, true, countriesNow), rate: amount(body.rate, 'Day rate'),
        title: text(body.title, 'Gig headline', 10, 100), bio: text(body.bio, 'Description', 20, 1200),
        equipment: equipment.map((item) => text(item, 'Equipment', 1, 60)), skills: skills.map((item) => text(item, 'Skill', 1, 40)),
        cover: `https://images.unsplash.com/${covers[specialty.id]}?auto=format&fit=crop&w=800&q=85`,
        avatar: '', color: '#e3eacb', rating: 0, reviews: 0, verified: false, remote: Boolean(body.remote), status: 'published', createdAt: Date.now(),
      };
      await gigs.insertOne(gig);
      return updated(response, user, { gig: await gigDetails(gig) }, 201);
    }

    const gigMatch = pathname.match(/^\/api\/gigs\/([^/]+)$/);
    if (gigMatch && ['GET', 'PATCH'].includes(method)) {
      const gig = await gigs.findOne({ id: gigMatch[1] });
      if (!gig || (!visibleGig(gig, user) && !(method === 'GET' && await connectedToGig(gig, user)))) fail(404, 'Gig not found.');
      if (method === 'GET') return send(response, 200, { gig: await gigDetails(gig) });
      await authenticate(request, 'freelancer');
      if (gig.ownerId !== user.id) fail(404, 'Gig not found.');
      const body = await bodyOf(request);
      const next = { ...withoutMongoId(gig) };
      if (body.status !== undefined) {
        if (!['published', 'paused'].includes(body.status)) fail(400, 'Choose published or paused status.');
        if (body.status === 'published' && !(user.availability || []).length) fail(400, 'Add availability before publishing your gig.');
        next.status = body.status;
      }
      if (body.title !== undefined) next.title = text(body.title, 'Gig headline', 10, 100);
      if (body.bio !== undefined) next.bio = text(body.bio, 'Description', 20, 1200);
      if (body.rate !== undefined) next.rate = amount(body.rate, 'Day rate');
      if (body.location !== undefined) next.location = await location(body.location, true, countriesNow);
      if (body.category !== undefined) {
        next.category = category(body.category).id;
        next.cover = `https://images.unsplash.com/${covers[next.category]}?auto=format&fit=crop&w=800&q=85`;
      }
      for (const field of ['equipment', 'skills']) {
        if (body[field] !== undefined) {
          if (!Array.isArray(body[field]) || body[field].length > (field === 'equipment' ? 12 : 20) || (field === 'equipment' && !body[field].length)) fail(400, `Add a valid ${field} list.`);
          next[field] = body[field].map((item) => text(item, field, 1, field === 'equipment' ? 60 : 40));
        }
      }
      if (body.remote !== undefined) next.remote = Boolean(body.remote);
      await gigs.updateOne({ id: gig.id, ownerId: user.id }, { $set: next });
      const saved = await gigs.findOne({ id: gig.id, ownerId: user.id });
      return updated(response, user, { gig: await gigDetails(saved) });
    }

    const shortlistMatch = pathname.match(/^\/api\/shortlist\/([^/]+)$/);
    if (shortlistMatch && method === 'POST') {
      await authenticate(request, 'client');
      const gigId = shortlistMatch[1];
      if (!await gigs.findOne({ id: gigId, status: 'published' })) fail(404, 'Gig not found.');
      const shortlist = await shortlists.findOne({ userId: user.id });
      if ((shortlist?.gigIds || []).includes(gigId)) {
        await shortlists.updateOne({ userId: user.id, gigIds: gigId }, { $pull: { gigIds: gigId } });
      } else {
        try {
          await shortlists.updateOne(
            { userId: user.id, gigIds: { $ne: gigId } },
            { $setOnInsert: { id: user.id, userId: user.id }, $addToSet: { gigIds: gigId } },
            { upsert: true },
          );
        } catch (error) {
          if (!isDuplicateKey(error)) throw error;
          await shortlists.updateOne({ userId: user.id }, { $addToSet: { gigIds: gigId } });
        }
      }
      return updated(response, user);
    }

    if (pathname === '/api/bookings' && method === 'POST') {
      await authenticate(request, 'client');
      const body = await bodyOf(request);
      const gig = await gigs.findOne({ id: body.creatorId, status: 'published' });
      if (!gig) fail(404, 'That gig is no longer available.');
      if (!validDate(body.date) || !Number.isFinite(minutes(body.start)) || !Number.isFinite(minutes(body.end)) || minutes(body.end) <= minutes(body.start)) fail(400, 'Choose a valid date and an end time after your start time.');
      const detailedGig = await gigDetails(gig);
      if (!bookingFits(detailedGig, body.date, body.start, body.end, [], user.availability || [])) fail(409, 'These hours are no longer available to both of you. Please choose another time or update your availability.');
      const project = body.projectId && await projects.findOne({ id: body.projectId, clientId: user.id, status: 'open' });
      if (body.projectId && !project) fail(404, 'Project brief not found.');
      const rate = await agreedRates.findOne({ clientId: user.id, creatorId: gig.id });
      const dayRate = rate?.rate || gig.rate;
      const booking = {
        id: id('booking'), clientId: user.id, freelancerId: gig.ownerId, creatorId: gig.id,
        date: body.date, start: body.start, end: body.end, projectId: project?.id || '',
        dayRate, total: Math.round(dayRate * (minutes(body.end) - minutes(body.start)) / DAY_MINUTES),
        status: 'requested', createdAt: Date.now(),
      };
      if (!(await reserveBookingSlot(booking))) fail(409, 'These hours are no longer available. Please choose another time.');
      try {
        await bookings.insertOne(booking);
      } catch (error) {
        await releaseBookingSlot(booking);
        throw error;
      }
      return updated(response, user, { booking: { ...booking, creatorName: detailedGig.name } }, 201);
    }
    const bookingMatch = pathname.match(/^\/api\/bookings\/([^/]+)$/);
    if (bookingMatch && method === 'PATCH') {
      const booking = await bookings.findOne({ id: bookingMatch[1], ...(user.role === 'client' ? { clientId: user.id } : { freelancerId: user.id }) });
      if (!booking) fail(404, 'Booking not found.');
      const body = await bodyOf(request);
      const canCancel = body.status === 'cancelled' && activeBooking(booking);
      const canRespond = user.role === 'freelancer' && booking.status === 'requested' && ['confirmed', 'declined'].includes(body.status);
      if (!canCancel && !canRespond) fail(400, 'That booking cannot be updated to this status.');
      const changed = await bookings.updateOne(
        { id: booking.id, status: booking.status },
        { $set: { status: body.status, updatedAt: Date.now() } },
      );
      if (!changed.modifiedCount) fail(409, 'This booking was updated by another request. Refresh and try again.');
      if (!activeBooking({ ...booking, status: body.status })) await releaseBookingSlot(booking);
      return updated(response, user);
    }

    if (pathname === '/api/projects' && method === 'POST') {
      await authenticate(request, 'client');
      const body = await bodyOf(request);
      const preferredTimes = availability(body.preferredTimes, false);
      if (!preferredTimes.length) fail(400, 'Add at least one preferred call time.');
      if (body.urgent && preferredTimes.some((slot) => slot.date !== dateKey())) fail(400, 'An urgent crew call must use today’s date in IST.');
      const project = { id: id('project'), clientId: user.id, title: text(body.title, 'Project name', 5, 100), category: category(body.category).id, budget: amount(body.budget, 'Budget'), location: await location(body.location, true, countriesNow), description: text(body.description, 'Project description', 15, 2000), preferredTimes, urgent: Boolean(body.urgent), status: 'open', createdAt: Date.now() };
      await projects.insertOne(project);
      return updated(response, user, { project }, 201);
    }
    const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (projectMatch && method === 'PATCH') {
      await authenticate(request, 'client');
      const project = await projects.findOne({ id: projectMatch[1], clientId: user.id });
      if (!project) fail(404, 'Project brief not found.');
      await projects.updateOne({ id: project.id, clientId: user.id }, { $set: { status: 'closed' } });
      return updated(response, user);
    }

    if (pathname === '/api/messages' && method === 'POST') {
      const body = await bodyOf(request);
      const gig = await gigs.findOne({ id: body.creatorId });
      if (!gig || (user.role === 'freelancer' && gig.ownerId !== user.id)) fail(404, 'Conversation not found.');
      const clientId = user.role === 'client' ? user.id : body.clientId;
      const client = await users.findOne({ id: clientId, role: 'client' });
      if (!client) fail(404, 'Conversation not found.');
      const [existingMessage, existingBooking] = await Promise.all([
        messages.findOne({ creatorId: gig.id, clientId }),
        bookings.findOne({ creatorId: gig.id, clientId }),
      ]);
      const connected = Boolean(existingMessage || existingBooking);
      if ((user.role === 'freelancer' || gig.status !== 'published') && !connected) fail(404, 'Conversation not found.');
      const offer = body.offer === undefined ? undefined : amount(body.offer, 'Offer');
      const messageText = body.text ? text(body.text, 'Message', 1, 2000) : offer ? `Would ₹${offer.toLocaleString('en-IN')} per day work for this project?` : text('', 'Message', 1, 2000);
      let context;
      if (body.context?.date && validDate(body.context.date)) {
        context = { date: body.context.date };
        if (Number.isFinite(minutes(body.context.start)) && Number.isFinite(minutes(body.context.end))) {
          context.start = body.context.start;
          context.end = body.context.end;
        }
      }
      if (offer) {
        const pending = await messages.find({ creatorId: gig.id, clientId, offerStatus: 'pending' }).toArray();
        await Promise.all(pending.map((item) => messages.updateOne({ id: item.id, offerStatus: 'pending' }, { $set: { offerStatus: 'superseded' } })));
      }
      const message = { id: id('message'), creatorId: gig.id, clientId, senderId: user.id, text: messageText, timestamp: Date.now(), ...(offer ? { offer, offerStatus: 'pending' } : {}), ...(context ? { context } : {}) };
      await messages.insertOne(message);
      return updated(response, user, { message }, 201);
    }
    const offerMatch = pathname.match(/^\/api\/messages\/([^/]+)\/accept$/);
    if (offerMatch && method === 'POST') {
      const message = await messages.findOne({ id: offerMatch[1] });
      if (!message || !(await ownsThread(user, message))) fail(404, 'Offer not found.');
      if (!message.offer || message.senderId === user.id) fail(400, 'Only the recipient can accept a pending offer.');
      if (message.offerStatus === 'pending') {
        const accepted = await messages.updateOne(
          { id: message.id, offerStatus: 'pending', senderId: { $ne: user.id } },
          { $set: { offerStatus: 'accepted' } },
        );
        if (!accepted.modifiedCount) {
          const latest = await messages.findOne({ id: message.id });
          if (latest?.offerStatus !== 'accepted') fail(400, 'Only the recipient can accept a pending offer.');
        }
      } else if (message.offerStatus !== 'accepted') {
        fail(400, 'Only the recipient can accept a pending offer.');
      }
      const rateId = `${message.clientId}:${message.creatorId}`;
      const rateFilter = { clientId: message.clientId, creatorId: message.creatorId };
      const rateUpdate = { $set: { id: rateId, clientId: message.clientId, creatorId: message.creatorId, rate: message.offer } };
      try {
        await agreedRates.updateOne(rateFilter, rateUpdate, { upsert: true });
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
        await agreedRates.updateOne(rateFilter, rateUpdate);
      }
      const agreement = {
        id: `agreement-${message.id}`, creatorId: message.creatorId, clientId: message.clientId,
        senderId: 'system', text: `You’ve agreed on ₹${message.offer.toLocaleString('en-IN')}/day. Choose a mutually available call time to book the shoot.`, timestamp: Date.now(),
      };
      try {
        await messages.updateOne({ id: agreement.id }, { $setOnInsert: agreement }, { upsert: true });
      } catch (error) {
        if (!isDuplicateKey(error) || !await messages.findOne({ id: agreement.id })) throw error;
      }
      return updated(response, user);
    }
    fail(404, 'Endpoint not found.');
  }

  function serveWebsite(request, response, pathname) {
    if (!['GET', 'HEAD'].includes(request.method)) return send(response, 404, { error: 'Page not found.' });
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { return send(response, 400, { error: 'Invalid path.' }); }
    let file = path.resolve(buildRoot, `.${decoded}`);
    if (file !== buildRoot && !file.startsWith(`${buildRoot}${path.sep}`)) return send(response, 404, { error: 'Page not found.' });
    if (file === buildRoot || !path.extname(file)) file = path.join(buildRoot, 'index.html');
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return send(response, 404, { error: 'Build the website with npm run build, or use npm run dev for development.' });
    const mimeTypes = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain' };
    response.writeHead(200, {
      'Content-Type': `${mimeTypes[path.extname(file)] || 'application/octet-stream'}`,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Cache-Control': path.extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    if (request.method === 'HEAD') return response.end();
    fs.createReadStream(file).on('error', () => response.destroy()).pipe(response);
  }

  return http.createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      if (pathname.startsWith('/api/')) await handleApi(request, response, pathname);
      else serveWebsite(request, response, pathname);
    } catch (error) {
      if (response.headersSent) return response.destroy();
      const expectedError = error instanceof HttpError || (Number.isInteger(error.status) && error.status >= 400 && error.status < 600);
      if (!expectedError) console.error(`[frame-api] ${error.name || 'Error'}: ${error.message || 'request failed'}`);
      const status = error.status || (isDatabaseUnavailable(error) ? 503 : 500);
      const message = expectedError ? error.message
        : status === 503 ? 'The database is temporarily unavailable. Please try again.'
          : 'The server could not complete that request. Please try again.';
      send(response, status, { error: message });
    }
  });
}

async function startProductionServer() {
  const store = await createMongoStore();
  const server = createMarketplaceServer({ store });
  const port = Number(process.env.PORT || process.env.API_PORT || 4000);
  const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, resolve);
    });
  } catch (error) {
    await store.close();
    throw error;
  }
  console.log(`frame. website & API ready at http://${host}:${port}`);

  let stopping = false;
  const shutdown = (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`Received ${signal}; closing the HTTP server and MongoDB connection.`);
    const forceClose = setTimeout(() => server.closeAllConnections(), 25_000);
    forceClose.unref();
    server.close(async (error) => {
      clearTimeout(forceClose);
      if (error) console.error(`HTTP shutdown error: ${error.message}`);
      try { await store.close(); } catch (closeError) { console.error(`MongoDB shutdown error: ${closeError.message}`); }
    });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  server.on('error', (error) => console.error(`HTTP server error: ${error.message}`));
  return { server, store };
}

if (require.main === module) {
  startProductionServer().catch((error) => {
    console.error(`Unable to start frame.: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { createMarketplaceServer, startProductionServer, HttpError };
