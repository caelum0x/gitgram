import { EventStore } from './event-store.js';
import { TimelineIndex } from './timeline-index.js';

export interface SearchQuery {
  query: string;
  type?: 'conversation' | 'files' | 'checkpoints' | 'all';
  fuzzy?: boolean;
  contextLines?: number;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export interface SearchResult {
  type: 'message' | 'file' | 'checkpoint';
  id: string;
  content: string;
  context?: string; // surrounding text
  highlight?: string; // content with highlights
  timestamp: Date;
  checkpointId?: string;
  filePath?: string;
  role?: string;
  score: number;
  matchedTerms: string[];
}

export class SearchEngine {
  private wordIndex = new Map<string, Set<string>>(); // word -> document IDs
  private ngramIndex = new Map<string, Set<string>>(); // trigram -> document IDs
  private documents = new Map<string, { content: string; timestamp: Date; meta: any }>();

  constructor(
    private eventStore: EventStore,
    private timelineIndex: TimelineIndex
  ) {
    this.buildIndex();
  }

  buildIndex(): void {
    this.wordIndex.clear();
    this.ngramIndex.clear();
    this.documents.clear();

    // Index conversation events
    const events = this.eventStore.getAll();
    for (const event of events) {
      if (event.type === 'user_message' || event.type === 'assistant_message') {
        const docId = `event:${event.id}`;
        const content = event.data.content || '';
        
        this.documents.set(docId, {
          content,
          timestamp: event.timestamp,
          meta: { role: event.type === 'user_message' ? 'user' : 'assistant' }
        });

        this.indexDocument(docId, content);
      }
    }

    // Index checkpoint descriptions
    const checkpoints = this.timelineIndex.getAllCheckpoints();
    for (const cp of checkpoints) {
      const docId = `checkpoint:${cp.id}`;
      this.documents.set(docId, {
        content: cp.description,
        timestamp: cp.timestamp,
        meta: { files: cp.files }
      });
      this.indexDocument(docId, cp.description);
    }
  }

  private indexDocument(docId: string, content: string): void {
    const words = this.tokenize(content);
    
    // Word index
    for (const word of words) {
      if (!this.wordIndex.has(word)) {
        this.wordIndex.set(word, new Set());
      }
      this.wordIndex.get(word)!.add(docId);
    }

    // N-gram index for fuzzy matching
    for (const word of words) {
      const ngrams = this.getNgrams(word, 3);
      for (const ngram of ngrams) {
        if (!this.ngramIndex.has(ngram)) {
          this.ngramIndex.set(ngram, new Set());
        }
        this.ngramIndex.get(ngram)!.add(docId);
      }
    }
  }

  search(query: SearchQuery): SearchResult[] {
    const queryWords = this.tokenize(query.query);
    const docScores = new Map<string, { score: number; matchedTerms: Set<string> }>();

    // Exact word matching with TF-IDF
    for (const word of queryWords) {
      const docs = this.wordIndex.get(word);
      if (docs) {
        const idf = Math.log((this.documents.size + 1) / (docs.size + 1));
        for (const docId of docs) {
          if (!docScores.has(docId)) {
            docScores.set(docId, { score: 0, matchedTerms: new Set() });
          }
          const entry = docScores.get(docId)!;
          entry.score += idf * 2; // Boost exact matches
          entry.matchedTerms.add(word);
        }
      }
    }

    // Fuzzy matching using n-grams
    if (query.fuzzy !== false) {
      for (const word of queryWords) {
        const ngrams = this.getNgrams(word, 3);
        const candidateDocs = new Map<string, number>();
        
        for (const ngram of ngrams) {
          const docs = this.ngramIndex.get(ngram);
          if (docs) {
            for (const docId of docs) {
              candidateDocs.set(docId, (candidateDocs.get(docId) || 0) + 1);
            }
          }
        }

        // Score by n-gram overlap (Jaccard-like)
        for (const [docId, matchCount] of candidateDocs) {
          const similarity = matchCount / ngrams.length;
          if (similarity > 0.3) { // Threshold
            if (!docScores.has(docId)) {
              docScores.set(docId, { score: 0, matchedTerms: new Set() });
            }
            const entry = docScores.get(docId)!;
            entry.score += similarity;
            entry.matchedTerms.add(`~${word}`);
          }
        }
      }
    }

    // Convert to results
    const results: SearchResult[] = [];
    for (const [docId, { score, matchedTerms }] of docScores.entries()) {
      const doc = this.documents.get(docId);
      if (!doc) continue;

      // Date filtering
      if (query.startDate && doc.timestamp < query.startDate) continue;
      if (query.endDate && doc.timestamp > query.endDate) continue;

      // Type filtering
      const isEvent = docId.startsWith('event:');
      const isCheckpoint = docId.startsWith('checkpoint:');
      
      if (query.type === 'conversation' && !isEvent) continue;
      if (query.type === 'checkpoints' && !isCheckpoint) continue;

      const result: SearchResult = {
        type: isEvent ? 'message' : 'checkpoint',
        id: docId.split(':')[1],
        content: doc.content,
        timestamp: doc.timestamp,
        score,
        matchedTerms: Array.from(matchedTerms),
        role: doc.meta.role
      };

      // Add context snippet
      if (query.contextLines) {
        result.context = this.getContextSnippet(doc.content, query.query, query.contextLines);
      }

      // Add highlighted content
      result.highlight = this.highlightMatches(doc.content, queryWords);

      results.push(result);
    }

    // Sort by score descending, then by timestamp descending
    results.sort((a, b) => {
      if (Math.abs(a.score - b.score) > 0.1) return b.score - a.score;
      return b.timestamp.getTime() - a.timestamp.getTime();
    });

    return results.slice(0, query.limit || 20);
  }

  searchConversations(query: string, options: { limit?: number; role?: string } = {}): SearchResult[] {
    const results = this.search({ query, type: 'conversation', limit: options.limit || 20 });
    if (options.role) {
      return results.filter(r => r.role === options.role);
    }
    return results;
  }

  searchCheckpoints(query: string, limit = 20): SearchResult[] {
    return this.search({ query, type: 'checkpoints', limit });
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);
  }

  private getNgrams(text: string, n: number): string[] {
    const ngrams: string[] = [];
    const padded = `  ${text}  `;
    for (let i = 0; i <= padded.length - n; i++) {
      ngrams.push(padded.slice(i, i + n));
    }
    return ngrams;
  }

  private getContextSnippet(content: string, query: string, lines: number): string {
    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();
    const idx = contentLower.indexOf(queryLower);
    
    if (idx === -1) {
      return content.slice(0, 200) + (content.length > 200 ? '...' : '');
    }

    const lineBreaks = content.split('\n');
    let currentPos = 0;
    let matchLine = 0;
    
    for (let i = 0; i < lineBreaks.length; i++) {
      if (currentPos + lineBreaks[i].length >= idx) {
        matchLine = i;
        break;
      }
      currentPos += lineBreaks[i].length + 1;
    }

    const start = Math.max(0, matchLine - lines);
    const end = Math.min(lineBreaks.length, matchLine + lines + 1);
    
    return lineBreaks.slice(start, end).join('\n');
  }

  private highlightMatches(content: string, words: string[]): string {
    let result = content;
    for (const word of words) {
      const regex = new RegExp(`(${word})`, 'gi');
      result = result.replace(regex, '**$1**');
    }
    return result;
  }

  refresh(): void {
    this.buildIndex();
  }
}
