# OpenGrokBot — security and runtime audit (2026-11-06)

Scope: `server/`, `server/providers/`, `client/`, desktop launcher, local configuration and GitHub CI. This is a source-level review of the merged PR #1 and follow-up remediation; it is not a penetration test. `main` did not have recorded GitHub Actions runs when the audit began.

| Severity | Finding | Evidence | Follow-up |
|---|---|---|---|
| Critical | Model could invoke an unadvertised local tool by supplying its function name | `runOpenAiTurn` dispatched calls directly to `runLocalTool` | Fixed: match every call against the advertised tool set; test added |
| High | Directory walkers followed workspace symlinks into arbitrary paths | `walk()` used `statSync` | Fixed: `lstatSync`, skip symlinks; regression test |
| High | Model-controlled web fetches could reach private metadata/IPs through DNS rebinding | URL hostname filtering without pinned DNS | Fixed: resolve all addresses, reject nonpublic answers, pin selected IP, disallow redirects and cap response bytes |
| High | Untrusted HTML/SVG previews could inherit the app's origin | `/api/file` served HTML and iframe allowed same-origin | Fixed: response CSP sandbox and sandboxed iframe |
| High | Codex/Gemini CLI approval policies were not enforceable from chat | Headless CLI runners bypassed approval callback | Restricted: Codex ask-policies run read-only; Gemini ask-policies use default confirmation mode. Interactive approval cards remain unsupported by CLI runners |
| High | Claude router/memory could transfer non-Claude conversations to Anthropic | Background SDK calls regardless of configured agent provider | Fixed: Claude routing only when group manager uses Claude; memory compaction only for Claude agents |
| Medium | MCP environment values and HTTP headers appeared in API state | `publicTeam()` previously masked only provider API keys | Fixed: mask MCP env/header values |
| Medium | Local state/uploads could be group-readable | Default filesystem creation modes | Fixed: new secrets, state, uploads and team config use mode `0600` on POSIX; upload dirs `0700` |
| Medium | Provider tests were excluded from `npm test` | Test script expanded only `dist/server/*.test.js` | Fixed: recursive compiled-test runner; isolated runner smoke test passed |
| Medium | Mixed-provider UI did not expose Bedrock file tools or reset its model selection | Catalog/profile config | Fixed: Bedrock-capable tools and empty model selection |

## Residual risk / non-goals

1. **Process isolation:** unrestricted shell execution and inherited CLI/MCP tools remain unsandboxed at the OS boundary. Do not run on a privileged workstation with production credentials when agents can execute commands. Use a disposable, unprivileged container/VM and explicit approved workspace mounts.
2. **Credential storage:** API keys and MCP credentials can still reside in local `team.json`, protected by filesystem permissions but not encrypted at rest. Use OS disk encryption, a dedicated low-privilege account and external secret management.
3. **Network perimeter:** the application has single-token access and no per-user RBAC, rate limiting, audit log, TLS termination or reverse-proxy configuration. Bind to loopback or use a private authenticated HTTPS ingress.
4. **Background features:** provider-neutral router and memory summarizer are not implemented. Non-Claude agents do not automatically compact memory.
5. **Regex search:** agent-supplied `search_files` patterns may still create CPU-heavy regular-expression work on the event loop.
6. **Provider integration:** Bedrock Converse, Ollama Cloud and local Ollama have not been exercised against real configured credentials/models in this audit environment.

## Validation checklist

```bash
npm ci
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

Verify manually with an unprivileged test workspace: (1) Ollama model list + chat, (2) Bedrock AWS CLI v2 Converse response + tool approval, (3) HTML/SVG preview CSP, (4) denied symlink file access, (5) unauthorized cross-site POST, (6) absence of provider/MCP secrets in `/api/state`, (7) no implicit Anthropic traffic for Ollama-only teams.

**Rollback:** revert the follow-up PR if regressions occur; keep existing `team.json` and `data/` backups. Before enabling arbitrary shell tools, snapshot the disposable workspace. Never restore older URL-token login behavior for externally accessible installs.
