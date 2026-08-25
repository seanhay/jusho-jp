import { describe, expect, it } from 'vitest';
import { discover, readPostcode } from '../src/discover.ts';

const mount = (html: string) => {
	document.body.innerHTML = html;
	return document.body;
};

describe('discover', () => {
	it('finds fields by the standard autocomplete attributes', () => {
		const root = mount(`
			<form>
				<input autocomplete="postal-code" id="a">
				<input autocomplete="address-level1" id="b">
				<input autocomplete="address-level2" id="c">
				<input autocomplete="address-line1" id="d">
			</form>`);
		const [set] = discover(root);
		expect(set!.postcode.map((i) => i.id)).toEqual(['a']);
		expect(set!.prefecture?.id).toBe('b');
		expect(set!.city?.id).toBe('c');
		expect(set!.town?.id).toBe('d');
	});

	it('finds fields by common Japanese name conventions', () => {
		const root = mount(`
			<form>
				<input name="yubinbango" id="a">
				<select name="todofuken" id="b"></select>
				<input name="shikuchoson" id="c">
				<input name="chomei" id="d" placeholder="町名・番地">
			</form>`);
		const [set] = discover(root);
		expect(set!.postcode.map((i) => i.id)).toEqual(['a']);
		expect(set!.prefecture?.id).toBe('b');
		expect(set!.city?.id).toBe('c');
		expect(set!.town?.id).toBe('d');
	});

	it('identifies fields from label text when names are opaque', () => {
		const root = mount(`
			<form>
				<label for="x1">郵便番号</label><input id="x1" name="txt01">
				<label for="x2">都道府県</label><input id="x2" name="txt02">
				<label for="x3">市区町村</label><input id="x3" name="txt03">
			</form>`);
		const [set] = discover(root);
		expect(set!.postcode.map((i) => i.id)).toEqual(['x1']);
		expect(set!.prefecture?.id).toBe('x2');
		expect(set!.city?.id).toBe('x3');
	});

	it('handles a postcode split across two inputs', () => {
		const root = mount(`
			<form>
				<input name="zip1" id="a" maxlength="3">
				<input name="zip2" id="b" maxlength="4">
			</form>`);
		const [set] = discover(root);
		expect(set!.postcode.map((i) => i.id)).toEqual(['a', 'b']);
		set!.postcode[0]!.value = '100';
		set!.postcode[1]!.value = '0001';
		expect(readPostcode(set!.postcode)).toBe('1000001');
	});

	it('separates フリガナ fields from their kanji counterparts', () => {
		const root = mount(`
			<form>
				<input autocomplete="postal-code" id="a">
				<input name="pref" id="b">
				<input name="pref_kana" id="c">
				<input name="city" id="d">
				<input name="cityフリガナ" id="e">
			</form>`);
		const [set] = discover(root);
		expect(set!.prefecture?.id).toBe('b');
		expect(set!.kana.prefecture?.id).toBe('c');
		expect(set!.city?.id).toBe('d');
		expect(set!.kana.city?.id).toBe('e');
	});

	it('never claims the building/room line', () => {
		const root = mount(`
			<form>
				<input autocomplete="postal-code" id="a">
				<input autocomplete="address-line1" id="b">
				<input autocomplete="address-line2" id="c">
				<input name="building" id="d">
			</form>`);
		const [set] = discover(root);
		expect(set!.town?.id).toBe('b');
		const claimed = [set!.prefecture?.id, set!.city?.id, set!.town?.id];
		expect(claimed).not.toContain('c');
		expect(claimed).not.toContain('d');
	});

	it('lets an explicit autocomplete outrank incidental label wording', () => {
		// The label mentions "postcode" only in passing; the attribute is the
		// deliberate signal and must win.
		const root = mount(`
			<form>
				<input autocomplete="postal-code" id="z1"><input id="z2" name="zip2">
				<label for="t">町域・番地: with a datalist for multi-town postcodes</label>
				<input id="t" autocomplete="address-line1">
			</form>`);
		const [set] = discover(root);
		expect(set!.town?.id).toBe('t');
		expect(set!.postcode.map((i) => i.id)).toEqual(['z1', 'z2']);
	});

	it('prefers name over label when there is no autocomplete', () => {
		const root = mount(`
			<form>
				<input name="zip" id="z">
				<label for="c">お住まいの市区町村</label><input id="c" name="city">
			</form>`);
		const [set] = discover(root);
		expect(set!.city?.id).toBe('c');
	});

	it('keeps billing and shipping forms separate', () => {
		const root = mount(`
			<form id="billing"><input autocomplete="postal-code" id="a"><input autocomplete="address-level2" id="b"></form>
			<form id="shipping"><input autocomplete="postal-code" id="c"><input autocomplete="address-level2" id="d"></form>`);
		const sets = discover(root);
		expect(sets).toHaveLength(2);
		expect(sets[0]!.city?.id).toBe('b');
		expect(sets[1]!.city?.id).toBe('d');
	});

	it('separates two address blocks that use no <form> at all', () => {
		// Plenty of checkouts submit over fetch and never use a form. These used
		// to collapse into one block, with the two postcode inputs read as a
		// split 3 + 4 field and concatenated into nonsense.
		const root = mount(`
			<div class="billing">
				<input autocomplete="postal-code" id="z1">
				<input autocomplete="address-level2" id="c1">
			</div>
			<div class="shipping">
				<input autocomplete="postal-code" id="z2">
				<input autocomplete="address-level2" id="c2">
			</div>`);
		const sets = discover(root);
		expect(sets).toHaveLength(2);
		expect(sets[0]!.postcode.map((i) => i.id)).toEqual(['z1']);
		expect(sets[0]!.city?.id).toBe('c1');
		expect(sets[1]!.postcode.map((i) => i.id)).toEqual(['z2']);
		expect(sets[1]!.city?.id).toBe('c2');
	});

	it('still reads adjacent inputs as one split postcode', () => {
		// Nothing between them, so they are the two halves of one field.
		const root = mount(`
			<div>
				<input name="zip1" id="z1"><input name="zip2" id="z2">
				<input autocomplete="address-level2" id="c1">
			</div>`);
		const sets = discover(root);
		expect(sets).toHaveLength(1);
		expect(sets[0]!.postcode.map((i) => i.id)).toEqual(['z1', 'z2']);
	});

	it('separates two blocks that each use a split postcode', () => {
		const root = mount(`
			<div><input name="zip1" id="a1"><input name="zip2" id="a2"><input name="city" id="ac"></div>
			<div><input name="zip1" id="b1"><input name="zip2" id="b2"><input name="city" id="bc"></div>`);
		const sets = discover(root);
		expect(sets).toHaveLength(2);
		expect(sets[0]!.postcode.map((i) => i.id)).toEqual(['a1', 'a2']);
		expect(sets[0]!.city?.id).toBe('ac');
		expect(sets[1]!.postcode.map((i) => i.id)).toEqual(['b1', 'b2']);
		expect(sets[1]!.city?.id).toBe('bc');
	});

	it('does not split a single form that has one postcode', () => {
		const root = mount(`
			<form>
				<input autocomplete="postal-code" id="z">
				<select autocomplete="address-level1" id="p"></select>
				<input autocomplete="address-level2" id="c">
				<input autocomplete="address-line1" id="t">
			</form>`);
		const sets = discover(root);
		expect(sets).toHaveLength(1);
		expect(sets[0]!.town?.id).toBe('t');
	});

	it('ignores an address field that appears before any postcode', () => {
		const root = mount(`
			<div>
				<input autocomplete="address-level2" id="orphan">
				<input autocomplete="postal-code" id="z">
				<input autocomplete="address-level2" id="c">
			</div>`);
		const sets = discover(root);
		expect(sets).toHaveLength(1);
		expect(sets[0]!.city?.id).toBe('c');
	});

	it('ignores inputs that cannot hold an address', () => {
		const root = mount(`
			<form>
				<input autocomplete="postal-code" id="a">
				<input type="checkbox" name="postal-code-agree" id="b">
				<input type="hidden" name="zip_hidden" id="c">
			</form>`);
		const [set] = discover(root);
		expect(set!.postcode.map((i) => i.id)).toEqual(['a']);
	});
});
