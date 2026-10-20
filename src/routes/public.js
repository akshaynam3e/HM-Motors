const express = require('express');
const { db, getSettings } = require('../db');
const { escapeHtml: e, safeJson, parseJson } = require('../validation');

const router = express.Router();
const sitePaths = [
  ['/', 'Home'], ['/vehicles', 'All vehicles'], ['/new', 'New vehicles'], ['/pre-owned', 'Second-hand vehicles'],
  ['/scooters', 'Scooty'], ['/motorcycles', 'Bike'], ['/cars', 'Cars'],
  ['/compare', 'Compare vehicles'], ['/emi-calculator', 'EMI calculator'], ['/offers', 'Offers'],
  ['/test-ride', 'Test ride or drive'], ['/finance', 'Finance enquiry'], ['/exchange', 'Exchange enquiry'], ['/enquiry', 'Ask HM Motors'],
  ['/about', 'About'], ['/contact', 'Contact'], ['/faq', 'Frequently asked questions'],
  ['/privacy', 'Privacy policy'], ['/terms', 'Terms and conditions'], ['/disclaimer', 'Disclaimers'],
];
const ownerName = (s) => s.site_name || 'HM Motors';
function page(res, s, title, description, content, options = {}) {
  const origin = (s.public_base_url || '').replace(/\/$/, '');
  res.render('page', {
    settings: s, brand: ownerName(s), title: `${title} | ${ownerName(s)}`,
    description, canonical: origin ? `${origin}${options.path || '/'}` : '',
    path: options.path || '/', noindex: Boolean(options.noindex), content,
    keywords: 'HM Motors Bhurkunda, scooters, bikes, cars, new vehicles, second-hand vehicles, Ramgarh',
    jsonLd: options.jsonLd ? safeJson(options.jsonLd) : '',
  });
}
const vehicleName = (v) => [v.brand, v.model, v.variant].filter(Boolean).join(' ');
const categoryName = (category) => ({ SCOOTER: 'Scooty', MOTORCYCLE: 'Bike', CAR: 'Car' }[category] || 'Vehicle');
const conditionName = (v) => v.condition === 'PRE_OWNED' ? 'Second-hand' : 'New';
const vehicleTypeName = (v) => categoryName(v.category).toLowerCase();
const vehicleOptionName = (v) => `${vehicleName(v)} · ${conditionName(v)} ${categoryName(v.category)}`;
const displayPrice = (v) => v.price_verified && v.ex_showroom_price !== null
  ? `<p class="price">₹${Number(v.ex_showroom_price).toLocaleString('en-IN')}</p><p class="fine-print">${v.condition === 'PRE_OWNED' ? 'Asking price' : 'Ex-showroom price'} entered as verified by the showroom. Confirm the final amount before purchase.</p>`
  : '<p class="price">Price: enquire for current details</p>';
function card(v) {
  const name = vehicleName(v);
  const image = v.image_path ? `<img src="${e(v.image_path)}" alt="${e(name)}" loading="lazy" width="720" height="480">` : '<div class="vehicle-image-empty" aria-label="No showroom photograph has been added"><span>Photo not provided</span></div>';
  const availability = { ASK: 'Ask about availability', IN_STOCK: 'In stock — confirm before visiting', LIMITED: 'Limited — confirm before visiting', OUT_OF_STOCK: 'Currently unavailable', DISCONTINUED: 'No longer listed' }[v.availability] || 'Ask about availability';
  return `<article class="vehicle-card">${image}<div class="vehicle-card__body"><p class="eyebrow"><span class="condition-badge">${e(conditionName(v))}</span><span class="category-label">${e(categoryName(v.category))}</span>${v.engine_cc ? `<span>${e(v.engine_cc)} cc</span>` : ''}</p><h2><a href="/vehicles/${encodeURIComponent(v.slug)}">${e(name)}</a></h2>${displayPrice(v)}<p class="availability">${e(availability)}</p><div class="card-actions"><a class="button button--small" href="/vehicles/${encodeURIComponent(v.slug)}">View details</a><a class="button button--outline button--small" href="/enquiry?vehicle=${encodeURIComponent(v.id)}">Ask about this</a><button class="button button--quiet button--small" type="button" data-compare-add="${e(v.slug)}">Compare</button></div></div></article>`;
}
function formMarkup(type, vehicles, selectedId = '') {
  const validSelection = vehicles.some((v) => v.id === selectedId);
  const vehicleOptions = vehicles.map((v) => `<option value="${e(v.id)}" ${validSelection && selectedId === v.id ? 'selected' : ''}>${e(vehicleOptionName(v))}</option>`).join('');
  const isRide = type === 'TEST_RIDE';
  const categoryText = isRide ? 'Vehicle for your test ride or drive' : 'Vehicle of interest (optional)';
  const chooseText = isRide ? 'Choose a published vehicle' : 'I need help choosing — no exact model needed';
  return `<form class="enquiry-form" data-enquiry-form="${e(type)}">
    <div class="field-row"><label>Full name<input name="name" autocomplete="name" maxlength="120" required></label><label>Mobile number<input name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="24" required aria-describedby="phone-help"><small id="phone-help">Indian mobile number</small></label></div>
    <label>Email (optional)<input name="email" type="email" autocomplete="email" maxlength="254"></label>
    <label>${categoryText}<select name="vehicleId" ${isRide ? 'required' : ''}><option value="" ${validSelection ? '' : 'selected'}>${chooseText}</option>${vehicleOptions}</select></label>
    ${isRide ? '<div class="field-row"><label>Preferred date<input name="preferredDate" type="date" min="' + new Date().toISOString().slice(0,10) + '" required></label><label>Preferred time<input name="preferredTime" type="time" required></label></div><p class="fine-print">This is a request only. HM Motors must contact you to confirm the test ride or drive.</p>' : '<p class="fine-print">You can browse and enquire without knowing an exact make or model. Leave this blank and tell us what you need.</p>'}
    <label>How should HM Motors contact you?<select name="preferredContact"><option value="PHONE">Phone call</option><option value="WHATSAPP">WhatsApp</option><option value="EMAIL">Email</option></select></label>
    <label>Message (optional)<textarea name="message" maxlength="1500" rows="4" placeholder="For example, describe how you plan to use the vehicle or your preferred budget."></textarea></label>
    <label class="consent"><input name="consent" type="checkbox" required><span>I agree that the showroom may use these details to respond to this request. Read the <a href="/privacy">privacy notice</a>.</span></label>
    <label class="trap" aria-hidden="true">Leave this field empty<input name="website" tabindex="-1" autocomplete="off"></label>
    <button class="button" type="submit">${isRide ? 'Request a test ride or drive' : 'Send enquiry'}</button><p class="form-status" aria-live="polite"></p>
  </form>`;
}

