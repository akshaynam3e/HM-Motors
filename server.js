require('dotenv').config();
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { db, storageDir, now, audit } = require('./src/db');
const { bootstrapOwnerFromEnvironment } = require('./scripts/bootstrap-owner');
const BetterSqliteSessionStore = require('./src/session-store');
const { csrfToken, requireCsrf, login } = require('./src/auth');
const { publicRouter } = { publicRouter: require('./src/routes/public') };
const apiPublic = require('./src/routes/api-public');
const apiAdmin = require('./src/routes/api-admin');

const app = express();
const port = Number(process.env.PORT) || 3000;
const mode = process.env.APP_COOKIE_MODE || 'local';
if (!['local','production','preview'].includes(mode)) throw new Error('APP_COOKIE_MODE must be local, production, or preview.');
const sessionSecret = process.env.SESSION_SECRET || '';
if (sessionSecret.length < 32 || /replace[-_ ]?me|change[-_ ]?this/i.test(sessionSecret)) throw new Error('Set SESSION_SECRET to at least 32 random characters. Generate one with: openssl rand -hex 32');
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5) throw new Error('TRUST_PROXY_HOPS must be an integer from 0 to 5.');
if (trustProxyHops > 0) app.set('trust proxy', trustProxyHops);

app.disable('x-powered-by');
app.set('view engine','ejs');
app.set('views',path.join(__dirname,'views'));
app.use((req,res,next)=>{res.locals.cspNonce=crypto.randomBytes(18).toString('base64');next();});
app.use(helmet({
  contentSecurityPolicy:{directives:{defaultSrc:["'self'"],baseUri:["'self'"],fontSrc:["'self'"],formAction:["'self'"],frameAncestors:["'self'","https://*.manus.computer"],imgSrc:["'self'","data:"],objectSrc:["'none'"],scriptSrc:["'self'",(req,res)=>`'nonce-${res.locals.cspNonce}'`],styleSrc:["'self'"],upgradeInsecureRequests: mode==='production'?[]:null}},
  frameguard:false,
  crossOriginEmbedderPolicy:false,
  referrerPolicy:{policy:'no-referrer'},
  strictTransportSecurity:mode==='production'?undefined:false,
}));
app.use(express.json({limit:'64kb',strict:true}));
app.use(express.urlencoded({extended:false,limit:'24kb'}));
const sameSite=mode==='preview'?'none':'lax';
const secure=mode!=='local';
const cookieName='showroom_admin_session';
const sessionStore=new BetterSqliteSessionStore(storageDir);
app.use(session({
  name:cookieName,secret:sessionSecret,resave:false,saveUninitialized:false,rolling:true,
  proxy:mode==='preview'||trustProxyHops>0,
  store:sessionStore,
  cookie:{httpOnly:true,secure,sameSite,maxAge:8*60*60*1000,path:'/'},
}));
app.use((req,res,next)=>{res.set('X-Content-Type-Options','nosniff');if(req.path.startsWith('/admin')||req.path.startsWith('/api/admin'))res.set('Cache-Control','no-store');next();});
app.get('/healthz',(req,res)=>res.status(200).json({status:'ok'}));
app.get('/uploads/:filename',(req,res,next)=>{
  const filename=req.params.filename;
  if(!/^[a-f0-9-]{36}\.(?:jpg|png|webp)$/i.test(filename))return res.sendStatus(404);
  const imagePath=`/uploads/${filename}`;
  if(!db.prepare('SELECT 1 FROM vehicles WHERE image_path=? AND published=1').get(imagePath))return res.sendStatus(404);
  res.set({'X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=86400'});
  res.sendFile(path.join(storageDir,'uploads',filename),(error)=>{if(error)next(error);});
});
app.use('/api/public',apiPublic);

