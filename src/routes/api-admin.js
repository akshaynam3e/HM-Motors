const express = require('express');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');
let sharp;
function getSharp() { if (sharp !== undefined) return sharp; try { sharp=require('sharp'); } catch { sharp=null; } return sharp; }
function sharpUnavailable(error) { const code=error?.code||''; return ['MODULE_NOT_FOUND','ERR_MODULE_NOT_FOUND','ERR_DLOPEN_FAILED','ERR_LOAD_NATIVE','ERR_GLIBC_VERSION_NOT_FOUND'].includes(code) || /(?:sharp|libvips).*(?:binding|module|library|shared object|undefined symbol)|(?:cannot open shared object|undefined symbol).*(?:vips|sharp)|unsupported.*(?:runtime|architecture|platform)/i.test(String(error?.message||'')); }
const { rateLimit } = require('express-rate-limit');
const { parse: parseCsv } = require('csv-parse/sync');
const { db, storageDir, now, getSettings, setSettings, audit } = require('../db');
const { requireAdmin, requireOwner, requireCsrf, hashPassword, verifyPassword } = require('../auth');
const { vehicleSchema, offerSchema, safeSlug, parseSettings, csvSafe, escapeHtml } = require('../validation');

const router = express.Router();
router.use(requireAdmin);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const statics = path.join(storageDir, 'uploads');
fs.mkdirSync(statics, { recursive: true, mode: 0o700 });
function removeIfUnreferenced(imagePath) {
  const match=/^\/uploads\/([a-f0-9-]{36}\.webp)$/i.exec(imagePath||'');
  if(!match||db.prepare('SELECT 1 FROM vehicles WHERE image_path=? LIMIT 1').get(imagePath))return false;
  try{fs.rmSync(path.join(statics,match[1]),{force:true});return true;}catch{return false;}
}
const vehicleSelect = `SELECT v.*, a.name AS assigned_name FROM vehicles v LEFT JOIN admins a ON 1=0`;
function sendError(res, status, message) { return res.status(status).json({ error: message }); }
function valueSlug(data) { return safeSlug(data.slug || [data.condition === 'PRE_OWNED' ? 'pre-owned' : 'new',data.brand,data.model,data.variant].filter(Boolean).join('-')); }
function vehicleBody(body) {
  const input = { ...body };
  if (typeof input.colours === 'string') input.colours = input.colours.split(',').map((x)=>x.trim()).filter(Boolean);
  if (typeof input.specs === 'string') {
    try { input.specs=JSON.parse(input.specs); } catch { input.specs={}; }
  }
  if (input.engineCc === '') input.engineCc=null;
  if (input.exShowroomPrice === '') input.exShowroomPrice=null;
  if (input.stockQuantity === '') input.stockQuantity=null;
  if (input.imagePath === '') input.imagePath=null;
  if (input.published === 'true') input.published=true;
  if (input.published === 'false') input.published=false;
  if (input.featured === 'true') input.featured=true;
  if (input.featured === 'false') input.featured=false;
  if (input.priceVerified === 'true') input.priceVerified=true;
  if (input.priceVerified === 'false') input.priceVerified=false;
  return input;
}
function saveVehicle(id, d, timestamp, old = null) {
  const slug = valueSlug(d);
  if (!slug) throw new Error('Enter a name that can form a valid URL slug.');
  const record = {
    id, slug, category:d.category, condition:d.condition, brand:d.brand, model:d.model, variant:d.variant, description:d.description,
    colours:JSON.stringify(d.colours), specs:JSON.stringify(d.specs), engineCc:d.engineCc ?? null,
    price:d.exShowroomPrice ?? null, priceVerified:d.priceVerified ? 1:0, availability:d.availability,
    stock:d.stockQuantity ?? null, imagePath:d.imagePath === undefined ? (old?.image_path || null) : (d.imagePath || null),
    published:d.published ? 1:0, featured:d.featured ? 1:0, createdAt:old?.created_at || timestamp, updatedAt:timestamp,
  };
  db.prepare(`INSERT INTO vehicles(id,slug,category,condition,brand,model,variant,description,colours_json,specs_json,engine_cc,ex_showroom_price,price_verified,availability,stock_quantity,image_path,published,featured,created_at,updated_at)
    VALUES(@id,@slug,@category,@condition,@brand,@model,@variant,@description,@colours,@specs,@engineCc,@price,@priceVerified,@availability,@stock,@imagePath,@published,@featured,@createdAt,@updatedAt)
    ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,category=excluded.category,condition=excluded.condition,brand=excluded.brand,model=excluded.model,variant=excluded.variant,description=excluded.description,colours_json=excluded.colours_json,specs_json=excluded.specs_json,engine_cc=excluded.engine_cc,ex_showroom_price=excluded.ex_showroom_price,price_verified=excluded.price_verified,availability=excluded.availability,stock_quantity=excluded.stock_quantity,image_path=excluded.image_path,published=excluded.published,featured=excluded.featured,updated_at=excluded.updated_at`).run(record);
  if(old?.image_path&&old.image_path!==record.imagePath)removeIfUnreferenced(old.image_path);
  return record;
}
function csvCell(value) { return `"${csvSafe(value).replace(/"/g,'""')}"`; }

