/**
 * GraphQL Schema Definition
 *
 * Defines types, queries, and mutations for the Gitgram API.
 * Mirrors the Prisma data model and aligns with the REST/tRPC surface.
 */

export const typeDefs = `#graphql
  # -------------------------------------------------------------------------
  # Scalars
  # -------------------------------------------------------------------------
  scalar DateTime

  # -------------------------------------------------------------------------
  # Enums
  # -------------------------------------------------------------------------
  enum UserTier {
    free
    pro
    enterprise
  }

  # -------------------------------------------------------------------------
  # Core types
  # -------------------------------------------------------------------------
  type User {
    id: ID!
    username: String!
    displayName: String
    avatar: String
    bio: String
    followersCount: Int!
    followingCount: Int!
    isVerified: Boolean!
    tier: UserTier!
  }

  type Post {
    id: ID!
    content: String!
    author: User!
    likes: Int!
    commentsCount: Int!
    repostsCount: Int!
    hashtags: [String!]!
    createdAt: DateTime!
  }

  type Repository {
    id: ID!
    fullName: String!
    description: String
    stars: Int!
    forks: Int!
    language: String
    isPrivate: Boolean!
    owner: User!
  }

  type Snippet {
    id: ID!
    title: String
    code: String!
    language: String
    description: String
    author: User!
    likes: Int!
  }

  # -------------------------------------------------------------------------
  # Pagination
  # -------------------------------------------------------------------------
  type PageInfo {
    hasNextPage: Boolean!
    endCursor: String
  }

  type PostEdge {
    node: Post!
    cursor: String!
  }

  type PostConnection {
    edges: [PostEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  # -------------------------------------------------------------------------
  # Trending
  # -------------------------------------------------------------------------
  type TrendingResult {
    posts: [Post!]!
    repositories: [Repository!]!
    users: [User!]!
  }

  # -------------------------------------------------------------------------
  # Inputs
  # -------------------------------------------------------------------------
  input CreatePostInput {
    content: String!
    hashtags: [String!]
    repoOwner: String
    repoName: String
    mediaUrls: [String!]
  }

  # -------------------------------------------------------------------------
  # Queries
  # -------------------------------------------------------------------------
  type Query {
    """Look up a user profile by username."""
    user(username: String!): User

    """Look up a single post by ID."""
    post(id: ID!): Post

    """
    Paginated list of posts.
    Pass userId to scope to a specific author.
    Pass cursor (opaque string from a previous response) to page forward.
    """
    posts(userId: ID, limit: Int, cursor: String): PostConnection!

    """Look up a repository by owner handle and repo name."""
    repository(owner: String!, name: String!): Repository

    """
    Authenticated user's personalised feed.
    Requires a valid JWT in the request cookie / Authorization header.
    """
    feed(limit: Int, cursor: String): PostConnection!

    """Trending posts, repositories, and users."""
    trending: TrendingResult!
  }

  # -------------------------------------------------------------------------
  # Mutations
  # -------------------------------------------------------------------------
  type Mutation {
    """Create a new post. Requires authentication."""
    createPost(input: CreatePostInput!): Post!

    """Like (or unlike) a post. Returns the updated post. Requires authentication."""
    likePost(postId: ID!): Post!

    """Follow (or unfollow) a user. Returns the updated target user. Requires authentication."""
    followUser(userId: ID!): User!
  }
`;
