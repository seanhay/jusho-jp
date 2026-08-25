import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isEmpty, populateDatalist, selectPrefecture, setValue } from '../src/dom.ts';

beforeEach(() => { document.body.innerHTML = ''; });

const input = (html = '<input>') => {
	document.body.innerHTML = html;
	return document.body.firstElementChild as HTMLInputElement;
};

describe('setValue', () => {
	it('writes the value and emits input and change', () => {
		const el = input();
		const seen: string[] = [];
		el.addEventListener('input', () => seen.push('input'));
		el.addEventListener('change', () => seen.push('change'));
		setValue(el, '東京都');
		expect(el.value).toBe('東京都');
		expect(seen).toEqual(['input', 'change']);
	});

	it('goes through the prototype setter so frameworks observe the write', () => {
		const el = input();
		// Stand in for React, which installs its own `value` on the instance and
		// would otherwise swallow the assignment without ever re-rendering.
		const shadowed = vi.fn();
		Object.defineProperty(el, 'value', {
			configurable: true,
			get: () => '',
			set: shadowed,
		});
		setValue(el, '大阪府');
		expect(shadowed).not.toHaveBeenCalled();
		// The native setter wrote through to the real DOM property.
		delete (el as unknown as Record<string, unknown>).value;
		expect(el.value).toBe('大阪府');
	});

	it('bubbles, so delegated listeners fire', () => {
		const el = input();
		const onBody = vi.fn();
		document.body.addEventListener('input', onBody);
		setValue(el, 'x');
		expect(onBody).toHaveBeenCalled();
	});
});

describe('isEmpty', () => {
	it('treats whitespace as empty', () => {
		const el = input();
		expect(isEmpty(el)).toBe(true);
		el.value = '   ';
		expect(isEmpty(el)).toBe(true);
		el.value = '東京都';
		expect(isEmpty(el)).toBe(false);
	});
});

describe('selectPrefecture', () => {
	const opts = { kanji: '東京都', kana: 'トウキョウト', romaji: 'Tokyo To', jisPrefecture: '13' };
	const select = (html: string) => {
		document.body.innerHTML = `<select>${html}</select>`;
		return document.body.firstElementChild as HTMLSelectElement;
	};

	it('matches the full kanji name', () => {
		const el = select('<option value=""></option><option>北海道</option><option>東京都</option>');
		expect(selectPrefecture(el, opts)).toBe(true);
		expect(el.value).toBe('東京都');
	});

	it('matches a name written without the 都/道/府/県 suffix', () => {
		const el = select('<option value=""></option><option>東京</option>');
		expect(selectPrefecture(el, opts)).toBe(true);
		expect(el.value).toBe('東京');
	});

	it('matches by JIS prefecture code, zero-padded or not', () => {
		expect(selectPrefecture(select('<option value="13">首都</option>'), opts)).toBe(true);
		const unpadded = select('<option value="13">x</option>');
		expect(selectPrefecture(unpadded, opts)).toBe(true);
	});

	it('matches romaji', () => {
		const el = select('<option value=""></option><option value="tokyo to">Tokyo To</option>');
		expect(selectPrefecture(el, opts)).toBe(true);
	});

	it('leaves the control untouched when nothing matches', () => {
		const el = select('<option value="foo">Foo</option><option value="bar">Bar</option>');
		el.value = 'bar';
		expect(selectPrefecture(el, opts)).toBe(false);
		expect(el.value).toBe('bar');
	});

	it('emits change so a framework-bound select updates', () => {
		const el = select('<option value=""></option><option>東京都</option>');
		const onChange = vi.fn();
		el.addEventListener('change', onChange);
		selectPrefecture(el, opts);
		expect(onChange).toHaveBeenCalled();
	});

	it('does not re-fire when already on the right option', () => {
		const el = select('<option>東京都</option>');
		el.value = '東京都';
		const onChange = vi.fn();
		el.addEventListener('change', onChange);
		expect(selectPrefecture(el, opts)).toBe(true);
		expect(onChange).not.toHaveBeenCalled();
	});
});

describe('populateDatalist', () => {
	it('fills the datalist the input points at', () => {
		document.body.innerHTML = `<input list="towns"><datalist id="towns"><option value="stale"></datalist>`;
		const el = document.body.firstElementChild as HTMLInputElement;
		populateDatalist(el, ['春日一本松', '春日一番割']);
		const list = document.getElementById('towns') as HTMLDataListElement;
		expect(Array.from(list.options).map((o) => o.value)).toEqual(['春日一本松', '春日一番割']);
	});

	it('does nothing when there is no datalist to fill', () => {
		const el = input('<input>');
		expect(() => populateDatalist(el, ['x'])).not.toThrow();
	});
});
