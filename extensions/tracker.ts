/**
 * Session file tracking.
 *
 * Tracks files touched by write/edit tools during a pi session.
 * Persists via custom session entries so tracking survives /resume.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { clearRepoRootCache, getRepoRoot, toRepoRelative } from "./git.js";

const sessionFiles = new Set<string>();

export function getSessionFiles(): string[] {
	return [...sessionFiles];
}

/**
 * Pull the agent's cwd off the session header entry.
 *
 * The session header (`type === "session"`) carries the cwd the agent was
 * launched with. Relative paths from `write`/`edit` are resolved against this
 * cwd inside pi, so we must use the same value to map back to repo-relative.
 *
 * Falls back to `process.cwd()` when the header isn't available (rare; mostly
 * tests and very early init).
 */
function getAgentCwd(ctx: ExtensionContext): string {
	try {
		for (const entry of ctx.sessionManager.getEntries()) {
			if ((entry as { type?: string; cwd?: string }).type === "session") {
				const cwd = (entry as { cwd?: string }).cwd;
				if (cwd && typeof cwd === "string") return cwd;
			}
		}
	} catch (err) {
		console.error("[git-assistant] getAgentCwd failed:", err);
	}
	return process.cwd();
}

async function resolveRepoRoot(pi: ExtensionAPI): Promise<string | null> {
	try {
		let root = await getRepoRoot(pi);
		if (root) return root;
		// Bust the cache and retry once. The first call may have run before the
		// cwd was settled (e.g. immediately after session start) and a stale
		// `null` would otherwise never be revisited because we never cache nulls
		// — this guards against transient `pi.exec` failures during init.
		clearRepoRootCache();
		root = await getRepoRoot(pi);
		return root;
	} catch (err) {
		console.error("[git-assistant] resolveRepoRoot failed:", err);
		return null;
	}
}

export async function reconstructSessionFiles(ctx: ExtensionContext, pi: ExtensionAPI) {
	sessionFiles.clear();
	let fromEntries = 0;
	let fromFallback = 0;
	const root = await resolveRepoRoot(pi);
	const agentCwd = getAgentCwd(ctx);

	for (const entry of ctx.sessionManager.getEntries()) {
		// Primary: custom entries created by this extension
		if (entry.type === "custom" && entry.customType === "git-file-track" && entry.data?.path) {
			sessionFiles.add(entry.data.path as string);
			fromEntries++;
			continue;
		}

		// Fallback: scan assistant messages for write/edit tool calls
		// (for sessions created before the custom-entry tracking, OR for sessions
		// where the extension was installed mid-session and never saw the live
		// `tool_result` events for past edits).
		if (
			entry.type === "message" &&
			entry.message.role === "assistant" &&
			Array.isArray(entry.message.content)
		) {
			for (const block of entry.message.content) {
				if (block?.type === "toolCall" && (block.name === "write" || block.name === "edit")) {
					const rawPath = block.arguments?.path ?? block.input?.path;
					if (rawPath && typeof rawPath === "string" && root) {
						const relPath = toRepoRelative(rawPath, root, agentCwd);
						if (relPath) {
							sessionFiles.add(relPath);
							fromFallback++;
						}
					}
				}
			}
		}
	}

	console.log(
		`[git-assistant] Reconstructed ${sessionFiles.size} tracked files (${fromEntries} from entries, ${fromFallback} from fallback)`,
	);
}

/**
 * Refresh the in-memory tracking Set from the on-disk session entries.
 *
 * Called at command time so commands always see the freshest set of tracked
 * files, even if the extension was installed mid-session and `session_start`
 * never fired for the existing session.
 */
export async function refreshSessionFiles(ctx: ExtensionContext, pi: ExtensionAPI): Promise<void> {
	await reconstructSessionFiles(ctx, pi);
}

/**
 * Handle a tool_result event, tracking write/edit file paths.
 */
export async function handleToolResult(
	pi: ExtensionAPI,
	event: { toolName: string; input?: Record<string, unknown> },
	ctx?: ExtensionContext,
): Promise<void> {
	if ((event.toolName === "write" || event.toolName === "edit") && event.input?.path) {
		const rawPath = event.input.path as string;
		const root = await resolveRepoRoot(pi);
		if (!root) return;
		const agentCwd = ctx ? getAgentCwd(ctx) : process.cwd();
		const relPath = toRepoRelative(rawPath, root, agentCwd);
		if (!relPath) return;

		// Dedupe: only persist if we haven't already recorded this exact path in
		// this session. The Set is the source of truth for what's tracked, so
		// skipping the appendEntry when the path is already present keeps the
		// session file from growing unboundedly when the same file is edited many
		// times — without changing what gets committed (git add stages the whole
		// working tree for that path either way).
		if (sessionFiles.has(relPath)) return;
		sessionFiles.add(relPath);
		try {
			pi.appendEntry("git-file-track", { path: relPath });
		} catch (err) {
			console.error("[git-assistant] appendEntry failed for", relPath, err);
		}
	}
}
