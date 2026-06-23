import * as crypto from 'crypto';
import * as path from 'path';

export type TreeEntryType = 'blob' | 'tree';

export interface TreeEntry {
    name: string;
    type: TreeEntryType;
    hash: string;
    mode: number;
    size?: number; // Only for blobs
}

/**
 * Represents a directory snapshot in the Merkle DAG.
 * Content is sorted by name for consistent hashing.
 */
export class Tree {
    public readonly entries: TreeEntry[];
    public readonly hash: string;

    constructor(entries: TreeEntry[]) {
        // Sort entries by name for deterministic hashing (Git behavior)
        this.entries = entries.sort((a, b) => {
            if (a.name < b.name) return -1;
            if (a.name > b.name) return 1;
            return 0;
        });
        this.hash = this.computeHash();
    }

    private computeHash(): string {
        const hash = crypto.createHash('sha256');
        // Add a header to the tree hash itself to prevent collision with blobs
        // tree <content_len>\0
        const content = this.serializeContent();
        hash.update(`tree ${content.length}\0`);
        hash.update(content);
        return hash.digest('hex');
    }

    /**
     * Serialize tree content for storage
     */
    serialize(): Buffer {
        const content = this.serializeContent();
        // Add header: tree <size>\0<content>
        const header = Buffer.from(`tree ${content.length}\0`);
        return Buffer.concat([header, content]);
    }

    private serializeContent(): Buffer {
        const buffers: Buffer[] = [];
        for (const entry of this.entries) {
            // Format: mode type name\0hash
            const header = Buffer.from(`${entry.mode.toString(8)} ${entry.type} ${entry.name}\0`);
            buffers.push(header);
            buffers.push(Buffer.from(entry.hash, 'hex'));
        }
        return Buffer.concat(buffers);
    }

    /**
     * Parse a serialized tree buffer
     */
    static parse(buffer: Buffer): Tree {
        // Check header
        const nullByte = buffer.indexOf(0);
        if (nullByte === -1) throw new Error('Invalid tree object: no header');

        const header = buffer.subarray(0, nullByte).toString('utf8');
        const [type, sizeStr] = header.split(' ');

        if (type !== 'tree') throw new Error(`Expected tree, got ${type}`);

        const content = buffer.subarray(nullByte + 1);
        if (content.length !== parseInt(sizeStr)) {
            // Warn or throw? Git is strict.
            // throw new Error('Tree size mismatch');
        }

        const entries: TreeEntry[] = [];
        let cursor = 0;

        while (cursor < content.length) {
            // Find null byte for entry header end
            const entryNull = content.indexOf(0, cursor);
            if (entryNull === -1) break;

            const entryHeader = content.subarray(cursor, entryNull).toString('utf8');
            const [modeStr, entryType, name] = entryHeader.split(' ');

            // Read hash (32 bytes for SHA-256)
            const hashStart = entryNull + 1;
            const hashEnd = hashStart + 32;

            if (hashEnd > content.length) throw new Error('Truncated tree buffer');

            const hash = content.subarray(hashStart, hashEnd).toString('hex');

            entries.push({
                mode: parseInt(modeStr, 8),
                type: entryType as TreeEntryType,
                name,
                hash
            });

            cursor = hashEnd;
        }

        return new Tree(entries);
    }

    /**
     * Find an entry by name
     */
    find(name: string): TreeEntry | undefined {
        return this.entries.find(e => e.name === name);
    }
}

/**
 * Helper to build a Merkle Tree from a flat list of files
 */
export class TreeBuilder {
    /**
     * Convert flat file entries to a root Tree
     */
    static buildFromFlat(files: { path: string; hash: string; mode: number; size: number }[]): { root: Tree; allTrees: Tree[] } {
        const rootEntries = new Map<string, TreeEntry>();
        const subDirs = new Map<string, { path: string; hash: string; mode: number; size: number }[]>();
        const allTrees: Tree[] = [];

        for (const file of files) {
            const parts = file.path.split('/');
            const name = parts[0];

            if (parts.length === 1) {
                // It's a file in this directory
                rootEntries.set(name, {
                    name,
                    type: 'blob',
                    hash: file.hash,
                    mode: file.mode,
                    size: file.size
                });
            } else {
                // It's in a subdirectory
                if (!subDirs.has(name)) {
                    subDirs.set(name, []);
                }
                // Pass the rest of the path down
                subDirs.get(name)!.push({
                    ...file,
                    path: parts.slice(1).join('/')
                });
            }
        }

        // Recursively build subtrees
        for (const [name, subFiles] of subDirs) {
            const { root: subTree, allTrees: subAll } = this.buildFromFlat(subFiles);
            allTrees.push(...subAll);
            allTrees.push(subTree);

            rootEntries.set(name, {
                name,
                type: 'tree',
                hash: subTree.hash,
                mode: 0o040000, // Standard directory mode
            });
        }

        const root = new Tree(Array.from(rootEntries.values()));
        return { root, allTrees };
    }
}
