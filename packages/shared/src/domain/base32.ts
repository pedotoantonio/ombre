const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 without padding: the form authenticator apps expect for a secret. */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let text = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      text += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) text += alphabet[(value << (5 - bits)) & 31];
  return text;
}

export function base32Decode(text: string): Uint8Array {
  const clean = text.toUpperCase().replace(/[\s=]/g, '');
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const letter of clean) {
    const index = alphabet.indexOf(letter);
    if (index < 0) throw new RangeError('not a base32 text');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(bytes);
}
