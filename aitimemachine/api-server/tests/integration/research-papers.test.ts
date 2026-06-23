import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  seedTestData,
  createTestApp,
  TEST_API_KEY,
  mockResearchPapers,
} from "../setup.js";

// Mock arXiv XML response for fetchArxivMetadata
const MOCK_ARXIV_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Test Paper: Neural Networks for Code Generation</title>
    <summary>An abstract about neural network approaches to code generation and synthesis.</summary>
    <author><name>Test Author</name></author>
    <published>2024-01-15T00:00:00Z</published>
    <updated>2024-01-20T00:00:00Z</updated>
    <link title="pdf" href="https://arxiv.org/pdf/2401.12345.pdf" />
    <arxiv:primary_category xmlns:arxiv="http://arxiv.org/schemas/atom" term="cs.AI" />
    <category term="cs.AI" />
    <category term="cs.SE" />
  </entry>
</feed>`;

describe("Research Papers PDF Extraction", () => {
  let app: Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(() => {
    seedTestData();

    // Mock global fetch - supports both arXiv API (text) and PDF download (arrayBuffer)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(MOCK_ARXIV_XML),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      })
    );

    // Seed a research paper
    mockResearchPapers.push({
      id: "paper_test_001",
      userId: "user_test_001",
      arxivId: "2301.00001",
      title: "Test Paper: Machine Learning for Code",
      authors: ["Author One", "Author Two"],
      abstract:
        "This is a test abstract about machine learning for code generation.",
      pdfUrl: "https://arxiv.org/pdf/2301.00001.pdf",
      publishedDate: new Date("2023-01-01"),
      categories: ["cs.AI", "cs.SE"],
      searchableContent: "Test searchable content",
      indexStatus: "completed",
      tags: ["ml", "code"],
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
    });
  });

  describe("GET /v1/research-papers", () => {
    it("should return a list containing the seeded paper", async () => {
      const res = await request(app)
        .get("/v1/research-papers")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      const paper = res.body.data.find(
        (p: { id: string }) => p.id === "paper_test_001"
      );
      expect(paper).toBeDefined();
      expect(paper.title).toBe("Test Paper: Machine Learning for Code");
      expect(paper.arxiv_id).toBe("2301.00001");
    });

    it("should return an empty list when no papers exist", async () => {
      mockResearchPapers.length = 0;

      const res = await request(app)
        .get("/v1/research-papers")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(res.body.data.length).toBe(0);
    });
  });

  describe("POST /v1/research-papers", () => {
    it("should create a paper record when given a valid arxiv_id", async () => {
      const paperCountBefore = mockResearchPapers.length;

      const res = await request(app)
        .post("/v1/research-papers")
        .set("X-API-Key", TEST_API_KEY)
        .send({ arxiv_id: "2401.12345" });

      expect(res.status).toBe(201);
      expect(res.body).toBeDefined();
      expect(res.body.arxiv_id).toBe("2401.12345");
      expect(mockResearchPapers.length).toBe(paperCountBefore + 1);
    });

    it("should return 400 for an invalid arXiv ID", async () => {
      const res = await request(app)
        .post("/v1/research-papers")
        .set("X-API-Key", TEST_API_KEY)
        .send({ arxiv_id: "not-a-valid-id" });

      expect(res.status).toBe(400);
    });
  });

  describe("GET /v1/research-papers/:id", () => {
    it("should return paper details for an existing paper", async () => {
      const res = await request(app)
        .get("/v1/research-papers/paper_test_001")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toBeDefined();
      expect(res.body.id).toBe("paper_test_001");
      expect(res.body.title).toBe("Test Paper: Machine Learning for Code");
      expect(res.body.arxiv_id).toBe("2301.00001");
      expect(res.body.index_status).toBe("completed");
    });

    it("should return 404 for a nonexistent paper", async () => {
      const res = await request(app)
        .get("/v1/research-papers/paper_nonexistent")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /v1/research-papers/:id", () => {
    it("should delete an existing paper and return success", async () => {
      const paperCountBefore = mockResearchPapers.length;

      const res = await request(app)
        .delete("/v1/research-papers/paper_test_001")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("deleted", true);
      expect(mockResearchPapers.length).toBe(paperCountBefore - 1);
    });
  });
});
