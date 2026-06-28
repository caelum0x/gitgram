import { Router, Response } from "express";
import { db, schema } from "../db/index.js";
import { eq, and, desc, like, or, sql, ilike } from "drizzle-orm";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { Errors, asyncHandler } from "../middleware/errors.js";
import crypto from "crypto";
import pdfParse from "pdf-parse";
import { logger } from "../lib/monitoring.js";

const router = Router();

// All routes require authentication
router.use(apiKeyAuth);

/**
 * Helper function to generate unique IDs
 */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

/**
 * Parse arXiv URL or ID to extract the paper ID
 * Supports formats:
 * - "2301.00001" (ID only)
 * - "2301.00001v2" (ID with version)
 * - "https://arxiv.org/abs/2301.00001"
 * - "https://arxiv.org/pdf/2301.00001.pdf"
 * - "arxiv:2301.00001"
 */
function parseArxivId(input: string): { arxivId: string; version?: string } | null {
  const trimmed = input.trim();

  // Pattern for arXiv ID: YYMM.NNNNN or YYMM.NNNNNvN (new format)
  // or category/YYMMNNN (old format)
  const newIdPattern = /(\d{4}\.\d{4,5})(v\d+)?/;
  const oldIdPattern = /([a-z-]+\/\d{7})(v\d+)?/i;

  // Try to extract from URL
  const urlPatterns = [
    /arxiv\.org\/abs\/(.+?)(?:\.pdf)?(?:\?|$)/i,
    /arxiv\.org\/pdf\/(.+?)(?:\.pdf)?(?:\?|$)/i,
    /arxiv:(.+?)(?:\s|$)/i,
  ];

  for (const pattern of urlPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      const extracted = match[1];
      const newMatch = extracted.match(newIdPattern);
      if (newMatch) {
        return { arxivId: newMatch[1], version: newMatch[2]?.slice(1) };
      }
      const oldMatch = extracted.match(oldIdPattern);
      if (oldMatch) {
        return { arxivId: oldMatch[1], version: oldMatch[2]?.slice(1) };
      }
    }
  }

  // Try direct ID match
  const newMatch = trimmed.match(newIdPattern);
  if (newMatch) {
    return { arxivId: newMatch[1], version: newMatch[2]?.slice(1) };
  }

  const oldMatch = trimmed.match(oldIdPattern);
  if (oldMatch) {
    return { arxivId: oldMatch[1], version: oldMatch[2]?.slice(1) };
  }

  return null;
}

/**
 * Fetch paper metadata from arXiv API
 */