router.get('/', (req, res) => {
  const s = getSettings();
  const featured = db.prepare("SELECT * FROM vehicles WHERE published=1 AND featured=1 ORDER BY updated_at DESC LIMIT 6").all();
  const activeOffers = db.prepare("SELECT * FROM offers WHERE published=1 AND (starts_at IS NULL OR starts_at='' OR starts_at<=date('now')) AND (ends_at IS NULL OR ends_at='' OR ends_at>=date('now')) ORDER BY created_at DESC LIMIT 3").all();
  const counts = Object.fromEntries(db.prepare('SELECT category,count(*) AS count FROM vehicles WHERE published=1 GROUP BY category').all().map((r) => [r.category, r.count]));
  const categoryCards = [
    { key:'SCOOTER', label:'Scooty', href:'/scooters', note:'Easy everyday rides' },
    { key:'MOTORCYCLE', label:'Bike', href:'/motorcycles', note:'Compare bikes' },
    { key:'CAR', label:'Car', href:'/cars', note:'Find a car' },
  ].map((item, index) => `<a class="shop-category-card" href="${item.href}"><span class="shop-category-card__index">0${index + 1}</span><span class="shop-category-card__count">${Number(counts[item.key] || 0)} listed</span><strong>${item.label}</strong><small>${item.note}</small><span class="shop-category-card__arrow" aria-hidden="true">→</span></a>`).join('');
  const content = `<section class="shop-hero"><div class="shop-hero__copy"><p class="eyebrow">HM MOTORS · BHURKUNDA · RAMGARH</p><h1>Find your next vehicle, without knowing the exact model.</h1><p>Start with Scooty, Bike, or Car. Browse real showroom listings and ask us to help narrow down your options.</p><div class="shop-hero-actions"><a class="button" href="/vehicles">Browse all listings</a><a class="shop-help" href="/enquiry">Help me choose →</a></div></div><div class="shop-hero__side"><span class="shop-hero__mark" aria-hidden="true">HM</span><p>Browse first.<br>Choose with confidence.</p></div></section>
  <section class="shop-section"><div class="section-heading"><div><p class="eyebrow">START HERE</p><h2>Shop by vehicle type</h2><p class="section-lead">Choose a section to see what's listed. No model name required.</p></div><a class="text-link" href="/vehicles">Browse all vehicles →</a></div><div class="shop-category-grid">${categoryCards}</div></section>
  <section class="condition-section"><div><p class="eyebrow">CHOOSE CONDITION</p><h2>New or second-hand?</h2><p>Filter every category by the condition that suits you.</p></div><div class="condition-choice-grid"><a href="/new"><span>01</span><strong>New</strong><small>Browse new listings</small><b aria-hidden="true">→</b></a><a href="/pre-owned"><span>02</span><strong>Second-hand</strong><small>Browse second-hand listings</small><b aria-hidden="true">→</b></a></div></section>
  <section class="content-section"><div class="section-heading"><div><p class="eyebrow">SHOWROOM LISTINGS</p><h2>Featured vehicles</h2></div><a class="text-link" href="/vehicles">See all listings →</a></div>${featured.length ? `<div class="vehicle-grid">${featured.map(card).join('')}</div>` : '<div class="empty-state"><h3>Listings will appear here once published</h3><p>HM Motors has not published inventory yet. We never show sample vehicles or invented prices. Browse a category, or ask us to help you choose.</p><a class="button button--outline" href="/enquiry">Ask HM Motors for help</a></div>'}</section>
  <section class="offers-strip"><div><p class="eyebrow">CURRENT OFFERS</p><h2>Only verified offers are published.</h2></div>${activeOffers.length ? `<ul>${activeOffers.map((o) => `<li><strong>${e(o.title)}</strong><span>${e(o.description || o.terms || 'Ask the showroom for conditions.')}</span></li>`).join('')}</ul>` : '<p>No current offer has been published by the showroom.</p>'}<a class="text-link" href="/offers">View offer details →</a></section>
  <section class="contact-cta"><div><p class="eyebrow">NEED A HAND?</p><h2>Tell us what you need. We’ll help you compare.</h2><p>You can send a general enquiry without choosing a make or model. A test-drive request is only confirmed after staff contact you.</p></div><div class="hero-actions"><a class="button" href="/enquiry">Help me choose</a><a class="button button--outline" href="/contact">Contact HM Motors</a></div></section>`;
  page(res, s, 'Scooty, bikes and cars', 'Browse Scooty, Bike and Car listings at HM Motors in Bhurkunda. Choose a vehicle type and New or Second-hand condition.', content, { path: '/' });
});

