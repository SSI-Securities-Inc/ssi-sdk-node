import { randomBytes } from 'crypto';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DEFAULT_SIZE = 20;

/** Generate a random request ID matching nanoid algorithm. */
export function generateRequestId(alphabet = ALPHABET, size = DEFAULT_SIZE): string {
  const alphabetLen = alphabet.length;
  const mask = (2 << (31 - Math.clz32((alphabetLen - 1) | 1))) - 1;
  const step = Math.ceil((1.6 * mask * size) / alphabetLen);

  let result = '';
  while (true) {
    const bytes = randomBytes(step);
    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i] & mask;
      if (byte < alphabetLen) {
        result += alphabet[byte];
        if (result.length === size) {
          return result;
        }
      }
    }
  }
}
