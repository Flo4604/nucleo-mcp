/** Nucleo's own default ink colour, used when a caller does not ask for one. */
export const DEFAULT_COLOR = "#1D1F21";

/**
 * The library stores inner markup only. The desktop app builds the wrapper at
 * render time, so reproduce the same shape here: a sized root element and an
 * nc-icon-wrapper group carrying the fill.
 */
export function renderSvg(
	inner: string,
	size: number | null,
	color: string = DEFAULT_COLOR,
): string {
	const box = size && size > 0 ? size : 24;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}" `
		+ `viewBox="0 0 ${box} ${box}">`
		+ `<g class="nc-icon-wrapper" fill="${color}">${inner}</g>`
		+ `</svg>`;
}
