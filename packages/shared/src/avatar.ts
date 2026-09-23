const colors = ['#6554b3', '#3265a8', '#267666', '#ad4b65', '#9b621f', '#6d5c9d', '#376f87', '#8b516a'];
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Same normalized name always has the same default avatar; no network or storage required. */
export function nameAvatar(name: string): { initials: string; color: string } {
  const normalized = name.normalize('NFC').trim().replace(/\s+/gu, ' ');
  const chars = Array.from(graphemes.segment(normalized), (part) => part.segment);
  const words = normalized.split(' ');
  let initials: string;
  if (/\p{Script=Han}/u.test(normalized)) initials = chars.slice(-2).join('');
  else if (words.length > 1) {
    const first = Array.from(graphemes.segment(words[0]!))[0]?.segment ?? '';
    const last = Array.from(graphemes.segment(words.at(-1)!))[0]?.segment ?? '';
    initials = (first + last).toLocaleUpperCase('en');
  } else initials = chars.slice(0, 2).join('').toLocaleUpperCase('en');
  let hash = 0;
  for (const character of normalized) hash = (Math.imul(hash, 31) + character.codePointAt(0)!) | 0;
  return { initials: initials || '?', color: colors[(hash >>> 0) % colors.length]! };
}
