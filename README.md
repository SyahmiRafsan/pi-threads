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

The Python backend must be installed separately. It currently expects its
existing `MEDSOS_*` environment variables.

```sh
# Python backend
cd /path/to/medsos
python3 -m venv .venv
. .venv/bin/activate
pip install -e ".[dev]"
alembic upgrade head
```

Configure the backend's `.env`, start its Flask service, and configure the
public Meta webhook and OAuth URLs as described by that backend's docs.

Then configure Pi:

```sh
export MEDSOS_ROOT=/path/to/medsos
export MEDSOS_PYTHON=/path/to/medsos/.venv/bin/python

pi install /path/to/pi-threads
# or test without persisting the install:
pi -e /path/to/pi-threads
```

Pi and the Python process must see the same `MEDSOS_*` environment variables.
`threads_add_account` returns an authorize URL; open it in a browser and then
call `threads_find_accounts` to verify the account.

## Attribution

This project is based on the architecture and implementation of
[suhz/medsos](https://github.com/suhz/medsos). It is not affiliated with or
endorsed by the original author. Attribution for the derived adapter contract
is in `THIRD_PARTY_NOTICES`; this project has its own `LICENSE`.
