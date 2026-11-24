# omp-charm

An [Oh My Pi](https://github.com/can1357/oh-my-pi) extension for [Charm Hyper](https://hyper.charm.land).

omp 19.1.1 and later already ship Hyper as the built-in `charm-hyper` provider: models, API-key login, live model discovery and `/usage` credits. This extension does not add a second provider. It changes three things about how the built-in one talks to Hyper, taken from Charm's own [pi-hyper-provider](https://github.com/charmbracelet/pi-hyper-provider):

| Change | What it does |
|---|---|
| Session affinity | Sends `x-client-request-id` and `x-session-affinity` with the session id. That pair is Charm's own `openai-nosession` format, and `pi-hyper-provider` sets it with `sendSessionAffinityHeaders: true` and the note that Hyper keys provider pinning and upstream prompt caches on it. It has no measured effect here — see below. |
| Compressed requests | Sends JSON request bodies as brotli, falling back to gzip and then plain if Hyper answers 400 or 415. |
| Prism route | Shows `Prism → <model>` in the status line when a Prism model routes the request. |

Measured on omp 19.1.1 through the installed tag, one `prism-flash` request each: a 938,754-byte request body (system prompt and tool schemas) went out as 183,053 bytes of brotli q4 — 5.1× smaller. A 37,957-byte 13k-token JSON body went to 2,414 bytes (15.7×); the ratio follows how repetitive the body is.

Cache hits did not follow the affinity header in these runs: a fresh 16,785-token prompt reported 0 cached tokens, and every identical repeat reported 16,384 (97.6%) cached — with the same session id, with no affinity headers at all, and with a different session id. The same held on `glm-5.3` (6,656 of 6,798 tokens cached on every repeat). That is consistent with content-keyed caching, but hitting across affinities does not prove the mechanism; it only rules out the affinity header as necessary for these hits.

A wider probe over four models, seven sequential requests each on one fresh prompt — affinity A, then B, C, D, no affinity, and A again — matched that:

| Model | Cached share on every repeat | Counter-example |
|---|---|---|
| `prism-flash` | 9,216 / 10,008 (92.1%) | none |
| `glm-5.3` | 7,680 / 7,919 (97.0%) | none |
| `deepseek-v4.1-flash-1017` | 8,064 / 8,065 (100%) | none |
| `gpt-oss-120b` | 7,424 / 7,506 (98.9%) when it hit | affinity A missed on its warm repeat, then hit on the final A repeat |

Identical content hit the prompt cache whichever affinity it carried, and the same affinity did not guarantee a hit. Response headers expose `x-prism-model-id` but no upstream provider, so pinning cannot be verified from outside either. The header stays because Charm's own provider sends it and it costs nothing; in these runs it was not what the hits depended on.

The route line was confirmed in the interactive TUI on 19.1.1 with the installed tag: a `prism-flash` completion that Prism routed to GLM 5.3 Flash drew `Prism → GLM 5.3 Flash` under the prompt, and the same model in a session started with `--no-extensions` drew no such line.

## Model tier speed: `deepseek-v4.1-flash-1017` vs `-economy`

Hyper lists two ids for the same DeepSeek Flash line. Both report 1M context, vision and the low/high/max effort levels, but they are priced and served differently: input/output per million tokens $0.33/$1.31 vs $0.20/$0.60, cache hit $0.03 vs $0.01, max output 262,144 vs 384,000. The economy id is the cheaper, slower one.

Measured on 2026-11-24, streaming with every delta timestamped, `reasoning_effort: "low"`, four alternating runs per model per workload. Min–max:

**Effective tok/s** is `(completion_tokens − reasoning_tokens) / (last visible content − first visible content)`: provider-reported answer tokens over the streamed answer window only. Prefill and all thinking time drop out, so it measures how fast the answer streams, not how long the task takes. Keep it apart from **first token** (request → first delta of any kind), **TTFA** (request → first visible content) and **wall** (request → last visible content).

| | `deepseek-v4.1-flash-1017` | `-economy` |
|---|---|---|
| Effective tok/s, 62-token prompt, 2.6k-token answer | 1,700–1,706 | 369–439 |
| TTFA, same task | 0.77–1.23 s | 2.25–4.42 s |
| Wall time, same task | 2.33–2.79 s | 9.36–10.40 s |
| First token, 11,948-token prompt | 0.55–0.73 s | 1.00–1.45 s |
| TTFA, 11,948-token prompt | 1.59–6.71 s | 4.17–9.68 s |
| Reasoning rate, 11,948-token prompt | 580–1,154 tok/s | 209–242 tok/s |

Hyper returned no `prompt_tokens_details` in these runs, so their cache state is unknown; runs 2–4 of each workload repeated the same prompt and may have been warm. An earlier five-run set, where each workload's first run was uncached and later runs mostly hit, kept the same ordering on warm prefill: 0.62 s vs 1.72 s median to first token on a 7,743-token prompt, and 3.8 s vs 16.2 s median wall time for a ~5.3k-token answer.

The tiers differ in sampling too: on identical prompts economy emitted 171 reasoning tokens where regular used 900, and 735–1,810 against 992–3,477 on the long prompt. Server-side routing is not visible from outside — both answer with `server: Google Frontend` and the same 10,000/hour and 100,000/day limits.

Where that lands: Artificial Analysis reports roughly 30–150 output tok/s for typical frontier APIs and 300–600 for fast providers. On that scale ~1,700 tok/s is dedicated-inference class and ~400 tok/s is fast but ordinary. These are Hyper-reported token counts from one prompt family on one day, not an AA measurement. Economy is worth it only when the answer is short and the wait is acceptable; use the regular id for latency-sensitive work.

## Install

```sh
omp plugin install 'git+https://github.com/ericjuta/omp-charm.git#v0.1.0'
```

Or from a checkout: `omp plugin link /path/to/omp-charm`.

Then give omp a Hyper API key: run `/login` and pick Charm Hyper, or set `CHARM_HYPER_API_KEY`. Pick a model with `--model charm-hyper/<id>`; `omp models ls charm-hyper` lists them.

## Develop

```sh
bun install
bun run check
```

## Licence

MIT. `src/compression.ts` is adapted from charmbracelet/pi-hyper-provider (MIT, Copyright (c) Charmbracelet, Inc.).
