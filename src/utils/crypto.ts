import { createHash } from 'crypto';

// DER prefix for SHA-256 AlgorithmIdentifier (PKCS#1 v1.5 DigestInfo header)
const SHA256_DER_PREFIX = Buffer.from([
  0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86,
  0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05,
  0x00, 0x04, 0x20,
]);

/**
 * Parse a base64-encoded XML RSA private key and return { n, d } as BigInts.
 *
 * The XML must follow the .NET `RSAKeyValue` schema:
 * ```xml
 * <RSAKeyValue>
 *   <Modulus>…</Modulus>
 *   <D>…</D>
 * </RSAKeyValue>
 * ```
 */
function parseXmlRsaKey(base64Xml: string): { n: bigint; d: bigint } {
  const xml = Buffer.from(base64Xml, 'base64').toString('utf-8');

  const getTag = (tag: string): bigint => {
    const match = xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`));
    if (!match) throw new Error(`RSA XML key missing <${tag}> element`);
    const bytes = Buffer.from(match[1].trim(), 'base64');
    return BigInt('0x' + bytes.toString('hex'));
  };

  return { n: getTag('Modulus'), d: getTag('D') };
}

/**
 * PKCS#1 v1.5 SHA-256 signature using Node.js built-in BigInt.
 *
 * @param data - UTF-8 string to sign
 * @param privateKey - Base64-encoded XML RSA private key
 * @returns Lower-case hex string of the signature
 */
export function sign(data: string, privateKey: string): string {
  const { n, d } = parseXmlRsaKey(privateKey);

  const digest = createHash('sha256').update(data, 'utf8').digest();
  const digestInfo = Buffer.concat([SHA256_DER_PREFIX, digest]);

  const keyLen = Math.ceil(n.toString(16).length / 2);
  const padLen = keyLen - digestInfo.length - 3;
  if (padLen < 8) throw new Error('RSA key too short for PKCS#1 v1.5 padding');

  const padded = Buffer.concat([
    Buffer.from([0x00, 0x01]),
    Buffer.alloc(padLen, 0xff),
    Buffer.from([0x00]),
    digestInfo,
  ]);

  const m = BigInt('0x' + padded.toString('hex'));
  const s = modPow(m, d, n);

  // Convert to fixed-length hex (zero-padded to key size)
  const sigHex = s.toString(16).padStart(keyLen * 2, '0');
  return sigHex;
}

/** Modular exponentiation using BigInt (right-to-left binary method). */
function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp % 2n === 1n) result = (result * base) % mod;
    exp = exp / 2n;
    base = (base * base) % mod;
  }
  return result;
}