function listingRoute(path, fixedCategory, title, defaultCondition='') {
  router.get(path, (req, res) => {
    const s = getSettings();
    const term = (req.query.q || '').toString().trim().slice(0, 80);
    const brand = (req.query.brand || '').toString().trim().slice(0, 80);
    const allowedCategories = ['SCOOTER','MOTORCYCLE','CAR'];
    const requestedCategory = fixedCategory || (req.query.category || '').toString().toUpperCase();
    const selectedCategory = allowedCategories.includes(requestedCategory) ? requestedCategory : '';
    const requestedCondition = defaultCondition || (req.query.condition || '').toString().toUpperCase();
    const condition = ['NEW','PRE_OWNED'].includes(requestedCondition) ? requestedCondition : '';
    const minPrice = Number(req.query.minPrice); const maxPrice = Number(req.query.maxPrice);
    const minCc = Number(req.query.minCc); const maxCc = Number(req.query.maxCc);
    const conditions = ['published=1']; const params = [];
    if (selectedCategory) { conditions.push('category=?'); params.push(selectedCategory); }
    if (condition) { conditions.push('condition=?'); params.push(condition); }
    if (term) { conditions.push('(brand LIKE ? OR model LIKE ? OR variant LIKE ?)'); params.push(`%${term}%`,`%${term}%`,`%${term}%`); }
    if (brand) { conditions.push('brand=?'); params.push(brand); }
    if (Number.isFinite(minPrice) && minPrice > 0) { conditions.push('price_verified=1 AND ex_showroom_price>=?'); params.push(minPrice); }
    if (Number.isFinite(maxPrice) && maxPrice > 0) { conditions.push('price_verified=1 AND ex_showroom_price<=?'); params.push(maxPrice); }
    if (Number.isFinite(minCc) && minCc > 0) { conditions.push('engine_cc>=?'); params.push(minCc); }
    if (Number.isFinite(maxCc) && maxCc > 0) { conditions.push('engine_cc<=?'); params.push(maxCc); }
    const sort = req.query.sort === 'price-low' ? 'ex_showroom_price IS NULL, ex_showroom_price ASC' : req.query.sort === 'price-high' ? 'ex_showroom_price IS NULL, ex_showroom_price DESC' : req.query.sort === 'name' ? 'brand,model,variant' : 'featured DESC, updated_at DESC';
    const total = db.prepare(`SELECT count(*) AS n FROM vehicles WHERE ${conditions.join(' AND ')}`).get(...params).n;
    const pageSize = 24; const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(pageCount, 1000, Math.max(1, parseInt(req.query.page, 10) || 1));
    const vehicles = db.prepare(`SELECT * FROM vehicles WHERE ${conditions.join(' AND ')} ORDER BY ${sort} LIMIT ? OFFSET ?`).all(...params, pageSize, (currentPage - 1) * pageSize);
    const catalogUrl = (targetPath, targetCategory='', targetCondition='') => {
      const query = new URLSearchParams();
      if (targetCategory && ['/vehicles','/new','/pre-owned'].includes(targetPath)) query.set('category', targetCategory);
      if (targetCondition && !['/new','/pre-owned'].includes(targetPath)) query.set('condition', targetCondition);
      const search = query.toString(); return `${targetPath}${search ? `?${search}` : ''}`;
    };
    const categoryLinks = [
      { label:'All', key:'', path:'/vehicles' },
      { label:'Scooty', key:'SCOOTER', path:'/scooters' },
      { label:'Bike', key:'MOTORCYCLE', path:'/motorcycles' },
      { label:'Car', key:'CAR', path:'/cars' },
    ].map((item) => `<a class="filter-pill ${selectedCategory === item.key ? 'is-active' : ''}" href="${e(catalogUrl(item.path, item.key, condition))}" ${selectedCategory === item.key ? 'aria-current="page"' : ''}>${item.label}</a>`).join('');
    const conditionLinks = [
      { label:'All conditions', key:'', path:'/vehicles' },
      { label:'New', key:'NEW', path:'/new' },
      { label:'Second-hand', key:'PRE_OWNED', path:'/pre-owned' },
    ].map((item) => `<a class="filter-pill ${condition === item.key ? 'is-active' : ''}" href="${e(catalogUrl(item.path, selectedCategory, item.key))}" ${condition === item.key ? 'aria-current="page"' : ''}>${item.label}</a>`).join('');
    const filters = `<section class="catalogue-controls" aria-label="Browse listings"><div class="browse-filter-block"><p class="filter-heading">Vehicle type</p><nav class="filter-pills" aria-label="Choose vehicle type">${categoryLinks}</nav></div><div class="browse-filter-block"><p class="filter-heading">Condition</p><nav class="filter-pills" aria-label="Choose New or Second-hand">${conditionLinks}</nav></div></section>`;
    const query = new URLSearchParams(req.query); query.delete('page');
    const pagination = pageCount > 1 ? `<nav class="pagination" aria-label="Vehicle catalogue pages">${currentPage>1?`<a class="button button--outline button--small" href="${e(path)}?${e(new URLSearchParams({...Object.fromEntries(query),page:String(currentPage-1)}).toString())}">Previous</a>`:''}<span>Page ${currentPage} of ${pageCount} · ${total} listings</span>${currentPage<Math.min(pageCount,1000)?`<a class="button button--outline button--small" href="${e(path)}?${e(new URLSearchParams({...Object.fromEntries(query),page:String(currentPage+1)}).toString())}">Next</a>`:''}</nav>` : '';
    const heading = `<section class="page-intro"><p class="eyebrow">HM MOTORS CATALOGUE</p><h1>${e(title)}</h1><p>Browse actual showroom listings by type and condition. No model search needed. Prices, details and availability must be confirmed before travelling.</p></section>`;
    const summary = `<div class="results-summary" role="status">${vehicles.length} of ${total} ${total===1?'listing':'listings'} shown${selectedCategory ? ` · ${e(categoryName(selectedCategory))}` : ''}${condition ? ` · ${e(conditionName({condition}))}` : ''}</div>`;
    const empty = `<div class="empty-state"><h2>No published listings match these filters</h2><p>Try another category or condition, clear the filters, or ask HM Motors to help you find a suitable option.</p><a class="button button--outline" href="/enquiry">Help me choose</a></div>`;
    const content = `${heading}${filters}${summary}${vehicles.length ? `${pagination}<div class="vehicle-grid">${vehicles.map(card).join('')}</div>${pagination}` : empty}`;
    page(res, s, title, `Browse ${title.toLowerCase()} at HM Motors, Bhurkunda. View Scooty, bikes and cars and filter by new or second-hand condition.`, content, { path });
  });
}
listingRoute('/vehicles', null, 'All vehicles');
listingRoute('/new', null, 'New vehicles', 'NEW');
listingRoute('/pre-owned', null, 'Second-hand vehicles', 'PRE_OWNED');
listingRoute('/scooters', 'SCOOTER', 'Scooty');
listingRoute('/motorcycles', 'MOTORCYCLE', 'Bike');
listingRoute('/cars', 'CAR', 'Cars');