router.get('/me', (req,res)=>res.json({ user:req.admin, csrf:req.session.csrf }));
router.get('/dashboard', (req,res)=>{
  const today=new Date().toISOString().slice(0,10);
  const counts={
    enquiries:db.prepare('SELECT count(*) n FROM enquiries').get().n,
    newEnquiries:db.prepare("SELECT count(*) n FROM enquiries WHERE status='NEW'").get().n,
    testRideRequests:db.prepare('SELECT count(*) n FROM test_ride_requests').get().n,
    followUpsDue:db.prepare("SELECT count(*) n FROM enquiries WHERE next_follow_up IS NOT NULL AND next_follow_up<=? AND status NOT IN ('CLOSED','CONVERTED')").get(today).n,
    conversions:db.prepare("SELECT count(*) n FROM enquiries WHERE status='CONVERTED'").get().n,
    confirmedVisits:db.prepare('SELECT count(*) n FROM enquiries WHERE visit_confirmed_at IS NOT NULL').get().n,
    followUpsCompleted:db.prepare("SELECT count(*) n FROM follow_up_events WHERE completed_at>=date('now','-30 day')").get().n,
    calls:db.prepare("SELECT count(*) n FROM analytics_events WHERE event_type='call_click' AND created_at>=date('now','-30 day')").get().n,
    whatsapp:db.prepare("SELECT count(*) n FROM analytics_events WHERE event_type='whatsapp_click' AND created_at>=date('now','-30 day')").get().n,
    enquiryFormEvents:db.prepare("SELECT count(*) n FROM analytics_events WHERE event_type='enquiry_submitted' AND created_at>=date('now','-30 day')").get().n,
    publishedVehicles:db.prepare('SELECT count(*) n FROM vehicles WHERE published=1').get().n,
    activeOffers:db.prepare("SELECT count(*) n FROM offers WHERE published=1 AND (starts_at IS NULL OR starts_at='' OR starts_at<=date('now')) AND (ends_at IS NULL OR ends_at='' OR ends_at>=date('now'))").get().n,
  };
  const bySource=db.prepare('SELECT source,count(*) AS count FROM enquiries GROUP BY source ORDER BY count DESC LIMIT 10').all();
  const byVehicle=db.prepare('SELECT COALESCE(v.brand || \' \' || v.model || \' · \' || CASE WHEN v.condition=\'PRE_OWNED\' THEN \'Second-hand\' ELSE \'New\' END || \' \' || CASE WHEN v.category=\'SCOOTER\' THEN \'Scooty\' WHEN v.category=\'MOTORCYCLE\' THEN \'Bike\' ELSE \'Car\' END, \'Vehicle no longer listed\') AS vehicle,count(*) AS count FROM enquiries e LEFT JOIN vehicles v ON v.id=e.vehicle_id GROUP BY e.vehicle_id ORDER BY count DESC LIMIT 10').all();
  res.json({ counts, bySource, byVehicle, metricNotes:{conversions:'Enquiries manually marked CONVERTED by staff; not independently verified sales.',confirmedVisits:'Enquiries for which staff recorded a visit confirmation.',followUpsCompleted:'Follow-up actions explicitly recorded by staff in the last 30 days.',calls:'Tracked call-link clicks in the last 30 days; not unique callers.',whatsapp:'Tracked WhatsApp-link clicks in the last 30 days; not sent messages or unique customers.'} });
});

