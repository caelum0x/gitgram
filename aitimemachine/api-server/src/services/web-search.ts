/**
 * Web Search Service
 *
 * Provides web search and scraping capabilities with multiple provider support:
 * - Brave Search API
 * - SerpAPI
 * - Serper.dev
 * - DuckDuckGo (no API key required)
 *
 * And scraping:
 * - Native fetch + HTML parsing
 * - Firecrawl API
 */

import * as cheerio from "cheerio";

// ============================================================================
// Types
// ============================================================================

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  favicon?: string;
  publishedDate?: string;
  source?: string;
}

export interface WebSearchOptions {
  limit?: number;
  safeSearch?: boolean;
  region?: string;
  language?: string;
}

export interface ScrapeResult {
  url: string;
  title: string;
  content: string;
  markdown?: string;
  extracted?: Record<string, string | string[]>;
  metadata?: {
    description?: string;
    keywords?: string[];
    author?: string;
    publishedDate?: string;
    ogImage?: string;
  };
}

export interface ScrapeOptions {
  selectors?: string[];
  includeMarkdown?: boolean;
  timeout?: number;
}

type SearchProvider = "brave" | "serpapi" | "serper" | "duckduckgo";

// ============================================================================
// Web Search Service
// ============================================================================

export class WebSearchService {
  private provider: SearchProvider;
  private apiKey?: string;

  constructor() {
    this.provider = this.detectProvider();
    this.apiKey = this.getApiKey();
  }

  /**
   * Auto-detect available search provider
   */
  private detectProvider(): SearchProvider {
    if (process.env.BRAVE_SEARCH_API_KEY) return "brave";
    if (process.env.SERPAPI_KEY) return "serpapi";
    if (process.env.SERPER_API_KEY) return "serper";
    return "duckduckgo"; // Free fallback
  }

  /**
   * Get API key for current provider
   */
  private getApiKey(): string | undefined {
    switch (this.provider) {
      case "brave":
        return process.env.BRAVE_SEARCH_API_KEY;
      case "serpapi":
        return process.env.SERPAPI_KEY;
      case "serper":
        return process.env.SERPER_API_KEY;
      default:
        return undefined;
    }
  }

  /**
   * Perform a web search
   */
  async search(query: string, options: WebSearchOptions = {}): Promise<WebSearchResult[]> {
    const { limit = 10, safeSearch = true } = options;

    switch (this.provider) {
      case "brave":
        return this.searchBrave(query, limit, safeSearch);
      case "serpapi":
        return this.searchSerpApi(query, limit, safeSearch);
      case "serper":
        return this.searchSerper(query, limit, safeSearch);
      case "duckduckgo":
      default:
        return this.searchDuckDuckGo(query, limit, safeSearch);
    }
  }

