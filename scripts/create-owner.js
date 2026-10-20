require('dotenv').config();
const readline = require('node:readline');
const crypto = require('node:crypto');
const { db, now } = require('../src/db');
const { hashPassword } = require('../src/auth');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }));
}
function hidden(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    const wasRaw = Boolean(stdin.isRaw);
    stdin.setRawMode?.(true);
    stdin.resume();
    let value = '';
    const onData = (chunk) => {
      const char = chunk.toString('utf8');
      if (char === '\u0003') { stdin.off('data', onData); stdin.setRawMode?.(wasRaw); process.stdout.write('\n'); process.exit(130); }
      if (char === '\r' || char === '\n') { stdin.off('data', onData); stdin.setRawMode?.(wasRaw); process.stdout.write('\n'); resolve(value); return; }
      if (char === '\u007f' || char === '\b') { value = value.slice(0, -1); return; }
      if (char >= ' ') value += char;
    };
    stdin.on('data', onData);
  });
}
(async () => {
  if (db.prepare("SELECT count(*) AS n FROM admins WHERE role='OWNER'").get().n > 0) throw new Error('An owner account already exists. Use the owner portal to manage administrators.');
  const name = await ask('Owner full name: ');
  const email = (await ask('Owner email: ')).toLowerCase();
  if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Enter a valid name and email address.');
  const password = await hidden('Password (minimum 14 characters; input hidden): ');
  const again = await hidden('Confirm password: ');
  if (password !== again || password.length < 14 || password.length > 200) throw new Error('Passwords must match and be 14–200 characters long.');
  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  db.prepare('INSERT INTO admins(id,email,name,password_hash,role,active,created_at) VALUES(?,?,?,?,?,?,?)').run(id, email, name, passwordHash, 'OWNER', 1, now());
  console.log(`Owner account created for ${email}. You can now sign in at /admin.`);
  db.close();
  process.exit(0);
})().catch((error) => { console.error(error.message); db.close(); process.exit(1); });
