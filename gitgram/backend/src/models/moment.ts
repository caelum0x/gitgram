// Moment model interface
export interface Moment {
  id: string;
  userId: string;
  screenshotUrl: string;
  selfieUrl: string;
  caption?: string;
  location?: string;
  likesCount: number;
  commentsCount: number;
  createdAt: Date;
  expiresAt?: Date;
  user: {
    id: string;
    username: string;
    avatar?: string;
  };
}

