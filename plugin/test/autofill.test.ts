import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { autofill } from '../src/autofill.ts';

const BASE = 'https://api.test';
// Resolved from the working directory, not import.meta.url: under jsdom the
// module URL is an http:// document URL, so a relative URL against it silently
// produces a path that does not exist and every fetch 404s.
//
// JUSHO_FIXTURES lets the standalone public mirror of this package point at a
// committed fixture set instead, since it has no pipeline to generate one.
const ASSETS = resolve(process.cwd(), process.env.JUSHO_FIXTURES ?? 'api/assets/jp') + '/';
if (!existsSync(`${ASSETS}manifest.json`)) {
	throw new Error(`No data at ${ASSETS}. Run \`npm run data:build\`, or set JUSHO_FIXTURES.`);
}

/** Requests the plugin has started but not yet finished reading. */
let inFlight = 0;

/**
 * Serves the real generated shards. Stubbing the payload would let the plugin
 * and the pipeline drift apart silently: the encoding is the contract between
 * them, so the test uses the actual files.
 */
function stubFetch() {
	return vi.fn(async (input: RequestInfo | URL) => {
		inFlight++;
		try {
			const url = new URL(String(input));
			const file = url.pathname.startsWith('/jp/s/')
				? `${ASSETS}s/${url.pathname.split('/').pop()}`
				: `${ASSETS}manifest.json`;
			try {
				return new Response(readFileSync(file, 'utf-8'), { status: 200 });
			} catch {
				return new Response('not found', { status: 404 });
			}
		} finally {
			inFlight--;
		}
	});
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * A lookup is two chained requests: the manifest for the vintage, then the
 * shard, and each resolves over several ticks. Waiting on the in-flight count
 * rather than a fixed delay keeps this fast and non-flaky.
 */
const settle = async () => {
	for (let i = 0; i < 200; i++) {
		await tick();
		if (inFlight === 0) {
			// Let the .json() parse and the fill run before asserting.
			await tick();
			await tick();
			if (inFlight === 0) return;
		}
	}
};

const type = async (el: HTMLInputElement, value: string) => {
	el.value = value;
	el.dispatchEvent(new Event('input', { bubbles: true }));
	await settle();
};

beforeEach(() => {
	document.body.innerHTML = '';
	inFlight = 0;
	vi.stubGlobal('fetch', stubFetch());
});

describe('autofill', () => {
	it('fills prefecture, city and town from a postcode', async () => {
		document.body.innerHTML = `
			<form>
				<input autocomplete="postal-code" id="zip">
				<input autocomplete="address-level1" id="pref">
				<input autocomplete="address-level2" id="city">
				<input autocomplete="address-line1" id="town">
			</form>`;
		autofill({ baseUrl: BASE });
		await type(document.getElementById('zip') as HTMLInputElement, '1000001');
		expect((document.getElementById('pref') as HTMLInputElement).value).toBe('東京都');
		expect((document.getElementById('city') as HTMLInputElement).value).toBe('千代田区');
		expect((document.getElementById('town') as HTMLInputElement).value).toBe('千代田');
	});

	it('preserves the leading zero that broke the original dataset', async () => {
		document.body.innerHTML = `
			<form>
				<input autocomplete="postal-code" id="zip">
				<input autocomplete="address-level1" id="pref">
				<input autocomplete="address-level2" id="city">
			</form>`;
		autofill({ baseUrl: BASE });
		await type(document.getElementById('zip') as HTMLInputElement, '0600000');
		expect((document.getElementById('pref') as HTMLInputElement).value).toBe('北海道');
		expect((document.getElementById('city') as HTMLInputElement).value).toBe('札幌市中央区');
	});

	it('accepts a hyphenated postcode', async () => {
		document.body.innerHTML = `
			<form><input autocomplete="postal-code" id="zip"><input autocomplete="address-level2" id="city"></form>`;
		autofill({ baseUrl: BASE });
		await type(document.getElementById('zip') as HTMLInputElement, '150-0002');
		expect((document.getElementById('city') as HTMLInputElement).value).toBe('渋谷区');
	});

	it('fills from a postcode split across two inputs', async () => {
		document.body.innerHTML = `
			<form>
				<input name="zip1" id="z1"><input name="zip2" id="z2">
				<input autocomplete="address-level2" id="city">
			</form>`;
		autofill({ baseUrl: BASE });
		(document.getElementById('z1') as HTMLInputElement).value = '100';
		await type(document.getElementById('z2') as HTMLInputElement, '0001');
		expect((document.getElementById('city') as HTMLInputElement).value).toBe('千代田区');
	});

	it('fills フリガナ fields alongside the kanji ones', async () => {
		document.body.innerHTML = `
			<form>
				<input autocomplete="postal-code" id="zip">
				<input name="pref" id="pref"><input name="pref_kana" id="prefk">
				<input name="city" id="city"><input name="city_kana" id="cityk">
			</form>`;
		autofill({ baseUrl: BASE });
		await type(document.getElementById('zip') as HTMLInputElement, '1000001');
		expect((document.getElementById('pref') as HTMLInputElement).value).toBe('東京都');
		expect((document.getElementById('prefk') as HTMLInputElement).value).toBe('トウキョウト');
		expect((document.getElementById('cityk') as HTMLInputElement).value).toBe('チヨダク');
	});

	it('selects the right option in a prefecture dropdown', async () => {
		document.body.innerHTML = `
			<form>
				<input autocomplete="postal-code" id="zip">
				<select autocomplete="address-level1" id="pref">
					<option value=""></option><option>北海道</option><option>東京都</option>
				</select>
			</form>`;
		autofill({ baseUrl: BASE });
		await type(document.getElementById('zip') as HTMLInputElement, '1000001');
		expect((document.getElementById('pref') as HTMLSelectElement).value).toBe('東京都');
	});

	it('replaces its own earlier answer when the postcode changes', async () => {
		document.body.innerHTML = `
			<form>
				<input autocomplete="postal-code" id="zip">
				<input autocomplete="address-level1" id="pref">
				<input autocomplete="address-level2" id="city">
				<input autocomplete="address-line1" id="town">
			</form>`;
		autofill({ baseUrl: BASE });
		const zip = document.getElementById('zip') as HTMLInputElement;
		await type(zip, '1000001');
		expect((document.getElementById('city') as HTMLInputElement).value).toBe('千代田区');

		// Correcting a mistyped postcode must not leave the first answer behind.
		await type(zip, '4640034');
		expect((document.getElementById('pref') as HTMLInputElement).value).toBe('愛知県');
		expect((document.getElementById('city') as HTMLInputElement).value).toBe('名古屋市千種区');
		expect((document.getElementById('town') as HTMLInputElement).value).toBe('清住町');
	});

	it('clears a town it filled when the next postcode has none', async () => {
		document.body.innerHTML = `
			<form>
				<input autocomplete="postal-code" id="zip">
				<input autocomplete="address-level2" id="city">
				<input autocomplete="address-line1" id="town">
			</form>`;
		autofill({ baseUrl: BASE });
		const zip = document.getElementById('zip') as HTMLInputElement;
		const town = document.getElementById('town') as HTMLInputElement;
		await type(zip, '1000001');
		expect(town.value).toBe('千代田');
		// 060-0000 lists no town; leaving 千代田 would strand it under 札幌市中央区.
		await type(zip, '0600000');
		expect((document.getElementById('city') as HTMLInputElement).value).toBe('札幌市中央区');
		expect(town.value).toBe('');
	});

	it('clears the datalist when the next postcode has no shared towns', async () => {
		document.body.innerHTML = `
			<form>
				<input autocomplete="postal-code" id="zip">
				<input autocomplete="address-line1" id="town" list="towns">
				<datalist id="towns"></datalist>
			</form>`;
		autofill({ baseUrl: BASE });
		const zip = document.getElementById('zip') as HTMLInputElement;
		const list = document.getElementById('towns') as HTMLDataListElement;

		await type(zip, '4520961');
		expect(list.options.length).toBeGreaterThan(50);

		// A postcode with a single town must not leave 66 stale options behind:
		// emptying the field and clicking would offer towns in another prefecture.
		await type(zip, '1000001');
		expect(list.options.length).toBe(0);

		// And going back must offer them again: clearing removes the list from
		// the set of ones we own, so refilling has to put it back.
		await type(zip, '4520961');
		expect(list.options.length).toBeGreaterThan(50);
		expect(Array.from(list.options).map((o) => o.value)).toContain('春日一本松');
	});

	it('does not touch a datalist the page filled itself', async () => {
		document.body.innerHTML = `
			<form>
				<input autocomplete="postal-code" id="zip">
				<input autocomplete="address-line1" id="town" list="towns">
				<datalist id="towns"><option value="ページが用意した候補"></datalist>
			</form>`;
		autofill({ baseUrl: BASE });
		// A postcode with no variants: the page's own options must survive.
		await type(document.getElementById('zip') as HTMLInputElement, '1000001');
		const list = document.getElementById('towns') as HTMLDataListElement;
		expect(Array.from(list.options).map((o) => o.value)).toEqual(['ページが用意した候補']);
	});

	it('leaves a town the user typed when the next postcode has none', async () => {
		document.body.innerHTML = `
			<form>
				<input autocomplete="postal-code" id="zip">
				<input autocomplete="address-line1" id="town">
			</form>`;
		autofill({ baseUrl: BASE });
		const zip = document.getElementById('zip') as HTMLInputElement;
		const town = document.getElementById('town') as HTMLInputElement;
		await type(zip, '1000001');
		town.value = '自分で入れた町域';
		await type(zip, '0600000');
		expect(town.value).toBe('自分で入れた町域');
	});

	it('keeps an edit the user made to a filled field', async () => {
		document.body.innerHTML = `
			<form>
				<input autocomplete="postal-code" id="zip">
				<input autocomplete="address-level2" id="city">
				<input autocomplete="address-line1" id="town">
			</form>`;
		autofill({ baseUrl: BASE });
		const zip = document.getElementById('zip') as HTMLInputElement;
		const city = document.getElementById('city') as HTMLInputElement;
		await type(zip, '1000001');
		city.value = '手で直した市区町村';
		await type(zip, '4640034');
		expect(city.value).toBe('手で直した市区町村');
		expect((document.getElementById('town') as HTMLInputElement).value).toBe('清住町');
	});

	it('updates a prefecture select when the postcode changes', async () => {
		document.body.innerHTML = `
			<form>
				<input autocomplete="postal-code" id="zip">
				<select autocomplete="address-level1" id="pref">
					<option value=""></option><option>東京都</option><option>愛知県</option>
				</select>
			</form>`;
		autofill({ baseUrl: BASE });
		const zip = document.getElementById('zip') as HTMLInputElement;
		await type(zip, '1000001');
		expect((document.getElementById('pref') as HTMLSelectElement).value).toBe('東京都');
		await type(zip, '4640034');
		expect((document.getElementById('pref') as HTMLSelectElement).value).toBe('愛知県');
	});

	it('does not overwrite what the user already typed', async () => {
		document.body.innerHTML = `
			<form>
				<input autocomplete="postal-code" id="zip">
				<input autocomplete="address-level2" id="city" value="手入力した市区町村">
			</form>`;
		autofill({ baseUrl: BASE });
		await type(document.getElementById('zip') as HTMLInputElement, '1000001');
		expect((document.getElementById('city') as HTMLInputElement).value).toBe('手入力した市区町村');
	});

	it('overwrites when explicitly asked to', async () => {
		document.body.innerHTML = `
			<form>
				<input autocomplete="postal-code" id="zip">
				<input autocomplete="address-level2" id="city" value="古い値">
			</form>`;
		autofill({ baseUrl: BASE, overwrite: true });
		await type(document.getElementById('zip') as HTMLInputElement, '1000001');
		expect((document.getElementById('city') as HTMLInputElement).value).toBe('千代田区');
	});

	it('fills only the shared run of a multi-town postcode, and offers the rest', async () => {
		document.body.innerHTML = `
			<form>
				<input autocomplete="postal-code" id="zip">
				<input autocomplete="address-line1" id="town" list="towns">
				<datalist id="towns"></datalist>
			</form>`;
		const onFill = vi.fn();
		autofill({ baseUrl: BASE, onFill });
		await type(document.getElementById('zip') as HTMLInputElement, '4520961');
		expect((document.getElementById('town') as HTMLInputElement).value).toBe('春日');
		const list = document.getElementById('towns') as HTMLDataListElement;
		expect(list.options.length).toBeGreaterThan(50);
		expect(Array.from(list.options).map((o) => o.value)).toContain('春日一本松');
	});

	it('leaves the town blank where Japan Post lists none', async () => {
		document.body.innerHTML = `
			<form>
				<input autocomplete="postal-code" id="zip">
				<input autocomplete="address-level2" id="city">
				<input autocomplete="address-line1" id="town">
			</form>`;
		autofill({ baseUrl: BASE });
		await type(document.getElementById('zip') as HTMLInputElement, '0600000');
		expect((document.getElementById('city') as HTMLInputElement).value).toBe('札幌市中央区');
		expect((document.getElementById('town') as HTMLInputElement).value).toBe('');
	});

	it('fetches one shard for a prefix, however many postcodes are looked up', async () => {
		document.body.innerHTML = `
			<form><input autocomplete="postal-code" id="zip"><input autocomplete="address-level2" id="city"></form>`;
		autofill({ baseUrl: BASE });
		const zip = document.getElementById('zip') as HTMLInputElement;
		await type(zip, '1000001');
		await type(zip, '1000004');
		await type(zip, '1000005');
		const shardCalls = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter(
			(c) => String(c[0]).includes('/jp/s/'),
		);
		expect(shardCalls).toHaveLength(1);
	});

	it('uses an injected transport instead of the global fetch', async () => {
		// What a browser extension does: the content script cannot read packaged
		// files, so requests go through a bridge to the service worker.
		const seen: string[] = [];
		const viaBridge = async (url: string) => {
			seen.push(new URL(url).pathname);
			const file = url.includes('/jp/s/')
				? `${ASSETS}s/${url.split('/').pop()!.split('?')[0]}`
				: `${ASSETS}manifest.json`;
			return new Response(readFileSync(file, 'utf-8'), { status: 200 });
		};
		document.body.innerHTML = `
			<form><input autocomplete="postal-code" id="zip"><input autocomplete="address-level2" id="city"></form>`;
		autofill({ baseUrl: 'https://unused.invalid', fetch: viaBridge });
		await type(document.getElementById('zip') as HTMLInputElement, '1000001');
		expect((document.getElementById('city') as HTMLInputElement).value).toBe('千代田区');
		expect(seen).toEqual(['/jp/manifest.json', '/jp/s/100.json']);
		// The global fetch must not have been touched at all.
		expect((fetch as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
	});

	it('does nothing for an unknown postcode', async () => {
		document.body.innerHTML = `
			<form><input autocomplete="postal-code" id="zip"><input autocomplete="address-level2" id="city"></form>`;
		autofill({ baseUrl: BASE });
		await type(document.getElementById('zip') as HTMLInputElement, '9999999');
		expect((document.getElementById('city') as HTMLInputElement).value).toBe('');
	});

	it('stops filling after destroy()', async () => {
		document.body.innerHTML = `
			<form><input autocomplete="postal-code" id="zip"><input autocomplete="address-level2" id="city"></form>`;
		const handle = autofill({ baseUrl: BASE });
		handle.destroy();
		await type(document.getElementById('zip') as HTMLInputElement, '1000001');
		expect((document.getElementById('city') as HTMLInputElement).value).toBe('');
	});

	it('fills each address block from its own postcode, with no form elements', async () => {
		document.body.innerHTML = `
			<div class="billing">
				<input autocomplete="postal-code" id="z1"><input autocomplete="address-level2" id="c1">
			</div>
			<div class="shipping">
				<input autocomplete="postal-code" id="z2"><input autocomplete="address-level2" id="c2">
			</div>`;
		autofill({ baseUrl: BASE });
		await type(document.getElementById('z1') as HTMLInputElement, '1000001');
		expect((document.getElementById('c1') as HTMLInputElement).value).toBe('千代田区');
		expect((document.getElementById('c2') as HTMLInputElement).value).toBe('');
		await type(document.getElementById('z2') as HTMLInputElement, '4640034');
		expect((document.getElementById('c2') as HTMLInputElement).value).toBe('名古屋市千種区');
		// The first block must be untouched by the second postcode.
		expect((document.getElementById('c1') as HTMLInputElement).value).toBe('千代田区');
	});

	it('fills each form on the page from its own postcode', async () => {
		document.body.innerHTML = `
			<form id="billing"><input autocomplete="postal-code" id="z1"><input autocomplete="address-level2" id="c1"></form>
			<form id="shipping"><input autocomplete="postal-code" id="z2"><input autocomplete="address-level2" id="c2"></form>`;
		autofill({ baseUrl: BASE });
		await type(document.getElementById('z1') as HTMLInputElement, '1000001');
		expect((document.getElementById('c1') as HTMLInputElement).value).toBe('千代田区');
		expect((document.getElementById('c2') as HTMLInputElement).value).toBe('');
		await type(document.getElementById('z2') as HTMLInputElement, '5300001');
		expect((document.getElementById('c2') as HTMLInputElement).value).toBe('大阪市北区');
	});
});
