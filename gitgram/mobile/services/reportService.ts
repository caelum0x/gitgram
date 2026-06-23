import api from './api';

// Report target types
export type ReportTargetType = 'POST' | 'COMMENT' | 'USER' | 'REEL' | 'STORY';

// Report reasons
export type ReportReason = 'SPAM' | 'HARASSMENT' | 'INAPPROPRIATE' | 'MISINFORMATION' | 'OTHER';

// Report status
export type ReportStatus = 'PENDING' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED';

export interface CreateReportData {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  description?: string;
}

export interface Report {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  description?: string;
  status: ReportStatus;
  createdAt: string;
  resolvedAt?: string;
  resolution?: string;
}

export interface ReportResponse {
  message: string;
  reportId: string;
}

export interface MyReportsResponse {
  reports: Report[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// Human-readable reason labels
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  SPAM: 'Spam',
  HARASSMENT: 'Harassment or bullying',
  INAPPROPRIATE: 'Inappropriate content',
  MISINFORMATION: 'False information',
  OTHER: 'Other',
};

// Human-readable reason descriptions
export const REPORT_REASON_DESCRIPTIONS: Record<ReportReason, string> = {
  SPAM: 'Unwanted commercial content or repetitive posts',
  HARASSMENT: 'Abusive, threatening, or bullying behavior',
  INAPPROPRIATE: 'Nudity, violence, or other inappropriate content',
  MISINFORMATION: 'Deliberately false or misleading information',
  OTHER: 'Something else not listed above',
};

export const reportService = {
  // Submit a new report
  createReport: async (data: CreateReportData): Promise<ReportResponse> => {
    const response = await api.post('/v1/reports', data);
    return response.data;
  },

  // Get user's submitted reports
  getMyReports: async (page: number = 1, limit: number = 20): Promise<MyReportsResponse> => {
    const response = await api.get('/v1/reports/my-reports', {
      params: { page, limit },
    });
    return response.data;
  },

  // Get a specific report by ID
  getReport: async (reportId: string): Promise<Report> => {
    const response = await api.get(`/v1/reports/my-reports/${reportId}`);
    return response.data;
  },

  // Helper: Report a post
  reportPost: async (postId: string, reason: ReportReason, description?: string): Promise<ReportResponse> => {
    return reportService.createReport({
      targetType: 'POST',
      targetId: postId,
      reason,
      description,
    });
  },

  // Helper: Report a comment
  reportComment: async (commentId: string, reason: ReportReason, description?: string): Promise<ReportResponse> => {
    return reportService.createReport({
      targetType: 'COMMENT',
      targetId: commentId,
      reason,
      description,
    });
  },

  // Helper: Report a user
  reportUser: async (userId: string, reason: ReportReason, description?: string): Promise<ReportResponse> => {
    return reportService.createReport({
      targetType: 'USER',
      targetId: userId,
      reason,
      description,
    });
  },

  // Helper: Report a reel
  reportReel: async (reelId: string, reason: ReportReason, description?: string): Promise<ReportResponse> => {
    return reportService.createReport({
      targetType: 'REEL',
      targetId: reelId,
      reason,
      description,
    });
  },

  // Helper: Report a story
  reportStory: async (storyId: string, reason: ReportReason, description?: string): Promise<ReportResponse> => {
    return reportService.createReport({
      targetType: 'STORY',
      targetId: storyId,
      reason,
      description,
    });
  },

  // Legacy method for backward compatibility
  submitReport: async (data: {
    category: string;
    description: string;
    email?: string;
  }) => {
    const response = await api.post('/v1/feedback', {
      category: 'report',
      subject: data.category,
      message: data.description,
      email: data.email,
    });
    return response.data;
  },
};