const loginLimiter=rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many sign-in attempts. Wait 15 minutes and try again.'}});
app.post('/api/admin/login',loginLimiter,requireCsrf,async(req,res,next)=>{
  try{
    const email=typeof req.body.email==='string'?req.body.email.trim().toLowerCase():'';
    const password=typeof req.body.password==='string'?req.body.password:'';
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||password.length>200)return res.status(400).json({error:'Enter your account email and password.'});
    const user=await login(req,email,password);
    if(!user)return res.status(401).json({error:'Email or password is incorrect, or the account is inactive.'});
    res.json({ok:true,user,csrf:req.session.csrf});
  }catch(error){next(error);}
});
app.post('/api/admin/logout',requireCsrf,(req,res)=>{
  const actor=req.session.adminId;
  if(actor)audit(actor,'LOGOUT','admin',actor);
  req.session.destroy((error)=>{
    if(error)return res.status(500).json({error:'Could not end the session. Please close the browser.'});
    res.clearCookie(cookieName,{path:'/',httpOnly:true,secure,sameSite});res.json({ok:true});
  });
});
app.use('/api/admin',apiAdmin);

app.get('/admin', (req,res)=>{
  const csrf=csrfToken(req);
  const user=req.session.adminId?db.prepare('SELECT id,email,name,role,active FROM admins WHERE id=? AND active=1').get(req.session.adminId):null;
  const ownerExists=Boolean(db.prepare("SELECT 1 FROM admins WHERE role='OWNER' AND active=1").get());
  if(req.session.adminId&&!user)req.session.destroy(()=>{});
  res.render('admin',{csrf,user:user||null,ownerExists});
});
app.get('/admin/',(req,res)=>res.redirect(308,'/admin'));
app.get('/admin/accept-invite/:token',(req,res)=>{
  const token=req.params.token;
  const tokenHash=crypto.createHash('sha256').update(token).digest('hex');
  const invite=db.prepare('SELECT email,name,expires_at FROM admin_invites WHERE token_hash=? AND used_at IS NULL AND expires_at>?').get(tokenHash,now());
  const csrf=csrfToken(req);
  res.status(invite?200:404).render('accept-invite',{csrf,invite:invite||null,token:invite?token:''});
});

app.use('/',publicRouter);
app.use(express.static(path.join(__dirname,'public'),{index:false,fallthrough:true,dotfiles:'deny',etag:true,maxAge:process.env.NODE_ENV==='production'?'1h':0}));
app.use((req,res)=>{
  const s=require('./src/db').getSettings();
  res.status(404).render('page',{settings:s,brand:s.site_name||'HM Motors',title:'Page not found',description:'The requested page could not be found.',canonical:'',path:req.path,noindex:true,keywords:'',jsonLd:'',content:'<section class="page-intro"><p class="eyebrow">404</p><h1>That page could not be found.</h1><p>The link may be incorrect or the listing may have been removed.</p><a class="button" href="/vehicles">Browse current listings</a></section>'});
});
app.use((error,req,res,next)=>{
  if(res.headersSent)return next(error);
  console.error('Request failed:',error.code||error.name||'Error');
  const status=error.statusCode||error.status||500;
  if(req.path.startsWith('/api/'))return res.status(status>=400&&status<600?status:500).json({error:status===413?'Request is too large.':'The request could not be completed.'});
  const s=require('./src/db').getSettings();
  res.status(status>=400&&status<600?status:500).render('page',{settings:s,brand:s.site_name||'HM Motors',title:'Something went wrong',description:'The page could not be loaded.',canonical:'',path:req.path,noindex:true,keywords:'',jsonLd:'',content:'<section class="page-intro"><p class="eyebrow">SERVICE UNAVAILABLE</p><h1>We could not load that page.</h1><p>Please try again later or contact the showroom using its verified details.</p><a class="button" href="/">Return home</a></section>'});
});
let server;
async function startServer() {
  await bootstrapOwnerFromEnvironment();
  server = app.listen(port,'0.0.0.0',()=>console.log(`Showroom website listening on port ${port} (${mode} cookie mode).`));
}
function shutdown(){
  const finish=()=>{try{sessionStore.close();db.close();}finally{process.exit(0);}};
  if(server)server.close(finish);else finish();
  setTimeout(()=>process.exit(1),10000).unref();
}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
startServer().catch((error)=>{console.error(`Startup failed: ${error.message}`);try{sessionStore.close();db.close();}finally{process.exit(1);}});
module.exports=app;
