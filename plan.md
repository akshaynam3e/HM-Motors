# Implementation Plan — HM Motors vehicle marketplace

## Scope and decisions

Revise the existing source-deliverable Node.js/Express/EJS application for HM Motors, the Bhurkunda showroom. Public discovery covers **Scooty, Bike, and Car**, with **New** and **Second-hand** inventory. Keep the shopper interface minimal and marketplace-like: browse real listings by vehicle type and condition, with no required model entry and no long stack of filter fields. Do not show public make/model search, numeric range inputs, or an expanded advanced-filter form. Exact vehicle details appear only on an individual listing; enquiry vehicle selection remains optional except for a test-ride request. Preserve backend compatibility for existing query parameters without exposing them in the ordinary browse UI. This is a browse-and-enquire catalogue, not online checkout.

For existing APIs and databases, keep stored vehicle categories `SCOOTER`, `MOTORCYCLE`, and add `CAR`; map those to the customer-facing labels **Scooty**, **Bike**, and **Car**. Keep stored conditions `NEW` and `PRE_OWNED`, display the latter as **Second-hand**, and expose clear Admin inputs for Category and Condition. Preserve old `/pre-owned`, `/scooters`, and `/motorcycles` routes and existing stored records. Migrate older SQLite table constraints safely so Car records are accepted while preserving vehicles, enquiries, analytics references, owner/admin accounts, and lead history. Legacy two-wheelers and CSV rows without a condition remain New by default.

Customers can browse published inventory using only clear vehicle-type and New/Second-hand choices, then scan actual product cards. General, finance, and exchange forms make vehicle choice optional and say staff can help customers choose. Test-ride requests still require an actual listed vehicle and an available date/time. No sample listings, invented prices, offers, brands, vehicle facts, or availability are added.

Keep the existing secure manually entered `/admin` route, one owner and multiple-admin roles, inventory/offer management, enquiries, test rides, analytics, privacy tools, and deployment documentation. The user requests a complete fresh ZIP, not public deployment.

## Architecture and project structure

- `server.js`: Express security boundary, sessions/CSRF, route mounting, static assets, health endpoint, graceful shutdown.
- `src/db.js`: SQLite schema and forward migrations; safely expand the category check constraint to include `CAR`, retaining foreign-key integrity and preserving all existing records.
- `src/validation.js`: controlled category and condition enums plus existing form/CSV/security schemas.
- `src/routes/public.js`: server-rendered category pages, minimal customer-facing type/condition filters, product cards/detail pages, optional vehicle-interest forms, sitemap, and robots behavior.
- `src/routes/api-public.js`: public enquiry, test-ride, analytics, and compare APIs; accept category-car listings and keep non-test-ride vehicle choice optional.
- `src/routes/api-admin.js`: role-protected inventory/offer/CSV/lead/test-ride/settings/admin/audit/image operations; preserve new category/condition values in all reads and writes.
- `views/page.ejs`: simplified public navigation for Scooty, Bike, Car, New, Second-hand, and browse/help; never link to `/admin` publicly.
- `views/admin.ejs`, `public/js/admin.js`: understandable category and first-/second-hand controls, readable labels, and clear inventory editing.
- `public/css/site.css`: premium navy/cobalt/silver design with familiar retail browsing hierarchy, readable mobile cards, filter chips, and reduced-motion support.
- `public/js/site.js`: enquiry forms, category/condition browsing, comparison, and event tracking.
- `public/manus-routes.json`: synchronized public route declaration, with car route and no admin/API routes.
- `test/`: schema/input validation and migration tests covering an existing database with vehicle records and enquiry foreign keys.
- `README.md`, `CLIENT-HANDOFF.md`, `LEGAL-REVIEW.md`, Docker/Compose, `.env.example`: operations, data backup, setup, and transparent limits.
- `storage/`: durable private database/session/upload directory; ZIP includes only `.gitkeep`.

## Security and operational decisions

Use parameterized SQL, strict validation, EJS output escaping, bcrypt password hashes, regenerated sessions, server-side role checks, one-time CLI owner bootstrap, CSRF protection, login throttling, secure cookies, safe image uploads, audit history, retention and backup guidance. Run the category migration with foreign-key checks and verify existing vehicle/customer references survive. Do not seed credentials, products, customer records, offers, photos, or fake claims. Public enquiry vehicle choice stays optional except for test rides. Show only owner-verified details. Do not add payment, online reservation, loan approval, or claim guaranteed sales.

## Design

Chosen direction: **premium automotive retail with familiar marketplace usability**—a distinct HM Motors theme, informed by the user's request for a Flipkart-like browse flow, without reproducing another retailer's branding or visual assets.

- **Design Movement:** Premium mobility commerce with a clean catalogue hierarchy.
- **Core Principles:** browse before naming; simple category-first navigation; honest New/Second-hand labels; low-friction customer enquiry.
- **Color Philosophy:** retain the midnight navy, cobalt action color, and cool metallic silver; use high-contrast light catalogue surfaces so listings are easy to scan.
- **Layout Paradigm:** home opens with a direct browse action and three category cards (Scooty, Bike, Car), then New/Second-hand choices and actual inventory cards; catalogue pages use only compact type/condition chips; mobile uses stacked cards and large tap targets.
- **Signature Elements:** cobalt category/filter pills; high-contrast condition badges; compact product cards with clear image, model, price status, and availability.
- **Interaction Philosophy:** customers can browse with a couple of category/condition taps, without typing a model; select “help me choose” whenever they want staff assistance. Selecting a specific product is required only to request a test ride.
- **Animation:** short restrained transitions, no parallax, and honor `prefers-reduced-motion`.
- **Typography System:** clear sans-serif for catalog readability, monospaced metadata for prices/specification labels, large but restrained headlines.
- **Brand Essence:** a transparent, premium local place to compare verified vehicle listings; **clear, helpful, considered**.
- **Brand Voice:** direct, welcoming, factual. Example lines: “Choose a category. Browse what’s available.” “Not sure about the model? Tell us what you need and we’ll help.”
- **Wordmark & Logo:** use HM Motors' existing original HM monogram and wordmark; do not add third-party marks.
- **Signature Brand Color:** cobalt blue for selected categories, filter state, and primary actions.

## Build and delivery

Keep the existing locked Node manifest, tests, security controls, and Docker/Compose deployment. Refresh the ZIP after implementation; exclude `node_modules`, `.env`, SQLite data, sessions, uploads, backups, and customer records. Verify schema migration, public catalogue/category routes, admin condition/category controls, optional-model enquiry flow, route manifest, and clean archive installation. The owner still must enter real contact details, verified inventory, domain, and HTTPS production hosting before public launch.