router.get('/vehicles/:slug', (req, res, next) => {
  const s = getSettings();
  const v = db.prepare('SELECT * FROM vehicles WHERE slug=? AND published=1').get(req.params.slug);
  if (!v) return next();
  const name = vehicleName(v); const specs = parseJson(v.specs_json, {}); const colours = parseJson(v.colours_json, []);
  const image = v.image_path ? `<img class="vehicle-detail-image" src="${e(v.image_path)}" alt="${e(name)}" width="960" height="640">` : '<div class="vehicle-image-empty vehicle-image-empty--large">No showroom photograph has been provided for this listing.</div>';
  const stock = { ASK:'Ask the showroom to confirm availability', IN_STOCK:'Listed in stock; confirm before visiting', LIMITED:'Limited availability; confirm before visiting', OUT_OF_STOCK:'Currently unavailable', DISCONTINUED:'This model is no longer listed' }[v.availability] || 'Availability not confirmed';
  const specRows = Object.entries(specs).map(([k, val]) => `<tr><th scope="row">${e(k)}</th><td>${e(val)}</td></tr>`).join('');
  const content = `<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/vehicles">Vehicles</a><span aria-hidden="true">/</span><span>${e(name)}</span></nav><section class="vehicle-detail"><div>${image}</div><div class="vehicle-detail__copy"><p class="eyebrow"><span class="condition-badge">${e(conditionName(v))}</span> · ${e(categoryName(v.category))}${v.engine_cc?` · ${e(v.engine_cc)} cc`:''}</p><h1>${e(name)}</h1>${v.description?`<p>${e(v.description)}</p>`:''}<p class="availability">${e(stock)}</p>${displayPrice(v)}<p class="fine-print">Prices and stock are subject to showroom confirmation. On-road amounts may include additional charges.</p>${colours.length?`<h2>Listed colours</h2><ul class="chip-list">${colours.map((c)=>`<li>${e(c)}</li>`).join('')}</ul>`:''}<div class="hero-actions"><a class="button" href="/test-ride?vehicle=${encodeURIComponent(v.id)}">Request a test ride or drive</a><button class="button button--outline" type="button" data-compare-add="${e(v.slug)}">Add to compare</button></div>${s.whatsapp_number?`<a class="whatsapp-link" data-track="whatsapp_click" data-vehicle="${e(v.id)}" href="https://wa.me/${e(s.whatsapp_number.replace(/\D/g,''))}?text=${encodeURIComponent(`Hello, I would like to ask about ${name}. Please confirm the current price and availability.`)}" target="_blank" rel="noopener noreferrer">Ask about this vehicle on WhatsApp</a>`:''}</div></section>${specRows?`<section class="content-section"><p class="eyebrow">CONFIRMED DETAILS</p><h2>Specifications provided by the showroom</h2><div class="table-wrap"><table class="spec-table"><tbody>${specRows}</tbody></table></div><p class="fine-print">Specifications shown are entered by the showroom. Confirm critical details before purchase.</p></section>`:''}<section class="content-section"><p class="eyebrow">ASK A QUESTION</p><h2>Check price or availability</h2>${formMarkup('GENERAL', [v], v.id)}</section>`;
  const origin = (s.public_base_url || '').replace(/\/$/, '');
  const schemaAvailability={IN_STOCK:'InStock',LIMITED:'LimitedAvailability',OUT_OF_STOCK:'OutOfStock',DISCONTINUED:'Discontinued'}[v.availability];
  const jsonLd = origin ? { '@context':'https://schema.org','@type':'Product',name,category:`${conditionName(v)} ${categoryName(v.category)}`,description:v.description || undefined,brand:{'@type':'Brand',name:v.brand},image:v.image_path ? `${origin}${v.image_path}` : undefined,offers:v.price_verified && v.ex_showroom_price>0 && schemaAvailability ? {'@type':'Offer',price:v.ex_showroom_price,priceCurrency:'INR',availability:`https://schema.org/${schemaAvailability}`,url:`${origin}/vehicles/${v.slug}`} : undefined } : null;
  page(res, s, name, `${name}: view showroom-provided specifications and ask about current price or availability.`, content, { path:`/vehicles/${v.slug}`, jsonLd });
});