router.get('/vehicles', (req,res)=>{
  const q=(req.query.q||'').toString().trim().slice(0,80); const state=(req.query.state||'').toString();
  const conditions=[]; const args=[];
  if(q){conditions.push('(brand LIKE ? OR model LIKE ? OR variant LIKE ?)');args.push(`%${q}%`,`%${q}%`,`%${q}%`);}
  if(state==='published')conditions.push('published=1'); else if(state==='draft')conditions.push('published=0');
  const rows=db.prepare(`SELECT * FROM vehicles ${conditions.length?'WHERE '+conditions.join(' AND '):''} ORDER BY updated_at DESC LIMIT 250`).all(...args);
  const settings=getSettings();const cutoff=new Date(Date.now()-(Number(settings.stale_listing_days)||30)*86400000).toISOString();const low=Number(settings.low_stock_threshold)||2;
  const vehicles=rows.map((v)=>({...v,colours:JSON.parse(v.colours_json||'[]'),specs:JSON.parse(v.specs_json||'{}'),stale:v.updated_at<cutoff,lowStock:v.stock_quantity!==null&&v.stock_quantity<=low}));
  res.json({vehicles,limits:{staleDays:Number(settings.stale_listing_days)||30,lowStockThreshold:low}});
});
router.post('/vehicles', requireCsrf, (req,res)=>{
  const parsed=vehicleSchema.safeParse(vehicleBody(req.body)); if(!parsed.success)return sendError(res,400,parsed.error.issues[0].message);
  try { const id=crypto.randomUUID(),t=now(); const row=saveVehicle(id,parsed.data,t); audit(req.admin.id,'VEHICLE_CREATED','vehicle',id,{published:row.published===1}); res.status(201).json({vehicle:db.prepare('SELECT * FROM vehicles WHERE id=?').get(id)}); }
  catch(err){ if(err.code==='SQLITE_CONSTRAINT_UNIQUE')return sendError(res,409,'A listing with this URL slug already exists.'); return sendError(res,400,err.message); }
});
router.put('/vehicles/:id',requireCsrf,(req,res)=>{
  const old=db.prepare('SELECT * FROM vehicles WHERE id=?').get(req.params.id);if(!old)return sendError(res,404,'Vehicle listing not found.');
  const parsed=vehicleSchema.safeParse(vehicleBody(req.body));if(!parsed.success)return sendError(res,400,parsed.error.issues[0].message);
  try{saveVehicle(old.id,parsed.data,now(),old);audit(req.admin.id,'VEHICLE_UPDATED','vehicle',old.id,{published:parsed.data.published});res.json({vehicle:db.prepare('SELECT * FROM vehicles WHERE id=?').get(old.id)});}catch(err){if(err.code==='SQLITE_CONSTRAINT_UNIQUE')return sendError(res,409,'A listing with this URL slug already exists.');return sendError(res,400,err.message);}
});
router.delete('/vehicles/:id/image',requireCsrf,(req,res)=>{const vehicle=db.prepare('SELECT id,image_path FROM vehicles WHERE id=?').get(req.params.id);if(!vehicle)return sendError(res,404,'Vehicle listing not found.');if(!vehicle.image_path)return res.json({ok:true,removed:false});db.prepare('UPDATE vehicles SET image_path=NULL,updated_at=? WHERE id=?').run(now(),vehicle.id);const deleted=removeIfUnreferenced(vehicle.image_path);audit(req.admin.id,'VEHICLE_IMAGE_REMOVED','vehicle',vehicle.id,{fileDeleted:deleted});res.json({ok:true,removed:true,fileDeleted:deleted});});
router.delete('/vehicles/:id',requireCsrf,(req,res)=>{const v=db.prepare('SELECT id FROM vehicles WHERE id=?').get(req.params.id);if(!v)return sendError(res,404,'Vehicle listing not found.');db.prepare('UPDATE vehicles SET published=0,featured=0,updated_at=? WHERE id=?').run(now(),v.id);audit(req.admin.id,'VEHICLE_ARCHIVED','vehicle',v.id);res.json({ok:true,message:'Listing unpublished and retained for lead history.'});});

