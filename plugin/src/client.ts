import { expandShardEntry, normalisePostcode } from '../../shared/src/expand.ts';
import type { Address, Shard } from '../../shared/src/types.ts';

export interface ClientOptions {
	/** Origin serving /jp/manifest.json and /jp/s/*.json. */
	baseUrl: string;
	/** Shards to keep in memory. Each is a few KB; 24 covers heavy form use. */
	cacheSize?: number;
	/**
	 * Transport, if the global `fetch` is not the right one.
	 *
	 * A browser extension cannot read its own packaged files from a content
	 * script without exposing them to every page, so it routes requests through
	 * its service worker instead. Anything that resolves to a `Response` works:
	 * a messaging bridge, a caching wrapper, or a stub in a test.
	 */
	fetch?: (url: string) => Promise<Response>;
}

/**
 * Resolves postcodes from the static shards.
 *
 * The whole point of the shard layout is that typing a postcode costs at most
 * one network request: the first three digits fetch a file holding every
 * postcode in that prefix, so the remaining four digits, and any correction
 * the user makes, resolve from memory.
 */
export class PostcodeClient {
	readonly #baseUrl: string;
	readonly #cacheSize: number;
	readonly #fetch: (url: string) => Promise<Response>;
	readonly #shards = new Map<string, Promise<Shard | null>>();
	#vintage: Promise<string> | null = null;

	constructor(options: ClientOptions) {
		this.#baseUrl = options.baseUrl.replace(/\/$/, '');
		this.#cacheSize = options.cacheSize ?? 24;
		// Bound here rather than captured at call time: an unbound `fetch` throws
		// an illegal-invocation error in some hosts.
		this.#fetch = options.fetch ?? ((url) => fetch(url));
	}

	/** Resolves a complete postcode, or null if it is malformed or unknown. */
	async lookup(input: string): Promise<Address | null> {
		const code = normalisePostcode(input);
		if (!code) return null;
		const shard = await this.#shard(code.slice(0, 3));
		const entry = shard?.e[code.slice(3)];
		return shard && entry ? expandShardEntry(shard, code, entry) : null;
	}

	/**
	 * Call on every keystroke. Warms the shard as soon as three digits exist so
	 * the eventual lookup resolves without waiting on the network.
	 */
	prefetch(input: string): void {
		const digits = input.replace(/[^0-9０-９]/g, '');
		if (digits.length >= 3) void this.#shard(normalisePostcode(digits.padEnd(7, '0'))!.slice(0, 3));
	}

	/** Every postcode sharing a 3-to-6 digit prefix, for as-you-type suggestions. */
	async suggest(prefix: string, limit = 20): Promise<Address[]> {
		const digits = prefix.replace(/[^0-9]/g, '');
		if (digits.length < 3) return [];
		const shard = await this.#shard(digits.slice(0, 3));
		if (!shard) return [];
		const rest = digits.slice(3);
		const out: Address[] = [];
		for (const suffix of Object.keys(shard.e).sort()) {
			if (!suffix.startsWith(rest)) continue;
			out.push(expandShardEntry(shard, digits.slice(0, 3) + suffix, shard.e[suffix]!));
			if (out.length >= limit) break;
		}
		return out;
	}

	async #vintageOnce(): Promise<string> {
		this.#vintage ??= this.#fetch(`${this.#baseUrl}/jp/manifest.json`)
			.then((r) => (r.ok ? r.json() : null))
			.then((m: { vintage?: string } | null) => m?.vintage ?? 'unknown')
			.catch(() => 'unknown');
		return this.#vintage;
	}

	async #shard(prefix: string): Promise<Shard | null> {
		const cached = this.#shards.get(prefix);
		if (cached) {
			// Refresh recency for the simple LRU eviction below.
			this.#shards.delete(prefix);
			this.#shards.set(prefix, cached);
			return cached;
		}

		const pending = this.#vintageOnce()
			.then((v) => this.#fetch(`${this.#baseUrl}/jp/s/${prefix}.json?v=${encodeURIComponent(v)}`))
			.then((r) => (r.ok ? (r.json() as Promise<Shard>) : null))
			.catch(() => null);

		this.#shards.set(prefix, pending);
		// A failed fetch must not be cached as a permanent miss.
		void pending.then((s) => { if (!s) this.#shards.delete(prefix); });
		while (this.#shards.size > this.#cacheSize) {
			this.#shards.delete(this.#shards.keys().next().value!);
		}
		return pending;
	}
}
