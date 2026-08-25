/** One postcode's address, in the three scripts Japanese forms ask for. */
export interface Address {
	/** 7 digits, no hyphen, leading zeros preserved. */
	postcode: string;
	prefecture: Script;
	city: Script;
	/** Empty when Japan Post lists no town for the postcode (see `townNote`). */
	town: Script;
	/**
	 * Set when the postcode covers several towns and `town` holds only the part
	 * they share. Autofill this much; make the user type the rest.
	 */
	partialTown?: true;
	/** Japan Post's parenthesised qualifier, e.g. "1〜19丁目". Never autofill this. */
	note?: string;
	/** JIS X0401/X0402 municipality code. */
	jis: string;
}

export interface Script {
	kanji: string;
	kana: string;
	hiragana: string;
	romaji: string;
}

/** A postcode that maps to more than one town. */
export interface TownVariant {
	kanji: string;
	kana: string;
	hiragana: string;
	romaji: string;
	note?: string;
}

export interface Lookup extends Address {
	/** Present only when `partialTown` is set. */
	towns?: TownVariant[];
}

/**
 * A static shard: every postcode sharing a 3-digit prefix, served as one
 * immutable file. Prefectures and cities are interned because a shard almost
 * always covers a single prefecture and a handful of cities, and inlining them
 * per entry roughly triples the payload.
 */
export interface Shard {
	/** Data vintage, e.g. "2026-07-31". */
	v: string;
	/** Interned prefectures: [kanji, kana, romaji]. */
	p: [kanji: string, kana: string, romaji: string][];
	/** Interned cities: [kanji, kana, romaji, index into `p`]. */
	c: [kanji: string, kana: string, romaji: string, pref: number][];
	/** Entries keyed by the last 4 digits of the postcode. */
	e: Record<string, ShardEntry>;
	/**
	 * Every town of the multi-town postcodes in this shard, keyed the same way.
	 * Present so a client that has the shard never needs a second request to
	 * offer the choice: only ~630 postcodes nationwide have one, so carrying
	 * them costs little and keeps the one-request-per-form property intact.
	 */
	t?: Record<string, ShardTown[]>;
}

export type ShardTown = [kanji: string, kana: string, romaji: string, note?: string];

export type ShardEntry = [
	city: number,
	townKanji: string,
	townKana: string,
	townRomaji: string,
	jis: string,
	flags: number,
	note?: string,
];

/** `town` holds only the run the postcode's several towns share. */
export const FLAG_PARTIAL_TOWN = 1;
