# omp-charm

An [Oh My Pi](https://github.com/can1357/oh-my-pi) extension for [Charm Hyper](https://hyper.charm.land).

omp 19.1.1 and later already ship Hyper as the built-in `charm-hyper` provider: models, API-key login, live model discovery and `/usage` credits. This extension does not add a second provider. It changes three things about how the built-in one talks to Hyper, taken from Charm's own [pi-hyper-provider](https://github.com/charmbracelet/pi-hyper-provider):

| Change | What it does |
|---|---|
| Session affinity | Sends `x-client-request-id` and `x-session-affinity` with the session id. That pair is Charm's own `openai-nosession` format, and `pi-hyper-provider` sets it with `sendSessionAffinityHeaders: true` and the note that Hyper keys provider pinning and upstream prompt caches on it. It has no measured effect here — see below. |
| Compressed requests | Sends JSON request bodies as brotli, falling back to gzip and then plain if Hyper answers 400 or 415. |
| Prism route | Shows `Prism → <model>` in the status line when a Prism model routes the request. |

Measured on omp 19.1.1 through the installed tag, one `prism-flash` request each: a 938,754-byte request body (system prompt and tool schemas) went out as 183,053 bytes of brotli q4 — 5.1× smaller. A 37,957-byte 13k-token JSON body went to 2,414 bytes (15.7×); the ratio follows how repetitive the body is.

Cache hits did not follow the affinity header. Hyper's prompt cache is keyed on prompt content: a fresh 16,785-token prompt reported 0 cached tokens, and every identical repeat reported 16,384 (97.6%) cached — with the same session id, with no affinity headers at all, and with a different session id. The same held on `glm-5.3` (6,656 of 6,798 tokens cached on every repeat).

A wider probe over four models, seven sequential requests each on one fresh prompt — affinity A, then B, C, D, no affinity, and A again — matched that:

| Model | Cached share on every repeat | Counter-example |
|---|---|---|
| `prism-flash` | 9,216 / 10,008 (92.1%) | none |
| `glm-5.3` | 7,680 / 7,919 (97.0%) | none |
| `deepseek-v4.1-flash-1017` | 8,064 / 8,065 (100%) | none |
| `gpt-oss-120b` | 7,424 / 7,506 (98.9%) when it hit | affinity A missed on its warm repeat, then hit on the final A repeat |

Identical content is served from the prompt cache whichever affinity it carries, and the same affinity does not guarantee a hit. Response headers expose `x-prism-model-id` but no upstream provider, so pinning cannot be verified from outside either. The header stays because Charm's own provider sends it and it costs nothing; it is not what buys the cache hit.

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
