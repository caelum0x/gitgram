import { db } from '../neon/client.js';
import { embeddings, commits } from '../neon/schema.js';
import { cosineDistance, desc, sql, eq } from 'drizzle-orm';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

export class OracleAgent {
    private openai: OpenAI | null = null;
    private projectId: string;

    constructor(projectId: string) {
        this.projectId = projectId;
        if (process.env.OPENAI_API_KEY) {
            this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        }
    }

    /**
     * Ask the Oracle a question about the project history
     */
    async ask(question: string): Promise<string> {
        if (!this.openai || !process.env.DATABASE_URL) {
            return "Oracle is not available (Missing OPENAI_API_KEY or DATABASE_URL).";
        }

        console.log(`[Oracle] Analyzing: "${question}"`);

        // 1. Embed question
        const questionEmbedding = await this.generateEmbedding(question);

        // 2. Search Context (Code & Commits)
        const similarDocs = await db.select({
            content: embeddings.content,
            entityType: embeddings.entityType,
            entityId: embeddings.entityId,
            similarity: sql<number>`1 - (${cosineDistance(embeddings.embedding, questionEmbedding)})`
        })
            .from(embeddings)
            .where(eq(embeddings.projectId, this.projectId))
            .orderBy((t) => desc(t.similarity))
            .limit(10);

        // 3. Construct Context String
        let contextStr = "";
        for (const doc of similarDocs) {
            contextStr += `[${doc.entityType} - ${doc.entityId}]\n${doc.content}\n\n`;
        }

        // 4. Ask LLM
        const response = await this.openai.chat.completions.create({
            model: 'gpt-4-turbo',
            messages: [
                {
                    role: 'system', content: `You are the Oracle, an AI expert on this project's history. 
          Use the provided context (code snippets, commit messages) to answer the user's question.
          If you don't know, say so. Cite specific files or commits if possible.` },
                { role: 'user', content: `Context:\n${contextStr}\n\nQuestion: ${question}` }
            ]
        });

        return response.choices[0].message.content || "No answer generated.";
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
