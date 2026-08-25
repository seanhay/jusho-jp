# jusho-jp

[![npm](https://img.shields.io/npm/v/jusho-jp?color=cb3837&logo=npm)](https://www.npmjs.com/package/jusho-jp)
[![provenance](https://img.shields.io/badge/provenance-verified-2f6f4f)](https://www.npmjs.com/package/jusho-jp#provenance)
[![licence](https://img.shields.io/npm/l/jusho-jp?color=555)](LICENSE)

**日本語** | [English](#english)

郵便番号を入力すると、住所欄が自動で埋まります。約3KB、依存関係なし。

漢字・カタカナ・ひらがな・ローマ字に対応し、日本のフォームによくあるフリガナ欄も同時に入力します。

**[デモを試す](https://jusho.srh.workers.dev)**

## インストール

```bash
npm install jusho-jp
```

```ts
import { autofill } from 'jusho-jp';

autofill({ baseUrl: 'https://jusho.srh.workers.dev' });
```

これで完了です。住所欄はページから自動で見つけます。`baseUrl` は住所データの配信元です。

ビルドツールを使わない場合:

```html
<script src="https://unpkg.com/jusho-jp/dist/jusho.global.js"></script>
<script>
  jusho.autofill({ baseUrl: 'https://jusho.srh.workers.dev' });
</script>
```

## フィールドの検出

次の順で判別します。

1. **`autocomplete` 属性**: `postal-code`、`address-level1`（都道府県）、`address-level2`（市区町村）、`address-line1`（町域）
2. **`name` と `id`**: `zip`、`yubinbango`、`todofuken`、`shikuchoson` など。snake_case、kebab-case、camelCase に対応します
3. **ラベルの文言**: `<label>郵便番号</label>` があれば、`name` が `txt01` のような欄でも判別できます

`autocomplete` 属性を付けておくのが最も確実です。ブラウザ自身の自動入力も同じ属性を使います。

フリガナを示す語（`kana`、`furigana`、`カナ`、`ヨミ` など）を含む欄は、対応する漢字欄のフリガナとして扱います。

`address-line2`、建物名、部屋番号には書き込みません。

### 対応しているフォームの形

| | |
|---|---|
| 分割された郵便番号 | `<input name="zip1">` と `<input name="zip2">` を1つの値として読みます |
| 都道府県の `<select>` | `東京都`、`東京`、`Tokyo To`、値が `13` のいずれでも選べます |
| 1ページに複数の住所 | 請求先と配送先を別々に扱います。`<form>` がなくても住所欄の並びから判断します |

検出がうまくいかない場合は、明示的に指定できます。

```ts
autofill({
  baseUrl: '…',
  fields: { postcode: '#zip', prefecture: '#pref', city: '#city', town: '#town' },
});
```

## 動作について

知っておくと役に立つ挙動が4つあります。

**入力済みの欄は上書きしません。** ただし、このライブラリ自身が入れた値は更新します。郵便番号を打ち直したときに古い住所が残っていては困るためです。すべて上書きするには `overwrite: true` を指定します。

**町域がない郵便番号があります。** 約2,300件は「以下に掲載がない場合」で、これは町域が存在しないことを表す文言です。地名ではないため、町域欄は空のままにします。

**複数の町域を持つ郵便番号があります。** 452-0961 には66件の町域が含まれます。町域欄には共通部分の `春日` だけを入れ、`partialTown` を立てて全件を `towns` で返します。入力欄に `<datalist>` を付けると候補が自動で表示されます。

```html
<input autocomplete="address-line1" list="towns">
<datalist id="towns"></datalist>
```

**括弧内の補足は分離します。** `大手町（次のビルを除く）` は、町域の `大手町` と `note` の `次のビルを除く` に分かれます。`note` は参考情報なので入力欄には入れないでください。

## 通信

キーストロークごとではなく、フォームごとに1回だけ通信します。郵便番号の上3桁を入力した時点で、その範囲の住所をまとめて取得します。残りの4桁と入力の訂正は、通信せずに解決します。

## オプション

```ts
autofill(options): AutofillHandle
```

| オプション | 既定値 | 内容 |
|---|---|---|
| `baseUrl` | 必須 | 住所データの配信元 |
| `root` | `document` | 検出対象の範囲 |
| `script` | `'kanji'` | `kanji` / `kana` / `hiragana` / `romaji` |
| `kanaScript` | `'kana'` | フリガナ欄に入れる表記 |
| `overwrite` | `false` | 入力済みの値も上書きするか |
| `fields` | なし | 検出を使わず明示的に指定する |
| `onFill` | なし | `(address, fields) => void` |
| `onError` | なし | `(error) => void` |

戻り値は `{ destroy(), refresh(), client }` です。ページに住所フォームを後から追加した場合は `refresh()` を呼んでください。

## フレームワーク

値はネイティブのセッター経由で書き込み、`input` と `change` を発火させます。そのため React、Vue、Svelte のいずれでも変更が検知されます。

```tsx
useEffect(() => {
  const handle = autofill({ baseUrl: '…', root: formRef.current! });
  return () => handle.destroy();
}, []);
```

## DOM を使わない検索

```ts
import { PostcodeClient } from 'jusho-jp';

const client = new PostcodeClient({ baseUrl: '…' });

await client.lookup('100-0001');   // 住所、見つからなければ null
await client.suggest('100', 20);   // 先頭一致する郵便番号の一覧
client.prefetch('100');            // 3桁目の入力時に先読み
```

## データについて

日本郵便が公開している郵便番号データを使っています。日本郵便は「郵便番号データに限っては日本郵便株式会社は著作権を主張しません。自由に配布していただいて結構です。」と明記しています。

データは毎月更新されます。日本郵便のリリースに合わせて自動で取り込んでいるため、`baseUrl` から取得できる内容は常に最新です。

## ライセンス

MIT。郵便番号データは日本郵便のもので、著作権は主張されていません。

---

## English

[日本語](#jusho-jp) | **English**

Type a Japanese postcode and the address fields fill themselves. About 3 KB, no
dependencies.

Kanji, katakana, hiragana and romaji, including the フリガナ fields Japanese
forms usually carry alongside.

**[Try the demo](https://jusho.srh.workers.dev)**

## Install

```bash
npm install jusho-jp
```

```ts
import { autofill } from 'jusho-jp';

autofill({ baseUrl: 'https://jusho.srh.workers.dev' });
```

That is the whole setup. It finds the address fields itself. `baseUrl` is where
the postcode data is served from.

Without a build step:

```html
<script src="https://unpkg.com/jusho-jp/dist/jusho.global.js"></script>
<script>
  jusho.autofill({ baseUrl: 'https://jusho.srh.workers.dev' });
</script>
```

## How fields are found

In order of preference:

1. **The `autocomplete` attribute**: `postal-code`, `address-level1`
   (prefecture), `address-level2` (city), `address-line1` (town)
2. **`name` and `id`**: `zip`, `yubinbango`, `todofuken`, `shikuchoson` and so
   on, in snake_case, kebab-case or camelCase
3. **Label text**: `<label>郵便番号</label>` identifies a field named `txt01`

Marking fields up with `autocomplete` is the most reliable, and worth doing
regardless: the browser's own autofill uses the same attributes.

Fields whose names suggest フリガナ (`kana`, `furigana`, `カナ`, `ヨミ`) are
treated as the kana counterpart of whatever they otherwise match.

`address-line2`, building and room fields are never written to.

### Form shapes it handles

| | |
|---|---|
| Split postcode | `<input name="zip1">` and `<input name="zip2">` read as one value |
| Prefecture `<select>` | Matches `東京都`, `東京`, `Tokyo To`, or the value `13` |
| Several addresses on a page | Billing and shipping stay separate, with or without `<form>` elements |

If discovery gets it wrong, name the fields yourself:

```ts
autofill({
  baseUrl: '…',
  fields: { postcode: '#zip', prefecture: '#pref', city: '#city', town: '#town' },
});
```

## Behaviour

Four things worth knowing.

**It will not overwrite what someone has typed**, but it does replace its own
earlier answer. A postcode corrected after the first lookup has to update the
address, or the form keeps one nobody chose. Pass `overwrite: true` to replace
everything regardless.

**Some postcodes have no town.** Around 2,300 are `以下に掲載がない場合`, which
describes the *absence* of a 町域 rather than naming a place, so the town field
is left blank.

**Some postcodes cover several towns.** 452-0961 covers 66. The town field gets
only the run they share (`春日`), `partialTown` is set, and the full list arrives
in `towns`. Give the input a `<datalist>` and the choices appear automatically:

```html
<input autocomplete="address-line1" list="towns">
<datalist id="towns"></datalist>
```

**Parenthesised qualifiers are separated out.** `大手町（次のビルを除く）` fills
`大手町` and puts `次のビルを除く` in `note`. That is informational, so do not put
it in a field.

## Requests

One request per form, not one per keystroke. The first three digits fetch every
postcode in that range at once, so the remaining four digits, and any correction
the user makes, resolve without going back to the network.

## Options

```ts
autofill(options): AutofillHandle
```

| Option | Default | |
|---|---|---|
| `baseUrl` | *required* | Where the postcode data is served from |
| `root` | `document` | Where to look for fields |
| `script` | `'kanji'` | `kanji` / `kana` / `hiragana` / `romaji` |
| `kanaScript` | `'kana'` | Script for detected フリガナ fields |
| `overwrite` | `false` | Replace values the user entered |
| `fields` | none | Explicit selectors, bypassing discovery |
| `onFill` | none | `(address, fields) => void` |
| `onError` | none | `(error) => void` |

Returns `{ destroy(), refresh(), client }`. Call `refresh()` after adding an
address form to the page.

## Frameworks

Values are written through the native setter and followed by `input` and
`change`, so React, Vue and Svelte all observe them.

```tsx
useEffect(() => {
  const handle = autofill({ baseUrl: '…', root: formRef.current! });
  return () => handle.destroy();
}, []);
```

## Lookups without the DOM

```ts
import { PostcodeClient } from 'jusho-jp';

const client = new PostcodeClient({ baseUrl: '…' });

await client.lookup('100-0001');   // an address, or null
await client.suggest('100', 20);   // every postcode under a prefix
client.prefetch('100');            // warm the data on the third keystroke
```

## Data

Built from the postcode data Japan Post publishes, which they permit anyone to
redistribute: *"郵便番号データに限っては日本郵便株式会社は著作権を主張しません。
自由に配布していただいて結構です。"*

Japan Post publishes monthly, and each release is picked up automatically, so
what `baseUrl` serves is never more than a month behind.

## Licence

MIT. Postal data is Japan Post's and carries no copyright claim.
