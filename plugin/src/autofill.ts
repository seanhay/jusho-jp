import type { Address, Lookup } from '../../shared/src/types.ts';
import { PostcodeClient } from './client.ts';
import { discover, readPostcode, type FieldSet } from './discover.ts';
import { isEmpty, populateDatalist, selectPrefecture, setValue, type Field } from './dom.ts';

export type Script = 'kanji' | 'kana' | 'hiragana' | 'romaji';

export interface AutofillOptions {
	/** Origin serving the postcode data. */
	baseUrl: string;
	/** Transport, if the global `fetch` is not the right one. See ClientOptions. */
	fetch?: (url: string) => Promise<Response>;
	/** Where to look for fields. Defaults to the whole document. */
	root?: ParentNode;
	/** Script for the main fields. フリガナ fields always get kana or hiragana. */
	script?: Script;
	/** Script for detected フリガナ fields. Defaults to katakana. */
	kanaScript?: 'kana' | 'hiragana';
	/**
	 * Overwrite fields the user has already filled. Off by default: a postcode
	 * corrected after the address was typed should not silently discard it.
	 */
	overwrite?: boolean;
	/** Explicit fields, when discovery gets it wrong or the markup is unusual. */
	fields?: Partial<Record<'postcode' | 'prefecture' | 'city' | 'town', string | Field>>;
	onFill?: (address: Lookup, fields: FieldSet) => void;
	onError?: (error: unknown) => void;
}

export interface AutofillHandle {
	/** Stops listening and releases the fields. */
	destroy(): void;
	/** Re-runs discovery. Call after adding an address form to the page. */
	refresh(): void;
	client: PostcodeClient;
}

function resolve(root: ParentNode, value: string | Field): Field | null {
	return typeof value === 'string' ? (root.querySelector(value) as Field | null) : value;
}

/**
 * Wires every address form found under `root` to postcode lookup.
 *
 * Returns a handle rather than nothing so single-page apps can tear listeners
 * down on unmount and re-run discovery when a form appears later.
 */
export function autofill(options: AutofillOptions): AutofillHandle {
	const {
		baseUrl,
		root = document,
		script = 'kanji',
		kanaScript = 'kana',
		overwrite = false,
		onFill,
		onError,
	} = options;

	const client = new PostcodeClient({ baseUrl, fetch: options.fetch });
	let bindings: { inputs: HTMLInputElement[]; handler: () => void }[] = [];

	/**
	 * The value this instance last wrote into each field.
	 *
	 * `overwrite: false` protects what the *user* typed, not what we typed. A
	 * postcode corrected after a first lookup has to replace the first answer,
	 * or the form keeps an address the user never chose and has no reason to
	 * re-check. Comparing against what we wrote separates the two cases: if the
	 * field still holds our value the user has not touched it, and if it does
	 * not, they have and we leave it alone.
	 */
	const written = new WeakMap<Field, string>();

	const mayWrite = (el: Field) => overwrite || isEmpty(el) || el.value === written.get(el);

	const write = (el: Field | undefined, value: string, address: Address) => {
		if (!el || !value || !mayWrite(el)) return;
		if (el instanceof HTMLSelectElement) {
			selectPrefecture(el, {
				kanji: address.prefecture.kanji,
				kana: address.prefecture.kana,
				romaji: address.prefecture.romaji,
				jisPrefecture: address.jis.slice(0, 2),
			});
		} else {
			setValue(el, value);
		}
		// Read back rather than storing `value`: a select records the option's
		// value, which is rarely the prefecture name we matched on.
		written.set(el, el.value);
	};

	const fill = (set: FieldSet, address: Lookup) => {
		write(set.prefecture, address.prefecture[script], address);
		write(set.city, address.city[script], address);
		write(set.town, address.town[script], address);
		write(set.kana.prefecture, address.prefecture[kanaScript], address);
		write(set.kana.city, address.city[kanaScript], address);
		write(set.kana.town, address.town[kanaScript], address);

		// Around 2,300 postcodes list no town. If one of ours filled the field
		// earlier, leaving it would strand a town under a different city.
		if (!address.town.kanji) {
			for (const el of [set.town, set.kana.town]) {
				if (el && !isEmpty(el) && el.value === written.get(el)) {
					setValue(el, '');
					written.set(el, '');
				}
			}
		}

		// Several towns share this postcode and only their common prefix was
		// filled; offer the rest through the page's own datalist if it has one.
		// Always called, including with nothing to offer, so options from the
		// previous postcode do not linger behind the next one.
		if (set.town instanceof HTMLInputElement) {
			const variants =
				address.partialTown && address.towns?.length
					? address.towns.map((t) => t[script] ?? t.kanji)
					: [];
			populateDatalist(set.town, variants);
		}
		onFill?.(address, set);
	};

	const bind = (set: FieldSet) => {
		let generation = 0;
		const handler = () => {
			const raw = readPostcode(set.postcode);
			client.prefetch(raw);
			const current = ++generation;
			client
				.lookup(raw)
				.then((address) => {
					// Discard a slow answer that a newer keystroke has superseded.
					if (address && current === generation) fill(set, address);
				})
				.catch((err) => onError?.(err));
		};
		for (const input of set.postcode) {
			input.addEventListener('input', handler);
			// Paste and autofill do not always emit `input` in every browser.
			input.addEventListener('change', handler);
		}
		bindings.push({ inputs: set.postcode, handler });
	};

	const teardown = () => {
		for (const { inputs, handler } of bindings) {
			for (const input of inputs) {
				input.removeEventListener('input', handler);
				input.removeEventListener('change', handler);
			}
		}
		bindings = [];
	};

	const refresh = () => {
		teardown();
		if (options.fields?.postcode) {
			const postcode = resolve(root, options.fields.postcode);
			if (postcode instanceof HTMLInputElement) {
				bind({
					postcode: [postcode],
					prefecture: options.fields.prefecture ? resolve(root, options.fields.prefecture) ?? undefined : undefined,
					city: options.fields.city ? resolve(root, options.fields.city) ?? undefined : undefined,
					town: options.fields.town ? resolve(root, options.fields.town) ?? undefined : undefined,
					kana: {},
				});
			}
			return;
		}
		for (const set of discover(root)) bind(set);
	};

	refresh();
	return { destroy: teardown, refresh, client };
}
