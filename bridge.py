#!/usr/bin/env python3
"""JSON stdin bridge for the Pi Threads extension.

The business logic stays in the Python backend. This process only adapts Pi's tool
arguments to the existing Hermes-compatible operations and prints one JSON
value to stdout.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path


def _add_repo_to_path() -> None:
    root = os.environ.get("MEDSOS_ROOT")
    if not root:
        return
    root_path = Path(root).expanduser().resolve()
    # Supports both an editable checkout and a source checkout that has not
    # been installed yet.
    for candidate in (root_path, root_path / "src"):
        if candidate.is_dir():
            sys.path.insert(0, str(candidate))


_add_repo_to_path()

try:
    from medsos import ops
except Exception as exc:  # pragma: no cover - exercised by the process wrapper
    print(f"Threads backend import failed: {exc}", file=sys.stderr)
    raise


def _int_or_none(value):
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _safe(fn, *args, **kwargs):
    """Keep the original plugin contract: domain failures become JSON errors."""
    try:
        return fn(*args, **kwargs)
    except Exception as exc:  # noqa: BLE001 - tool boundary
        return {"error": str(exc)}


def dispatch(name: str, args: dict) -> dict:
    if name == "threads_find_accounts":
        return {"accounts": _safe(ops.find_accounts, _int_or_none(args.get("account_id")))}

    if name == "threads_add_account":
        return _safe(ops.add_account, args.get("platform", "threads"))

    account_id = _int_or_none(args.get("account_id"))
    if account_id is None:
        return {"error": "account_id required"}

    if name == "threads_find_posts":
        return {
            "posts": _safe(
                ops.find_posts,
                account_id,
                post_id=_int_or_none(args.get("post_id")),
                platform_media_id=args.get("platform_media_id"),
                status=args.get("status"),
                limit=_int_or_none(args.get("limit")) or 20,
            )
        }

    if name == "threads_create_post":
        return _safe(ops.create_post, account_id, args.get("text", ""), args.get("media_urls"))

    if name == "threads_update_post":
        post_id = _int_or_none(args.get("post_id"))
        if post_id is None:
            return {"error": "account_id and post_id required"}
        return _safe(
            ops.update_post,
            account_id,
            post_id,
            text=args.get("text"),
            media_urls=args.get("media_urls"),
        )

    if name == "threads_publish_post":
        return _safe(
            ops.publish_post,
            account_id,
            post_id=_int_or_none(args.get("post_id")),
            text=args.get("text"),
            media_urls=args.get("media_urls"),
        )

    if name == "threads_delete_post":
        post_id = _int_or_none(args.get("post_id"))
        if post_id is None:
            return {"error": "account_id and post_id required"}
        return _safe(ops.delete_post, account_id, post_id)

    if name == "threads_find_replies":
        return {
            "replies": _safe(
                ops.find_replies,
                account_id,
                reply_id=_int_or_none(args.get("reply_id")),
                direction=args.get("direction"),
                status=args.get("status"),
                full=bool(args.get("full", False)),
                limit=_int_or_none(args.get("limit")) or 20,
            )
        }

    if name == "threads_publish_reply":
        reply_id = _int_or_none(args.get("reply_id"))
        if reply_id is None:
            return {"error": "account_id and reply_id required"}
        return _safe(ops.publish_reply, account_id, reply_id, args.get("text", ""), args.get("image"))

    if name == "threads_update_reply":
        reply_id = _int_or_none(args.get("reply_id"))
        if reply_id is None:
            return {"error": "account_id and reply_id required"}
        return _safe(
            ops.update_reply,
            account_id,
            reply_id,
            args.get("status", "skipped"),
            args.get("reason"),
        )

    if name == "threads_delete_reply":
        reply_id = _int_or_none(args.get("reply_id"))
        if reply_id is None:
            return {"error": "account_id and reply_id required"}
        return _safe(ops.delete_reply, account_id, reply_id)

    if name == "threads_get_insights":
        return _safe(ops.get_insights, account_id, _int_or_none(args.get("days")) or 2)

    return {"error": f"unknown Threads tool: {name}"}


def main() -> int:
    request = json.load(sys.stdin)
    name = request.get("tool")
    args = request.get("args") or {}
    if not isinstance(name, str) or not isinstance(args, dict):
        print(json.dumps({"error": "invalid bridge request"}))
        return 0
    print(json.dumps(dispatch(name, args), separators=(",", ":"), default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