async function fetchArxivMetadata(arxivId: string): Promise<{
  title: string;
  authors: Array<{ name: string; affiliation?: string }>;
  abstract: string;
  publishedDate: Date | null;
  updatedDate: Date | null;
  metadata: {
    pdfUrl?: string;
    primaryCategory?: string;
    categories?: string[];
    journalRef?: string;
    doi?: string;
    comments?: string;
  };
} | null> {
  try {
    const apiUrl = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`;
    const response = await fetch(apiUrl);

    if (!response.ok) {
      return null;
    }

    const xmlText = await response.text();

    // Parse XML response (simple parsing for arXiv API)
    const getTagContent = (xml: string, tag: string): string | null => {
      const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
      const match = xml.match(regex);
      return match ? match[1].trim() : null;
    };

    const getAllTagContents = (xml: string, tag: string): string[] => {
      const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
      const matches: string[] = [];
      let match;
      while ((match = regex.exec(xml)) !== null) {
        matches.push(match[1].trim());
      }
      return matches;
    };

    // Find the entry element
    const entryMatch = xmlText.match(/<entry>([\s\S]*?)<\/entry>/i);
    if (!entryMatch) {
      return null;
    }

    const entry = entryMatch[1];

    const title = getTagContent(entry, "title")?.replace(/\s+/g, " ") || "";
    const abstract = getTagContent(entry, "summary")?.replace(/\s+/g, " ") || "";
    const published = getTagContent(entry, "published");
    const updated = getTagContent(entry, "updated");

    // Extract authors
    const authorMatches = entry.matchAll(/<author>([\s\S]*?)<\/author>/gi);
    const authors: Array<{ name: string; affiliation?: string }> = [];
    for (const authorMatch of authorMatches) {
      const authorContent = authorMatch[1];
      const name = getTagContent(authorContent, "name");
      const affiliation = getTagContent(authorContent, "arxiv:affiliation");
      if (name) {
        authors.push({ name, affiliation: affiliation || undefined });
      }
    }

    // Extract categories
    const categoryMatches = entry.matchAll(/category[^>]*term="([^"]+)"/gi);
    const categories: string[] = [];
    for (const catMatch of categoryMatches) {
      categories.push(catMatch[1]);
    }

    // Extract primary category
    const primaryCategoryMatch = entry.match(/arxiv:primary_category[^>]*term="([^"]+)"/i);
    const primaryCategory = primaryCategoryMatch ? primaryCategoryMatch[1] : categories[0];

    // Extract PDF link
    const pdfLinkMatch = entry.match(/<link[^>]*title="pdf"[^>]*href="([^"]+)"/i);
    const pdfUrl = pdfLinkMatch ? pdfLinkMatch[1] : `https://arxiv.org/pdf/${arxivId}.pdf`;

    // Extract optional fields
    const journalRef = getTagContent(entry, "arxiv:journal_ref");
    const doi = getTagContent(entry, "arxiv:doi");
    const comments = getTagContent(entry, "arxiv:comment");

    return {
      title,
      authors,
      abstract,
      publishedDate: published ? new Date(published) : null,
      updatedDate: updated ? new Date(updated) : null,
      metadata: {
        pdfUrl,
        primaryCategory,
        categories,
        journalRef: journalRef || undefined,
        doi: doi || undefined,
        comments: comments || undefined,
      },
    };
  } catch (error) {
    logger.error("Error fetching arXiv metadata", error instanceof Error ? error : undefined, { details: String(error) });
    return null;
  }
}

/**
 * Download and extract text from a PDF URL
 */
async function extractPdfText(pdfUrl: string): Promise<string | null> {
  try {
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      logger.error("Failed to download PDF", undefined, { status: response.status });
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const data = await pdfParse(buffer);
    return data.text || null;
  } catch (error) {
    logger.error("Error extracting PDF text", error instanceof Error ? error : undefined, { details: String(error) });
    return null;
  }
}

/**
 * Maximum age (ms) a paper can stay in "indexing" before the recovery worker
 * considers it stuck and re-attempts. Guards against a process crash that left
 * a paper mid-indexing.
 */
const STUCK_INDEXING_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Run content indexing for a single paper: mark it indexing, fetch and extract
 * the PDF, then mark completed (falling back to the abstract on extraction
 * failure) or failed. Idempotent and safe to re-run for recovery.
 *
 * This is intentionally self-contained (catches its own errors) so it can be
 * driven from a fire-and-forget request path AND from the recovery worker.
 */
export async function indexPaperContent(params: {
  paperId: string;
  arxivId: string;
  pdfUrl: string;
  fallbackAbstract: string;
}): Promise<"completed" | "failed"> {
  const { paperId, arxivId, pdfUrl, fallbackAbstract } = params;
  try {
    await db
      .update(schema.researchPapers)
      .set({ indexStatus: "indexing", updatedAt: new Date() })
      .where(eq(schema.researchPapers.id, paperId));

    const resolvedUrl = pdfUrl || `https://arxiv.org/pdf/${arxivId}.pdf`;
    const extractedText = await extractPdfText(resolvedUrl);
    const content = extractedText || fallbackAbstract;
    const wordCount = content.split(/\s+/).length;

    await db
      .update(schema.researchPapers)
      .set({
        content,
        wordCount,
        indexStatus: "completed",
        contentHash: crypto.createHash("sha256").update(content).digest("hex"),
        updatedAt: new Date(),
      })
      .where(eq(schema.researchPapers.id, paperId));
    return "completed";
  } catch (error) {
    // Fall back to abstract so the paper is still usable; only mark failed if
    // even the fallback write fails.
    try {
      await db
        .update(schema.researchPapers)
        .set({
          content: fallbackAbstract,
          contentHash: crypto.createHash("sha256").update(fallbackAbstract).digest("hex"),
          indexStatus: "completed",
          updatedAt: new Date(),
        })
        .where(eq(schema.researchPapers.id, paperId));
      return "completed";
    } catch {
      await db
        .update(schema.researchPapers)
        .set({
          indexStatus: "failed",
          indexError: error instanceof Error ? error.message : String(error),
          updatedAt: new Date(),
        })
        .where(eq(schema.researchPapers.id, paperId));
      return "failed";
    }
  }
}