router.get('/compare', (req, res) => page(res, getSettings(), 'Compare vehicles', 'Compare up to three showroom-listed vehicles using information supplied by the showroom.', `<section class="page-intro"><p class="eyebrow">MAKE AN INFORMED CHOICE</p><h1>Compare listed vehicles</h1><p>Select up to three vehicles from the catalogue. Only information supplied by the showroom is shown.</p></section><div id="compare-content" class="compare-content" aria-live="polite"><p class="empty-state">No vehicles selected for comparison.</p><a class="button" href="/vehicles">Browse vehicles</a></div>`, { path:'/compare' }));

router.get('/emi-calculator', (req, res) => page(res, getSettings(), 'Indicative EMI calculator', 'Estimate a monthly loan payment from an example amount, interest rate, and tenure. This is not a finance offer.', `<section class="page-intro"><p class="eyebrow">ESTIMATE ONLY</p><h1>Indicative EMI calculator</h1><p>Use a price confirmed by the showroom and terms provided by a lender. The estimate excludes fees and is not a loan offer or approval.</p></section><form id="emi-form" class="calculator-form"><label>Vehicle price (₹)<input name="price" type="number" min="1" max="100000000" step="1000" required></label><label>Down payment (₹)<input name="downPayment" type="number" min="0" max="100000000" step="1000" value="0" required></label><label>Annual interest rate (%)<input name="rate" type="number" min="0" max="60" step="0.01" value="12" required></label><label>Loan tenure (months)<input name="months" type="number" min="1" max="120" value="36" required></label><button class="button" type="submit">Calculate estimate</button></form><div id="emi-result" class="calculator-result" aria-live="polite"></div><p class="fine-print">Actual lender terms, eligibility, processing fees, insurance, taxes and other charges may change the amount payable. Verify all figures with the lender.</p>`, { path:'/emi-calculator' }));

