// Adapted from charmbracelet/pi-hyper-provider (MIT), src/compression.ts.
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

// The async codecs run on libuv's threadpool, so the TUI stays responsive.
const brotliCompressAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

// Hyper inflates brotli and gzip request bodies. These are Crush's levels:
// brotli quality 5 and up doubles the CPU for a few percent fewer bytes.
const ENCODINGS = [
	{
		name: "br",
		encode: (body: Buffer) =>
			brotliCompressAsync(body, {
				params: {
					[constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
					[constants.BROTLI_PARAM_QUALITY]: 4,
					[constants.BROTLI_PARAM_SIZE_HINT]: body.length,
				},
			}),
	},
	{ name: "gzip", encode: (body: Buffer) => gzipAsync(body, { level: 6 }) },
] as const;

// Compressing a few hundred bytes saves nothing and costs a header.
const COMPRESSED_BODY_BYTES_MIN = 1024;

/**
 * Returns a wrapper that sends JSON request bodies compressed, most preferred
 * encoding first. A 400 or 415 answer means the server could not read that
 * encoding, so the request is replayed with the next one and finally plain.
 * Other statuses are never replayed: they can follow work already billed.
 * The first accepted encoding is remembered by the returned wrapper, so a
 * refusal costs one request per process, not one per turn.
 */
export function createRequestCompressor(): (fetch: Fetch | undefined) => Fetch {
	// Index into ENCODINGS where requests start; ENCODINGS.length means plain.
	let accepted = 0;

	return (fetch) => async (input, init) => {
		// Resolve at call time so a later global override still applies.
		const send = fetch ?? globalThis.fetch;
		const body = compressibleBody(init);
		if (init === undefined || body === undefined) return send(input, init);

		let attempted = false;
		for (let index = accepted; index < ENCODINGS.length; index += 1) {
			const encoding = ENCODINGS[index];
			if (encoding === undefined) break;
			const encoded = await encoding.encode(body);
			// Incompressible JSON would spend the header and the inflation for nothing.
			if (encoded.length >= body.length) continue;
			attempted = true;
			const response = await send(input, withEncodedBody(init, encoded, encoding.name));
			if (!bodyRefused(response)) {
				accepted = index;
				return response;
			}
			await response.body?.cancel();
		}

		// init still holds the original string body, which can be sent again.
		const response = await send(input, init);
		// A plain body that is refused too says nothing about encodings.
		if (attempted && !bodyRefused(response)) accepted = ENCODINGS.length;
		return response;
	};
}

function compressibleBody(init: RequestInit | undefined): Buffer | undefined {
	// The OpenAI client serializes JSON bodies to strings; anything else is left alone.
	if (typeof init?.body !== "string") return undefined;
	const headers = new Headers(init.headers);
	if (headers.has("Content-Encoding")) return undefined;
	if (!headers.get("Content-Type")?.startsWith("application/json")) return undefined;
	const body = Buffer.from(init.body);
	return body.length >= COMPRESSED_BODY_BYTES_MIN ? body : undefined;
}

function withEncodedBody(init: RequestInit, body: Buffer, encoding: string): RequestInit {
	const headers = new Headers(init.headers);
	headers.set("Content-Encoding", encoding);
	// fetch derives the length from the new body; a stale one would truncate it.
	headers.delete("Content-Length");
	return { ...init, headers, body: new Uint8Array(body) };
}

function bodyRefused(response: Response): boolean {
	return response.status === 400 || response.status === 415;
}
