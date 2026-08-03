import { randomBytes, randomUUID } from 'node:crypto';

/** 128-bit base64url secret, e.g. k3Jf9QwLm2Xb7RtY0aZpNg */
export function newToken(): string {
	return randomBytes(16).toString('base64url');
}

/** no vowels (no accidental words), no ambiguous glyphs (0/O, 1/I/L, S/5, B/8, Z/2) */
const CODE_ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY3479';

export function newCode(length = 6): string {
	const bytes = randomBytes(length);
	let out = '';
	for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
	return out;
}

export function newDeviceId(): string {
	return randomUUID();
}

/** firstname-lastname, diacritics stripped: `Łukasz Stanik` -> `lukasz-stanik` */
export function slugify(name: string): string {
	return name
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/ł/g, 'l')
		.replace(/Ł/g, 'L')
		.replace(/ø/gi, 'o')
		.replace(/đ/gi, 'd')
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}
