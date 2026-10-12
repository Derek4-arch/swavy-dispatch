/* Shared server helpers: errors, passwords, tokens, codes, phone numbers and input checks. */
'use strict';
const crypto = require('node:crypto');

class UserError extends Error {
  constructor(message, status, field, code) { super(message); this.status = status || 400; this.field = field; this.code = code; }
}
const fail = (msg, field, status, code) => { throw new UserError(msg, status || 400, field, code); };

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return { salt, hash };
}
function checkPassword(password, salt, hash) {
  const a = Buffer.from(hashPassword(password, salt).hash, 'hex');
  const b = Buffer.from(String(hash), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const token = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');
const sha256 = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const code4 = () => String(crypto.randomInt(1000, 10000));
const ref = prefix => prefix + '-' + crypto.randomInt(10000, 100000);

function normPhone(v) {
  let d = String(v || '').replace(/[^\d]/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0') && d.length === 11) d = '234' + d.slice(1);
  else if (d.length === 10 && /^[789]/.test(d)) d = '234' + d;
  return d;
}
const str = (v, max = 200) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const text = (v, max = 1000) => String(v == null ? '' : v).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, max);
function int(v, field, { min = 0, max = 1e9, label = 'Amount' } = {}) {
  const n = typeof v === 'number' ? v : Number(String(v == null ? '' : v).replace(/[,₦\s]/g, ''));
  if (!Number.isFinite(n) || Math.round(n) !== n) fail(`${label} must be a whole number.`, field);
  if (n < min) fail(`${label} must be at least ${min.toLocaleString('en-NG')}.`, field);
  if (n > max) fail(`${label} is too large.`, field);
  return n;
}
const isEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const json = (v, d) => { try { return v == null ? d : JSON.parse(v); } catch (e) { return d; } };

const AREAS = {
  Lagos: ['Lekki', 'Ajah', 'Victoria Island', 'Ikoyi', 'Yaba', 'Surulere', 'Ikeja', 'Gbagada', 'Magodo', 'Festac'],
  Abuja: ['Wuse', 'Maitama', 'Garki', 'Asokoro', 'Gwarinpa', 'Jabi', 'Kubwa', 'Lugbe']
};
const cityOf = area => Object.keys(AREAS).find(c => AREAS[c].includes(area)) || '';

module.exports = { UserError, fail, hashPassword, checkPassword, token, sha256, code4, ref, normPhone, str, text, int, isEmail, json, AREAS, cityOf };