router.get('/vehicles/export.csv',(req,res)=>{
  const rows=db.prepare('SELECT * FROM vehicles ORDER BY brand,model').all();const columns=['slug','condition','category','brand','model','variant','description','colours_json','specs_json','engine_cc','ex_showroom_price','price_verified','availability','stock_quantity','image_path','published','featured'];
  const csv=[columns.map(csvCell).join(','),...rows.map((row)=>columns.map((key)=>csvCell(row[key])).join(','))].join('\r\n');
  res.set({'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="vehicle-inventory.csv"','Cache-Control':'no-store'}).send(csv);
});
router.post('/vehicles/import.csv',requireCsrf,upload.single('file'),(req,res)=>{
  if(!req.file)return sendError(res,400,'Choose a CSV file.');if(req.file.size>1024*1024)return sendError(res,413,'CSV must be no larger than 1 MB.');
  let records;try{records=parseCsv(req.file.buffer.toString('utf8'),{columns:true,skip_empty_lines:true,bom:true,relax_column_count:false,trim:true,max_record_size:12000});}catch{return sendError(res,400,'CSV could not be read. Export the current inventory template and try again.');}
  if(records.length>500)return sendError(res,400,'Import up to 500 rows at a time.');
  const required=['slug','category','brand','model'];if(!records.length||required.some((h)=>!(h in records[0])))return sendError(res,400,'CSV needs slug, category, brand, and model columns.');
  let created=0,updated=0;const errors=[];
  for(let i=0;i<records.length;i++){
    const r=records[i];const toBool=(x)=>String(x||'').toLowerCase()==='true'||String(x)==='1';
    let colours=[],specs={};try{colours=r.colours_json?JSON.parse(r.colours_json):[];specs=r.specs_json?JSON.parse(r.specs_json):{};}catch{errors.push({row:i+2,error:'Invalid colours_json or specs_json.'});continue;}
    const raw={condition:r.condition||'NEW',category:r.category,brand:r.brand,model:r.model,variant:r.variant||'',slug:r.slug,description:r.description||'',colours,specs,engineCc:r.engine_cc||null,exShowroomPrice:r.ex_showroom_price||null,priceVerified:toBool(r.price_verified),availability:r.availability||'ASK',stockQuantity:r.stock_quantity||null,imagePath:r.image_path||null,published:toBool(r.published),featured:toBool(r.featured)};
    const parsed=vehicleSchema.safeParse(vehicleBody(raw));if(!parsed.success){errors.push({row:i+2,error:parsed.error.issues[0].message});continue;}
    const old=db.prepare('SELECT * FROM vehicles WHERE slug=?').get(safeSlug(parsed.data.slug||[parsed.data.brand,parsed.data.model,parsed.data.variant].join('-')));
    try{if(old){saveVehicle(old.id,parsed.data,now(),old);updated++;}else{saveVehicle(crypto.randomUUID(),parsed.data,now());created++;}}catch(err){errors.push({row:i+2,error:err.code==='SQLITE_CONSTRAINT_UNIQUE'?'Duplicate slug.':err.message});}
  }
  audit(req.admin.id,'VEHICLES_IMPORTED','vehicle_import',null,{created,updated,errors:errors.length});res.json({created,updated,errors:errors.slice(0,50),errorCount:errors.length});
});

const imageUpload = upload.single('image');
router.post('/uploads/vehicle-image',requireCsrf,(req,res,next)=>imageUpload(req,res,(err)=>err?sendError(res,400,'Image must be a JPEG, PNG, or WebP up to 5 MB.'):next()),async(req,res)=>{
  if(!req.file)return sendError(res,400,'Choose a JPEG, PNG, or WebP image.');
  const imageProcessor=getSharp();if(!imageProcessor)return sendError(res,503,'Image optimization is unavailable on this device. The site can still run; use a supported Linux server to enable product-image uploads.');
  const b=req.file.buffer;let ext='';
  if(b.length>=3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)ext='jpg';
  else if(b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))ext='png';
  else if(b.length>=12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP')ext='webp';
  if(!ext)return sendError(res,400,'The file contents are not a supported JPEG, PNG, or WebP image.');
  try{
    const optimized=await imageProcessor(b,{failOn:'error',limitInputPixels:30000000}).rotate().resize({width:1600,height:1200,fit:'inside',withoutEnlargement:true}).webp({quality:82,effort:4}).toBuffer();
    const name=`${crypto.randomUUID()}.webp`;fs.writeFileSync(path.join(statics,name),optimized,{flag:'wx',mode:0o640});audit(req.admin.id,'IMAGE_UPLOADED','asset',name,{inputBytes:b.length,outputBytes:optimized.length,format:'webp'});res.status(201).json({path:`/uploads/${name}`});
  }catch(error){if(sharpUnavailable(error))return sendError(res,503,'Image optimization is unavailable on this device. The site can still run; use a supported Linux server to enable product-image uploads.');return sendError(res,400,'The uploaded image could not be decoded or optimized.');}
});

