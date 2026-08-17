# pi-threads

A Pi extension for managing Threads accounts, posts, replies, OAuth, and
insights.

> Agents: read [AGENTS.md](AGENTS.md) before implementing or changing this
> extension.

This package exposes the Threads toolset to Pi while keeping the Python
backend responsible for the database, encryption, Threads API client, OAuth,
and webhooks.

## How it works

```text
Pi → TypeScript extension → Python bridge → Python Threads backend → SQLite/PostgreSQL + Threads API
                                      └→ Flask service handles OAuth callbacks and webhooks
```

The extension provides:

- `threads_find_accounts`
- `threads_add_account`
- `threads_find_posts`
- `threads_create_post`
- `threads_update_post`
- `threads_publish_post`
- `threads_delete_post`
- `threads_find_replies`
- `threads_publish_reply`
- `threads_update_reply`
- `threads_delete_reply`
- `threads_get_insights`

Publishing and deleting retain the backend's external side effects. Set
`MEDSOS_PI_CONFIRM=1` to require Pi UI confirmation for those tools.

## Setup

`pi-threads` is **only a Pi extension**. It does not contain, install, or run
the Python backend. The backend is provided by the upstream
[`suhz/medsos`](https://github.com/suhz/medsos) project.

### 1. Install the Python backend

```sh
git clone https://github.com/suhz/medsos.git /path/to/medsos
cd /path/to/medsos
python3 -m venv .venv
. .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
chmod 600 .env
```

Before filling `.env`, read the upstream
[README](https://github.com/suhz/medsos/blob/main/README.md) and
[AGENTS.md](https://github.com/suhz/medsos/blob/main/AGENTS.md). A human must
provide the Meta App ID, Meta App Secret, webhook verify token, and public
HTTPS callback URL. Do not invent Meta credentials.

Run the backend migrations and API:

```sh
alembic upgrade head
set -a && . .env && set +a
python scripts/serve.py
# in another terminal:
curl -sS http://127.0.0.1:8768/healthz
```

The backend also needs a public HTTPS route for the Meta OAuth callback and
Threads webhook. Follow the upstream README to configure the reverse proxy,
tunnel, and Meta dashboard URLs.

### 2. Install the Pi extension

In a shell that can see the same `MEDSOS_*` variables as the backend:

```sh
export MEDSOS_ROOT=/path/to/medsos
export MEDSOS_PYTHON=/path/to/medsos/.venv/bin/python

# Install from the public repository:
pi install https://github.com/SyahmiRafsan/pi-threads

# Or test a local checkout without saving the install:
pi -e /path/to/pi-threads
```

The extension starts `bridge.py` for each tool call. The bridge imports
`medsos.ops`, so the backend Python environment, database, and required
`MEDSOS_*` variables must be available to Pi as well.

`threads_add_account` returns an OAuth authorize URL. Open it in a browser,
complete approval, then call `threads_find_accounts` to verify the account.

## Attribution

This project is based on the architecture and implementation of
[suhz/medsos](https://github.com/suhz/medsos). It is not affiliated with or
endorsed by the original author. Attribution for the derived adapter contract
is in `THIRD_PARTY_NOTICES`; this project has its own `LICENSE`.