/**
 * Recover papers whose indexing never completed — either because the process
 * crashed mid-request (leaving them "pending"), or because an "indexing" run
 * was abandoned (older than {@link STUCK_INDEXING_THRESHOLD_MS}).
 *
 * Returns the number of papers re-processed. Designed to be called by a
 * background worker on an interval.
 */
export async function recoverStuckPaperIndexing(limit = 25): Promise<number> {
  const staleBefore = new Date(Date.now() - STUCK_INDEXING_THRESHOLD_MS);

  const candidates = await db
    .select({
      id: schema.researchPapers.id,
      arxivId: schema.researchPapers.arxivId,
      abstract: schema.researchPapers.abstract,
      metadata: schema.researchPapers.metadata,
      indexStatus: schema.researchPapers.indexStatus,
      updatedAt: schema.researchPapers.updatedAt,
    })
    .from(schema.researchPapers)
    .where(
      or(
        eq(schema.researchPapers.indexStatus, "pending"),
        and(
          eq(schema.researchPapers.indexStatus, "indexing"),
          sql`${schema.researchPapers.updatedAt} < ${staleBefore}`
        )
      )
    )
    .limit(limit);

  let recovered = 0;
  for (const paper of candidates) {
    const metadata = (paper.metadata ?? {}) as { pdfUrl?: string };
    const pdfUrl = metadata.pdfUrl || `https://arxiv.org/pdf/${paper.arxivId}.pdf`;
    await indexPaperContent({
      paperId: paper.id,
      arxivId: paper.arxivId,
      pdfUrl,
      fallbackAbstract: paper.abstract ?? "",
    });
    recovered += 1;
  }

  if (recovered > 0) {
    logger.info("Recovered stuck research-paper indexing", { recovered });
  }
  return recovered;
}

/**
 * GET /v1/research-papers
 * List indexed research papers with pagination
 */
router.get(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      projectId,
      project_id,
      status,
      limit = "20",
      offset = "0",
      sort = "created_at",
      order = "desc",
    } = req.query;

    const effectiveProjectId = (projectId || project_id) as string | undefined;
    const conditions = [eq(schema.researchPapers.userId, req.user!.userId)];

    if (effectiveProjectId) {
      conditions.push(eq(schema.researchPapers.projectId, effectiveProjectId));
    }

    if (status) {
      conditions.push(eq(schema.researchPapers.indexStatus, status as string));
    }

    // Build order clause
    const orderColumn = sort === "published_date"
      ? schema.researchPapers.publishedDate
      : sort === "title"
      ? schema.researchPapers.title
      : schema.researchPapers.createdAt;

    const papers = await db
      .select()
      .from(schema.researchPapers)
      .where(and(...conditions))
      .orderBy(order === "asc" ? orderColumn : desc(orderColumn))
      .limit(Number(limit))
      .offset(Number(offset));

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.researchPapers)
      .where(and(...conditions));

    res.json({
      data: papers.map((paper: any) => ({
        id: paper.id,
        arxiv_id: paper.arxivId,
        title: paper.title,
        authors: paper.authors,
        abstract: paper.abstract.slice(0, 500) + (paper.abstract.length > 500 ? "..." : ""),
        published_date: paper.publishedDate,
        index_status: paper.indexStatus,
        word_count: paper.wordCount,
        project_id: paper.projectId,
        tags: paper.tags,
        metadata: paper.metadata,
        created_at: paper.createdAt,
        updated_at: paper.updatedAt,
      })),
      total: countResult?.count || 0,
      limit: Number(limit),
      offset: Number(offset),
      has_more: Number(offset) + papers.length < (countResult?.count || 0),
    });
  })
);

