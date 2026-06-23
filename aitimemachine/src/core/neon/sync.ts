import { db } from './client.js';
import { commits, trees, blobs, projects } from './schema.js';
import { TimePoint } from '../types.js';
import { TreeBuilder, Tree } from '../git/tree.js';
import { eq } from 'drizzle-orm';

export class NeonSyncService {
    private projectId: string;

    constructor(projectId: string) {
        this.projectId = projectId;
    }

    /**
     * Ensure project exists in DB
     */
    async initProject(name: string) {
        if (!process.env.DATABASE_URL) return;

        try {
            await db.insert(projects)
                .values({ id: this.projectId, name })
                .onConflictDoNothing();
        } catch (e) {
            console.error('Failed to init project in Neon:', e);
        }
    }

    /**
     * Sync a TimePoint to Neon
     */
    async sync(tp: TimePoint) {
        if (!process.env.DATABASE_URL) return;

        try {
            console.log(`[NeonSync] Syncing checkpoint ${tp.id}...`);

            // 1. Build Merkle Tree from flat files
            const flatFiles = tp.files.map(f => ({
                path: f.path,
                hash: f.hash,
                mode: f.mode,
                size: f.size
            }));

            const { root: rootTree, allTrees } = TreeBuilder.buildFromFlat(flatFiles);

            // 2. Sync Trees (Recursive)
            // Sync all generated trees
            for (const tree of allTrees) {
                await this.syncTree(tree);
            }
            await this.syncTree(rootTree);

            // 3. Sync Blobs (Metadata only)
            await this.syncBlobs(flatFiles);

            // 4. Sync Commit
            await db.insert(commits).values({
                id: tp.id,
                projectId: this.projectId,
                parentId: tp.linkedCheckpointId, // Or find previous by timestamp
                message: tp.description,
                timestamp: tp.timestamp,
                treeHash: rootTree.hash,
                metadata: {
                    trigger: tp.trigger,
                    stats: tp.stats,
                    changes: tp.changes
                }
            }).onConflictDoNothing();

            console.log(`[NeonSync] Synced ${tp.id} (Tree: ${rootTree.hash})`);

        } catch (e) {
            console.error(`[NeonSync] Failed to sync ${tp.id}:`, e);
        }
    }

    private async syncTree(tree: Tree) {
        // Check if tree exists
        const exists = await db.select({ hash: trees.hash })
            .from(trees)
            .where(eq(trees.hash, tree.hash))
            .limit(1);

        if (exists.length > 0) return;

        // Insert tree
        await db.insert(trees).values({
            hash: tree.hash,
            content: tree.entries,
        }).onConflictDoNothing();
    }

    private async syncBlobs(files: { hash: string; size: number; path: string }[]) {
        // Batch insert blobs (ignoring duplicates)
        // In a real app, we'd batch this more carefully
        for (const file of files) {
            await db.insert(blobs).values({
                hash: file.hash,
                size: file.size,
                language: this.detectLanguage(file.path)
            }).onConflictDoNothing();
        }
    }

    private detectLanguage(filePath: string): string {
        const ext = filePath.split('.').pop() || '';
        return ext;
    }
}
