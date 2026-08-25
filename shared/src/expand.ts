import {
	FLAG_PARTIAL_TOWN,
	type Lookup,
	type Shard,
	type ShardEntry,
	type TownVariant,
} from './types.ts';

/** Normalises "100-0001", "１０００００１", "100 0001" -> "1000001". */
export function normalisePostcode(input: string): string | null {
	const digits = input
		.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
		.replace(/[^0-9]/g, '');
	return digits.length === 7 ? digits : null;
}

/** Rehydrates one shard entry into a full address, variants included. */
export function expandShardEntry(shard: Shard, postcode: string, entry: ShardEntry): Lookup {
	const [cityIdx, townKanji, townKana, townRomaji, jis, flags, note] = entry;
	const city = shard.c[cityIdx]!;
	const pref = shard.p[city[3]]!;
	const variants = shard.t?.[postcode.slice(3)];
	const towns: TownVariant[] | undefined = variants?.map(([kanji, kana, romaji, note]) => ({
		kanji,
		kana,
		hiragana: toHiragana(kana),
		romaji,
		...(note ? { note } : {}),
	}));
	return {
		postcode,
		jis,
		prefecture: { kanji: pref[0], kana: pref[1], hiragana: toHiragana(pref[1]), romaji: pref[2] },
		city: { kanji: city[0], kana: city[1], hiragana: toHiragana(city[1]), romaji: city[2] },
		town: { kanji: townKanji, kana: townKana, hiragana: toHiragana(townKana), romaji: townRomaji },
		...(flags & FLAG_PARTIAL_TOWN ? { partialTown: true as const } : {}),
		...(note ? { note } : {}),
		...(towns?.length ? { towns } : {}),
	};
}

/** Katakana -> hiragana. The two blocks are a fixed 0x60 apart. */
export function toHiragana(s: string): string {
	return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}