/**
 * POST /v1/research-papers
 * Index a new research paper from arXiv
 */
router.post(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      url,
      arxivId,
      arxiv_id,
      projectId,
      project_id,
      tags,
    } = req.body;

    const input = url || arxivId || arxiv_id;
    const effectiveProjectId = projectId || project_id;

    if (!input) {
      throw Errors.missingParameter("url or arxivId");
    }

    // Parse arXiv ID from input
    const parsed = parseArxivId(input);
    if (!parsed) {
      throw Errors.invalidParameter(
        "url",
        "Invalid arXiv URL or ID. Supported formats: '2301.00001', 'https://arxiv.org/abs/2301.00001', 'arxiv:2301.00001'"
      );
    }

    // Check if paper already exists for this user
    const [existing] = await db
      .select()
      .from(schema.researchPapers)
      .where(
        and(
          eq(schema.researchPapers.userId, req.user!.userId),
          eq(schema.researchPapers.arxivId, parsed.arxivId)
        )
      )
      .limit(1);

    if (existing) {
      throw Errors.conflict(`Paper with arXiv ID '${parsed.arxivId}' is already indexed`);
    }

    // Verify project belongs to user if provided
    if (effectiveProjectId) {
      const [project] = await db
        .select()
        .from(schema.projects)
        .where(
          and(
            eq(schema.projects.id, effectiveProjectId),
            eq(schema.projects.userId, req.user!.userId)
          )
        )
        .limit(1);

      if (!project) {
        throw Errors.projectNotFound(effectiveProjectId);
      }
    }

    // Fetch metadata from arXiv
    const arxivData = await fetchArxivMetadata(parsed.arxivId);
    if (!arxivData) {
      throw Errors.invalidRequest(
        `Could not fetch paper metadata from arXiv for ID '${parsed.arxivId}'. Please verify the ID is correct.`
      );
    }

    // Generate paper ID
    const paperId = generateId("paper");

    // Create paper record
    const [paper] = await db
      .insert(schema.researchPapers)
      .values({
        id: paperId,
        userId: req.user!.userId,
        projectId: effectiveProjectId || null,
        arxivId: parsed.arxivId,
        title: arxivData.title,
        authors: arxivData.authors,
        abstract: arxivData.abstract,
        content: null, // Will be populated during indexing
        publishedDate: arxivData.publishedDate,
        updatedDate: arxivData.updatedDate,
        indexStatus: "pending",
        wordCount: arxivData.abstract.split(/\s+/).length,
        metadata: arxivData.metadata,
        tags: tags || null,
      })
      .returning();

    // Kick off content indexing immediately (fire-and-forget for fast response).
    // If the process crashes mid-index, recoverStuckPaperIndexing() — run by the
    // background "paper-indexing" worker — will re-process this paper, so a paper
    // can never be permanently stranded in "pending"/"indexing".
    const pdfUrl = arxivData.metadata.pdfUrl || `https://arxiv.org/pdf/${parsed.arxivId}.pdf`;
    void indexPaperContent({
      paperId,
      arxivId: parsed.arxivId,
      pdfUrl,
      fallbackAbstract: arxivData.abstract,
    }).catch((error: unknown) => {
      logger.error(
        "research-paper indexing failed",
        error instanceof Error ? error : undefined,
        { paperId, details: String(error) }
      );
    });

    res.status(201).json({
      id: paper.id,
      arxiv_id: paper.arxivId,
      title: paper.title,
      authors: paper.authors,
      abstract: paper.abstract,
      published_date: paper.publishedDate,
      index_status: paper.indexStatus,
      project_id: paper.projectId,
      tags: paper.tags,
      metadata: paper.metadata,
      created_at: paper.createdAt,
      message: "Paper indexed successfully. Content extraction may take a moment.",
    });
  })
);

/**
 * GET /v1/research-papers/search
 * Search across all indexed papers
 */