router.get('/offers', (req, res) => {
  const offers = db.prepare("SELECT * FROM offers WHERE published=1 AND (starts_at IS NULL OR starts_at='' OR starts_at<=date('now')) AND (ends_at IS NULL OR ends_at='' OR ends_at>=date('now')) ORDER BY created_at DESC").all();
  const content = `<section class="page-intro"><p class="eyebrow">OFFERS & ANNOUNCEMENTS</p><h1>Current showroom offers</h1><p>Conditions, eligibility and dates are set by the showroom. Confirm the complete terms before relying on an offer.</p></section>${offers.length?`<div class="offer-list">${offers.map((o)=>`<article class="offer-card"><p class="eyebrow">${o.starts_at?`From ${e(o.starts_at)}`:'Current listing'}${o.ends_at?` · Until ${e(o.ends_at)}`:''}</p><h2>${e(o.title)}</h2><p>${e(o.description)}</p>${o.terms?`<p class="fine-print"><strong>Conditions:</strong> ${e(o.terms)}</p>`:''}<a class="text-link" href="/contact">Ask the showroom about this offer →</a></article>`).join('')}</div>`:'<div class="empty-state"><h2>No current offer has been published</h2><p>Offers appear here only after showroom staff verify and publish them.</p><a class="text-link" href="/contact">Contact the showroom →</a></div>'}`;
  page(res, getSettings(), 'Offers and announcements', 'View offers and announcements published by the showroom with dates and conditions.', content, { path:'/offers' });
});

