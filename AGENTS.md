# AGENTS.md — pi-threads

This file helps Pi and other coding agents work on this repository safely.
Read it before changing the extension.

## Project scope

`pi-threads` is a Pi extension. It exposes Threads tools through
`pi.registerTool()` and delegates the existing Python social-account backend
through `bridge.py`.

This repository is not the Python backend and does not replace its Flask
service. The backend still owns:

- database migrations and state
- encrypted account tokens
- Threads API calls
- Meta OAuth callback handling
- Threads webhook handling

See [README.md](README.md) for setup and [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES)
for attribution. Before changing backend setup assumptions, read the upstream
[`medsos` README](https://github.com/suhz/medsos/blob/main/README.md) and
[`medsos` AGENTS.md](https://github.com/suhz/medsos/blob/main/AGENTS.md).

## Repository layout

- `extension.ts` — Pi extension; registers the public `threads_*` tools
- `bridge.py` — one-shot JSON stdin/stdout adapter to `medsos.ops`
- `package.json` — Pi package manifest
- `README.md` — operator setup
- `LICENSE` — this project's license
- `THIRD_PARTY_NOTICES` — upstream attribution

## Development rules

- Keep public tool names branded `threads_*`; do not expose `medsos_*` names in
  the Pi UI or tool schema.
- Keep `MEDSOS_*` environment variables unchanged for backend compatibility.
  Renaming those variables is a separate migration, not a cosmetic edit.
- Keep business logic in the Python backend unless there is a deliberate
  decision to replace it. Do not duplicate OAuth, token, webhook, or database
  logic in TypeScript.
- Do not put credentials, `.env` files, databases, logs, or OAuth URLs with
  state values into git or tool output.
- Publishing and deleting are external side effects. Never trigger them while
  merely testing discovery or setup. Use `MEDSOS_PI_CONFIRM=1` when interactive
  confirmation is required.
- Preserve attribution when changing code derived from the upstream tool
  contract; update `THIRD_PARTY_NOTICES` when copying substantial new logic.
- Never commit or push changes unless the operator explicitly asks for it.

## Backend prerequisite

This repository is only the Pi extension. It depends on a separately installed
and running Python backend from:

```text
https://github.com/suhz/medsos
```

An agent helping an operator should follow the upstream `README.md` and
`AGENTS.md` to:

1. create the Python virtualenv and install `medsos` with its dev extras;
2. collect human-supplied Meta credentials and a public HTTPS callback URL;
3. create the backend `.env` without printing secrets;
4. run `alembic upgrade head`;
5. start the Flask service and verify `/healthz`; and
6. configure Meta OAuth and webhook URLs.

Do not call the upstream `medsos-install` command. It wires a Hermes plugin,
not this Pi extension.

## Local configuration

The extension finds the backend using:

```sh
export MEDSOS_ROOT=/absolute/path/to/python-backend
export MEDSOS_PYTHON=/absolute/path/to/python-backend/.venv/bin/python
```

The Python backend and Pi must receive the same required `MEDSOS_*` variables.
Pi also needs `MEDSOS_ROOT` and `MEDSOS_PYTHON` so `bridge.py` can use the
backend checkout and virtualenv. Do not invent Meta App ID or App Secret
values. Ask the operator for missing credentials.

## Validation

Run these checks after changes:

```sh
python3 -m py_compile bridge.py
python3 -m json.tool package.json >/dev/null
pi --mode rpc --no-session --offline -e . <<'EOF'
{"id":"state","type":"get_state"}
EOF
```

When the backend virtualenv is available, test a read-only tool first:

```sh
printf '%s' '{"tool":"threads_find_accounts","args":{}}' \
  | MEDSOS_ROOT=/absolute/path/to/python-backend \
    MEDSOS_PYTHON=/absolute/path/to/python-backend/.venv/bin/python \
    /absolute/path/to/pi-threads/bridge.py
```

Do not use publish or delete tools as a smoke test unless the operator
explicitly requests a real external action.