router.get(
  "/search",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      q,
      query,
      projectId,
      project_id,
      limit = "20",
      offset = "0",
      searchIn = "all", // all, title, abstract, content
    } = req.query;

    const searchQuery = (q || query) as string;
    const effectiveProjectId = (projectId || project_id) as string | undefined;

    if (!searchQuery) {
      throw Errors.missingParameter("q");
    }

    const conditions = [eq(schema.researchPapers.userId, req.user!.userId)];

    if (effectiveProjectId) {
      conditions.push(eq(schema.researchPapers.projectId, effectiveProjectId));
    }

    // Build search conditions based on searchIn parameter
    const searchConditions: any[] = [];
    const searchPattern = `%${searchQuery}%`;

    if (searchIn === "all" || searchIn === "title") {
      searchConditions.push(ilike(schema.researchPapers.title, searchPattern));
    }
    if (searchIn === "all" || searchIn === "abstract") {
      searchConditions.push(ilike(schema.researchPapers.abstract, searchPattern));
    }
    if (searchIn === "all" || searchIn === "content") {
      searchConditions.push(ilike(schema.researchPapers.content, searchPattern));
    }

    // Also search in author names (JSON field)
    if (searchIn === "all") {
      searchConditions.push(
        sql`${schema.researchPapers.authors}::text ILIKE ${searchPattern}`
      );
    }

    const papers = await db
      .select()
      .from(schema.researchPapers)
      .where(
        and(
          ...conditions,
          or(...searchConditions)
        )
      )
      .orderBy(desc(schema.researchPapers.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));

    // Extract matching snippets
    const results = papers.map((paper: any) => {
      const matches: Array<{ field: string; snippet: string }> = [];
      const searchLower = searchQuery.toLowerCase();

      // Check title
      if (paper.title.toLowerCase().includes(searchLower)) {
        matches.push({ field: "title", snippet: paper.title });
      }

      // Check abstract
      if (paper.abstract.toLowerCase().includes(searchLower)) {
        const index = paper.abstract.toLowerCase().indexOf(searchLower);
        const start = Math.max(0, index - 100);
        const end = Math.min(paper.abstract.length, index + searchQuery.length + 100);
        matches.push({
          field: "abstract",
          snippet:
            (start > 0 ? "..." : "") +
            paper.abstract.slice(start, end) +
            (end < paper.abstract.length ? "..." : ""),
        });
      }

      // Check content
      if (paper.content?.toLowerCase().includes(searchLower)) {
        const index = paper.content.toLowerCase().indexOf(searchLower);
        const start = Math.max(0, index - 100);
        const end = Math.min(paper.content.length, index + searchQuery.length + 100);
        matches.push({
          field: "content",
          snippet:
            (start > 0 ? "..." : "") +
            paper.content.slice(start, end) +
            (end < paper.content.length ? "..." : ""),
        });
      }

      // Check authors
      const authorNames = paper.authors?.map((a: any) => a.name).join(", ") || "";
      if (authorNames.toLowerCase().includes(searchLower)) {
        matches.push({ field: "authors", snippet: authorNames });
      }

      return {
        id: paper.id,
        arxiv_id: paper.arxivId,
        title: paper.title,
        authors: paper.authors,
        published_date: paper.publishedDate,
        project_id: paper.projectId,
        matches,
        created_at: paper.createdAt,
      };
    });

    res.json({
      query: searchQuery,
      search_in: searchIn,
      results,
      total: results.length,
      limit: Number(limit),
      offset: Number(offset),
    });
  })
);

/**
 * GET /v1/research-papers/:id
 * Get paper details by ID
 */
router.get(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const [paper] = await db
      .select()
      .from(schema.researchPapers)
      .where(
        and(
          eq(schema.researchPapers.id, id),
          eq(schema.researchPapers.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!paper) {
      throw Errors.notFound("Research paper", id);
    }

    res.json({
      id: paper.id,
      arxiv_id: paper.arxivId,
      title: paper.title,
      authors: paper.authors,
      abstract: paper.abstract,
      content: paper.content,
      published_date: paper.publishedDate,
      updated_date: paper.updatedDate,
      index_status: paper.indexStatus,
      index_error: paper.indexError,
      word_count: paper.wordCount,
      project_id: paper.projectId,
      tags: paper.tags,
      metadata: paper.metadata,
      created_at: paper.createdAt,
      updated_at: paper.updatedAt,
    });
  })
);

