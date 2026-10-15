import { createHash, randomBytes } from 'crypto';
import { ValidationError } from '../exceptions.js';

// DER prefix for SHA-256 AlgorithmIdentifier (PKCS#1 v1.5 DigestInfo header)
const SHA256_DER_PREFIX = Buffer.from([
  0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86,
  0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05,
  0x00, 0x04, 0x20,
]);

export type SignatureEncoding = 'hex' | 'base64';

interface RsaKey {
  n: bigint;
  e: bigint | null;
  d: bigint;
}

function bytesToBigInt(bytes: Buffer): bigint {
  return bytes.length === 0 ? 0n : BigInt('0x' + bytes.toString('hex'));
}

/**
 * Parse a base64-encoded XML RSA key (.NET `RSAKeyValue`) into `{ n, e, d }`.
 * `e` is null when the XML has no Exponent. Throws a plain Error on anything malformed;
 * callers must not echo the message (it never contains key material).
 */
function parseXmlRsaKey(base64Xml: string): RsaKey {
  const xml = Buffer.from(base64Xml, 'base64').toString('utf-8');
  const getTag = (tag: string): bigint | null => {
    const match = new RegExp(`<${tag}>([^<]+)</${tag}>`).exec(xml);
    if (!match) return null;
    const value = bytesToBigInt(Buffer.from(match[1].trim(), 'base64'));
    return value > 0n ? value : null;
  };
  const n = getTag('Modulus');
  const d = getTag('D');
  if (n === null || d === null) throw new Error('incomplete key');
  return { n, e: getTag('Exponent'), d };
}

/** Modular exponentiation using BigInt (right-to-left binary method). */
function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

/** Modular inverse via the extended Euclidean algorithm (requires gcd(a, m) == 1). */
function modInv(a: bigint, m: bigint): bigint {
  let [oldR, r] = [a % m, m];
  let [oldS, s] = [1n, 0n];
  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  return ((oldS % m) + m) % m;
}

/** A random integer in [2, n - 2] from the OS CSPRNG. */
function randomBelow(n: bigint): bigint {
  const byteLen = Math.ceil(n.toString(16).length / 2) + 8; // extra bytes keep the bias negligible
  return (bytesToBigInt(randomBytes(byteLen)) % (n - 3n)) + 2n;
}

/**
 * RSA private-key operation with base blinding and a result check.
 *
 * Blinding randomises the value `d` is applied to, which blunts timing attacks (BigInt
 * arithmetic is not constant-time). With the public exponent known the signature is
 * verified before it is returned, so a faulty computation can never leak a bad signature.
 */
function privateOp(m: bigint, key: RsaKey): bigint {
  const { n, e, d } = key;
  if (e === null) return modPow(m, d, n);
  let r: bigint;
  do {
    r = randomBelow(n);
  } while (gcd(r, n) !== 1n);
  const blinded = (m * modPow(r, e, n)) % n;
  const s = (modPow(blinded, d, n) * modInv(r, n)) % n;
  if (modPow(s, e, n) !== m) {
    throw new ValidationError('signing failed an internal consistency check');
  }
  return s;
}

/**
 * RSA PKCS#1 v1.5 SHA-256 signature using Node's built-in BigInt.
 *
 * @param data - UTF-8 string to sign
 * @param privateKey - Base64-encoded XML RSA private key
 * @param encoding - `hex` (REST `X-Signature`) or `base64` (trading WebSocket)
 * @throws ValidationError if the key is missing/malformed or the encoding is unknown.
 */
export function sign(data: string, privateKey: string, encoding: SignatureEncoding = 'hex'): string {
  if (!privateKey) throw new ValidationError('private_key is required to sign this request');
  if (encoding !== 'hex' && encoding !== 'base64') {
    throw new ValidationError(`signature encoding must be 'hex' or 'base64', got '${String(encoding)}'`);
  }
  let key: RsaKey;
  try {
    key = parseXmlRsaKey(privateKey);
  } catch {
    // Never echo key material or parser internals.
    throw new ValidationError('private_key is not a valid base64-encoded XML RSA key');
  }

  const digest = createHash('sha256').update(data, 'utf8').digest();
  const digestInfo = Buffer.concat([SHA256_DER_PREFIX, digest]);

  const keyLen = Math.ceil(key.n.toString(16).length / 2);
  const padLen = keyLen - digestInfo.length - 3;
  if (padLen < 8) throw new ValidationError('private_key is not a valid base64-encoded XML RSA key');

  const padded = Buffer.concat([
    Buffer.from([0x00, 0x01]),
    Buffer.alloc(padLen, 0xff),
    Buffer.from([0x00]),
    digestInfo,
  ]);

  const s = privateOp(bytesToBigInt(padded), key);
  const raw = Buffer.from(s.toString(16).padStart(keyLen * 2, '0'), 'hex');
  return encoding === 'base64' ? raw.toString('base64') : raw.toString('hex');
}
