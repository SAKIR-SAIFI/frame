# frame. India — Data Flow Documentation

This document describes how data moves through the application, from user interactions to persistent storage.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        REACT FRONTEND (port 3000)               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Pages     │  │  Components │  │     State Management    │  │
│  │             │  │             │  │                         │  │
│  │ • Landing   │  │ • Dashboards│  │ • user (current account)│  │
│  │ • Auth      │  │ • Modals    │  │ • workspace (all data)  │  │
│  │ • Client    │  │ • Cards     │  │ • modal (active dialog) │  │
│  │ • Freelancer│  │ • Forms     │  │ • filters, query, etc.  │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│         │                │                     │                │
│         └────────────────┼─────────────────────┘                │
│                          ▼                                      │
│                   ┌─────────────┐                               │
│                   │   api.js    │  ← fetch with credentials    │
│                   │  (proxy to  │     same-origin cookies      │
│                   │   port 4000)│                               │
│                   └──────┬──────┘                               │
└─────────────────────────┼───────────────────────────────────────┘
                          │ HTTPS /api/*
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      NODE.JS API SERVER (port 4000)             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Routes    │  │  Business   │  │      Data Store         │  │
│  │             │  │   Logic     │  │                         │  │
│  │ • /auth/*   │  │ • Auth      │  │ • MongoDB: frame        │  │
│  │ • /gigs     │  │ • Booking   │  │ • MongoDB collections   │  │
│  │ • /bookings │  │ • Projects  │  │ • portfolioAssets      │  │
│  │ • /projects │  │ • Messages  │  │                         │  │
│  │ • /messages │  │ • Portfolio │  │ • GridFS uploads        │  │
│  │ • /portfolio│  │ • Search    │  │                         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow Patterns

### Country and city suggestions

The React location picker requests `GET /api/locations/countries` and `GET /api/locations/cities?country=...`. The API reads country and city lists from CountriesNow, caches them in-process, and uses the existing Indian city list as an India-only fallback if CountriesNow is unavailable. Submitted city/country values are validated by the API before they are saved.

### 1. Authentication Flow

```
User submits login/register form
         │
         ▼
POST /api/auth/login or /api/auth/register
         │
         ▼
Server validates:
  • Email format, password length
  • Role matches account type (client/freelancer)
  • Phone: +91 10-digit Indian number
  • Location: valid Indian city from suggestions
         │
         ▼
Password hashed with scrypt (salt + 64-byte hash)
         │
         ▼
Session created:
  • Random 32-byte token → HttpOnly cookie
  • MongoDB stores only SHA-256(token), userId, expiresAt
  • TTL index cleans expired sessions; API checks expiry on each lookup
  • 7-day expiry, SameSite=Lax, Secure in production
         │
         ▼
Response: { user, workspace }
         │
         ▼
Frontend: setUser(), setWorkspace(), notify()
```

### 2. Workspace Hydration (Initial Load & Refresh)

```
App mounts / window focus / 15s interval / refresh button
         │
         ▼
GET /api/session  →  { user } or { user: null }
         │
         ▼
If user exists: GET /api/workspace
         │
         ▼
Server builds workspace object:
  For CLIENT:
  {
    user: publicUser,
    gigs: all published gigs + related paused gigs,
    bookings: user's bookings (with creator/client names),
    projects: user's project briefs,
    portfolioProjects: shared projects from booked gigs,
    messages: user's conversations,
    agreedRates: negotiated rates for user's threads,
    saved: shortlisted gig IDs,
    availability: user's preferred hours,
    contacts: []
  }

  For FREELANCER:
  {
    user: publicUser,
    gigs: only freelancer's own gigs,
    bookings: bookings for freelancer's gigs,
    projects: briefs attached to freelancer's bookings,
    portfolioProjects: ALL freelancer's portfolio projects,
    messages: conversations for freelancer's gigs,
    agreedRates: negotiated rates for freelancer's threads,
    saved: [],
    availability: freelancer's working hours,
    contacts: clients who booked/messaged
  }
         │
         ▼
Frontend: applyWorkspace() → setUser(), setWorkspace()
```

### 3. Gig Discovery (Client Side)

```
Client searches/filters
         │
         ▼
Filtered locally from workspace.gigs:
  • query: name, role, category, location, bio, equipment, skills
  • category: specialty filter
  • location: exact match or remote
  • budget: max day rate
  • availableNow: intersection with client's availability today
  • date: intersection with both schedules on specific date
         │
         ▼
Sorted: recommended / price-low / price-high / rating
         │
         ▼
Rendered in CreatorCard grid
```

### 4. Availability & Scheduling

```
Both roles can set availability:
  • Specific dates (override weekly)
  • Weekly recurring (0=Sunday..6=Saturday)
  • Multiple windows per day
  • All times in IST (Asia/Kolkata)

Client books gig:
  1. Client opens BookingModal → Calendar shows mutual availability
  2. Client picks date + custom start/end within window
  3. POST /api/bookings { creatorId, date, start, end, projectId? }
  4. Server validates:
     • Gig is published (or connected for client)
     • Time fits both schedules (bookingFits)
     • No conflicts with freelancer's other bookings
     • Rate = agreed rate or gig rate
  5. Booking created with status="requested"
  6. Freelancer's gig.busyTimes updated across ALL their gigs
  7. Both workspaces refreshed
```

### 5. Project Briefs (Client → Freelancer)

```
Client creates brief:
  POST /api/projects { title, category, budget, location, description, preferredTimes[], urgent }
         │
         ▼
Freelancer finds matching crew:
  • Filters gigs by brief category + location + budget
  • Shows mutual availability for preferredTimes
         │
         ▼
Client books with projectId:
  • Booking linked to project
  • Freelancer sees project in "Attached briefs" tab
  • Project marked closed when booking confirmed
```

### 6. Messages & Rate Negotiation

```
Conversation scoped to (creatorId, clientId):
  • Client can message any published gig
  • Freelancer can only message clients who booked/messaged their gigs
  • System messages for rate agreements

Rate proposal:
  1. Client sends offer: { offer: 15000, text, context }
  2. Freelancer accepts → agreedRates["clientId:creatorId"] = 15000
  3. Subsequent bookings use agreed rate
```

### 7. Freelancer Portfolio Projects

```
Freelancer adds project:
  POST /api/portfolio-projects { title, category, description, yourRole, projectDate, driveUrl, showOnProfile }
         │
         ▼
Upload files (optional):
  POST /api/portfolio-projects/:id/assets (raw binary request body, streamed)
  • Types: image/*, video/*, application/pdf
  • Max 8 files, 50 MB each
  • Stored as GridFS chunks in the portfolioAssets bucket
  • Served via GET /api/portfolio-assets/:assetId with range support

Visibility:
  • showOnProfile=true → appears on freelancer's gig profiles for clients
  • showOnProfile=false → only visible to freelancer
  • Other freelancers: 404 on all portfolio endpoints

Client views gig profile:
  • Gig includes portfolioProjects (filtered by showOnProfile)
  • Client clicks file → opens in new tab via /api/portfolio-assets/:id
  • Google Drive links open in new tab with target="_blank"
```

### 8. Data Persistence

```
All app records are read from and written to MongoDB collections in the `frame` database:
  • users, gigs, bookings, projects, portfolioProjects, messages
  • agreedRates, shortlists, sessions, bookingSlots
  • portfolioAssets GridFS bucket for uploaded binary files

On server start:
  • Connect to MongoDB and create indexes before accepting traffic
  • Do not import the old JSON file or insert demo data; the database starts empty
  • Booking slot reservations use atomic MongoDB updates to reject overlaps across instances
```

## Key Data Structures

### User
```json
{
  "id": "freelancer-aarav",
  "name": "Aarav Sharma",
  "email": "aarav@frame.in",
  "role": "freelancer",
  "passwordHash": "salt:hash",
  "phone": "9000000000",
  "location": "Mumbai, Maharashtra",
  "company": "",
  "specialty": "cinematography",
  "availability": [{ "id": "time-1", "weekday": 1, "start": "09:00", "end": "17:00" }],
  "createdAt": 1700000000000
}
```

### Gig
```json
{
  "id": "aarav",
  "ownerId": "freelancer-aarav",
  "name": "Aarav Sharma",
  "category": "cinematography",
  "location": "Mumbai, Maharashtra",
  "rate": 18000,
  "title": "Your vision, brought to life in every frame.",
  "bio": "...",
  "equipment": ["Sony FX6", "Cinema lenses"],
  "skills": ["Commercials", "Wedding films", "Hindi"],
  "cover": "https://images.unsplash.com/...",
  "avatar": "",
  "color": "#dee5d9",
  "rating": 4.9,
  "reviews": 128,
  "verified": true,
  "remote": false,
  "status": "published",
  "createdAt": 1700000000000,
  "availability": [...],
  "busyTimes": [{ "date": "2026-10-15", "start": "10:00", "end": "12:00" }],
  "portfolioProjects": [...]
}
```

### Booking
```json
{
  "id": "booking-abc",
  "clientId": "client-demo",
  "freelancerId": "freelancer-aarav",
  "creatorId": "aarav",
  "date": "2026-10-15",
  "start": "10:30",
  "end": "12:30",
  "projectId": "project-123",
  "dayRate": 18000,
  "total": 4500,
  "status": "confirmed",
  "createdAt": 1700000000000,
  "updatedAt": 1700000000000
}
```

### Portfolio Project
```json
{
  "id": "portfolio-xyz",
  "ownerId": "freelancer-aarav",
  "title": "Mumbai brand film",
  "category": "cinematography",
  "description": "A warm launch film...",
  "yourRole": "Cinematographer",
  "projectDate": "2024-11-15",
  "driveUrl": "https://drive.google.com/drive/folders/...",
  "showOnProfile": true,
  "assets": [
    { "id": "asset-1", "name": "still.png", "type": "image/png", "size": 245000, "url": "/api/portfolio-assets/asset-1", "uploadedAt": 1700000000000 }
  ],
  "createdAt": 1700000000000,
  "updatedAt": 1700000000000
}
```

## Security Boundaries

| Resource | Client Access | Freelancer Access |
|----------|--------------|-------------------|
| Published gigs | ✅ All | ❌ Only own |
| Paused gigs (connected) | ✅ If booked/messaged | ✅ Own |
| Other freelancer's gigs | ✅ Published only | ❌ 404 |
| Bookings | ✅ Own | ✅ For own gigs |
| Project briefs | ✅ Own | ✅ Attached to own bookings |
| Messages | ✅ Own threads | ✅ Threads for own gigs |
| Portfolio projects | ✅ showOnProfile on booked gigs | ✅ All own |
| Portfolio files | ✅ For showOnProfile projects | ✅ All own |
| Other freelancer's portfolio | ❌ 404 | ❌ 404 |

## Cache & Refresh Strategy

- **Workspace**: Refreshed every 15s, on window focus, and via header refresh button
- **Gig cards**: Filtered locally from workspace (no extra requests)
- **Modals**: Fetch fresh data when opening (e.g., BookingModal gets current bookings)
- **Uploads**: Server streams files from GridFS with range support

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_PORT` / `PORT` | 4000 locally | HTTP server port; Render supplies `PORT` |
| `HOST` | 127.0.0.1 locally, 0.0.0.0 in production | HTTP bind address |
| `MONGODB_URI` | — | Atlas connection string; locally loaded from `atlas-credentials.env` |
| `MONGODB_DNS_SERVERS` | system DNS | Optional DNS resolver list for MongoDB SRV queries |
| `MONGODB_DB_NAME` | `frame` | MongoDB database name |
| `MONGODB_MAX_POOL_SIZE` | `5` | Per-process MongoDB connection pool limit |
| `COOKIE_SECURE` | production default | Set `true` to force Secure cookies |

## Running the Data Flow

```bash
# Development (React on 3000, API on 4000)
npm run dev

# Production build + serve
npm run build
npm run serve

# Run tests
npm test -- --watchAll=false --runInBand  # UI tests
npm run test:api                          # API integration tests
npm run test:api:mongo                    # MongoDB integration (MONGODB_TEST_URI)
npm run lint
```