/**
 * DELETE /v1/research-papers/:id
 * Delete an indexed paper
 */
router.delete(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    // Verify ownership
    const [existing] = await db
      .select()
      .from(schema.researchPapers)
      .where(
        and(
          eq(schema.researchPapers.id, id),
          eq(schema.researchPapers.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!existing) {
      throw Errors.notFound("Research paper", id);
    }

    await db
      .delete(schema.researchPapers)
      .where(eq(schema.researchPapers.id, id));

    res.json({
      deleted: true,
      id,
      message: "Research paper deleted successfully",
    });
  })
);

/**
 * POST /v1/research-papers/:id/search
 * Search within a specific paper's content
 */
router.post(
  "/:id/search",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const {
      q,
      query,
      case_sensitive = false,
      max_results = 20,
    } = req.body;

    const searchQuery = q || query;

    if (!searchQuery) {
      throw Errors.missingParameter("q or query");
    }

    // Get the paper
    const [paper] = await db
      .select()
      .from(schema.researchPapers)
      .where(
        and(
          eq(schema.researchPapers.id, id),
          eq(schema.researchPapers.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!paper) {
      throw Errors.notFound("Research paper", id);
    }

    // Search in content, abstract, and title
    const searchIn = case_sensitive ? searchQuery : searchQuery.toLowerCase();
    const results: Array<{
      field: string;
      position: number;
      snippet: string;
      context_before: string;
      context_after: string;
    }> = [];

    const searchText = (text: string, fieldName: string) => {
      if (!text) return;

      const compareText = case_sensitive ? text : text.toLowerCase();
      let position = 0;

      while (results.length < max_results) {
        const index = compareText.indexOf(searchIn, position);
        if (index === -1) break;

        const snippetStart = Math.max(0, index - 50);
        const snippetEnd = Math.min(text.length, index + searchQuery.length + 50);
        const contextBefore = text.slice(snippetStart, index);
        const match = text.slice(index, index + searchQuery.length);
        const contextAfter = text.slice(index + searchQuery.length, snippetEnd);

        results.push({
          field: fieldName,
          position: index,
          snippet: match,
          context_before: (snippetStart > 0 ? "..." : "") + contextBefore,
          context_after: contextAfter + (snippetEnd < text.length ? "..." : ""),
        });

        position = index + 1;
      }
    };

    searchText(paper.title, "title");
    searchText(paper.abstract, "abstract");
    searchText(paper.content || "", "content");

    res.json({
      paper_id: paper.id,
      arxiv_id: paper.arxivId,
      title: paper.title,
      query: searchQuery,
      case_sensitive,
      results: results.slice(0, max_results),
      total_matches: results.length,
    });
  })
);

/**
 * PATCH /v1/research-papers/:id
 * Update paper metadata (tags, project association)
 */
router.patch(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { tags, projectId, project_id } = req.body;

    const effectiveProjectId = projectId || project_id;

    // Verify ownership
    const [existing] = await db
      .select()
      .from(schema.researchPapers)
      .where(
        and(
          eq(schema.researchPapers.id, id),
          eq(schema.researchPapers.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!existing) {
      throw Errors.notFound("Research paper", id);
    }

    // Verify project if provided
    if (effectiveProjectId) {
      const [project] = await db
        .select()
        .from(schema.projects)
        .where(
          and(
            eq(schema.projects.id, effectiveProjectId),
            eq(schema.projects.userId, req.user!.userId)
          )
        )
        .limit(1);

      if (!project) {
        throw Errors.projectNotFound(effectiveProjectId);
      }
    }

    // Build update object
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (tags !== undefined) updates.tags = tags;
    if (effectiveProjectId !== undefined) updates.projectId = effectiveProjectId;

    const [updated] = await db
      .update(schema.researchPapers)
      .set(updates)
      .where(eq(schema.researchPapers.id, id))
      .returning();

    res.json({
      id: updated.id,
      arxiv_id: updated.arxivId,
      title: updated.title,
      tags: updated.tags,
      project_id: updated.projectId,
      updated_at: updated.updatedAt,
      message: "Paper updated successfully",
    });
  })
);

export default router;
