/** Any field we might write an address component into. */
export type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/**
 * React (and Vue's v-model, and Svelte's bind:value) install their own `value`
 * property on the element instance and reconcile against their own state. An
 * assignment to `el.value` writes straight through that and the framework never
 * learns the DOM changed, so the next render puts the old value back.
 *
 * Calling the prototype's native setter writes the same DOM property while
 * leaving the framework's tracking intact; the dispatched `input` event is then
 * what the framework actually listens for.
 */
const nativeSetter = (el: Field): ((v: string) => void) | null => {
	const proto =
		el instanceof HTMLInputElement
			? HTMLInputElement.prototype
			: el instanceof HTMLSelectElement
				? HTMLSelectElement.prototype
				: HTMLTextAreaElement.prototype;
	const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
	return setter ? (v: string) => setter.call(el, v) : null;
};

/** Writes a value and tells the page about it, framework or not. */
export function setValue(el: Field, value: string): void {
	const set = nativeSetter(el);
	if (set) set(value);
	else el.value = value;
	el.dispatchEvent(new Event('input', { bubbles: true }));
	el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** True when the field holds nothing the user would mind losing. */
export function isEmpty(el: Field): boolean {
	return el.value.trim() === '';
}

const squash = (s: string) => s.replace(/[\s　]/g, '');

/**
 * Prefecture names as they appear in a `<select>` vary: "東京都", "東京",
 * "Tokyo", or the JIS code "13". Comparing with the 都/道/府/県 suffix removed
 * catches the first two; the others are matched directly.
 */
const stripSuffix = (s: string) => squash(s).replace(/[都道府県]$/, '');

/**
 * Selects the option matching a prefecture, returning false if none does so the
 * caller can leave the control alone rather than blanking someone's selection.
 */
export function selectPrefecture(
	el: HTMLSelectElement,
	opts: { kanji: string; kana: string; romaji: string; jisPrefecture: string },
): boolean {
	const candidates = [
		opts.kanji,
		stripSuffix(opts.kanji),
		opts.kana,
		opts.romaji,
		opts.jisPrefecture,
		// Some forms number prefectures without the leading zero.
		String(Number(opts.jisPrefecture)),
		// Squashed on both sides: option text is compared with whitespace
		// removed, so "Tokyo To" must become "tokyoto" to match "Tokyo To".
	].map((c) => squash(c).toLowerCase());

	for (const option of Array.from(el.options)) {
		const text = squash(option.textContent ?? '').toLowerCase();
		const value = squash(option.value).toLowerCase();
		if (!text && !value) continue;
		const forms = new Set([text, value, stripSuffix(text), stripSuffix(value)]);
		if (candidates.some((c) => c && forms.has(c))) {
			if (el.value !== option.value) setValue(el, option.value);
			return true;
		}
	}
	return false;
}

/**
 * Offers the towns of a multi-town postcode through the `<datalist>` the input
 * already points at, if it has one. Using the page's own datalist keeps the
 * plugin out of the business of rendering and positioning a dropdown.
 */
export function populateDatalist(el: HTMLInputElement, values: string[]): void {
	const id = el.getAttribute('list');
	if (!id) return;
	const list = el.ownerDocument.getElementById(id);
	if (!(list instanceof HTMLDataListElement)) return;
	list.replaceChildren(
		...values.map((v) => {
			const option = el.ownerDocument.createElement('option');
			option.value = v;
			return option;
		}),
	);
}
