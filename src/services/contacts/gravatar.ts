import { getContactByEmail, updateContactAvatar } from "@/services/db/contacts";

/**
 * Simple MD5 implementation for Gravatar hashes.
 * Web Crypto doesn't support MD5, so we use this minimal implementation.
 */
function md5(input: string): string {
  function safeAdd(x: number, y: number) {
    const lsw = (x & 0xffff) + (y & 0xffff);
    return (((x >> 16) + (y >> 16) + (lsw >> 16)) << 16) | (lsw & 0xffff);
  }
  function bitRotateLeft(num: number, cnt: number) {
    return (num << cnt) | (num >>> (32 - cnt));
  }
  function md5cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  }
  function md5ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn((b & c) | (~b & d), a, b, x, s, t);
  }
  function md5gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
  }
  function md5hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function md5ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn(c ^ (b | ~d), a, b, x, s, t);
  }

  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    bytes.push(input.charCodeAt(i) & 0xff);
  }
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const bitLen = input.length * 8;
  bytes.push(bitLen & 0xff, (bitLen >> 8) & 0xff, (bitLen >> 16) & 0xff, (bitLen >> 24) & 0xff, 0, 0, 0, 0);

  const x: number[] = [];
  for (let i = 0; i < bytes.length; i += 4) {
    x.push(bytes[i]! | (bytes[i + 1]! << 8) | (bytes[i + 2]! << 16) | (bytes[i + 3]! << 24));
  }

  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
  for (let i = 0; i < x.length; i += 16) {
    const aa = a, bb = b, cc = c, dd = d;
    a = md5ff(a, b, c, d, x[i]!,  7, -680876936); d = md5ff(d, a, b, c, x[i+1]!,  12, -389564586);
    c = md5ff(c, d, a, b, x[i+2]!,  17, 606105819); b = md5ff(b, c, d, a, x[i+3]!,  22, -1044525330);
    a = md5ff(a, b, c, d, x[i+4]!,  7, -176418897); d = md5ff(d, a, b, c, x[i+5]!,  12, 1200080426);
    c = md5ff(c, d, a, b, x[i+6]!,  17, -1473231341); b = md5ff(b, c, d, a, x[i+7]!,  22, -45705983);
    a = md5ff(a, b, c, d, x[i+8]!,  7, 1770035416); d = md5ff(d, a, b, c, x[i+9]!,  12, -1958414417);
    c = md5ff(c, d, a, b, x[i+10]!, 17, -42063); b = md5ff(b, c, d, a, x[i+11]!, 22, -1990404162);
    a = md5ff(a, b, c, d, x[i+12]!, 7, 1804603682); d = md5ff(d, a, b, c, x[i+13]!, 12, -40341101);
    c = md5ff(c, d, a, b, x[i+14]!, 17, -1502002290); b = md5ff(b, c, d, a, x[i+15]!, 22, 1236535329);
    a = md5gg(a, b, c, d, x[i+1]!,  5, -165796510); d = md5gg(d, a, b, c, x[i+6]!,  9, -1069501632);
    c = md5gg(c, d, a, b, x[i+11]!, 14, 643717713); b = md5gg(b, c, d, a, x[i]!,    20, -373897302);
    a = md5gg(a, b, c, d, x[i+5]!,  5, -701558691); d = md5gg(d, a, b, c, x[i+10]!, 9, 38016083);
    c = md5gg(c, d, a, b, x[i+15]!, 14, -660478335); b = md5gg(b, c, d, a, x[i+4]!,  20, -405537848);
    a = md5gg(a, b, c, d, x[i+9]!,  5, 568446438); d = md5gg(d, a, b, c, x[i+14]!, 9, -1019803690);
    c = md5gg(c, d, a, b, x[i+3]!,  14, -187363961); b = md5gg(b, c, d, a, x[i+8]!,  20, 1163531501);
    a = md5gg(a, b, c, d, x[i+13]!, 5, -1444681467); d = md5gg(d, a, b, c, x[i+2]!,  9, -51403784);
    c = md5gg(c, d, a, b, x[i+7]!,  14, 1735328473); b = md5gg(b, c, d, a, x[i+12]!, 20, -1926607734);
    a = md5hh(a, b, c, d, x[i+5]!,  4, -378558); d = md5hh(d, a, b, c, x[i+8]!,  11, -2022574463);
    c = md5hh(c, d, a, b, x[i+11]!, 16, 1839030562); b = md5hh(b, c, d, a, x[i+14]!, 23, -35309556);
    a = md5hh(a, b, c, d, x[i+1]!,  4, -1530992060); d = md5hh(d, a, b, c, x[i+4]!,  11, 1272893353);
    c = md5hh(c, d, a, b, x[i+7]!,  16, -155497632); b = md5hh(b, c, d, a, x[i+10]!, 23, -1094730640);
    a = md5hh(a, b, c, d, x[i+13]!, 4, 681279174); d = md5hh(d, a, b, c, x[i]!,    11, -358537222);
    c = md5hh(c, d, a, b, x[i+3]!,  16, -722521979); b = md5hh(b, c, d, a, x[i+6]!,  23, 76029189);
    a = md5hh(a, b, c, d, x[i+9]!,  4, -640364487); d = md5hh(d, a, b, c, x[i+12]!, 11, -421815835);
    c = md5hh(c, d, a, b, x[i+15]!, 16, 530742520); b = md5hh(b, c, d, a, x[i+2]!,  23, -995338651);
    a = md5ii(a, b, c, d, x[i]!,    6, -198630844); d = md5ii(d, a, b, c, x[i+7]!,  10, 1126891415);
    c = md5ii(c, d, a, b, x[i+14]!, 15, -1416354905); b = md5ii(b, c, d, a, x[i+5]!,  21, -57434055);
    a = md5ii(a, b, c, d, x[i+12]!, 6, 1700485571); d = md5ii(d, a, b, c, x[i+3]!,  10, -1894986606);
    c = md5ii(c, d, a, b, x[i+10]!, 15, -1051523); b = md5ii(b, c, d, a, x[i+1]!,  21, -2054922799);
    a = md5ii(a, b, c, d, x[i+8]!,  6, 1873313359); d = md5ii(d, a, b, c, x[i+15]!, 10, -30611744);
    c = md5ii(c, d, a, b, x[i+6]!,  15, -1560198380); b = md5ii(b, c, d, a, x[i+13]!, 21, 1309151649);
    a = md5ii(a, b, c, d, x[i+4]!,  6, -145523070); d = md5ii(d, a, b, c, x[i+11]!, 10, -1120210379);
    c = md5ii(c, d, a, b, x[i+2]!,  15, 718787259); b = md5ii(b, c, d, a, x[i+9]!,  21, -343485551);
    a = safeAdd(a, aa); b = safeAdd(b, bb); c = safeAdd(c, cc); d = safeAdd(d, dd);
  }

  const hex = "0123456789abcdef";
  let result = "";
  for (const n of [a, b, c, d]) {
    for (let j = 0; j < 4; j++) {
      result += hex[(n >> (j * 8 + 4)) & 0xf]! + hex[(n >> (j * 8)) & 0xf]!;
    }
  }
  return result;
}

export function getGravatarUrl(email: string): string {
  const hash = md5(email.trim().toLowerCase());
  return `https://www.gravatar.com/avatar/${hash}?d=404&s=80`;
}

export async function fetchAndCacheGravatarUrl(email: string): Promise<string | null> {
  // Check if we already have a cached avatar
  const contact = await getContactByEmail(email);
  if (contact?.avatar_url) return contact.avatar_url;

  const url = getGravatarUrl(email);
  try {
    const response = await fetch(url, { method: "HEAD" });
    if (response.ok) {
      await updateContactAvatar(email, url);
      return url;
    }
  } catch {
    // Network error — ignore
  }
  return null;
}
