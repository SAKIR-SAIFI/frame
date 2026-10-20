# perfectlens. India — Your vision. The right crew.

A responsive React + Node.js marketplace for India’s cinematographers, camera operators, drone pilots, gimbal operators, photographers, and video editors. Clients and freelancers have separate accounts, sign-in pages, and workspaces.

## Run locally

Use Node.js 24.x.

```sh
npm install
npm run dev
```

This starts the React website at [localhost:3000](http://localhost:3000) and the API at port **4000**. The React development server proxies `/api` requests to the API. The API reads `MONGODB_URI` from `atlas-credentials.env` for local development; alternatively, set `MONGODB_URI` in your shell. Keep the credentials file private and never commit it.

### OpenCode MongoDB MCP

`opencode.json` starts `server/mcp-launcher.js`, which loads the same `MONGODB_URI`, selects the `perfectlens` database, and passes it to the MongoDB MCP server without storing credentials in OpenCode config. Restart OpenCode after changing `opencode.json`.

### Separate account pages

- Clients: `/client/login` and `/client/register`
- Freelancers: `/freelancer/login` and `/freelancer/register`
- Signed-in workspaces: `/client` and `/freelancer`

An email address can have a separate account for each role. Each login checks the requested account type. Indian city aliases such as **Bangalore → Bengaluru** are normalized, and mobile numbers are validated as **+91** numbers.

Country and city pickers load options from the CountriesNow API. The server caches the lists and validates selected cities before saving account, gig, and project locations.

### First run

The `perfectlens` MongoDB database starts empty; no demo accounts or gigs are inserted. Register a freelancer, add availability, and publish the first gig. Register a client account to browse and book gigs. Use separate browser profiles or a private window to sign in as both roles simultaneously.

## Client experience

- Browse every published gig, with India-based names, cities, portfolios, languages, and rates in **₹ INR**.
- Search by skill, project style, kit, or city; filter by specialty, shoot date, maximum day rate, and availability today.
- Save gigs to an account-specific shortlist.
- Set comfortable working hours and browse the intersection of the client’s and freelancer’s schedules.
- Choose a custom start and end time, with a price prorated from an **8-hour day**.
- Post private project briefs with rupee budgets and several alternative call times. Attach a brief to a booking to share it with that freelancer.
- Send private messages, propose a day rate, and accept a rate offered by the other participant.
- Track pending and confirmed bookings or cancel a booking to release the reserved time.

## Freelancer experience

- Create, edit, publish, or pause their own gigs.
- Manage kit, skills, languages, city, remote-work preference, and day rate.
- Use the **Projects** section to add their own portfolio work, upload project files, or attach Google Drive links.
- Set one availability schedule shared by all of their gigs.
- Review, confirm, decline, or cancel booking requests for their own work.
- See only related client conversations and briefs attached to their bookings.

## Contact, queries, and feedback

Use **Contact / feedback** in the footer to send a query, complaint, suggestion, or other message. The server emails submissions to `saifi.sameer.0001@gmail.com` and sets the sender’s address as the reply-to address. The form is available to signed-out visitors as well as signed-in users.

Email delivery uses Gmail SMTP with an App Password for `saifi.sameer.0001@gmail.com` (Google 2-Step Verification must be enabled). Set `GMAIL_APP_PASSWORD` in the local `atlas-credentials.env` file or as a secret environment variable on Render. Do not use or share the account’s regular Gmail password. The contact endpoint validates submissions, filters a honeypot field, and limits repeated requests.

The API enforces role and ownership checks on reads and mutations. A freelancer cannot fetch or edit another freelancer’s gig or portfolio project, view their bookings, or read their conversations. When a gig is paused, it leaves discovery; existing clients can still access their conversation and booking details.

### Freelancer projects and Google Drive

Select **Projects** in the freelancer navigation, or scroll to the Projects section in the workspace.

- **Add project**: enter a title, specialty, project date, your role, and a description. Upload photos, videos, or PDFs, optionally with a Drive link.
- **Add Google Drive link**: create a project entry using a Google Drive file, folder, or Google document share link. No Google API keys or account connection are needed.
- Supported uploads: JPG, PNG, WebP, GIF, AVIF, MP4, WebM, MOV, and PDF. Each project supports up to **8 files**, with **50 MB per file**. Drive links can be used for larger project folders and films.
- Use **Edit project** to update details, replace the Drive link, add files, or remove attachments. File removals are applied when changes are saved.
- **Show this project to clients** controls whether the project appears in the portfolio on your gig profiles. Unchecked projects stay personal to the owner. Other freelancers cannot view or manage your projects or uploaded files.
- Clients can open shared project files and Drive links in a new tab. Google Drive’s own sharing settings determine who can open the linked content.
- Projects can be removed from the portfolio along with their uploaded files. Removing a Drive link does not delete anything from Google Drive.

## Flexible scheduling

All dates and call times use **Indian Standard Time, Asia/Kolkata (UTC +05:30)**, including when a browser is in another time zone.

- Add any start/end time to minute precision, rather than choosing fixed morning/afternoon slots.
- Add multiple windows on a specific date or repeat them on a chosen weekday.
- Specific-date windows replace the weekly schedule for that date.
- Leave client availability empty if any of the freelancer’s open hours work.
- Requested and confirmed bookings block overlapping hours across **all gigs owned by that freelancer**. Adjacent bookings are allowed. Declining or cancelling releases those hours.
- Existing bookings retain their agreed call times when availability is edited.
- For overnight availability, split the hours across two dates.

Workspaces refresh every 15 seconds, when the window regains focus, and through the header’s refresh button. Booking requests are rechecked by the server before they are saved.

## Data and sessions

Accounts, gigs, bookings, project briefs, portfolio projects, messages, agreed rates, and shortlists are stored in MongoDB database **`perfectlens`**. Portfolio uploads are streamed to the `portfolioAssets` GridFS bucket and served through permission-checked, range-capable API routes. The old JSON data file and local uploads are not imported; the MongoDB database begins empty.

Passwords use salted scrypt hashes. Login uses an opaque, HttpOnly, SameSite cookie; only a SHA-256 hash of each session token is stored in MongoDB. Sessions expire after seven days and are shared across server instances.

Chat is between real signed-in accounts; replies are not automated. Portfolio photos come from Unsplash. No payments, SMS, or booking email notifications are sent. Atlas Free clusters have a 0.5 GB total storage limit, including indexes; monitor usage as portfolio files are added.

## Serve the production build

```sh
npm run build
npm start
```

Open [localhost:4000](http://localhost:4000). The Node server serves both the built website and the API, including direct links to login and registration pages.

### Deploy to Render

The repository includes `render.yaml` for a free Render web service. Connect the repository in Render, set `MONGODB_URI` in the service environment (use the Atlas connection string for database `perfectlens`), and deploy. The Blueprint binds to Render's `PORT`, uses `/api/health`, and deploys only after GitHub CI checks pass. Make sure Atlas Network Access allows connections from the Render service.

Render Free services sleep after 15 minutes without incoming traffic and can take about a minute to wake. The service filesystem is ephemeral, so app data and uploads are stored in MongoDB rather than on the Render disk.

Environment settings:

- `MONGODB_URI`: Atlas connection string. Locally, loaded from `atlas-credentials.env`; on Render, set it as a secret.
- `MONGODB_DNS_SERVERS`: optional comma-separated DNS resolver IPs for SRV lookups (for example, `8.8.8.8` if your Windows DNS blocks SRV queries).
- `MONGODB_DB_NAME`: database name, default `perfectlens`.
- `MONGODB_MAX_POOL_SIZE`: per-instance pool size, default `5`.
- `PORT` or `API_PORT`: HTTP port, default `4000` locally; Render provides `PORT`.
- `HOST`: bind address; production defaults to `0.0.0.0`.
- `COOKIE_SECURE=true`: force secure session cookies; enabled in the Render Blueprint.
- `GMAIL_APP_PASSWORD`: Gmail App Password used to send contact-form submissions to `saifi.sameer.0001@gmail.com`.

For separate development terminals, run `npm run start:api` and `npm run start:client`.

## Checks

```sh
npm test -- --watchAll=false --runInBand
npm run test:api
npm run test:api:mongo
npm run lint
npm run build
```

The MongoDB integration test uses `MONGODB_TEST_URI` when set; GitHub Actions provides its own temporary MongoDB service and does not use the production Atlas credentials. API tests verify authentication, role isolation, cross-instance sessions, booking conflict protection, portfolio access, GridFS persistence, and range requests.