  /**
   * Brave Search API
   */
  private async searchBrave(
    query: string,
    limit: number,
    safeSearch: boolean
  ): Promise<WebSearchResult[]> {
    if (!this.apiKey) {
      throw new Error("Brave Search API key not configured");
    }

    const params = new URLSearchParams({
      q: query,
      count: Math.min(limit, 20).toString(),
      safesearch: safeSearch ? "moderate" : "off",
    });

    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?${params}`,
      {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": this.apiKey,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Brave Search failed: ${error}`);
    }

    const data = await response.json();
    const results: WebSearchResult[] = [];

    if (data.web?.results) {
      for (const result of data.web.results.slice(0, limit)) {
        results.push({
          title: result.title || "",
          url: result.url || "",
          snippet: result.description || "",
          favicon: result.profile?.img || this.getFaviconUrl(result.url),
          publishedDate: result.age,
        });
      }
    }

    return results;
  }

  /**
   * SerpAPI
   */
  private async searchSerpApi(
    query: string,
    limit: number,
    safeSearch: boolean
  ): Promise<WebSearchResult[]> {
    if (!this.apiKey) {
      throw new Error("SerpAPI key not configured");
    }

    const params = new URLSearchParams({
      q: query,
      api_key: this.apiKey,
      engine: "google",
      num: Math.min(limit, 100).toString(),
      safe: safeSearch ? "active" : "off",
    });

    const response = await fetch(`https://serpapi.com/search?${params}`);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`SerpAPI search failed: ${error}`);
    }

    const data = await response.json();
    const results: WebSearchResult[] = [];

    if (data.organic_results) {
      for (const result of data.organic_results.slice(0, limit)) {
        results.push({
          title: result.title || "",
          url: result.link || "",
          snippet: result.snippet || "",
          favicon: result.favicon || this.getFaviconUrl(result.link),
          publishedDate: result.date,
          source: result.source,
        });
      }
    }

    return results;
  }

  /**
   * Serper.dev API
   */
  private async searchSerper(
    query: string,
    limit: number,
    safeSearch: boolean
  ): Promise<WebSearchResult[]> {
    if (!this.apiKey) {
      throw new Error("Serper API key not configured");
    }

    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        num: Math.min(limit, 100),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Serper search failed: ${error}`);
    }

    const data = await response.json();
    const results: WebSearchResult[] = [];

    if (data.organic) {
      for (const result of data.organic.slice(0, limit)) {
        results.push({
          title: result.title || "",
          url: result.link || "",
          snippet: result.snippet || "",
          favicon: this.getFaviconUrl(result.link),
          publishedDate: result.date,
        });
      }
    }

    return results;
  }

  /**
   * DuckDuckGo Instant Answer API (free, no API key)
   * Note: This uses the instant answer API which has limited results
   */
  private async searchDuckDuckGo(
    query: string,
    limit: number,
    _safeSearch: boolean
  ): Promise<WebSearchResult[]> {
    // DuckDuckGo Instant Answer API
    const params = new URLSearchParams({
      q: query,
      format: "json",
      no_html: "1",
      skip_disambig: "1",
    });

    const response = await fetch(`https://api.duckduckgo.com/?${params}`, {
      headers: {
        "User-Agent": "GitgramTimeMachine/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo search failed: ${response.statusText}`);
    }

    const data = await response.json();
    const results: WebSearchResult[] = [];

    // Add abstract result if available
    if (data.AbstractText && data.AbstractURL) {
      results.push({
        title: data.Heading || query,
        url: data.AbstractURL,
        snippet: data.AbstractText,
        source: data.AbstractSource,
      });
    }

    // Add related topics
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, limit - results.length)) {
        if (topic.FirstURL && topic.Text) {
          results.push({
            title: topic.Text.split(" - ")[0] || topic.Text.slice(0, 60),
            url: topic.FirstURL,
            snippet: topic.Text,
            favicon: topic.Icon?.URL,
          });
        }
        // Handle nested topics
        if (topic.Topics) {
          for (const subTopic of topic.Topics) {
            if (results.length >= limit) break;
            if (subTopic.FirstURL && subTopic.Text) {
              results.push({
                title: subTopic.Text.split(" - ")[0] || subTopic.Text.slice(0, 60),
                url: subTopic.FirstURL,
                snippet: subTopic.Text,
                favicon: subTopic.Icon?.URL,
              });
            }
          }
        }
      }
    }

    // If no results from instant answer, try HTML scraping as fallback
    if (results.length === 0) {
      return this.scrapeDuckDuckGoHtml(query, limit);
    }

    return results.slice(0, limit);
  }

  /**
   * Scrape DuckDuckGo HTML results as fallback
   */
  private async scrapeDuckDuckGoHtml(
    query: string,
    limit: number
  ): Promise<WebSearchResult[]> {
    const params = new URLSearchParams({ q: query });
    const response = await fetch(`https://html.duckduckgo.com/html/?${params}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    if (!response.ok) {
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const results: WebSearchResult[] = [];

    $(".result").each((_, element) => {
      if (results.length >= limit) return false;

      const titleEl = $(element).find(".result__title a");
      const snippetEl = $(element).find(".result__snippet");
      const url = titleEl.attr("href");

      if (url && !url.startsWith("/")) {
        results.push({
          title: titleEl.text().trim(),
          url: url,
          snippet: snippetEl.text().trim(),
          favicon: this.getFaviconUrl(url),
        });
      }
    });

    return results;
  }

  /**
   * Get favicon URL for a domain
   */
  private getFaviconUrl(url: string): string {
    try {
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    } catch {
      return "";
    }
  }

  /**
   * Get current provider info
   */
  getProviderInfo(): { provider: SearchProvider; hasApiKey: boolean } {
    return {
      provider: this.provider,
      hasApiKey: !!this.apiKey,
    };
  }
}

// ============================================================================
// Web Scraping Service
// ============================================================================

export class WebScrapingService {
  private firecrawlKey?: string;

  constructor() {
    this.firecrawlKey = process.env.FIRECRAWL_API_KEY;
  }

  /**
   * Scrape content from a URL
   */
  async scrape(url: string, options: ScrapeOptions = {}): Promise<ScrapeResult> {
    // Validate URL
    try {
      new URL(url);
    } catch {
      throw new Error("Invalid URL format");
    }

    // Use Firecrawl if available for better results
    if (this.firecrawlKey) {
      return this.scrapeWithFirecrawl(url, options);
    }

    // Fall back to native fetch + cheerio
    return this.scrapeWithCheerio(url, options);
  }

  /**
   * Scrape with Firecrawl API
   */
  private async scrapeWithFirecrawl(
    url: string,
    options: ScrapeOptions
  ): Promise<ScrapeResult> {
    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.firecrawlKey}`,
      },
      body: JSON.stringify({
        url,
        formats: options.includeMarkdown ? ["markdown", "html"] : ["html"],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Firecrawl scrape failed: ${error}`);
    }

    const data = await response.json();

    const result: ScrapeResult = {
      url,
      title: data.data?.metadata?.title || "",
      content: data.data?.html || "",
      markdown: data.data?.markdown,
      metadata: {
        description: data.data?.metadata?.description,
        ogImage: data.data?.metadata?.ogImage,
      },
    };

    // Extract specific selectors if requested
    if (options.selectors && options.selectors.length > 0 && result.content) {
      result.extracted = this.extractSelectors(result.content, options.selectors);
    }

    return result;
  }

  /**
   * Scrape with native fetch and Cheerio
   */
  private async scrapeWithCheerio(
    url: string,
    options: ScrapeOptions
  ): Promise<ScrapeResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 30000);

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Remove scripts, styles, and other non-content elements
      $("script, style, nav, footer, header, aside, iframe, noscript").remove();

      // Extract metadata
      const metadata = {
        description:
          $('meta[name="description"]').attr("content") ||
          $('meta[property="og:description"]').attr("content"),
        keywords: $('meta[name="keywords"]')
          .attr("content")
          ?.split(",")
          .map((k) => k.trim()),
        author: $('meta[name="author"]').attr("content"),
        publishedDate:
          $('meta[property="article:published_time"]').attr("content") ||
          $('time[datetime]').first().attr("datetime"),
        ogImage: $('meta[property="og:image"]').attr("content"),
      };

      // Get title
      const title =
        $("title").text().trim() ||
        $("h1").first().text().trim() ||
        $('meta[property="og:title"]').attr("content") ||
        "";

      // Get main content
      let content = "";

      // Try to find main content area
      const mainSelectors = [
        "main",
        "article",
        '[role="main"]',
        ".content",
        ".post-content",
        ".article-content",
        ".entry-content",
        "#content",
        "#main",
      ];

      for (const selector of mainSelectors) {
        const main = $(selector);
        if (main.length > 0) {
          content = main.text().trim();
          break;
        }
      }

      // Fall back to body if no main content found
      if (!content) {
        content = $("body").text().trim();
      }

      // Clean up whitespace
      content = content.replace(/\s+/g, " ").trim();

      const result: ScrapeResult = {
        url,
        title,
        content,
        metadata,
      };

      // Generate markdown if requested
      if (options.includeMarkdown) {
        result.markdown = this.htmlToMarkdown($, $("body"));
      }

      // Extract specific selectors if requested
      if (options.selectors && options.selectors.length > 0) {
        result.extracted = {};
        for (const selector of options.selectors) {
          const elements = $(selector);
          if (elements.length === 1) {
            result.extracted[selector] = elements.text().trim();
          } else if (elements.length > 1) {
            result.extracted[selector] = elements
              .map((_, el) => $(el).text().trim())
              .get();
          }
        }
      }

      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Extract content using CSS selectors
   */
  private extractSelectors(
    html: string,
    selectors: string[]
  ): Record<string, string | string[]> {
    const $ = cheerio.load(html);
    const extracted: Record<string, string | string[]> = {};

    for (const selector of selectors) {
      const elements = $(selector);
      if (elements.length === 1) {
        extracted[selector] = elements.text().trim();
      } else if (elements.length > 1) {
        extracted[selector] = elements.map((_, el) => $(el).text().trim()).get();
      }
    }

    return extracted;
  }

  /**
   * Convert HTML to Markdown (simple implementation)
   */
  private htmlToMarkdown($: cheerio.CheerioAPI, element: cheerio.Cheerio<any>): string {
    const lines: string[] = [];

    element.find("h1, h2, h3, h4, h5, h6, p, li, pre, code, blockquote").each((_, el) => {
      const $el = $(el);
      const tagName = el.tagName.toLowerCase();
      const text = $el.text().trim();

      if (!text) return;

      switch (tagName) {
        case "h1":
          lines.push(`# ${text}\n`);
          break;
        case "h2":
          lines.push(`## ${text}\n`);
          break;
        case "h3":
          lines.push(`### ${text}\n`);
          break;
        case "h4":
          lines.push(`#### ${text}\n`);
          break;
        case "h5":
          lines.push(`##### ${text}\n`);
          break;
        case "h6":
          lines.push(`###### ${text}\n`);
          break;
        case "p":
          lines.push(`${text}\n`);
          break;
        case "li":
          lines.push(`- ${text}`);
          break;
        case "pre":
        case "code":
          lines.push(`\`\`\`\n${text}\n\`\`\`\n`);
          break;
        case "blockquote":
          lines.push(`> ${text}\n`);
          break;
      }
    });

    return lines.join("\n");
  }

  /**
   * Get scraping provider info
   */
  getProviderInfo(): { provider: string; hasApiKey: boolean } {
    return {
      provider: this.firecrawlKey ? "firecrawl" : "cheerio",
      hasApiKey: !!this.firecrawlKey,
    };
  }
}

// ============================================================================
// Singleton instances
// ============================================================================

let webSearchService: WebSearchService | null = null;
let webScrapingService: WebScrapingService | null = null;

export function getWebSearchService(): WebSearchService {
  if (!webSearchService) {
    webSearchService = new WebSearchService();
  }
  return webSearchService;
}

export function getWebScrapingService(): WebScrapingService {
  if (!webScrapingService) {
    webScrapingService = new WebScrapingService();
  }
  return webScrapingService;
}

export default { WebSearchService, WebScrapingService };
