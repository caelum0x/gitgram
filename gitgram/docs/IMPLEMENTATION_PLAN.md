# Gitgram Implementation Plan

## Executive Summary

Based on comprehensive codebase analysis, here's the prioritized implementation plan across Backend, Web, and Mobile.

---

## Current State Overview

| Platform | Completeness | Critical Gaps |
|----------|--------------|---------------|
| Backend | ~70% | 30+ stubbed endpoints, missing CRUD operations |
| Web | ~75% | Account deletion, comment threading, notifications |
| Mobile | ~55-60% | Live streaming, scheduled posts, advanced search |

---

## Phase 9: Backend Critical Fixes

### 9.1 Stubbed Endpoints (HIGH PRIORITY)

**File: `src/controllers/authController.ts`**
| Endpoint | Status | Action |
|----------|--------|--------|
| `forgotPassword()` | Stub | Implement email flow |
| `resetPassword()` | Stub | Implement token validation |
| `verifyEmail()` | Stub | Implement verification logic |
| `googleAuth()` | Stub | Implement OAuth |

**File: `src/controllers/userController.ts`**
| Endpoint | Status | Action |
|----------|--------|--------|
| `switchAccount()` | 501 | Implement account switching |
| `linkAccount()` | 501 | Add LinkedAccount model |
| `unlinkAccount()` | 501 | Implement unlinking |
| `updateInterests()` | Incomplete | Add interests field |

### 9.2 Missing CRUD Operations

**Comments**
```
POST   /api/v1/posts/:id/comments/:commentId/like   - Like comment
PUT    /api/v1/posts/:id/comments/:commentId        - Update comment
DELETE /api/v1/posts/:id/comments/:commentId        - Delete comment
```

**Messages**
```
PUT    /api/v1/messages/:id          - Edit message
DELETE /api/v1/messages/:id          - Delete message
POST   /api/v1/messages/:id/report   - Report message
POST   /api/v1/chats/:id/members     - Add member to group
DELETE /api/v1/chats/:id/members/:userId - Remove member
DELETE /api/v1/chats/:id             - Delete chat
```

**Stories**
```
PUT    /api/v1/stories/:id           - Update story
POST   /api/v1/stories/:id/archive   - Archive story
GET    /api/v1/stories/:id/viewers   - Get story viewers
```

**Reels**
```
PUT    /api/v1/reels/:id             - Update reel
POST   /api/v1/reels/:id/share       - Share reel
POST   /api/v1/reels/:id/report      - Report reel
```

**Scheduled Posts**
```
GET    /api/v1/scheduled-posts       - List scheduled posts
GET    /api/v1/scheduled-posts/:id   - Get single scheduled post
PUT    /api/v1/scheduled-posts/:id   - Update scheduled post
DELETE /api/v1/scheduled-posts/:id   - Cancel scheduled post
```

**Repositories**
```
PUT    /api/v1/repositories/:owner/:name         - Update repository
DELETE /api/v1/repositories/:owner/:name         - Delete repository
GET    /api/v1/repositories/:owner/:name/followers - Get followers
POST   /api/v1/repositories/:owner/:name/bookmark  - Bookmark repo
DELETE /api/v1/repositories/:owner/:name/bookmark  - Remove bookmark
```

### 9.3 Missing Services Exposure

| Service | File | Action |
|---------|------|--------|
| Content Insights | `contentInsightsService.ts` | Create routes |
| Data Export | `dataExportService.ts` | Create GDPR endpoints |
| AB Testing | `abTestingService.ts` | Create admin routes |
| GitHub Recommendations | `githubRecommendationService.ts` | Expose endpoints |

### 9.4 New Backend Models Needed

```prisma
// Add to schema.prisma

model LinkedAccount {
  id         String   @id @default(cuid())
  userId     String
  provider   String   // github, google
  providerId String
  email      String?
  createdAt  DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerId])
  @@index([userId])
}

model CommentLike {
  id        String   @id @default(cuid())
  commentId String
  userId    String
  createdAt DateTime @default(now())

  @@unique([commentId, userId])
}

model StoryArchive {
  id        String   @id @default(cuid())
  storyId   String
  userId    String
  createdAt DateTime @default(now())
}

model FollowRequest {
  id          String   @id @default(cuid())
  requesterId String
  targetId    String
  status      String   @default("pending") // pending, accepted, rejected
  createdAt   DateTime @default(now())

  @@unique([requesterId, targetId])
}
```

