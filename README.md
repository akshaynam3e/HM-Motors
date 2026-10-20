# HM Motors — Scooty, Bike & Car Catalogue

A full-stack, source-deliverable website for a vehicle showroom in Bhurkunda, Ramgarh, Jharkhand. It uses server-rendered EJS/HTML, CSS, browser JavaScript, Node.js/Express, and SQLite. It includes a public vehicle catalogue and inquiry flows plus a multi-user owner/admin portal.

## Important launch boundary

This ZIP contains a production-oriented application, not a client-specific live website. The business name HM Motors and Bhurkunda location were supplied. Public phone/email, exact address, map link, domain, vehicle inventory, prices, stock, offers, images, dealership status, service availability, review link, legal identity and policies were not supplied, so the app contains no seeded vehicles, sample offers, fake reviews, fake credentials, or invented contact details. The owner must configure and verify actual information before public launch. Privacy/terms pages are drafts for review, not legal advice or a compliance guarantee. You need a real domain, HTTPS hosting, a persistent data volume and a backup destination.

## Included functionality

The public site provides responsive, server-rendered pages for home, new, second-hand, Scooty/Bike/Car/all-vehicle catalogues, vehicle details, a three-vehicle comparison, an indicative EMI calculator, verified offers, test-ride requests, finance and exchange enquiries, about/contact/directions, FAQs, privacy, terms and disclaimers. Every listing carries a New or Second-hand condition and a Scooty, Bike, or Car category; minimal visible browse controls let customers choose category and condition against actual published data, without a model search or long filter form. Customers can browse without knowing an exact model and send a general enquiry without selecting a vehicle. Older database inventory migrates as New, and CSV rows missing condition import as New. No listing or offer is created automatically; client-provided facts are required. WhatsApp and phone actions are displayed only when the owner configures those details. Service/after-sales details and the public navigation link remain hidden until the owner enables them; the direct route shows a noindex status notice before then. Genuine customer review links are optional and point to an owner-configured review page.

The private admin portal is opened by manually entering `/admin` on the business domain. Public navigation, buttons, page footers and the public route manifest do not link to the portal. The URL being unlinked is not an access control: every admin API is session-authenticated and role-checked. The first owner is provisioned through an interactive server-side CLI command. The owner can issue one-time, 24-hour invitation links for other admins and deactivate/reactivate accounts; the single owner account cannot be deactivated or demoted in the portal. No invitation email provider is configured; the owner copies the invitation link and shares it privately. Admins can change their passwords. The host operator has a separate console-only recovery command.

Inventory supports create/edit, draft/publish, archival, image upload, verified prices, stock/availability, variants, specifications, colours, offers, search, bulk CSV import/export, stale-listing/low-stock alerts, and update timestamps. The `CSV-IMPORT-QUICK-GUIDE.md` explains the importer’s required headers, accepted values and row-level fixes. Leads support status, staff assignment, follow-up dates, internal notes, follow-up activity records, source tracking and CSV export. Test rides remain requests until staff explicitly confirms them. Dashboard counts distinguish recorded enquiries, visits and staff-marked conversions from actual independently verified sales. Lightweight analytics stores event type, page path, optional vehicle ID and timestamp, not names, phone numbers or full referrers.

## Requirements

- Node.js 20.11+ (22 LTS recommended) and npm 10.9.2.
- Termux can run the application if Node and `better-sqlite3` install successfully for that device; the Sharp/libvips image pipeline may not be available on Android. The server now starts without Sharp, but optimized vehicle-image uploads return a clear unavailable message until run on a supported Linux/macOS production host.
- For production: HTTPS termination/reverse proxy, a persistent writable storage volume, encrypted off-host backups, firewall controls and a real business-controlled domain.
- Docker and Compose are optional; a Linux VPS is a practical single-node option.

## Local setup

```bash
cp .env.example .env
openssl rand -hex 32
```

Copy the generated value into `SESSION_SECRET` in `.env`; do not commit `.env` or share the secret. `APP_COOKIE_MODE=local` is for local HTTP only. Then install and start:

```bash
npm ci
npm run check
npm test
npm start
```

The site listens on port 3000 by default. Open `/` for the public website. Initially there are no admin accounts; the `/admin` page explains how to create the owner. In a second terminal, run `npm run create-owner` and follow its prompts. Password keystrokes are hidden. Use an interactive TTY; do not put passwords in shell command arguments, chat, logs or environment files. Then manually visit `http://localhost:3000/admin` and sign in.

For development, `npm run dev` restarts on source changes. Never use live customer information in local development. `storage/` contains the database, sessions and images and must not be committed or copied into the source ZIP.

## HM Motors identity and inventory

The public name defaults to **HM Motors**. The public website presents Scooty, Bike, and Car listings in New and Second-hand condition; each listing must be marked New or Second-hand and Scooty, Bike, or Car in the admin inventory form. No product photos, prices, model facts, contact details or dealership affiliation are prefilled. Existing SQLite databases upgrade in place, preserving owner/admin accounts and customer records; existing vehicles are assigned New unless staff changes them.

The premium navy/cobalt/silver visual direction is an original HM Motors theme with simple category and condition choices with product-card browsing. It does not use Bugatti logos, wordmarks, images or imply any affiliation. The admin inventory form uses a separate condition input (New — first-hand / Second-hand), and extra verified details are entered one per line instead of JSON.

## Owner/admin access

- The owner is the sole `OWNER` role. The database enforces at most one owner.
- The owner can create invitations and revoke pending invites, and deactivate/reactivate admin accounts. Deactivation immediately blocks the account at the next request. The owner cannot be removed from the portal.
- Invitation token is stored as a hash, expires after 24 hours, and is single-use. The owner must privately share the generated link; the system does not email it.
- All state-changing admin requests use CSRF checks. Passwords are bcrypt-hashed, sessions are stored in SQLite, and password changes invalidate prior sessions for that admin.
- If the owner loses access, run `npm run reset-admin-password` on the trusted server console and complete its interactive prompts. It requires current operating-system/server access and invalidates old sessions.

