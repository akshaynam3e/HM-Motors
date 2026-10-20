require('dotenv').config();
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {db,storageDir}=require('../src/db');
(async()=>{
  const outputDir=path.resolve(process.env.BACKUP_DIR||'./backups');fs.mkdirSync(outputDir,{recursive:true,mode:0o700});
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');const archive=path.join(outputDir,`showroom-${stamp}.tar.gz`);const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'showroom-backup-'));
  try{
    await db.backup(path.join(temporary,'showroom.sqlite'));
    const uploads=path.join(storageDir,'uploads');if(fs.existsSync(uploads))fs.cpSync(uploads,path.join(temporary,'uploads'),{recursive:true});else fs.mkdirSync(path.join(temporary,'uploads'));
    fs.writeFileSync(path.join(temporary,'backup-manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),database:'showroom.sqlite',uploads:'uploads/',sessionsExcluded:true},null,2),{mode:0o600});
    const result=spawnSync('tar',['-czf',archive,'-C',temporary,'showroom.sqlite','uploads','backup-manifest.json'],{encoding:'utf8'});
    if(result.status!==0)throw new Error(result.stderr||'tar could not create the backup archive.');
    fs.chmodSync(archive,0o600);console.log(`Backup created: ${archive}`);console.log('Copy this archive to encrypted off-host storage and test the restore procedure.');
  }finally{fs.rmSync(temporary,{recursive:true,force:true});db.close();}
})().catch((error)=>{console.error(error.message);db.close();process.exit(1);});