---

## Phase 10: Web Critical Fixes

### 10.1 Account Management (HIGH PRIORITY)

**Fix Account Deletion** (`/settings/account/page.tsx`)
```typescript
// Current: Shows toast "Account deletion not implemented"
// Needed: Full deletion flow with confirmation and data export option
```

**Implement:**
- Confirmation modal with password verification
- Data export before deletion option
- 30-day grace period before permanent deletion
- Email confirmation

### 10.2 Comment System Enhancement

**Missing Features:**
- Comment threading/replies
- Comment likes
- Comment filtering (newest/top)
- Comment pinning (for post author)
- Comment editing/deletion

**Files to modify:**
- `components/Comments.tsx`
- `app/post/[id]/comments/page.tsx`
- Add `services/commentService.ts`

### 10.3 Missing Pages to Create

| Page | Route | Priority |
|------|-------|----------|
| Mutual Connections | `/users/mutual/[username]` | High |
| Follow Requests | `/requests` | High |
| Drafts | `/drafts` | Medium |
| Story Archive | `/archive/stories` | Medium |
| Content Appeal | `/appeal/[reportId]` | Medium |
| Creator Studio | `/creator` | Medium |
| Insights Detail | `/insights/[postId]` | Low |

### 10.4 UI Component Gaps

**Missing Components:**
```
components/
├── MentionInput.tsx      # @mention autocomplete
├── HashtagInput.tsx      # #hashtag autocomplete
├── ImageEditor.tsx       # Crop, filters, adjustments
├── VideoTrimmer.tsx      # Trim, effects
├── CommentThread.tsx     # Threaded comments
├── FollowRequestCard.tsx # Accept/reject follow
├── DraftCard.tsx         # Draft post preview
└── InsightChart.tsx      # Detailed analytics charts
```

### 10.5 Real-time Features

**WebSocket Integration Needed:**
- Live notification badge updates
- Real-time comment updates
- Typing indicators in DMs
- Online status indicators

---

## Phase 11: Mobile Critical Fixes

### 11.1 Missing Dependencies

```bash
# Install immediately
npm install @react-native-community/datetimepicker
```

### 11.2 Missing Screens

| Screen | Route | Priority |
|--------|-------|----------|
| Live Stream | `/(tabs)/live` | High |
| Scheduled Posts | `/(tabs)/scheduled` | High (needs datetime picker) |
| Code Snippets | `/(tabs)/snippets` | High |
| Help Center | `/help` | Medium |
| Terms/Privacy | `/legal` | Medium |
| Claim Repository | `/claim/[repo]` | Medium |

### 11.3 State Management

**Create Missing Stores:**
```typescript
// store/feedStore.ts
// store/postStore.ts
// store/messageStore.ts
// store/notificationStore.ts
// store/uiStore.ts
```

### 11.4 Push Notifications Enhancement

**Missing:**
- Deep linking from notification tap
- Notification action handling
- Notification preferences UI
- Notification sound customization

**File: `services/pushNotificationService.ts`**
```typescript
// Add notification tap handler
Notifications.addNotificationResponseReceivedListener(response => {
  const { type, id } = response.notification.request.content.data;
  // Navigate to appropriate screen based on type
});
```

### 11.5 Feature Parity with Web

| Feature | Web | Mobile | Action |
|---------|-----|--------|--------|
| Google OAuth | Yes | No | Implement |
| Advanced Search | Yes | Partial | Add filters |
| Code Snippets | Yes | No | Create screens |
| Data Export | Yes | No | Add screen |
| Live Streaming | Partial | No | Implement |

---

## Phase 12: Cross-Platform Improvements

### 12.1 API Consistency

**Standardize Response Format:**
```typescript
interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}
```

