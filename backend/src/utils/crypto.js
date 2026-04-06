'use strict';

const crypto = require('crypto');

const ALGO = 'aes-256-gcm';

// Derive a 32-byte key from ENCRYPTION_KEY or SESSION_SECRET
function getKey() {
  const raw = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!raw) throw new Error('[crypto] ENCRYPTION_KEY or SESSION_SECRET must be set');
  return crypto.createHash('sha256').update(raw).digest();
}

// Returns "ivHex:authTagHex:ciphertextHex"
function encrypt(plaintext) {
  const key = getKey();
  const iv  = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

// Returns plaintext, or null on failure
function decrypt(value) {
  if (!isEncrypted(value)) return null;
  try {
    const [ivHex, tagHex, encHex] = value.split(':');
    const key      = getKey();
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
  } catch {
    return null;
  }
}

// Encrypted values look like three colon-separated hex strings
function isEncrypted(value) {
  return typeof value === 'string' && /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/.test(value);
}

function resolveStoredSecret(value) {
  if (typeof value !== 'string' || !value) return null;
  if (isEncrypted(value)) return decrypt(value);
  return value;
}

module.exports = { encrypt, decrypt, isEncrypted, resolveStoredSecret };