router.delete('/uploads/vehicle-image/:filename',requireCsrf,(req,res)=>{const filename=req.params.filename;if(!/^[a-f0-9-]{36}\.webp$/i.test(filename))return sendError(res,404,'Image not found.');const imagePath=`/uploads/${filename}`;if(db.prepare('SELECT 1 FROM vehicles WHERE image_path=? LIMIT 1').get(imagePath))return sendError(res,409,'This image is still attached to a vehicle listing.');const deleted=removeIfUnreferenced(imagePath);if(deleted)audit(req.admin.id,'UNUSED_IMAGE_DELETED','asset',filename);return res.json({ok:true,deleted});});
router.get('/offers',(req,res)=>res.json({offers:db.prepare('SELECT * FROM offers ORDER BY updated_at DESC LIMIT 200').all()}));
router.post('/offers',requireCsrf,(req,res)=>{const p=offerSchema.safeParse(req.body);if(!p.success)return sendError(res,400,p.error.issues[0].message);const d=p.data,id=crypto.randomUUID(),t=now();db.prepare('INSERT INTO offers(id,title,description,terms,starts_at,ends_at,published,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,d.title,d.description,d.terms,d.startsAt||null,d.endsAt||null,d.published?1:0,t,t);audit(req.admin.id,'OFFER_CREATED','offer',id,{published:d.published});res.status(201).json({offer:db.prepare('SELECT * FROM offers WHERE id=?').get(id)});});
router.put('/offers/:id',requireCsrf,(req,res)=>{const old=db.prepare('SELECT id FROM offers WHERE id=?').get(req.params.id);if(!old)return sendError(res,404,'Offer not found.');const p=offerSchema.safeParse(req.body);if(!p.success)return sendError(res,400,p.error.issues[0].message);const d=p.data;db.prepare('UPDATE offers SET title=?,description=?,terms=?,starts_at=?,ends_at=?,published=?,updated_at=? WHERE id=?').run(d.title,d.description,d.terms,d.startsAt||null,d.endsAt||null,d.published?1:0,now(),old.id);audit(req.admin.id,'OFFER_UPDATED','offer',old.id,{published:d.published});res.json({offer:db.prepare('SELECT * FROM offers WHERE id=?').get(old.id)});});
router.delete('/offers/:id',requireCsrf,(req,res)=>{const r=db.prepare('UPDATE offers SET published=0,updated_at=? WHERE id=?').run(now(),req.params.id);if(!r.changes)return sendError(res,404,'Offer not found.');audit(req.admin.id,'OFFER_ARCHIVED','offer',req.params.id);res.json({ok:true});});

router.get('/leads',(req,res)=>{
  const page=Math.max(1,Math.min(100,Number(req.query.page)||1)),limit=50;const status=(req.query.status||'').toString();const type=(req.query.type||'').toString();const q=(req.query.q||'').toString().trim().slice(0,80);
  const where=[],args=[];if(['NEW','CONTACTED','FOLLOW_UP_REQUIRED','VISIT_SCHEDULED','CONVERTED','CLOSED'].includes(status)){where.push('e.status=?');args.push(status);}if(['GENERAL','TEST_RIDE','FINANCE','EXCHANGE'].includes(type)){where.push('e.type=?');args.push(type);}if(q){where.push('(e.name LIKE ? OR e.phone LIKE ? OR e.email LIKE ? OR v.model LIKE ? OR v.brand LIKE ?)');args.push(`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`);}
  const sql=`SELECT e.*,v.brand AS vehicle_brand,v.model AS vehicle_model,v.variant AS vehicle_variant,v.condition AS vehicle_condition,v.category AS vehicle_category,a.name AS assigned_name,t.preferred_date,t.preferred_time,t.status AS ride_status,t.confirmed_date,t.confirmed_time FROM enquiries e LEFT JOIN vehicles v ON v.id=e.vehicle_id LEFT JOIN admins a ON a.id=e.assigned_to LEFT JOIN test_ride_requests t ON t.enquiry_id=e.id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY e.created_at DESC LIMIT ? OFFSET ?`;
  const rows=db.prepare(sql).all(...args,limit,(page-1)*limit);const total=db.prepare(`SELECT count(*) n FROM enquiries e LEFT JOIN vehicles v ON v.id=e.vehicle_id ${where.length?'WHERE '+where.join(' AND '):''}`).get(...args).n;
  const admins=db.prepare("SELECT id,name,email FROM admins WHERE active=1 ORDER BY name").all();res.json({leads:rows,admins,page,total,limit});
});
router.patch('/leads/:id',requireCsrf,(req,res)=>{
  const lead=db.prepare('SELECT * FROM enquiries WHERE id=?').get(req.params.id);if(!lead)return sendError(res,404,'Enquiry not found.');const d=req.body;const statuses=['NEW','CONTACTED','FOLLOW_UP_REQUIRED','VISIT_SCHEDULED','CONVERTED','CLOSED'];
  const status=d.status===undefined?lead.status:d.status;if(!statuses.includes(status))return sendError(res,400,'Select a valid enquiry status.');
  let assigned=d.assignedTo===undefined?lead.assigned_to:(d.assignedTo||null);if(assigned&&!db.prepare('SELECT 1 FROM admins WHERE id=? AND active=1').get(assigned))return sendError(res,400,'Choose an active administrator.');
  let next=d.nextFollowUp===undefined?lead.next_follow_up:(d.nextFollowUp||null);if(next&&(!/^\d{4}-\d{2}-\d{2}$/.test(next)||Number.isNaN(Date.parse(next))))return sendError(res,400,'Enter a valid follow-up date.');
  let notes=lead.internal_notes;if(typeof d.note==='string'&&d.note.trim()){if(d.note.trim().length>2000)return sendError(res,400,'Internal note must be 2,000 characters or fewer.');notes=(notes?notes+'\n':'')+`[${new Date().toISOString()} · ${req.admin.name}] ${d.note.trim()}`;}
  const visit=status==='VISIT_SCHEDULED'?(lead.visit_confirmed_at||now()):lead.visit_confirmed_at;
  db.prepare('UPDATE enquiries SET status=?,assigned_to=?,next_follow_up=?,internal_notes=?,visit_confirmed_at=?,updated_at=? WHERE id=?').run(status,assigned,next,notes,visit,now(),lead.id);
  audit(req.admin.id,'LEAD_UPDATED','enquiry',lead.id,{status,assigned:Boolean(assigned),hasNextFollowUp:Boolean(next)});res.json({ok:true,lead:db.prepare('SELECT id,status,assigned_to,next_follow_up,updated_at FROM enquiries WHERE id=?').get(lead.id)});
});
router.post('/leads/:id/follow-ups',requireCsrf,(req,res)=>{const lead=db.prepare('SELECT id FROM enquiries WHERE id=?').get(req.params.id);if(!lead)return sendError(res,404,'Enquiry not found.');const note=typeof req.body.note==='string'?req.body.note.trim():'';const next=typeof req.body.nextFollowUp==='string'&&req.body.nextFollowUp?req.body.nextFollowUp:null;if(!note||note.length>2000)return sendError(res,400,'Add a short note about the follow-up.');if(next&&(!/^\d{4}-\d{2}-\d{2}$/.test(next)||Number.isNaN(Date.parse(next))))return sendError(res,400,'Enter a valid follow-up date.');const id=crypto.randomUUID(),t=now();db.prepare('INSERT INTO follow_up_events(id,enquiry_id,admin_id,note,next_follow_up,completed_at) VALUES(?,?,?,?,?,?)').run(id,lead.id,req.admin.id,note,next,t);if(next)db.prepare('UPDATE enquiries SET next_follow_up=?,updated_at=? WHERE id=?').run(next,t,lead.id);audit(req.admin.id,'FOLLOW_UP_COMPLETED','enquiry',lead.id,{hasNextFollowUp:Boolean(next)});res.status(201).json({ok:true,id,completedAt:t});});
router.get('/leads/:id/follow-ups',(req,res)=>{if(!db.prepare('SELECT 1 FROM enquiries WHERE id=?').get(req.params.id))return sendError(res,404,'Enquiry not found.');res.json({events:db.prepare('SELECT f.id,f.note,f.next_follow_up,f.completed_at,a.name AS admin_name FROM follow_up_events f LEFT JOIN admins a ON a.id=f.admin_id WHERE f.enquiry_id=? ORDER BY f.completed_at DESC LIMIT 100').all(req.params.id)});});
router.delete('/leads/:id',requireCsrf,requireOwner,(req,res)=>{const lead=db.prepare('SELECT id FROM enquiries WHERE id=?').get(req.params.id);if(!lead)return sendError(res,404,'Enquiry not found.');const erase=db.transaction(()=>{db.prepare('DELETE FROM enquiries WHERE id=?').run(lead.id);audit(req.admin.id,'CUSTOMER_DATA_ERASED','enquiry',lead.id,{requestVerifiedByOwner:true});});erase();res.json({ok:true,message:'Enquiry personal data was erased.'});});
router.get('/leads/export.csv',(req,res)=>{const rows=db.prepare('SELECT e.id,e.created_at,e.type,e.name,e.phone,e.email,e.status,e.source,e.next_follow_up,e.internal_notes,v.brand,v.model FROM enquiries e LEFT JOIN vehicles v ON v.id=e.vehicle_id ORDER BY e.created_at DESC LIMIT 5000').all();const headers=['id','created_at','type','name','phone','email','status','source','next_follow_up','internal_notes','brand','model'];const csv=[headers.join(','),...rows.map((r)=>headers.map((k)=>csvCell(r[k])).join(','))].join('\r\n');res.set({'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="enquiries.csv"','Cache-Control':'no-store'}).send(csv);});
router.get('/test-rides',(req,res)=>res.json({requests:db.prepare('SELECT t.*,e.name,e.phone,e.email,e.vehicle_id,e.status AS enquiry_status,v.brand,v.model,v.variant,v.condition AS vehicle_condition,v.category AS vehicle_category FROM test_ride_requests t JOIN enquiries e ON e.id=t.enquiry_id LEFT JOIN vehicles v ON v.id=e.vehicle_id ORDER BY t.created_at DESC LIMIT 200').all()}));
router.patch('/test-rides/:id',requireCsrf,(req,res)=>{const status=req.body.status;if(!['REQUESTED','CONFIRMED','REJECTED','COMPLETED'].includes(status))return sendError(res,400,'Choose a valid test-ride status.');const ride=db.prepare('SELECT * FROM test_ride_requests WHERE id=?').get(req.params.id);if(!ride)return sendError(res,404,'Test-ride request not found.');let date=ride.confirmed_date,time=ride.confirmed_time;if(status==='CONFIRMED'){date=req.body.confirmedDate||ride.preferred_date;time=req.body.confirmedTime||ride.preferred_time;if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return sendError(res,400,'Confirm a valid date and time.');}db.prepare('UPDATE test_ride_requests SET status=?,confirmed_date=?,confirmed_time=?,updated_at=? WHERE id=?').run(status,date,time,now(),ride.id);audit(req.admin.id,'TEST_RIDE_REVIEWED','test_ride',ride.id,{status});res.json({ok:true});});

router.get('/settings',(req,res)=>{if(req.admin.role!=='OWNER')return sendError(res,403,'Only the owner can view website settings.');res.json({settings:getSettings()});});
const passwordLimiter=rateLimit({windowMs:15*60*1000,limit:5,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many password change attempts. Wait and try again.'}});
router.post('/me/password',passwordLimiter,requireCsrf,async(req,res,next)=>{try{const adminId=req.admin.id;const current=typeof req.body.currentPassword==='string'?req.body.currentPassword:'';const password=typeof req.body.newPassword==='string'?req.body.newPassword:'';const confirm=typeof req.body.confirmPassword==='string'?req.body.confirmPassword:'';if(password.length<14||password.length>200||password!==confirm)return sendError(res,400,'New passwords must match and be at least 14 characters.');const user=db.prepare('SELECT password_hash,auth_version FROM admins WHERE id=? AND active=1').get(adminId);if(!user||!(await verifyPassword(current,user.password_hash)))return sendError(res,400,'Current password is incorrect.');const hash=await hashPassword(password);db.prepare('UPDATE admins SET password_hash=?,auth_version=auth_version+1 WHERE id=?').run(hash,adminId);const newVersion=user.auth_version+1;audit(adminId,'PASSWORD_CHANGED','admin',adminId);req.session.regenerate((error)=>{if(error)return next(error);req.session.adminId=adminId;req.session.authVersion=newVersion;req.session.csrf=require('../auth').csrfToken(req);res.json({ok:true,csrf:req.session.csrf});});}catch(error){next(error);}});
router.put('/settings',requireCsrf,requireOwner,(req,res)=>{try{const patch=parseSettings(req.body);setSettings(patch);audit(req.admin.id,'SETTINGS_UPDATED','settings',null,{fields:Object.keys(patch)});res.json({settings:getSettings()});}catch(err){sendError(res,400,err.message);}});
router.get('/admins',requireOwner,(req,res)=>{const admins=db.prepare('SELECT id,email,name,role,active,created_at,last_login_at FROM admins ORDER BY role DESC,name').all();const invites=db.prepare('SELECT id,email,name,expires_at,created_at FROM admin_invites WHERE used_at IS NULL AND expires_at>? ORDER BY created_at DESC').all(now());res.json({admins,invites});});
router.post('/admins/invites',requireCsrf,requireOwner,(req,res)=>{const base=(getSettings().public_base_url||'').replace(/\/$/,'');if(!base)return sendError(res,400,'Set the public HTTPS website URL in owner settings before creating administrator invitations.');const email=typeof req.body.email==='string'?req.body.email.trim().toLowerCase():'';const name=typeof req.body.name==='string'?req.body.name.trim():'';if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!name||name.length>120)return sendError(res,400,'Enter a valid administrator name and email.');if(db.prepare('SELECT 1 FROM admins WHERE email=? COLLATE NOCASE').get(email))return sendError(res,409,'An account already exists for this email.');const token=crypto.randomBytes(32).toString('base64url'),id=crypto.randomUUID(),t=now(),expires=new Date(Date.now()+24*60*60*1000).toISOString();const tokenHash=crypto.createHash('sha256').update(token).digest('hex');db.prepare('INSERT INTO admin_invites(id,email,name,token_hash,expires_at,created_by,created_at) VALUES(?,?,?,?,?,?,?)').run(id,email,name,tokenHash,expires,req.admin.id,t);audit(req.admin.id,'ADMIN_INVITED','admin_invite',id,{expiresAt:expires});res.status(201).json({id,email,expiresAt:expires,invitationUrl:`${base}/admin/accept-invite/${token}`});});
router.delete('/admins/invites/:id',requireCsrf,requireOwner,(req,res)=>{const r=db.prepare('DELETE FROM admin_invites WHERE id=? AND used_at IS NULL').run(req.params.id);if(!r.changes)return sendError(res,404,'Pending invitation not found.');audit(req.admin.id,'ADMIN_INVITE_REVOKED','admin_invite',req.params.id);res.json({ok:true});});
router.patch('/admins/:id',requireCsrf,requireOwner,(req,res)=>{const target=db.prepare('SELECT id,role,active FROM admins WHERE id=?').get(req.params.id);if(!target)return sendError(res,404,'Administrator not found.');if(target.role==='OWNER')return sendError(res,403,'The owner account cannot be deactivated or changed here.');const active=req.body.active===true||req.body.active==='true';db.prepare('UPDATE admins SET active=? WHERE id=? AND role=\'ADMIN\'').run(active?1:0,target.id);audit(req.admin.id,active?'ADMIN_REACTIVATED':'ADMIN_DEACTIVATED','admin',target.id);res.json({ok:true,active});});
router.get('/audit',(req,res)=>{const rows=db.prepare('SELECT l.id,l.actor_id,l.action,l.entity_type,l.entity_id,l.metadata_json,l.created_at,a.name AS actor_name FROM audit_logs l LEFT JOIN admins a ON a.id=l.actor_id ORDER BY l.created_at DESC LIMIT 200').all();res.json({events:rows.map((r)=>({...r,metadata:JSON.parse(r.metadata_json||'{}'),metadata_json:undefined}))});});

module.exports = router;
