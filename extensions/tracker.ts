/**
 * Session file tracking.
 *
 * Tracks files touched by write/edit tools during a pi session.
 * Persists via custom session entries so tracking survives /resume.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getRepoRoot, toRepoRelative } from "./git.js";

const sessionFiles = new Set<string>();

export function getSessionFiles(): string[] {
	return [...sessionFiles];
}

function clearSessionFiles(): void {
	sessionFiles.clear();
}

export async function reconstructSessionFiles(ctx: ExtensionContext, pi: ExtensionAPI) {
	sessionFiles.clear();
	let fromEntries = 0;
	let fromFallback = 0;
	let root: string | null = null;

	try {
		root = await getRepoRoot(pi);
	} catch (err) {
		console.error("[git-assistant] Failed to resolve repo root during reconstruction:", err);
	}

	for (const entry of ctx.sessionManager.getEntries()) {
		// Primary: custom entries created by this extension
		if (entry.type === "custom" && entry.customType === "git-file-track" && entry.data?.path) {
			sessionFiles.add(entry.data.path as string);
			fromEntries++;
			continue;
		}

		// Fallback: scan assistant messages for write/edit tool calls
		// (for sessions created before the custom-entry tracking)
		if (
			entry.type === "message" &&
			entry.message.role === "assistant" &&
			Array.isArray(entry.message.content)
		) {
			for (const block of entry.message.content) {
				if (block?.type === "toolCall" && (block.name === "write" || block.name === "edit")) {
					const absPath = block.arguments?.path ?? block.input?.path;
					if (absPath && typeof absPath === "string" && root) {
						const relPath = toRepoRelative(absPath, root);
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
 * Handle a tool_result event, tracking write/edit file paths.
 */
export async function handleToolResult(
	pi: ExtensionAPI,
	event: { toolName: string; input?: Record<string, unknown> },
): Promise<void> {
	if ((event.toolName === "write" || event.toolName === "edit") && event.input?.path) {
		const absPath = event.input.path as string;
		let root: string | null = null;
		try {
			root = await getRepoRoot(pi);
		} catch (err) {
			console.error("[git-assistant] getRepoRoot failed during tool tracking:", err);
			return;
		}
		if (!root) return;
		const relPath = toRepoRelative(absPath, root);
		if (relPath) {
			sessionFiles.add(relPath);
			try {
				pi.appendEntry("git-file-track", { path: relPath });
			} catch (err) {
				console.error("[git-assistant] appendEntry failed for", relPath, err);
			}
		}
	}
}