### 12.2 Shared Types

Create shared type definitions for:
- User profiles
- Posts/content
- Notifications
- API responses

### 12.3 Error Handling

Implement consistent error handling:
- Backend: Structured error responses
- Web: Error boundaries and toast notifications
- Mobile: Error boundaries and alert dialogs

---

## Implementation Priority Matrix

### Immediate (Week 1-2)
| Task | Platform | Impact |
|------|----------|--------|
| Fix account deletion | Web | Critical |
| Implement forgotPassword/resetPassword | Backend | Critical |
| Install datetime picker | Mobile | Critical |
| Comment CRUD operations | Backend | High |

### Short-term (Week 3-4)
| Task | Platform | Impact |
|------|----------|--------|
| Comment threading | Web + Backend | High |
| Follow requests system | All | High |
| Push notification deep linking | Mobile | High |
| Message edit/delete | Backend | Medium |

### Medium-term (Week 5-8)
| Task | Platform | Impact |
|------|----------|--------|
| Story archive | All | Medium |
| Code snippets mobile | Mobile | Medium |
| Creator studio | Web | Medium |
| Advanced search filters | Mobile | Medium |

### Long-term (Week 9+)
| Task | Platform | Impact |
|------|----------|--------|
| Live streaming | All | High |
| Video editing | Web + Mobile | Medium |
| NFT integration | All | Low |

---

## File Changes Summary

### Backend (New Files)
```
src/controllers/
├── commentActionsController.ts    # Comment likes, edit, delete
├── followRequestController.ts     # Follow request management
├── dataExportController.ts        # GDPR data export
├── linkedAccountController.ts     # Account linking
└── insightsController.ts          # Content insights

src/routes/
├── commentActions.ts
├── followRequests.ts
├── dataExport.ts
├── linkedAccounts.ts
└── insights.ts
```

### Backend (Modified Files)
```
src/controllers/authController.ts      # Implement stubs
src/controllers/userController.ts      # Implement stubs
src/controllers/messageController.ts   # Add edit/delete
src/controllers/storiesController.ts   # Add update/archive
src/controllers/reelsController.ts     # Add update/share
src/routes/scheduledPosts.ts           # Add full CRUD
prisma/schema.prisma                   # Add new models
```

### Web (New Files)
```
app/
├── requests/page.tsx              # Follow requests
├── drafts/page.tsx                # Draft posts
├── archive/stories/page.tsx       # Story archive
├── creator/page.tsx               # Creator studio
├── appeal/[reportId]/page.tsx     # Content appeal
└── users/mutual/[username]/page.tsx

components/
├── MentionInput.tsx
├── HashtagInput.tsx
├── ImageEditor.tsx
├── CommentThread.tsx
├── FollowRequestCard.tsx
└── DraftCard.tsx

services/
├── commentService.ts
├── followRequestService.ts
└── insightsService.ts
```

### Mobile (New Files)
```
app/
├── (tabs)/live.tsx               # Live streaming
├── (tabs)/snippets.tsx           # Code snippets
├── scheduled.tsx                 # Scheduled posts
├── help.tsx                      # Help center
├── legal.tsx                     # Terms/Privacy
└── claim/[repo].tsx              # Claim repository

store/
├── feedStore.ts
├── postStore.ts
├── messageStore.ts
├── notificationStore.ts
└── uiStore.ts

components/
├── LiveStreamPlayer.tsx
├── SnippetCard.tsx
└── SchedulePostPicker.tsx
```

---

## Estimated Effort

| Phase | Effort | Duration |
|-------|--------|----------|
| Phase 9 (Backend) | High | 2-3 weeks |
| Phase 10 (Web) | Medium | 2 weeks |
| Phase 11 (Mobile) | Medium | 2 weeks |
| Phase 12 (Cross-platform) | Low | 1 week |

**Total Estimated Time: 7-8 weeks for full implementation**

---

## Next Steps

1. Review and approve this plan
2. Set up task tracking (GitHub Issues/Projects)
3. Begin with immediate priorities
4. Weekly progress reviews
