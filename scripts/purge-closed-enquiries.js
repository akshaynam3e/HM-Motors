require('dotenv').config();
const {db,now,getSettings,audit}=require('../src/db');
const days=Math.min(3650,Math.max(1,Number(getSettings().retention_days)||180));
const cutoff=new Date(Date.now()-days*86400000).toISOString();
const rows=db.prepare("SELECT id FROM enquiries WHERE status='CLOSED' AND created_at<? ORDER BY created_at").all(cutoff);
console.log(`Retention target: ${days} days. Closed enquiries older than ${cutoff}: ${rows.length}.`);
if(!process.argv.includes('--apply')){console.log('Dry run only. Review the retention policy, take a backup, and pass --apply to erase these closed enquiries.');db.close();process.exit(0);}
if(process.env.NODE_ENV==='production'&&process.env.RETENTION_APPROVED!=='yes')throw new Error('For production, set RETENTION_APPROVED=yes for this command after a verified backup and policy review.');
const purge=db.transaction(()=>{for(const row of rows)db.prepare('DELETE FROM enquiries WHERE id=?').run(row.id);audit(null,'CLOSED_ENQUIRIES_PURGED','retention',null,{count:rows.length,cutoff});});
purge();console.log(`Erased ${rows.length} closed enquiry records and linked test-ride/follow-up data.`);db.close();