## First owner and production deployment with Docker Compose

1. Provision a business-controlled domain and a Linux host. Configure TLS at a maintained reverse proxy (for example, a separately managed Nginx or Caddy installation). Expose only HTTPS publicly; keep app port 3000 bound to loopback.
2. Clone/extract this source on the host. Create `.env` from `.env.example`, generate a unique `SESSION_SECRET` with `openssl rand -hex 32`, use `APP_COOKIE_MODE=production`, and set `TRUST_PROXY_HOPS` to the actual trusted proxy count only. Do not expose the app directly to the public Internet. The HTTPS reverse proxy must forward the original host/protocol safely.
3. Create the persistent volume with appropriate ownership for the Node container user. On a standard Linux host:

   ```bash
   mkdir -p storage/uploads
   sudo chown -R 1000:1000 storage
   chmod 700 storage
   ```

4. Build and run: `docker compose up -d --build`. Check `docker compose ps` and `curl -f http://127.0.0.1:3000/healthz` from the host.
5. Create the first owner interactively: `docker compose exec -it showroom npm run create-owner`. Do not expose port 3000 through a public firewall rule.
6. Open the real HTTPS domain, manually enter `https://your-domain.example/admin`, sign in, and complete Website settings with facts checked by the client. Upload a licensed showroom photograph and add actual vehicle records. Confirm the actual client has rights to every image/logo/trademark and any dealer-status claims.
7. Set the exact public HTTPS URL in Website settings. This enables canonical URLs and the absolute sitemap. Connect the owner-controlled Google Business Profile and Search Console only after the business identity/address/phone are verified. Review privacy, terms, disclaimers and data-retention policy with qualified counsel before collecting public data.
8. Test enquiries, test-ride staff confirmation, password changes, admin invitations/deactivation, backups and recovery on a non-customer test environment before launch.

`docker-compose.yml` uses a persistent host bind mount, read-only container root, a non-root runtime user, basic health checks and a loopback-only port. The storage folder must remain writable for the database, sessions and uploads. Configure TLS, HSTS policy, firewall, patching, uptime monitoring, alert delivery and off-host backups outside the application. The database and uploaded images are durable only if the mounted volume and its backups are durable.

## Updating from an earlier ZIP

Extract the updated source over the existing application folder without deleting `.env` or `storage/`. Run `npm ci` and restart the server. The SQLite schema migration runs on startup; do not run `npm run create-owner` again if the owner account already exists. Back up the `storage/` folder before any upgrade.

## Preview cookie modes

The cookie mode is an explicit deployment setting, not inferred from `NODE_ENV` or internal request headers:

- `local`: HTTP development, `SameSite=Lax`, non-secure cookie.
- `production`: HTTPS standalone site, `SameSite=Lax`, secure cookie.
- `preview`: HTTPS cross-site embedded Preview, `SameSite=None; Secure`; browser third-party-cookie restrictions may still block the embedded session. The CSP permits same-origin and Manus Preview framing; the response does not send `X-Frame-Options: DENY/SAMEORIGIN`.

Never use `local` on a public production host. Never set `preview` unless the public connection is HTTPS.

## Backup, restore and retention

Run a database-consistent backup and include current uploads:

```bash
npm run backup
```

This creates a `.tar.gz` archive in `./backups/` by default. It excludes sessions and secrets; staff will sign in again after a restore. Encrypt and transfer backups to separate access-controlled storage, define a retention schedule, and periodically test restoration on a separate environment. Do not treat a backup on the same disk as disaster recovery.

To restore: stop the app, copy the intended archive into a secure temporary location, inspect its manifest, extract `showroom.sqlite` and `uploads/` into the configured `STORAGE_DIR`, set correct file ownership/permissions, then restart and test the database plus a published image. Keep an untouched backup before restoration. Do not overwrite an active database.

`npm run purge-closed` performs a dry run for closed enquiries older than the configured retention target. To erase them, take a backup, review the owner's approved retention/legal policy, then run `npm run purge-closed -- --apply`; on production also set `RETENTION_APPROVED=yes` for that command. Only `CLOSED` enquiries are purged by this command. Other statuses are not auto-deleted. An owner can erase an individual enquiry in the admin portal after verifying a privacy request and applicable retention obligations. Review deletion/audit behavior with counsel; legal retention or a hold may override an ordinary deletion request.

## Operations, maintenance and business measurement

A monthly care plan can include a dependency/security update review, backup-success check and restore test, uptime check, link/form check, stale inventory audit, image/storage review, SEO/Search Console summary, and a fixed amount of owner-requested changes. Define hours, response windows, included changes, hosting, backups and third-party fees in the client agreement; do not promise unlimited support. Current analytics measures call/WhatsApp clicks and form/enquiry records. Clicks are not unique callers, conversions are staff-marked statuses, and no website feature guarantees sales or search ranking.

## Known boundaries and costs

The package does not include online payment/reservations, a finance-lender API, automatic WhatsApp/SMS/email sending, multi-branch stock synchronization, manufacturer data integrations, a full CRM, external GA4, or automated legal compliance certification. Adding these requires a separately scoped integration, provider credentials, vendor terms/privacy assessment, consent decisions, implementation and ongoing fees. Hosting/domain, TLS service where paid, backup storage, notification/message provider, and optional maintenance are external costs set by the chosen vendors and client agreement. One-node SQLite is designed for a modest single-showroom operation; horizontal multi-instance hosting requires migration to a managed SQL database, shared session store and object storage.
