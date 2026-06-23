import { db } from './client.js';
import { embeddings } from './schema.js';
import { TimePoint } from '../types.js';
import { ContentStore } from '../content-store.js';
import * as dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

export class ContextIndexer {
    private openai: OpenAI | null = null;
    private projectId: string;
    private contentStore: ContentStore;

    constructor(projectId: string, contentStore: ContentStore) {
        this.projectId = projectId;
        this.contentStore = contentStore;

        if (process.env.OPENAI_API_KEY) {
            this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        }
    }

    /**
     * Index changed files in a TimePoint
     */
    async index(tp: TimePoint) {
        if (!this.openai || !process.env.DATABASE_URL) return;

        console.log(`[ContextIndexer] Indexing checkpoint ${tp.id}...`);

        // Only index added or modified files
        const filesToIndex = [...tp.changes.added, ...tp.changes.modified];

        for (const filePath of filesToIndex) {
            const file = tp.files.find(f => f.path === filePath);
            if (!file) continue;

            // Skip large files or non-text
            if (file.size > 100 * 1024) continue; // 100KB limit for now

            const content = this.contentStore.getString(file.hash);
            if (!content) continue;

            // Chunking (simple line-based for now)
            const chunks = this.chunkContent(content);

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                try {
                    const embedding = await this.generateEmbedding(chunk);

                    await db.insert(embeddings).values({
                        id: `${file.hash}-${i}`,
                        projectId: this.projectId,
                        entityType: 'blob',
                        entityId: file.hash,
                        content: chunk,
                        embedding,
                    }).onConflictDoNothing();

                } catch (e) {
                    console.error(`Failed to embed ${filePath} chunk ${i}:`, e);
                }
            }
        }

        console.log(`[ContextIndexer] Indexed ${filesToIndex.length} files.`);
    }

    private chunkContent(content: string): string[] {
        // Simple chunking: 1000 chars overlap 100
        const chunks: string[] = [];
        const chunkSize = 1000;
        const overlap = 100;

        for (let i = 0; i < content.length; i += (chunkSize - overlap)) {
            chunks.push(content.slice(i, i + chunkSize));
        }
        return chunks;
    }

    private async generateEmbedding(text: string): Promise<number[]> {
        if (!this.openai) throw new Error('OpenAI not initialized');

        const response = await this.openai.embeddings.create({
            model: 'text-embedding-ada-002',
            input: text,
        });

        return response.data[0].embedding;
    }
}
