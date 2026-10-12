/**
 * One-time tool: replaces plain-text passwords in app_users with scrypt hashes.
 *
 *   node scripts/hash-existing-passwords.js           dry run: only counts, writes nothing
 *   node scripts/hash-existing-passwords.js --apply   hashes every plain-text password
 *
 * Run --apply only AFTER the version of the app that understands hashes is live
 * (lib/password.ts and the new login route). The old login compares plain text,
 * so with hashes in the table it would let nobody in.
 *
 * Without this script accounts are converted one by one on their next login;
 * the script just finishes the job for accounts that do not log in often.
 * Empty passwords are left alone (they cannot log in anyway). Every hash is
 * verified against the original password before it is written, and no password
 * or hash is ever printed.
 *
 * The format must stay identical to lib/password.ts (tests/password.test.ts
 * checks that both sides accept each other's hashes).
 */
const crypto = require('node:crypto')

const PREFIX = 'scrypt'
const N = 16384
const R = 8
const P = 1
const KEY_LEN = 64

const scrypt = (password, salt, keylen, options) =>
  new Promise((resolve, reject) => crypto.scrypt(password, salt, keylen, options, (e, k) => (e ? reject(e) : resolve(k))))

const isHashed = v => typeof v === 'string' && v.startsWith(`${PREFIX}$`)

async function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const key = await scrypt(password, salt, KEY_LEN, { N, r: R, p: P })
  return [PREFIX, N, R, P, salt.toString('base64'), key.toString('base64')].join('$')
}

async function verifyHash(password, stored) {
  const [, n, r, p, saltB64, hashB64] = stored.split('$')
  const expected = Buffer.from(hashB64 || '', 'base64')
  const key = await scrypt(password, Buffer.from(saltB64 || '', 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p) })
  return key.length === expected.length && crypto.timingSafeEqual(key, expected)
}

async function main() {
  require('dotenv').config({ path: '.env.local', quiet: true })
  const { createClient } = require('@supabase/supabase-js')
  const apply = process.argv.includes('--apply')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  const { data: users, error } = await db.from('app_users').select('id, username, password')
  if (error) throw new Error(error.message)

  const plain = users.filter(u => u.password && !isHashed(u.password))
  const hashed = users.filter(u => isHashed(u.password))
  const empty = users.filter(u => !u.password)
  console.log(`Пользователей: ${users.length} · с открытым паролем: ${plain.length} · уже с хешем: ${hashed.length} · с пустым паролем: ${empty.length}`)
  if (empty.length) console.log(`Пустой пароль (войти не могут, нужно задать пароль на странице «Пользователи»): ${empty.map(u => u.username).join(', ')}`)

  if (!apply) {
    console.log('\nЭто пробный запуск, ничего не записано. Чтобы захешировать: node scripts/hash-existing-passwords.js --apply')
    return
  }

  let done = 0
  for (const u of plain) {
    const hash = await hashPassword(u.password)
    if (!(await verifyHash(u.password, hash))) throw new Error(`Хеш для «${u.username}» не прошёл самопроверку, остановлено`)
    // Only touch the row if nobody changed the password in the meantime
    const { error: e, count } = await db.from('app_users').update({ password: hash }, { count: 'exact' }).eq('id', u.id).eq('password', u.password)
    if (e) throw new Error(`«${u.username}»: ${e.message}`)
    if (count) done++
  }
  console.log(`\nГотово: захешировано ${done} из ${plain.length}`)
}

module.exports = { hashPassword, verifyHash, isHashed }

if (require.main === module) {
  main().catch(e => {
    console.error('ОШИБКА:', e.message)
    process.exit(1)
  })
}
