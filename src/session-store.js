const path=require('node:path');
const fs=require('node:fs');
const Database=require('better-sqlite3');
const session=require('express-session');

class BetterSqliteSessionStore extends session.Store{
  constructor(storageDir){
    super();
    fs.mkdirSync(storageDir,{recursive:true,mode:0o700});
    this.db=new Database(path.join(storageDir,'sessions.sqlite'));
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec('CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, sess TEXT NOT NULL, expire INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS sessions_expire_idx ON sessions(expire);');
    this.read=this.db.prepare('SELECT sess,expire FROM sessions WHERE sid=?');
    this.write=this.db.prepare('INSERT INTO sessions(sid,sess,expire) VALUES(?,?,?) ON CONFLICT(sid) DO UPDATE SET sess=excluded.sess,expire=excluded.expire');
    this.remove=this.db.prepare('DELETE FROM sessions WHERE sid=?');
    this.touchRow=this.db.prepare('UPDATE sessions SET expire=? WHERE sid=?');
    this.removeExpired=this.db.prepare('DELETE FROM sessions WHERE expire<=?');
  }
  get(sid,callback){
    try{const row=this.read.get(sid);if(!row||row.expire<=Date.now()){if(row)this.remove.run(sid);return process.nextTick(callback,null,null);}return process.nextTick(callback,null,JSON.parse(row.sess));}
    catch(error){return process.nextTick(callback,error);}
  }
  set(sid,sess,callback){
    try{const expires=sess.cookie&&sess.cookie.expires?new Date(sess.cookie.expires).getTime():Date.now()+Number(sess.cookie?.maxAge||8*60*60*1000);this.write.run(sid,JSON.stringify(sess),expires);this.removeExpired.run(Date.now());if(callback)process.nextTick(callback);}
    catch(error){if(callback)process.nextTick(callback,error);else throw error;}
  }
  touch(sid,sess,callback){
    try{const expires=sess.cookie&&sess.cookie.expires?new Date(sess.cookie.expires).getTime():Date.now()+Number(sess.cookie?.maxAge||8*60*60*1000);this.touchRow.run(expires,sid);if(callback)process.nextTick(callback);}
    catch(error){if(callback)process.nextTick(callback,error);else throw error;}
  }
  destroy(sid,callback){try{this.remove.run(sid);if(callback)process.nextTick(callback);}catch(error){if(callback)process.nextTick(callback,error);else throw error;}}
  clear(callback){try{this.db.prepare('DELETE FROM sessions').run();if(callback)process.nextTick(callback);}catch(error){if(callback)process.nextTick(callback,error);else throw error;}}
  close(){if(this.db.open)this.db.close();}
}
module.exports=BetterSqliteSessionStore;
