import type { Field } from './dom.ts';

export interface FieldSet {
	/** One input, or two when the form splits the postcode into 3 + 4 digits. */
	postcode: HTMLInputElement[];
	prefecture?: Field;
	city?: Field;
	town?: Field;
	/** Parallel フリガナ fields, which Japanese forms very often have. */
	kana: { prefecture?: Field; city?: Field; town?: Field };
}

/** Normalises separators so `pref_kana`, `pref-kana` and `prefKana` all match. */
const normalise = (parts: (string | null)[]) =>
	parts
		.filter(Boolean)
		.join(' ')
		.replace(/_/g, ' ')
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.toLowerCase();

/**
 * What the page says about a field, kept in tiers rather than one blob.
 *
 * The tiers are consulted in order of how deliberate they are. Label text is
 * the weakest evidence and must not outvote an explicit `autocomplete`: a
 * 町域 field labelled "with a datalist for multi-town postcodes" contains the
 * word "postcode", and flattening everything into one string let that beat its
 * own `autocomplete="address-line1"`.
 */
function signals(el: Field) {
	const declared = normalise([el.getAttribute('autocomplete')]);
	const named = normalise([
		el.getAttribute('name'),
		el.id,
		el.getAttribute('data-address'),
	]);
	const described = normalise([
		el.getAttribute('placeholder'),
		el.getAttribute('aria-label'),
		// `labels` resolves both `<label for>` and a wrapping `<label>`, and avoids
		// having to escape an arbitrary id into a selector.
		...Array.from(el.labels ?? [], (l) => l.textContent),
	]);
	return { declared, named, described, all: `${declared} ${named} ${described}` };
}

const KANA = /kana|furigana|フリガナ|ふりがな|カナ|かな|ruby|yomi|ヨミ|読み/;
const POSTCODE = /postal|postcode|post-?code|zip|yubin|郵便|〒/;
const PREFECTURE = /address-level1|prefecture|pref\b|todofuken|都道府県|県名/;
const CITY = /address-level2|city|shikuchoson|locality|市区町村|市町村/;
const TOWN = /address-line1|address-?1\b|addr-?1\b|town|street|chome|町名|番地|丁目/;

/**
 * Fields whose names merely start with the same letters as a real match.
 * `address-line2` is the building/room line and must never be autofilled.
 */
const EXCLUDE = /address-line2|address-line3|address-?2\b|addr-?2\b|building|建物|部屋|room|apt|country|国/;

type Kind = 'postcode' | 'prefecture' | 'city' | 'town';

function match(sig: string): Kind | null {
	if (!sig) return null;
	// Postcode is tested first: a split postcode's second input often has a
	// generic name and is identified only by its neighbour's wording.
	if (POSTCODE.test(sig)) return 'postcode';
	if (PREFECTURE.test(sig)) return 'prefecture';
	if (CITY.test(sig)) return 'city';
	if (TOWN.test(sig)) return 'town';
	return null;
}

/** Strongest evidence wins; an exclusion anywhere disqualifies the field. */
function classify(sig: ReturnType<typeof signals>): Kind | null {
	if (EXCLUDE.test(sig.all)) return null;
	return match(sig.declared) ?? match(sig.named) ?? match(sig.described);
}

const isWritable = (el: Element): el is Field =>
	(el instanceof HTMLInputElement &&
		['text', 'tel', 'search', 'number', ''].includes(el.type.toLowerCase())) ||
	el instanceof HTMLSelectElement ||
	el instanceof HTMLTextAreaElement;

/**
 * Splits one run of fields into as many address blocks as it contains.
 *
 * A second postcode field means one of two things: the other half of a split
 * 3 + 4 input, or the start of a different address. They are told apart by
 * what sits between them. Nothing between is a split field, because that is
 * how those are always written. A prefecture or city in between means the
 * first address is already being filled in, so the next postcode belongs to
 * another one.
 */
function setsFrom(fields: Field[]): FieldSet[] {
	const sets: FieldSet[] = [];
	let current: FieldSet | null = null;
	/** Whether an address field has been claimed since the last postcode. */
	let claimedSince = false;

	for (const el of fields) {
		const sig = signals(el);
		const kind = classify(sig);
		if (!kind) continue;

		if (kind === 'postcode') {
			if (!(el instanceof HTMLInputElement)) continue;
			const continuesSplit = current !== null && current.postcode.length === 1 && !claimedSince;
			if (!continuesSplit || current === null) {
				current = { postcode: [], kana: {} };
				sets.push(current);
			}
			current.postcode.push(el);
			claimedSince = false;
			continue;
		}

		// An address field before any postcode has nothing to attach to.
		if (!current) continue;
		// A kana hint is worth taking from anywhere, including the label.
		const target = KANA.test(sig.all) ? current.kana : current;
		if (target[kind] === undefined) {
			target[kind] = el;
			claimedSince = true;
		}
	}
	return sets.filter((s) => s.postcode.length > 0);
}

/**
 * Finds address fields within a container, grouped per address block.
 *
 * A page can carry more than one address, billing and shipping being the usual
 * pair, and filling both from one postcode would be wrong. Where the page uses
 * `<form>` elements each is resolved independently, which is the strongest
 * signal available. Plenty of checkouts submit over fetch and use no form at
 * all, though, and those used to collapse into a single block: two separate
 * postcode inputs were read as one split field and concatenated. So each run is
 * split again on its own contents.
 */
export function discover(root: ParentNode = document): FieldSet[] {
	const elements = Array.from(root.querySelectorAll('input, select, textarea')).filter(isWritable);

	const groups = new Map<Element | null, Field[]>();
	for (const el of elements) {
		const key = el.closest('form');
		let g = groups.get(key);
		if (!g) groups.set(key, (g = []));
		g.push(el);
	}

	return [...groups.values()].flatMap(setsFrom);
}

/** Joins a split postcode, or reads a single one. */
export function readPostcode(inputs: HTMLInputElement[]): string {
	return inputs.map((i) => i.value).join('');
}
