import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type, type TSchema } from "typebox";

const BRIDGE = fileURLToPath(new URL("./bridge.py", import.meta.url));
const PUBLIC_SIDE_EFFECTS = new Set([
  "threads_publish_post",
  "threads_delete_post",
  "threads_publish_reply",
  "threads_delete_reply",
]);

function runBridge(
  tool: string,
  args: Record<string, unknown>,
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<Record<string, unknown>> {
  const abortSignal = signal ?? new AbortController().signal;
  const python = process.env.MEDSOS_PYTHON || "python3";
  const root = process.env.MEDSOS_ROOT || cwd;

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const child = spawn(python, [BRIDGE], {
      cwd: root,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const cleanup = () => abortSignal.removeEventListener("abort", abort);
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const abort = () => {
      child.kill("SIGTERM");
      fail(new Error(`${tool} cancelled`));
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    child.once("error", fail);
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      cleanup();

      if (code !== 0) {
        reject(new Error(stderr.trim() || `${tool} exited with code ${code}`));
        return;
      }

      try {
        const value = JSON.parse(stdout.trim()) as unknown;
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw new Error("bridge returned a non-object JSON value");
        }
        resolve(value as Record<string, unknown>);
      } catch (error) {
        reject(new Error(`Invalid Threads bridge output: ${error instanceof Error ? error.message : String(error)}`));
      }
    });

    abortSignal.addEventListener("abort", abort, { once: true });
    if (abortSignal.aborted) {
      abort();
      return;
    }

    child.stdin.end(JSON.stringify({ tool, args }));
  });
}

function registerThreadsTool(
  pi: ExtensionAPI,
  name: string,
  label: string,
  description: string,
  parameters: TSchema,
) {
  pi.registerTool({
    name,
    label,
    description,
    parameters,
    executionMode: "sequential",
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      if (PUBLIC_SIDE_EFFECTS.has(name) && process.env.MEDSOS_PI_CONFIRM === "1") {
        if (!ctx.hasUI) {
          throw new Error(`${name} requires confirmation, but Pi has no UI`);
        }
        const confirmed = await ctx.ui.confirm(
          `${label}?`,
          "This will change or delete content on the connected Threads account.",
        );
        if (!confirmed) {
          return {
            content: [{ type: "text", text: `${name} cancelled by the operator.` }],
            details: { cancelled: true },
          };
        }
      }

      if (name.includes("publish")) {
        onUpdate?.({ content: [{ type: "text", text: "Publishing to Threads; this can take about 30 seconds..." }] });
      }

      const result = await runBridge(
        name,
        (params || {}) as Record<string, unknown>,
        ctx.cwd,
        signal,
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  });
}

export default function threads(pi: ExtensionAPI) {
  const accountId = Type.Integer({ description: "Local Threads account row id" });
  const postId = Type.Optional(Type.Integer({ description: "Local post row id" }));
  const replyId = Type.Optional(Type.Integer({ description: "Local reply row id" }));
  const mediaUrls = Type.Optional(Type.Array(Type.String()));

  registerThreadsTool(
    pi,
    "threads_find_accounts",
    "Threads: find accounts",
    "List connected Threads accounts, or fetch one by account_id.",
    Type.Object({
      account_id: Type.Optional(accountId),
    }),
  );

  registerThreadsTool(
    pi,
    "threads_add_account",
    "Threads: add account",
    "Start Threads OAuth onboarding. Return the authorize URL and ask the operator to open it.",
    Type.Object({
      platform: Type.Optional(Type.String({ description: "Platform id; defaults to threads" })),
    }),
  );

  registerThreadsTool(
    pi,
    "threads_find_posts",
    "Threads: find posts",
    "Find posts for a connected account by local id, remote id, status, or limit.",
    Type.Object({
      account_id: accountId,
      post_id: postId,
      platform_media_id: Type.Optional(Type.String()),
      status: Type.Optional(StringEnum(["draft", "publishing", "published", "failed"] as const)),
      limit: Type.Optional(Type.Integer()),
    }),
  );

  registerThreadsTool(
    pi,
    "threads_create_post",
    "Threads: create draft",
    "Create a non-published draft post for a connected account.",
    Type.Object({
      account_id: accountId,
      text: Type.String(),
      media_urls: mediaUrls,
    }),
  );

  registerThreadsTool(
    pi,
    "threads_update_post",
    "Threads: update draft",
    "Update a draft post. Fails if the post is not still a draft.",
    Type.Object({
      account_id: accountId,
      post_id: Type.Integer(),
      text: Type.Optional(Type.String()),
      media_urls: mediaUrls,
    }),
  );

  registerThreadsTool(
    pi,
    "threads_publish_post",
    "Threads: publish post",
    "Publish a draft post, or publish inline text to Threads. This takes about 30 seconds.",
    Type.Object({
      account_id: accountId,
      post_id: postId,
      text: Type.Optional(Type.String()),
      media_urls: mediaUrls,
    }),
  );

  registerThreadsTool(
    pi,
    "threads_delete_post",
    "Threads: delete post",
    "Delete a remote Threads post and soft-delete its local record.",
    Type.Object({ account_id: accountId, post_id: Type.Integer() }),
  );

  registerThreadsTool(
    pi,
    "threads_find_replies",
    "Threads: find replies",
    "Find inbound or outbound replies. Set full=true for root post and thread context.",
    Type.Object({
      account_id: accountId,
      reply_id: replyId,
      direction: Type.Optional(StringEnum(["inbound", "outbound"] as const)),
      status: Type.Optional(Type.String()),
      full: Type.Optional(Type.Boolean()),
      limit: Type.Optional(Type.Integer()),
    }),
  );

  registerThreadsTool(
    pi,
    "threads_publish_reply",
    "Threads: publish reply",
    "Reply to a known inbound Threads reply. This takes about 30 seconds.",
    Type.Object({
      account_id: accountId,
      reply_id: Type.Integer(),
      text: Type.String(),
      image: Type.Optional(Type.String()),
    }),
  );

  registerThreadsTool(
    pi,
    "threads_update_reply",
    "Threads: update reply",
    "Mark a reply skipped, replied, or failed, with an optional reason.",
    Type.Object({
      account_id: accountId,
      reply_id: Type.Integer(),
      status: StringEnum(["skipped", "replied", "failed"] as const),
      reason: Type.Optional(Type.String()),
    }),
  );

  registerThreadsTool(
    pi,
    "threads_delete_reply",
    "Threads: delete reply",
    "Delete a remote Threads reply and soft-delete its local record.",
    Type.Object({ account_id: accountId, reply_id: Type.Integer() }),
  );

  registerThreadsTool(
    pi,
    "threads_get_insights",
    "Threads: get insights",
    "Read account-level Threads insights for the requested number of days.",
    Type.Object({
      account_id: accountId,
      days: Type.Optional(Type.Integer({ default: 2 })),
    }),
  );
}
