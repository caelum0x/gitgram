# Changelog

All notable changes to AITimeMachine will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-01-15

### Added

#### CLI v2
- Complete rewrite with interactive TUI mode
- `aitm init` — initialize a new project with guided setup
- `aitm checkpoint` — create timestamped checkpoints with metadata
- `aitm restore` — restore any previous checkpoint with confirmation prompts
- `aitm diff` — line-by-line comparison between checkpoints
- `aitm list` — browse checkpoint history with filtering and search
- `aitm setup` — configure MCP integration and CLAUDE.md for AI tools
- `aitm status` — show current project state and data sources

#### Cloud Sync
- End-to-end encrypted cloud backup and sync
- Cross-device checkpoint access
- Team sharing with granular permissions
- Conflict resolution for concurrent edits
- Bandwidth-efficient delta sync

#### MCP Protocol
- Full Model Context Protocol server implementation
- Tool registration: `checkpoint`, `restore`, `list`, `diff`, `timeline`
- Compatible with Claude, Cursor, Windsurf, and other MCP clients
- Streaming support for large checkpoint operations
- Context-aware checkpoint suggestions

#### API Server
- RESTful API with OpenAPI 3.0 specification
- Authentication via API keys and OAuth 2.0
- Health endpoints: `/health`, `/health/db`, `/health/live`, `/health/ready`, `/health/schema`
- Rate limiting and request validation
- PostgreSQL database with Drizzle ORM
- Session management and audit logging

#### Web Dashboard
- Project overview with checkpoint timeline
- Visual diff viewer with side-by-side comparison
- Team management and invitation system
- Usage analytics and storage monitoring
- Responsive design for mobile access

#### Teams & Organizations
- Organization accounts with role-based access control
- Team workspaces with shared checkpoint history
- Admin dashboard for member management
- Usage quotas and billing per organization
- SSO integration support

#### Infrastructure
- Docker support with multi-stage builds
- Health check endpoints for container orchestration
- Structured JSON logging
- Database migration system with Drizzle Kit
- Environment-based configuration

### Changed
- Migrated from isomorphic-git to custom checkpoint engine for better performance
- Redesigned CLI output with colored, structured formatting
- Improved checkpoint storage format for 3x space efficiency

### Fixed
- Checkpoint corruption on interrupted writes
- Memory leak in watch mode for large repositories
- Incorrect diff output for binary files

---

## [1.0.0] - 2025-06-01

### Added
- Core TimeMachine library with checkpoint/restore functionality
- Conversation memory for persistent AI interactions
- MCP protocol server for AI tool integrations
- CLI interface with commands for init, checkpoint, list, restore, status, mcp
- Git integration using isomorphic-git for versioned checkpoints
- Docusaurus website for documentation
- Comprehensive docs: README, DEVELOPMENT.md, API.md, ROADMAP.md
- Diff feature: view line-by-line differences between checkpoints via CLI and MCP
- Configuration system: user settings for auto-confirm, watch enabled, max checkpoints
- Confirmation prompts: user approval for destructive actions like restores
