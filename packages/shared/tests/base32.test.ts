import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode } from '../src/index';

describe('base32', () => {
  it('matches the RFC 4648 examples', () => {
    const encode = (text: string) => base32Encode(new TextEncoder().encode(text));
    expect(encode('f')).toBe('MY');
    expect(encode('fo')).toBe('MZXQ');
    expect(encode('foobar')).toBe('MZXW6YTBOI');
    expect(encode('12345678901234567890')).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });

  it('decodes what it encodes, ignoring spaces and case', () => {
    const bytes = Uint8Array.from({ length: 20 }, (_, index) => (index * 37 + 11) % 256);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
    expect(new TextDecoder().decode(base32Decode('mzxw 6ytb oi'))).toBe('foobar');
    expect(() => base32Decode('non-valido!')).toThrow(RangeError);
  });
});
