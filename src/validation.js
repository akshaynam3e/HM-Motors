const { z } = require('zod');

const trimmed = (max, required = false) => {
  let schema = z.string().trim().max(max);
  return required ? schema.min(1) : schema;
};
const phone = z.string().trim().transform((value) => value.replace(/[\s().-]/g, '')).refine((value) => /^\+?(?:91)?[6-9]\d{9}$/.test(value), 'Enter a valid Indian mobile number.');
const email = z.union([z.literal(''), z.string().trim().email().max(254)]).optional().transform((value) => value || null);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => { const parsed=new Date(`${value}T00:00:00Z`); return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10)===value; }, 'Enter a valid date.');
const safeSlug = (text) => text.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
const enquirySchema = z.object({
  type: z.enum(['GENERAL','TEST_RIDE','FINANCE','EXCHANGE']),
  name: trimmed(120, true), phone, email, vehicleId: z.string().uuid().optional().or(z.literal('')),
  preferredContact: z.enum(['PHONE','WHATSAPP','EMAIL']).default('PHONE'),
  message: trimmed(1500).default(''), consent: z.enum(['on','true','1']).or(z.boolean().refine(Boolean)),
  source: z.string().trim().max(120).optional(), website: z.string().max(500).optional(),
  preferredDate: isoDate.optional(), preferredTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
}).superRefine((enquiry,context)=>{if(enquiry.preferredContact==='EMAIL'&&!enquiry.email)context.addIssue({code:'custom',path:['email'],message:'Enter an email address if you prefer email contact.'});});
const vehicleSchema = z.object({
  category: z.enum(['SCOOTER','MOTORCYCLE','CAR']), condition: z.enum(['NEW','PRE_OWNED']).default('NEW'), brand: trimmed(80, true), model: trimmed(100, true),
  variant: trimmed(100).default(''), slug: z.string().trim().max(100).optional(),
  description: trimmed(2500).default(''), colours: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  specs: z.record(z.string().trim().max(100), z.string().trim().max(200)).default({}),
  imagePath: z.string().regex(/^\/uploads\/[a-f0-9-]+\.(?:jpg|png|webp)$/i).nullable().optional(),
  engineCc: z.coerce.number().int().min(0).max(20000).nullable().optional(),
  exShowroomPrice: z.coerce.number().min(0).max(100000000).nullable().optional(),
  priceVerified: z.coerce.boolean().default(false), availability: z.enum(['ASK','IN_STOCK','LIMITED','OUT_OF_STOCK','DISCONTINUED']).default('ASK'),
  stockQuantity: z.coerce.number().int().min(0).max(10000).nullable().optional(),
  published: z.coerce.boolean().default(false), featured: z.coerce.boolean().default(false),
}).superRefine((vehicle, context) => {
  if (vehicle.priceVerified && (vehicle.exShowroomPrice === undefined || vehicle.exShowroomPrice === null)) context.addIssue({ code:'custom', path:['exShowroomPrice'], message:'Enter the verified listing price before marking it verified.' });
});
const offerSchema = z.object({ title: trimmed(140, true), description: trimmed(2500).default(''), terms: trimmed(2000).default(''), startsAt: z.union([isoDate,z.literal('')]).optional(), endsAt: z.union([isoDate,z.literal('')]).optional(), published: z.coerce.boolean().default(false) }).superRefine((offer,context)=>{if(offer.startsAt&&offer.endsAt&&offer.startsAt>offer.endsAt)context.addIssue({code:'custom',path:['endsAt'],message:'Offer end date must be on or after its start date.'});});
const settingsAllowlist = new Set(['site_name','tagline','public_phone','public_email','whatsapp_number','address_line','locality','district','state','postal_code','map_url','business_hours','public_base_url','service_enabled','service_description','review_url','privacy_contact','retention_days','low_stock_threshold','stale_listing_days','gstin','dealership_statement','legal_business_name','privacy_notice','terms_notice']);
function parseSettings(input) {
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    if (!settingsAllowlist.has(key)) continue;
    if (typeof value !== 'string' && typeof value !== 'boolean') throw new Error(`Invalid setting: ${key}`);
    const str = String(value).trim();
    if (str.length > 3000) throw new Error(`Setting too long: ${key}`);
    if (['public_email','privacy_contact'].includes(key) && str && !z.string().email().safeParse(str).success) throw new Error(`Invalid email: ${key}`);
    if (key === 'public_base_url' && str) {
      let url; try { url = new URL(str); } catch { throw new Error('Enter a valid public website URL.'); }
      if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Public website URL must be a clean HTTPS origin without credentials, path, query or fragment.');
      output[key] = url.origin; continue;
    }
    if (['map_url','review_url'].includes(key) && str && !/^https:\/\//i.test(str)) throw new Error(`${key} must use HTTPS.`);
    output[key] = str;
  }
  return output;
}
function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function safeJson(value) { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026'); }
function parseJson(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }
function csvSafe(value) { const text = String(value ?? ''); return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text; }

module.exports = { trimmed, phone, email, isoDate, safeSlug, enquirySchema, vehicleSchema, offerSchema, parseSettings, escapeHtml, safeJson, parseJson, csvSafe };
