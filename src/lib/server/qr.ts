import QRCode from 'qrcode';

/** an inline SVG, so no client-side library and no external request */
export async function qrSvg(text: string, size = 320): Promise<string> {
	return QRCode.toString(text, {
		type: 'svg',
		errorCorrectionLevel: 'M',
		margin: 1,
		width: size,
		color: { dark: '#000000', light: '#ffffff' }
	});
}
