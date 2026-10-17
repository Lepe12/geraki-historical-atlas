# Web search: Google and Brave

Google organic search is accessed through **SerpAPI**; the independent second index is **Brave Search API**. This is not Google's discontinued Custom Search JSON API. Google's official documentation says that API is closed to new customers, with existing customers transitioning by 2027-01-01.

## Activation

Add the following repository Actions secrets in `Lepe12/geraki-historical-atlas` through GitHub's protected settings UI:

- `SERPAPI_API_KEY`: a key for the user's SerpAPI account, for Google search results.
- `BRAVE_SEARCH_API_KEY`: a key for the user's Brave Search API subscription.

Do not put keys in chat, code, browser storage, or research requests. No account, subscription or billing arrangement is created by this implementation. Both are optional at workflow-definition time: missing keys produce `API_KEY_REQUIRED`, not fake zero-hit success. One configured provider can operate independently while the other is reported missing. Merely merging code does not activate paid services or prove a successful search.

Both ordinary research lanes and the reusable specialist workflow receive only these two named search secrets. No blanket secrets inheritance is introduced. Other archive credentials are unchanged.

## Behavior and limits

- Both configured providers are queried concurrently, at most one request per provider per query, with an 18-second timeout each. Existing per-lane query budgets still apply. Each query can consume two API searches; actual usage/charges depend on the account plan. No automatic pagination or indefinite retries.
- Google consumes `organic_results` only; Brave consumes `web.results`. AI summaries, answer boxes and ads are not evidence inputs.
- Every output records source URL, snippet, provider(s), search query and provider-level execution diagnostics. Duplicate URLs merge provider provenance; this does not establish independent corroboration.
- Repository-scoped searches preserve `site:` constraints and validate the returned hostname, including legitimate subdomains.
- First-page coverage and truncation are explicit. No claim is made that the web or a catalogue was exhausted. An unrecognized response or remote failure is not an executed empty search.
- PDF links are retained as discovery pointers. This change does not itself implement general PDF download, correct multi-file IA acquisition, original inspection or historical identity verification.
- Query terms are provenance, not source text. Search snippets remain `UNVERIFIED_DISCOVERY`; there is no automatic VERIFIED promotion.
- API keys and raw provider error bodies/URLs are omitted from evidence diagnostics.
- The DuckDuckGo removal remains in force.

## Validation and live acceptance

Deterministic tests cover both result schemas, snippet/PDF retention, duplicate provenance, partial-provider failure, missing keys, explicit empty results, unrecognized responses, host restrictions and key redaction. These are adapter tests, not a live retrieval benchmark.

After activation, run an ordinary research request and inspect durable `lane_discovery` attempts: both providers should report actual execution, relevant source URLs should survive candidate merge/inventory, and known references should be retrieved without being supplied as results. Inspect the actual documents and follow citations before making historical claims. Until a credentialed run is observed, live provider execution remains **UNVERIFIED**.

Official/provider references checked 2026-10-17:

- https://developers.google.com/custom-search/v1/overview
- https://serpapi.com/search-api
- https://serpapi.com/organic-results
- https://api-dashboard.search.brave.com/api-reference/web/search/get
- https://api-dashboard.search.brave.com/documentation/guides/authentication
