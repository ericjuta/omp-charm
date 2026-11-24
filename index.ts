import type { Api, Model } from "@oh-my-pi/pi-ai";
import { streamOpenAICompletions } from "@oh-my-pi/pi-ai/providers/openai-completions";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { createRequestCompressor } from "./src/compression.ts";

const PROVIDER = "charm-hyper";
const STATUS_KEY = "charm-hyper-prism";

/**
 * Overlay on omp's built-in `charm-hyper` provider. Models, auth, discovery and
 * usage stay built-in; only the wire call changes:
 * - `x-session-affinity`: Hyper keys provider pinning and upstream prompt
 *   caches on it (same headers as Charm's own Pi provider).
 * - brotli/gzip request bodies.
 * - the model Prism routed to, shown in the status line.
 */
export default function charmHyper(pi: ExtensionAPI): void {
	const compress = createRequestCompressor();

	pi.registerProvider(PROVIDER, {
		stream(model, context, options) {
			if (model.api !== "openai-completions") {
				throw new Error(`omp-charm: ${PROVIDER}/${model.id} uses unsupported api "${model.api}"`);
			}
			const headers = { ...options.headers };
			if (options.sessionId) {
				headers["x-client-request-id"] ??= options.sessionId;
				headers["x-session-affinity"] ??= options.sessionId;
			}
			return streamOpenAICompletions(model as Model<Api> as Model<"openai-completions">, context, {
				...options,
				headers,
				fetch: compress(options.fetch),
			});
		},
	});

	// Only Hyper sends these headers, so any other provider's response clears the line.
	pi.on("after_provider_response", (event, ctx) => {
		const route = event.headers["x-prism-model-name"]?.trim() || event.headers["x-prism-model-id"]?.trim();
		ctx.ui.setStatus(STATUS_KEY, route ? `Prism → ${route}` : undefined);
	});
}