const publishedVehicles = () => db.prepare('SELECT id,brand,model,variant,condition,category FROM vehicles WHERE published=1 ORDER BY brand,model').all();
router.get('/test-ride', (req, res) => {
  const vehicles = publishedVehicles(); const selected = (req.query.vehicle || '').toString();
  const body = vehicles.length ? formMarkup('TEST_RIDE', vehicles, selected) : '<div class="empty-state"><h2>Test-ride requests are not available yet</h2><p>The showroom must publish vehicles before customers can request a ride. No ride is booked by this page; staff must confirm each request.</p></div>';
  page(res, getSettings(), 'Request a test ride or drive', 'Request a preferred test-drive time. The showroom must review and confirm the request.', `<section class="page-intro"><p class="eyebrow">A REQUEST, NOT A CONFIRMATION</p><h1>Request a test ride or drive</h1><p>Choose a vehicle and preferred time. The showroom will contact you to confirm, subject to availability and its requirements.</p></section>${body}`, { path:'/test-ride' });
});
router.get('/finance', (req, res) => {
  const vehicles = publishedVehicles();
  page(res, getSettings(), 'Finance enquiry', 'Ask the showroom about finance assistance. Loan approval and terms are determined by the lender.', `<section class="page-intro"><p class="eyebrow">FINANCE ENQUIRY</p><h1>Ask about finance assistance</h1><p>You can ask without selecting a make or model. Submitting this form is not a loan application or approval. Any finance options and charges must be confirmed by the lender and showroom.</p></section>${formMarkup('FINANCE', vehicles, (req.query.vehicle || '').toString())}`, { path:'/finance' });
});
router.get('/exchange', (req, res) => page(res, getSettings(), 'Exchange enquiry', 'Ask the showroom whether an exchange option is available. Any valuation is subject to inspection and confirmation.', `<section class="page-intro"><p class="eyebrow">EXCHANGE ENQUIRY</p><h1>Ask about vehicle exchange</h1><p>You can enquire without choosing your next vehicle. Availability and valuation depend on the showroom's current policy and vehicle inspection. No exchange value is guaranteed.</p></section>${formMarkup('EXCHANGE', publishedVehicles())}`, { path:'/exchange' }));
router.get('/enquiry', (req, res) => page(res, getSettings(), 'Vehicle enquiry', 'Send a question about a showroom-listed vehicle.', `<section class="page-intro"><p class="eyebrow">VEHICLE ENQUIRY</p><h1>Ask HM Motors a question</h1><p>Not sure which make or model you need? Leave the vehicle blank and tell us what you're looking for. A member of staff will help you compare.</p></section>${formMarkup('GENERAL', publishedVehicles(), (req.query.vehicle || '').toString())}`, { path:'/enquiry' }));
router.get('/service', (req, res) => {
  const s = getSettings(); const enabled=s.service_enabled==='true';
  const details = enabled ? (s.service_description ? `<p>${e(s.service_description)}</p>` : '<p>Contact HM Motors to confirm current service and spare-parts availability.</p>') : '<p>HM Motors has not enabled service or after-sales information on this website. Contact the showroom to confirm what support is available.</p>';
  page(res, s, 'Service and after-sales', 'Service and after-sales information provided by HM Motors when configured.', `<section class="page-intro"><p class="eyebrow">AFTER-SALES</p><h1>Service and support</h1>${details}</section><a class="button" href="/contact">Contact HM Motors</a>`, { path:'/service', noindex:!enabled });
});
router.get('/about', (req, res) => {
  const s = getSettings(); const statement = s.dealership_statement ? `<p>${e(s.dealership_statement)}</p>` : '<p>Information about the showroom, brands sold, and any dealership authorisation will be published here after it is verified by the business owner.</p>';
  page(res, s, 'About the showroom', 'Learn about HM Motors, the vehicle showroom in Bhurkunda, Ramgarh, Jharkhand.', `<section class="page-intro"><p class="eyebrow">ABOUT</p><h1>${e(s.site_name || 'About the showroom')}</h1>${s.tagline?`<p class="lead">${e(s.tagline)}</p>`:''}${statement}</section><p class="fine-print">No manufacturer relationship or dealer authorisation is implied unless the showroom confirms it and has permission to state it.</p>`, { path:'/about' });
});
router.get('/contact', (req, res) => {
  const s = getSettings(); const address = [s.address_line,s.locality,s.district,s.state,s.postal_code].filter(Boolean).join(', ');
  const details = [s.public_phone?`<p><strong>Phone:</strong> <a href="tel:${e(s.public_phone.replace(/[^+\d]/g,''))}" data-track="call_click">${e(s.public_phone)}</a></p>`:'',s.public_email?`<p><strong>Email:</strong> <a href="mailto:${e(s.public_email)}">${e(s.public_email)}</a></p>`:'',address?`<p><strong>Address:</strong> ${e(address)}</p>`:'',s.business_hours?`<p><strong>Business hours:</strong> ${e(s.business_hours)}</p>`:'',s.map_url?`<p><a class="button button--outline" href="${e(s.map_url)}" target="_blank" rel="noopener noreferrer">Open directions</a></p>`:'',s.whatsapp_number?`<p><a class="whatsapp-link" data-track="whatsapp_click" href="https://wa.me/${e(s.whatsapp_number.replace(/\D/g,''))}?text=${encodeURIComponent('Hello, I would like to ask about vehicle options at HM Motors in Bhurkunda.') }" target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a></p>`:''].filter(Boolean).join('');
  const message = details || '<div class="empty-state"><h2>Showroom contact details are being configured</h2><p>The business owner has not yet added a verified phone number, email, address, hours, or map link. Please check back after setup is complete.</p></div>';
  page(res, s, 'Contact and directions', 'Find verified showroom contact details and directions in Bhurkunda, Ramgarh.', `<section class="page-intro"><p class="eyebrow">VISIT OR GET IN TOUCH</p><h1>Contact &amp; directions</h1><p>Confirm vehicle availability and showroom hours before travelling.</p></section><div class="contact-details">${message}</div>${s.review_url?`<section class="review-panel"><h2>Share an honest review</h2><p>Only customers who have visited should leave a review. Reviews are voluntary and should reflect their genuine experience.</p><a class="text-link" href="${e(s.review_url)}" target="_blank" rel="noopener noreferrer">Open review page →</a></section>`:''}`, { path:'/contact' });
});
router.get('/faq', (req, res) => page(res, getSettings(), 'Frequently asked questions', 'Answers about vehicle listings, prices, test rides, finance and showroom enquiries.', `<section class="page-intro"><p class="eyebrow">HELPFUL DETAILS</p><h1>Frequently asked questions</h1></section><div class="faq-list"><details><summary>Can I ask for help without knowing the exact model?</summary><p>Yes. Browse Scooty, Bike, and Car sections, use the New or Second-hand filter, or send a general enquiry with the vehicle left blank. HM Motors can help you compare published options.</p></details><details><summary>Are listed prices on-road prices?</summary><p>Only prices explicitly marked as verified are displayed. A listed ex-showroom price is not an on-road price. Ask the showroom for a location-specific estimate and charges.</p></details><details><summary>Is a test ride confirmed when I submit the form?</summary><p>No. A request is only a preferred time. Showroom staff must contact you to confirm.</p></details><details><summary>Does the EMI calculator show a loan offer?</summary><p>No. It is a mathematical estimate only. Lender approval, interest, fees and other terms must be confirmed with the lender.</p></details><details><summary>Is every listed vehicle in stock?</summary><p>Availability can change. Contact the showroom before travelling to confirm current stock.</p></details><details><summary>What kinds of vehicles can I browse?</summary><p>Published Scooty, Bike, and Car listings appear in their own sections. Use the New or Second-hand filters to narrow the options. Only vehicles entered and published by HM Motors are displayed.</p></details><details><summary>Can I enquire about finance or exchange?</summary><p>You can send an enquiry. The showroom will confirm what assistance is available; lender and valuation decisions are not guaranteed.</p></details></div>`, { path:'/faq' }));
router.get('/privacy', (req, res) => {
  const s=getSettings(); const retention=Number(s.retention_days)||180;
  page(res,s,'Privacy notice','A plain-language notice describing the information collected when a customer sends an enquiry.',`<section class="page-intro"><p class="eyebrow">PRIVACY</p><h1>Privacy notice</h1><p>This draft notice must be reviewed and approved by the showroom and a qualified Indian privacy lawyer before launch.</p>${s.legal_business_name?`<p><strong>Business identity:</strong> ${e(s.legal_business_name)}</p>`:''}</section><section class="legal-copy"><h2>Information collected</h2><p>When you submit an enquiry, the website asks for your name, phone number, optional email, the vehicle or enquiry category, preferred contact method, optional message, and your acknowledgement that the showroom may respond.</p><h2>Purpose and access</h2><p>The information is used to review and respond to your request, arrange a requested test ride if the showroom confirms it, and record staff follow-up. Authorized showroom staff may access the enquiry data. Do not submit sensitive financial or identity documents through this form.</p><h2>Retention and requests</h2><p>The current configured retention target is ${e(retention)} days, subject to legal, accounting, dispute, and operational requirements. To ask about access, correction, deletion, or a privacy concern, contact ${s.privacy_contact?`<a href="mailto:${e(s.privacy_contact)}">${e(s.privacy_contact)}</a>`:'the showroom using its verified contact details'}.</p><h2>Security and third parties</h2><p>The site uses reasonable technical and organizational measures. No website can promise absolute security. Hosting, messaging links, mapping links, and other services may process information under their own terms. WhatsApp is opened only when you choose the link; the website does not send promotional messages on your behalf.</p><h2>Children and changes</h2><p>This website is intended for people able to make a vehicle enquiry under applicable law. The showroom should add its verified legal identity, grievance contact, applicable legal basis, retention schedule, and effective date after legal review.</p>${s.privacy_notice?`<h2>Additional owner-approved notice</h2><p>${e(s.privacy_notice).replace(/\n/g,'<br>')}</p>`:''}</section>`,{path:'/privacy'});
});
router.get('/terms', (req, res) => { const s=getSettings(); page(res,s,'Terms and conditions','Terms for using the showroom information and enquiry website.',`<section class="page-intro"><p class="eyebrow">WEBSITE TERMS</p><h1>Terms and conditions</h1><p>This draft is not legal advice and must be reviewed by the showroom and a qualified lawyer before launch.</p>${s.legal_business_name?`<p><strong>Business identity:</strong> ${e(s.legal_business_name)}</p>`:''}</section><section class="legal-copy"><h2>Information and availability</h2><p>Vehicle specifications, colours, prices, inventory and offers are supplied by showroom staff and may change. Contact the showroom to confirm the current details before making a decision.</p><h2>Enquiries and test rides</h2><p>Submitting a form does not create a sale, finance approval, reservation or confirmed test ride. Staff must contact you to confirm availability and next steps.</p><h2>Third-party services and intellectual property</h2><p>External map, messaging, finance or review services are subject to their own terms. The showroom must hold permission to use every image, name, logo and trademark on this site.</p><h2>Business identity</h2><p>The owner must insert and verify the legal business identity, applicable tax disclosures and contact information before publication. Nothing here represents that the showroom is an authorized dealer unless confirmed.</p>${s.terms_notice?`<h2>Additional owner-approved terms</h2><p>${e(s.terms_notice).replace(/\n/g,'<br>')}</p>`:''}</section>`,{path:'/terms'}); });
router.get('/disclaimer', (req, res) => page(res,getSettings(),'Important disclaimers','Important notes on prices, vehicle details, finance estimates, offers and test-ride requests.',`<section class="page-intro"><p class="eyebrow">IMPORTANT INFORMATION</p><h1>Disclaimers</h1></section><section class="legal-copy"><h2>Prices and stock</h2><p>Prices identified as verified are entered by the showroom and should be reconfirmed. Unless explicitly stated otherwise, price is not an on-road quote. Stock status is indicative and can change.</p><h2>Vehicle information</h2><p>Specifications, mileage, features, colours and images must be confirmed against appropriate manufacturer materials and the actual vehicle. This website does not independently verify them.</p><h2>Finance estimates</h2><p>The EMI calculator uses a standard amortization calculation based on user inputs. It is not a credit decision, finance offer or guarantee. Lender terms and charges control.</p><h2>Offers and authorisation</h2><p>Offers are subject to posted terms, dates, eligibility and availability. Do not rely on a manufacturer affiliation or dealer authorization unless the showroom has verified permission to claim it.</p><h2>Test rides</h2><p>A submitted preferred date and time is a request. It is not a confirmed booking until showroom staff confirm it.</p></section>`,{path:'/disclaimer'}));

router.get('/robots.txt',(req,res)=>{
  const s=getSettings(); let text='User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /storage/\n';
  if(s.public_base_url) text+=`Sitemap: ${s.public_base_url.replace(/\/$/,'')}/sitemap.xml\n`;
  res.type('text/plain').send(text);
});
router.get('/sitemap.xml',(req,res)=>{
  const s=getSettings(); const origin=(s.public_base_url||'').replace(/\/$/,'');
  if(!origin) return res.status(503).type('text/plain').send('Sitemap is available after the owner configures the canonical HTTPS website URL.');
  const entries=[...sitePaths.filter(([p])=>p!=='/service'),... (s.service_enabled==='true'?[['/service','Service']]:[])].map(([p])=>`${origin}${p}`);
  const slugs=db.prepare('SELECT slug FROM vehicles WHERE published=1 ORDER BY slug').all();
  for(const row of slugs) entries.push(`${origin}/vehicles/${encodeURIComponent(row.slug)}`);
  const body='<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+entries.map((url)=>`<url><loc>${e(url)}</loc></url>`).join('')+'</urlset>';
  res.type('application/xml').send(body);
});

module.exports = router;
