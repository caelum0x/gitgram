import * as fs from 'fs';
import * as path from 'path';
import { FileSystemError } from './errors.js';

export interface FileScanOptions {
    includePatterns?: string[];
    excludePatterns?: string[];
    maxFileSize?: number; // in bytes
    followSymlinks?: boolean;
}

export class FileScanner {
    private defaultExcludePatterns = [
        '**/node_modules/**',
        '**/.git/**',
        '**/.aitimemachine/**',
        '**/dist/**',
        '**/build/**',
        '**/.next/**',
        '**/coverage/**',
        '**/*.log',
    ];

    constructor(private options: FileScanOptions = {}) { }

    /**
     * Recursively scan directory and return all matching files
     */
    scanDirectory(dirPath: string): string[] {
        try {
            if (!fs.existsSync(dirPath)) {
                throw new FileSystemError(`Directory not found: ${dirPath}`);
            }

            const stats = fs.statSync(dirPath);
            if (!stats.isDirectory()) {
                throw new FileSystemError(`Path is not a directory: ${dirPath}`);
            }

            return this.scanRecursive(dirPath);
        } catch (error) {
            if (error instanceof FileSystemError) throw error;
            throw new FileSystemError(`Failed to scan directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Check if a file matches the include/exclude patterns
     */
    private shouldIncludeFile(filePath: string): boolean {
        const relativePath = filePath;

        // Check exclude patterns first
        const excludePatterns = [
            ...this.defaultExcludePatterns,
            ...(this.options.excludePatterns || [])
        ];

        for (const pattern of excludePatterns) {
            if (this.matchPattern(relativePath, pattern)) {
                return false;
            }
        }

        // If include patterns are specified, file must match at least one
        if (this.options.includePatterns && this.options.includePatterns.length > 0) {
            return this.options.includePatterns.some(pattern =>
                this.matchPattern(relativePath, pattern)
            );
        }

        return true;
    }

    /**
     * Simple glob pattern matching
     */
    private matchPattern(filePath: string, pattern: string): boolean {
        // Convert glob pattern to regex
        const regexPattern = pattern
            .replace(/\./g, '\\.')
            .replace(/\*\*/g, '.*')
            .replace(/\*/g, '[^/]*')
            .replace(/\?/g, '.');

        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(filePath);
    }

    /**
     * Recursively scan directory
     */
    private scanRecursive(dirPath: string, basePath: string = dirPath): string[] {
        const files: string[] = [];

        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                const relativePath = path.relative(basePath, fullPath);

                if (entry.isDirectory()) {
                    // Check if directory should be excluded
                    if (!this.shouldIncludeFile(relativePath + '/')) {
                        continue;
                    }

                    // Recursively scan subdirectory
                    files.push(...this.scanRecursive(fullPath, basePath));
                } else if (entry.isFile()) {
                    // Check file size limit
                    if (this.options.maxFileSize) {
                        const stats = fs.statSync(fullPath);
                        if (stats.size > this.options.maxFileSize) {
                            console.warn(`Skipping large file: ${relativePath} (${stats.size} bytes)`);
                            continue;
                        }
                    }

                    // Check if file should be included
                    if (this.shouldIncludeFile(relativePath)) {
                        files.push(fullPath);
                    }
                } else if (entry.isSymbolicLink() && this.options.followSymlinks) {
                    // Handle symlinks if enabled
                    const realPath = fs.realpathSync(fullPath);
                    const realStats = fs.statSync(realPath);

                    if (realStats.isFile() && this.shouldIncludeFile(relativePath)) {
                        files.push(fullPath);
                    }
                }
            }
        } catch (error) {
            console.warn(`Failed to scan directory ${dirPath}:`, error instanceof Error ? error.message : 'Unknown error');
        }

        return files;
    }

    /**
     * Get file content with error handling
     */
    readFile(filePath: string): string {
        try {
            if (!fs.existsSync(filePath)) {
                throw new FileSystemError(`File not found: ${filePath}`);
            }

            return fs.readFileSync(filePath, 'utf-8');
        } catch (error) {
            if (error instanceof FileSystemError) throw error;
            throw new FileSystemError(`Failed to read file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
