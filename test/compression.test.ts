import { expect, test } from "bun:test";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { createRequestCompressor } from "../src/compression.ts";

const BODY = JSON.stringify({ messages: Array.from({ length: 200 }, (_, i) => ({ role: "user", content: `turn ${i}` })) });
const JSON_INIT = { method: "POST", headers: { "Content-Type": "application/json" }, body: BODY };

interface Seen {
	encoding: string | null;
	body: unknown;
}

function recorder(statuses: (encoding: string | null) => number) {
	const seen: Seen[] = [];
	const fetch = async (_input: string | URL | Request, init?: RequestInit) => {
		const encoding = new Headers(init?.headers).get("Content-Encoding");
		seen.push({ encoding, body: init?.body });
		return new Response(null, { status: statuses(encoding) });
	};
	return { seen, fetch };
}

test("sends a brotli body that inflates to the original JSON", async () => {
	const { seen, fetch } = recorder(() => 200);
	await createRequestCompressor()(fetch)("https://hyper.test/v1/chat/completions", JSON_INIT);
	expect(seen).toHaveLength(1);
	expect(seen[0]?.encoding).toBe("br");
	expect(brotliDecompressSync(seen[0]?.body as Uint8Array).toString()).toBe(BODY);
});

test("falls back to gzip on 415 and remembers it for the next request", async () => {
	const { seen, fetch } = recorder((encoding) => (encoding === "br" ? 415 : 200));
	const send = createRequestCompressor()(fetch);
	const first = await send("https://hyper.test/v1/chat/completions", JSON_INIT);
	await send("https://hyper.test/v1/chat/completions", JSON_INIT);
	expect(first.status).toBe(200);
	expect(seen.map((s) => s.encoding)).toEqual(["br", "gzip", "gzip"]);
	expect(gunzipSync(seen[1]?.body as Uint8Array).toString()).toBe(BODY);
});

test("replays plain when every encoding is refused, then stops compressing", async () => {
	const { seen, fetch } = recorder((encoding) => (encoding ? 400 : 200));
	const send = createRequestCompressor()(fetch);
	await send("https://hyper.test/v1/chat/completions", JSON_INIT);
	await send("https://hyper.test/v1/chat/completions", JSON_INIT);
	expect(seen.map((s) => s.encoding)).toEqual(["br", "gzip", null, null]);
	expect(seen[2]?.body).toBe(BODY);
});

test("does not replay a billed failure", async () => {
	const { seen, fetch } = recorder(() => 500);
	const response = await createRequestCompressor()(fetch)("https://hyper.test/v1/chat/completions", JSON_INIT);
	expect(response.status).toBe(500);
	expect(seen).toHaveLength(1);
});

test("leaves small and non-JSON bodies alone", async () => {
	const { seen, fetch } = recorder(() => 200);
	const send = createRequestCompressor()(fetch);
	await send("https://hyper.test/x", { ...JSON_INIT, body: "{}" });
	await send("https://hyper.test/x", { method: "POST", headers: { "Content-Type": "text/plain" }, body: BODY });
	expect(seen.map((s) => s.encoding)).toEqual([null, null]);
});
