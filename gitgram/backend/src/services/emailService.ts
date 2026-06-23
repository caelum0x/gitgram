import { Resend } from 'resend';
import crypto from 'crypto';
import { prisma } from '../utils/prisma';
import logger from '../utils/logger';
import { getUserEmailPreferences } from '../controllers/emailPreferencesController';

type ResendSendPayload = Parameters<Resend['emails']['send']>[0];

const resendClient = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

if (!resendClient) {
  logger.warn('RESEND_API_KEY not set; email delivery disabled');
}

const resend = {
  emails: {
    send: async (payload: ResendSendPayload) => {
      if (!resendClient) {
        logger.warn('Skipping email send because RESEND_API_KEY is not configured', {
          to: payload.to,
          subject: payload.subject,
        });
        return { id: 'email-disabled' };
      }

      return resendClient.emails.send(payload);
    },
  },
};

// Generate cryptographically secure token
const generateSecureToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

// ============================================================================
// EMAIL TEMPLATE SYSTEM
// ============================================================================

const BRAND_COLORS = {
  primary: '#58a6ff',
  primaryDark: '#388bfd',
  background: '#0d1117',
  backgroundLight: '#161b22',
  text: '#c9d1d9',
  textMuted: '#8b949e',
  border: '#30363d',
  success: '#238636',
  warning: '#d29922',
  danger: '#da3633',
  white: '#ffffff',
};

/**
 * Base HTML email template with responsive CSS
 */
const baseEmailTemplate = (content: string, previewText?: string): string => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="dark light">
  <meta name="supported-color-schemes" content="dark light">
  <title>Gitgram</title>
  ${previewText ? `<!--[if !mso]><!--><meta name="description" content="${previewText}"><!--<![endif]-->` : ''}
  <style>
    /* Reset */
    body, table, td, p, a, li { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }

    /* Base Styles */
    body {
      margin: 0;
      padding: 0;
      width: 100% !important;
      min-width: 100%;
      background-color: ${BRAND_COLORS.background};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: ${BRAND_COLORS.text};
    }

    /* Container */
    .email-wrapper {
      width: 100%;
      background-color: ${BRAND_COLORS.background};
      padding: 40px 20px;
    }

    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: ${BRAND_COLORS.backgroundLight};
      border: 1px solid ${BRAND_COLORS.border};
      border-radius: 12px;
      overflow: hidden;
    }

    /* Header */
    .email-header {
      background: linear-gradient(135deg, ${BRAND_COLORS.backgroundLight} 0%, ${BRAND_COLORS.background} 100%);
      padding: 32px 40px;
      text-align: center;
      border-bottom: 1px solid ${BRAND_COLORS.border};
    }

    .logo {
      font-size: 28px;
      font-weight: 700;
      color: ${BRAND_COLORS.white};
      text-decoration: none;
    }

    .logo-icon {
      display: inline-block;
      margin-right: 8px;
    }

    /* Content */
    .email-content {
      padding: 40px;
    }

    h1 {
      margin: 0 0 24px 0;
      font-size: 24px;
      font-weight: 600;
      color: ${BRAND_COLORS.white};
      line-height: 1.3;
    }

    h2 {
      margin: 24px 0 16px 0;
      font-size: 20px;
      font-weight: 600;
      color: ${BRAND_COLORS.white};
    }

    p {
      margin: 0 0 16px 0;
      color: ${BRAND_COLORS.text};
    }

    .text-muted {
      color: ${BRAND_COLORS.textMuted};
      font-size: 14px;
    }

    /* Buttons */
    .btn {
      display: inline-block;
      padding: 14px 28px;
      font-size: 16px;
      font-weight: 600;
      text-decoration: none;
      border-radius: 8px;
      text-align: center;
      transition: all 0.2s;
    }

    .btn-primary {
      background-color: ${BRAND_COLORS.primary};
      color: ${BRAND_COLORS.white} !important;
    }

    .btn-success {
      background-color: ${BRAND_COLORS.success};
      color: ${BRAND_COLORS.white} !important;
    }

    .btn-danger {
      background-color: ${BRAND_COLORS.danger};
      color: ${BRAND_COLORS.white} !important;
    }

    .btn-secondary {
      background-color: ${BRAND_COLORS.border};
      color: ${BRAND_COLORS.text} !important;
    }

    /* Cards */
    .card {
      background-color: ${BRAND_COLORS.background};
      border: 1px solid ${BRAND_COLORS.border};
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
    }

    .card-highlight {
      border-left: 4px solid ${BRAND_COLORS.primary};
    }

    .card-warning {
      border-left: 4px solid ${BRAND_COLORS.warning};
    }

    .card-danger {
      border-left: 4px solid ${BRAND_COLORS.danger};
    }

    /* Stats */
    .stats-grid {
      display: flex;
      gap: 16px;
      margin: 20px 0;
    }

    .stat-item {
      flex: 1;
      text-align: center;
      padding: 16px;
      background-color: ${BRAND_COLORS.background};
      border-radius: 8px;
      border: 1px solid ${BRAND_COLORS.border};
    }

    .stat-value {
      font-size: 24px;
      font-weight: 700;
      color: ${BRAND_COLORS.primary};
    }

    .stat-label {
      font-size: 12px;
      color: ${BRAND_COLORS.textMuted};
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* List */
    .list-item {
      display: flex;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid ${BRAND_COLORS.border};
    }

    .list-item:last-child {
      border-bottom: none;
    }

    .list-icon {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background-color: ${BRAND_COLORS.background};
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 12px;
    }

    /* Code Block */
    .code-block {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 14px;
      background-color: ${BRAND_COLORS.background};
      border: 1px solid ${BRAND_COLORS.border};
      border-radius: 6px;
      padding: 16px;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }

    /* Divider */
    .divider {
      height: 1px;
      background-color: ${BRAND_COLORS.border};
      margin: 24px 0;
    }

    /* Footer */
    .email-footer {
      padding: 24px 40px;
      text-align: center;
      border-top: 1px solid ${BRAND_COLORS.border};
      background-color: ${BRAND_COLORS.background};
    }

    .footer-links {
      margin-bottom: 16px;
    }

    .footer-links a {
      color: ${BRAND_COLORS.textMuted};
      text-decoration: none;
      margin: 0 12px;
      font-size: 13px;
    }

    .footer-links a:hover {
      color: ${BRAND_COLORS.primary};
    }

    .footer-text {
      color: ${BRAND_COLORS.textMuted};
      font-size: 12px;
      margin: 0;
    }

    /* Social Links */
    .social-links {
      margin: 16px 0;
    }

    .social-links a {
      display: inline-block;
      margin: 0 8px;
    }

    /* Responsive */
    @media only screen and (max-width: 600px) {
      .email-wrapper { padding: 20px 10px; }
      .email-header { padding: 24px 20px; }
      .email-content { padding: 24px 20px; }
      .email-footer { padding: 20px; }
      h1 { font-size: 20px; }
      .btn { display: block; width: 100%; }
      .stats-grid { flex-direction: column; }
    }

    /* Dark Mode Support */
    @media (prefers-color-scheme: dark) {
      body { background-color: ${BRAND_COLORS.background} !important; }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-container">
      <div class="email-header">
        <a href="${process.env.FRONTEND_URL}" class="logo">
          <span class="logo-icon">📦</span>Gitgram
        </a>
      </div>
      <div class="email-content">
        ${content}
      </div>
      <div class="email-footer">
        <div class="footer-links">
          <a href="${process.env.FRONTEND_URL}/explore">Explore</a>
          <a href="${process.env.FRONTEND_URL}/settings">Settings</a>
          <a href="${process.env.FRONTEND_URL}/help">Help</a>
          <a href="${process.env.FRONTEND_URL}/settings/notifications">Unsubscribe</a>
        </div>
        <p class="footer-text">
          © ${new Date().getFullYear()} Gitgram. Share your code with the world.
        </p>
        <p class="footer-text" style="margin-top: 8px;">
          This email was sent to you because you have a Gitgram account.
        </p>
      </div>
    </div>
  </div>
</body>
</html>
`;

// ============================================================================
// EMAIL TEMPLATES
// ============================================================================

interface EmailTemplates {
  verification: (username: string, verifyUrl: string) => string;
  passwordReset: (resetUrl: string) => string;
  welcome: (username: string) => string;
  notification: (username: string, notification: NotificationData) => string;
  accountDeletionScheduled: (username: string, deleteDate: Date, reactivateUrl: string) => string;
  accountDeleted: (username: string) => string;
  securityAlert: (username: string, alert: SecurityAlertData) => string;
  weeklyDigest: (username: string, digest: WeeklyDigestData) => string;
  newFollower: (username: string, followerName: string, followerAvatar: string) => string;
  postMilestone: (username: string, postTitle: string, milestone: string, count: number) => string;
  twoFactorEnabled: (username: string) => string;
  twoFactorDisabled: (username: string) => string;
  loginFromNewDevice: (username: string, deviceInfo: DeviceInfo) => string;
  dataExportReady: (username: string, downloadUrl: string, expiresAt: Date) => string;
  subscriptionConfirmation: (username: string, plan: string, price: string) => string;
  subscriptionCanceled: (username: string, endDate: Date) => string;
}

interface NotificationData {
  type: string;
  content: string;
  actionUrl?: string;
}

interface SecurityAlertData {
  type: 'login' | 'password_change' | 'email_change' | 'two_factor' | 'suspicious_activity';
  description: string;
  ipAddress?: string;
  location?: string;
  device?: string;
  timestamp: Date;
}

interface WeeklyDigestData {
  profileViews: number;
  newFollowers: number;
  postLikes: number;
  postComments: number;
  topPost?: { title: string; likes: number; url: string };
  trendingRepos?: Array<{ name: string; stars: number; url: string }>;
}

interface DeviceInfo {
  browser: string;
  os: string;
  ipAddress: string;
  location?: string;
  timestamp: Date;
}

const templates: EmailTemplates = {
  verification: (username: string, verifyUrl: string) => `
    <h1>Verify your email address</h1>
    <p>Hi ${username},</p>
    <p>Thanks for signing up for Gitgram! Please verify your email address to get started.</p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${verifyUrl}" class="btn btn-primary">Verify Email Address</a>
    </div>

    <div class="card card-highlight">
      <p style="margin: 0;"><strong>Can't click the button?</strong></p>
      <p class="text-muted" style="margin-top: 8px; margin-bottom: 0;">Copy and paste this link into your browser:</p>
      <div class="code-block" style="margin-top: 12px;">${verifyUrl}</div>
    </div>

    <p class="text-muted">This link will expire in 24 hours. If you didn't create a Gitgram account, you can safely ignore this email.</p>
  `,

  passwordReset: (resetUrl: string) => `
    <h1>Reset your password</h1>
    <p>We received a request to reset your password. Click the button below to choose a new password.</p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${resetUrl}" class="btn btn-primary">Reset Password</a>
    </div>

    <div class="card card-warning">
      <p style="margin: 0;">⏰ <strong>This link expires in 1 hour</strong></p>
      <p class="text-muted" style="margin-top: 8px; margin-bottom: 0;">If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
    </div>

    <div class="divider"></div>

    <p class="text-muted" style="font-size: 13px;">
      <strong>Can't click the button?</strong> Copy and paste this link:<br>
      <span style="color: ${BRAND_COLORS.primary};">${resetUrl}</span>
    </p>
  `,

  welcome: (username: string) => `
    <h1>Welcome to Gitgram! 🎉</h1>
    <p>Hi ${username},</p>
    <p>Your account has been created successfully. You're now part of a community of developers sharing their code and projects with the world.</p>

    <h2>Get started in 3 easy steps:</h2>

    <div class="card">
      <div class="list-item">
        <div class="list-icon">1️⃣</div>
        <div>
          <strong>Connect your GitHub</strong>
          <p class="text-muted" style="margin: 4px 0 0 0;">Link your GitHub account to import your repositories</p>
        </div>
      </div>
      <div class="list-item">
        <div class="list-icon">2️⃣</div>
        <div>
          <strong>Share your first post</strong>
          <p class="text-muted" style="margin: 4px 0 0 0;">Show off a project, share a code snippet, or post an update</p>
        </div>
      </div>
      <div class="list-item">
        <div class="list-icon">3️⃣</div>
        <div>
          <strong>Follow developers</strong>
          <p class="text-muted" style="margin: 4px 0 0 0;">Discover and follow other developers to build your network</p>
        </div>
      </div>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${process.env.FRONTEND_URL}/explore" class="btn btn-primary">Start Exploring</a>
    </div>

    <p class="text-muted">Need help getting started? Check out our <a href="${process.env.FRONTEND_URL}/help" style="color: ${BRAND_COLORS.primary};">help center</a> or reach out to our support team.</p>
  `,

  notification: (username: string, notification: NotificationData) => `
    <h1>New ${notification.type}</h1>
    <p>Hi ${username},</p>

    <div class="card card-highlight">
      <p style="margin: 0;">${notification.content}</p>
    </div>

    ${notification.actionUrl ? `
    <div style="text-align: center; margin: 32px 0;">
      <a href="${notification.actionUrl}" class="btn btn-primary">View ${notification.type}</a>
    </div>
    ` : ''}

    <div style="text-align: center;">
      <a href="${process.env.FRONTEND_URL}/notifications" class="btn btn-secondary">View All Notifications</a>
    </div>
  `,

  accountDeletionScheduled: (username: string, deleteDate: Date, reactivateUrl: string) => `
    <h1>Account deletion scheduled</h1>
    <p>Hi ${username},</p>
    <p>We've received your request to delete your Gitgram account. Your account is scheduled to be permanently deleted on:</p>

    <div class="card card-danger" style="text-align: center;">
      <p style="font-size: 20px; font-weight: 600; margin: 0; color: ${BRAND_COLORS.danger};">
        ${deleteDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
    </div>

    <h2>What happens next?</h2>
    <ul style="color: ${BRAND_COLORS.text};">
      <li>Your profile will be hidden from other users immediately</li>
      <li>Your posts, comments, and data will be permanently deleted on the date above</li>
      <li>This action cannot be undone after the deletion date</li>
    </ul>

    <div class="card card-warning">
      <p style="margin: 0;"><strong>Changed your mind?</strong></p>
      <p class="text-muted" style="margin-top: 8px; margin-bottom: 0;">You can reactivate your account at any time before the deletion date by clicking the button below.</p>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${reactivateUrl}" class="btn btn-success">Cancel Deletion & Reactivate</a>
    </div>
  `,

  accountDeleted: (username: string) => `
    <h1>Account deleted</h1>
    <p>Hi ${username},</p>
    <p>Your Gitgram account has been permanently deleted as requested. All your data has been removed from our systems.</p>

    <div class="card">
      <p style="margin: 0;">We're sorry to see you go. If you have any feedback about your experience, we'd love to hear from you.</p>
    </div>

    <p class="text-muted">If you ever want to return, you're always welcome to create a new account at <a href="${process.env.FRONTEND_URL}" style="color: ${BRAND_COLORS.primary};">gitgram.app</a>.</p>

    <p>Thank you for being part of the Gitgram community.</p>
  `,

  securityAlert: (username: string, alert: SecurityAlertData) => `
    <h1>🔒 Security Alert</h1>
    <p>Hi ${username},</p>
    <p>We detected the following security-related activity on your account:</p>

    <div class="card card-danger">
      <p style="font-size: 18px; font-weight: 600; margin: 0 0 12px 0;">${alert.description}</p>
      <table style="width: 100%; font-size: 14px;">
        <tr>
          <td style="padding: 4px 0; color: ${BRAND_COLORS.textMuted};">Time:</td>
          <td style="padding: 4px 0;">${alert.timestamp.toLocaleString()}</td>
        </tr>
        ${alert.ipAddress ? `
        <tr>
          <td style="padding: 4px 0; color: ${BRAND_COLORS.textMuted};">IP Address:</td>
          <td style="padding: 4px 0;">${alert.ipAddress}</td>
        </tr>
        ` : ''}
        ${alert.location ? `
        <tr>
          <td style="padding: 4px 0; color: ${BRAND_COLORS.textMuted};">Location:</td>
          <td style="padding: 4px 0;">${alert.location}</td>
        </tr>
        ` : ''}
        ${alert.device ? `
        <tr>
          <td style="padding: 4px 0; color: ${BRAND_COLORS.textMuted};">Device:</td>
          <td style="padding: 4px 0;">${alert.device}</td>
        </tr>
        ` : ''}
      </table>
    </div>

    <p><strong>Was this you?</strong></p>
    <p>If you recognize this activity, no further action is needed. If you don't recognize this activity, we recommend:</p>
    <ul style="color: ${BRAND_COLORS.text};">
      <li>Change your password immediately</li>
      <li>Enable two-factor authentication</li>
      <li>Review your active sessions</li>
    </ul>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${process.env.FRONTEND_URL}/settings/security" class="btn btn-danger">Review Security Settings</a>
    </div>
  `,

  weeklyDigest: (username: string, digest: WeeklyDigestData) => `
    <h1>Your Weekly Digest 📊</h1>
    <p>Hi ${username}, here's how your week on Gitgram went:</p>

    <table style="width: 100%; margin: 24px 0; border-spacing: 12px;">
      <tr>
        <td style="width: 25%; text-align: center; padding: 20px; background-color: ${BRAND_COLORS.background}; border-radius: 8px; border: 1px solid ${BRAND_COLORS.border};">
          <div style="font-size: 28px; font-weight: 700; color: ${BRAND_COLORS.primary};">${digest.profileViews}</div>
          <div style="font-size: 12px; color: ${BRAND_COLORS.textMuted}; text-transform: uppercase;">Profile Views</div>
        </td>
        <td style="width: 25%; text-align: center; padding: 20px; background-color: ${BRAND_COLORS.background}; border-radius: 8px; border: 1px solid ${BRAND_COLORS.border};">
          <div style="font-size: 28px; font-weight: 700; color: ${BRAND_COLORS.success};">${digest.newFollowers}</div>
          <div style="font-size: 12px; color: ${BRAND_COLORS.textMuted}; text-transform: uppercase;">New Followers</div>
        </td>
        <td style="width: 25%; text-align: center; padding: 20px; background-color: ${BRAND_COLORS.background}; border-radius: 8px; border: 1px solid ${BRAND_COLORS.border};">
          <div style="font-size: 28px; font-weight: 700; color: ${BRAND_COLORS.danger};">❤️ ${digest.postLikes}</div>
          <div style="font-size: 12px; color: ${BRAND_COLORS.textMuted}; text-transform: uppercase;">Likes</div>
        </td>
        <td style="width: 25%; text-align: center; padding: 20px; background-color: ${BRAND_COLORS.background}; border-radius: 8px; border: 1px solid ${BRAND_COLORS.border};">
          <div style="font-size: 28px; font-weight: 700; color: ${BRAND_COLORS.primary};">💬 ${digest.postComments}</div>
          <div style="font-size: 12px; color: ${BRAND_COLORS.textMuted}; text-transform: uppercase;">Comments</div>
        </td>
      </tr>
    </table>

    ${digest.topPost ? `
    <h2>🏆 Top Performing Post</h2>
    <div class="card card-highlight">
      <p style="font-weight: 600; margin: 0 0 8px 0;">${digest.topPost.title}</p>
      <p class="text-muted" style="margin: 0;">❤️ ${digest.topPost.likes} likes</p>
      <a href="${digest.topPost.url}" style="color: ${BRAND_COLORS.primary}; font-size: 14px;">View post →</a>
    </div>
    ` : ''}

    ${digest.trendingRepos && digest.trendingRepos.length > 0 ? `
    <h2>🔥 Trending Repos This Week</h2>
    <div class="card">
      ${digest.trendingRepos.map((repo, i) => `
        <div class="list-item">
          <div class="list-icon">${i + 1}</div>
          <div style="flex: 1;">
            <a href="${repo.url}" style="color: ${BRAND_COLORS.white}; text-decoration: none; font-weight: 600;">${repo.name}</a>
          </div>
          <div style="color: ${BRAND_COLORS.textMuted};">⭐ ${repo.stars}</div>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <div style="text-align: center; margin: 32px 0;">
      <a href="${process.env.FRONTEND_URL}/insights" class="btn btn-primary">View Full Insights</a>
    </div>
  `,

  newFollower: (username: string, followerName: string, followerAvatar: string) => `
    <h1>You have a new follower! 🎉</h1>
    <p>Hi ${username},</p>

    <div class="card" style="text-align: center;">
      <img src="${followerAvatar}" alt="${followerName}" style="width: 80px; height: 80px; border-radius: 50%; margin-bottom: 16px;">
      <p style="font-size: 18px; font-weight: 600; margin: 0;">${followerName}</p>
      <p class="text-muted" style="margin: 8px 0 0 0;">started following you</p>
    </div>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${process.env.FRONTEND_URL}/${followerName}" class="btn btn-primary">View Profile</a>
    </div>
  `,

  postMilestone: (username: string, postTitle: string, milestone: string, count: number) => `
    <h1>🎊 Milestone Reached!</h1>
    <p>Hi ${username},</p>
    <p>Congratulations! Your post just hit a major milestone:</p>

    <div class="card" style="text-align: center; padding: 32px;">
      <div style="font-size: 48px; font-weight: 700; color: ${BRAND_COLORS.primary};">${count}</div>
      <div style="font-size: 18px; color: ${BRAND_COLORS.textMuted}; text-transform: uppercase;">${milestone}</div>
      <div class="divider"></div>
      <p style="font-weight: 600; margin: 0;">"${postTitle}"</p>
    </div>

    <p>Keep up the great work! Your content is resonating with the community.</p>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${process.env.FRONTEND_URL}/insights" class="btn btn-primary">View Post Insights</a>
    </div>
  `,

  twoFactorEnabled: (username: string) => `
    <h1>✅ Two-Factor Authentication Enabled</h1>
    <p>Hi ${username},</p>
    <p>Two-factor authentication has been successfully enabled for your Gitgram account. Your account is now more secure!</p>

    <div class="card card-highlight">
      <p style="margin: 0;"><strong>What this means:</strong></p>
      <ul style="margin: 12px 0 0 0; padding-left: 20px; color: ${BRAND_COLORS.text};">
        <li>You'll need your authenticator app when signing in</li>
        <li>Your account is protected even if your password is compromised</li>
        <li>Make sure to save your backup codes in a secure location</li>
      </ul>
    </div>

    <div class="card card-warning">
      <p style="margin: 0;">⚠️ <strong>Don't lose access!</strong></p>
      <p class="text-muted" style="margin-top: 8px; margin-bottom: 0;">If you lose your authenticator device, you'll need your backup codes to sign in. Store them safely!</p>
    </div>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${process.env.FRONTEND_URL}/settings/security" class="btn btn-secondary">Manage Security Settings</a>
    </div>
  `,

  twoFactorDisabled: (username: string) => `
    <h1>⚠️ Two-Factor Authentication Disabled</h1>
    <p>Hi ${username},</p>
    <p>Two-factor authentication has been disabled for your Gitgram account.</p>

    <div class="card card-warning">
      <p style="margin: 0;"><strong>Your account is less secure now</strong></p>
      <p class="text-muted" style="margin-top: 8px; margin-bottom: 0;">We recommend re-enabling two-factor authentication to protect your account.</p>
    </div>

    <p>If you didn't make this change, please secure your account immediately:</p>
    <ol style="color: ${BRAND_COLORS.text};">
      <li>Change your password</li>
      <li>Re-enable two-factor authentication</li>
      <li>Review your active sessions</li>
    </ol>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${process.env.FRONTEND_URL}/settings/security" class="btn btn-danger">Secure Your Account</a>
    </div>
  `,

  loginFromNewDevice: (username: string, deviceInfo: DeviceInfo) => `
    <h1>New sign-in detected</h1>
    <p>Hi ${username},</p>
    <p>We noticed a new sign-in to your Gitgram account:</p>

    <div class="card">
      <table style="width: 100%; font-size: 14px;">
        <tr>
          <td style="padding: 8px 0; color: ${BRAND_COLORS.textMuted}; width: 100px;">Browser:</td>
          <td style="padding: 8px 0;">${deviceInfo.browser}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: ${BRAND_COLORS.textMuted};">OS:</td>
          <td style="padding: 8px 0;">${deviceInfo.os}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: ${BRAND_COLORS.textMuted};">IP Address:</td>
          <td style="padding: 8px 0;">${deviceInfo.ipAddress}</td>
        </tr>
        ${deviceInfo.location ? `
        <tr>
          <td style="padding: 8px 0; color: ${BRAND_COLORS.textMuted};">Location:</td>
          <td style="padding: 8px 0;">${deviceInfo.location}</td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 8px 0; color: ${BRAND_COLORS.textMuted};">Time:</td>
          <td style="padding: 8px 0;">${deviceInfo.timestamp.toLocaleString()}</td>
        </tr>
      </table>
    </div>

    <p><strong>Was this you?</strong> If yes, you can ignore this email. If not, please secure your account immediately.</p>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${process.env.FRONTEND_URL}/settings/security" class="btn btn-danger">Secure My Account</a>
    </div>
  `,

  dataExportReady: (username: string, downloadUrl: string, expiresAt: Date) => `
    <h1>Your data export is ready</h1>
    <p>Hi ${username},</p>
    <p>Great news! The data export you requested is now ready for download.</p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${downloadUrl}" class="btn btn-primary">Download Your Data</a>
    </div>

    <div class="card card-warning">
      <p style="margin: 0;">⏰ <strong>Download expires:</strong></p>
      <p style="margin: 8px 0 0 0; font-size: 18px; font-weight: 600;">
        ${expiresAt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
      <p class="text-muted" style="margin-top: 8px; margin-bottom: 0;">The download link will expire after this date for security reasons.</p>
    </div>

    <h2>What's included?</h2>
    <ul style="color: ${BRAND_COLORS.text};">
      <li>Your profile information</li>
      <li>All your posts and comments</li>
      <li>Your followers and following lists</li>
      <li>Messages and conversations</li>
      <li>Liked and saved content</li>
    </ul>
  `,

  subscriptionConfirmation: (username: string, plan: string, price: string) => `
    <h1>Subscription confirmed! 🎉</h1>
    <p>Hi ${username},</p>
    <p>Thank you for subscribing to Gitgram ${plan}! Your subscription is now active.</p>

    <div class="card card-highlight" style="text-align: center;">
      <p style="font-size: 24px; font-weight: 700; margin: 0; color: ${BRAND_COLORS.primary};">Gitgram ${plan}</p>
      <p style="font-size: 32px; font-weight: 700; margin: 16px 0;">${price}<span style="font-size: 16px; color: ${BRAND_COLORS.textMuted};">/month</span></p>
    </div>

    <h2>Your ${plan} benefits:</h2>
    <ul style="color: ${BRAND_COLORS.text};">
      <li>✅ Advanced analytics and insights</li>
      <li>✅ Scheduled posts</li>
      <li>✅ Priority support</li>
      <li>✅ Custom profile themes</li>
      <li>✅ Verified badge</li>
    </ul>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${process.env.FRONTEND_URL}/settings/subscription" class="btn btn-primary">Manage Subscription</a>
    </div>
  `,

  subscriptionCanceled: (username: string, endDate: Date) => `
    <h1>Subscription canceled</h1>
    <p>Hi ${username},</p>
    <p>We're sorry to see you go! Your Gitgram Pro subscription has been canceled.</p>

    <div class="card card-highlight">
      <p style="margin: 0;"><strong>Your Pro benefits will remain active until:</strong></p>
      <p style="font-size: 20px; font-weight: 600; margin: 16px 0 0 0; color: ${BRAND_COLORS.primary};">
        ${endDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
    </div>

    <p>After this date, your account will revert to the free plan. You won't lose any of your content.</p>

    <div class="card">
      <p style="margin: 0;"><strong>Changed your mind?</strong></p>
      <p class="text-muted" style="margin-top: 8px; margin-bottom: 0;">You can resubscribe at any time to regain access to Pro features.</p>
    </div>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${process.env.FRONTEND_URL}/settings/subscription" class="btn btn-primary">Resubscribe</a>
    </div>

    <p class="text-muted">If you have any feedback about why you canceled, we'd love to hear from you. Reply to this email or contact our support team.</p>
  `,
};

// ============================================================================
// EMAIL PREFERENCES HELPER
// ============================================================================

type EmailPreferenceType =
  | 'marketingEmails'
  | 'newFollowerEmails'
  | 'commentEmails'
  | 'likeEmails'
  | 'mentionEmails'
  | 'weeklyDigest'
  | 'securityAlerts';

/**
 * Check if a user has opted in to receive a specific type of email
 * Returns true if the email should be sent, false if the user has opted out
 */
const shouldSendEmail = async (
  userId: string | undefined,
  preferenceType: EmailPreferenceType
): Promise<boolean> => {
  // Security alerts are always sent
  if (preferenceType === 'securityAlerts') {
    return true;
  }

  // If no userId, we can't check preferences (e.g., pre-registration emails)
  if (!userId) {
    return true;
  }

  try {
    const prefs = await getUserEmailPreferences(userId);
    return prefs[preferenceType] ?? true;
  } catch (error) {
    logger.error(`Failed to check email preference for user ${userId}:`, error);
    // On error, default to sending for important notifications, not for marketing/likes
    return preferenceType !== 'marketingEmails' && preferenceType !== 'likeEmails';
  }
};

// ============================================================================
// EMAIL SENDING FUNCTIONS
// ============================================================================

const DEFAULT_FROM = process.env.EMAIL_FROM || 'Gitgram <noreply@gitgram.app>';

export const sendVerificationEmail = async (email: string, username: string, token: string) => {
  const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

  try {
    await resend.emails.send({
      from: DEFAULT_FROM,
      to: email,
      subject: 'Verify your Gitgram account',
      html: baseEmailTemplate(templates.verification(username, verifyUrl), 'Please verify your email to get started with Gitgram'),
    });
    logger.info(`Verification email sent to ${email}`);
  } catch (error) {
    logger.error('Failed to send verification email:', error);
    throw error;
  }
};

export const sendPasswordResetEmail = async (email: string, token: string) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

  try {
    await resend.emails.send({
      from: DEFAULT_FROM,
      to: email,
      subject: 'Reset your Gitgram password',
      html: baseEmailTemplate(templates.passwordReset(resetUrl), 'Reset your password'),
    });
    logger.info(`Password reset email sent to ${email}`);
  } catch (error) {
    logger.error('Failed to send password reset email:', error);
    throw error;
  }
};

export const sendWelcomeEmail = async (email: string, username: string) => {
  try {
    await resend.emails.send({
      from: DEFAULT_FROM,
      to: email,
      subject: 'Welcome to Gitgram!',
      html: baseEmailTemplate(templates.welcome(username), 'Your Gitgram account is ready'),
    });
    logger.info(`Welcome email sent to ${email}`);
  } catch (error) {
    logger.error('Failed to send welcome email:', error);
  }
};

export const sendNotificationEmail = async (
  email: string,
  username: string,
  notification: { type: string; content: string; actionUrl?: string }
) => {
  try {
    await resend.emails.send({
      from: DEFAULT_FROM,
      to: email,
      subject: `New ${notification.type} on Gitgram`,
      html: baseEmailTemplate(templates.notification(username, notification), notification.content.substring(0, 100)),
    });
    logger.info(`Notification email sent to ${email}`);
  } catch (error) {
    logger.error('Failed to send notification email:', error);
  }
};

// ============================================================================
// PREFERENCE-AWARE NOTIFICATION EMAILS
// ============================================================================

/**
 * Send a comment notification email (respects user preferences)
 */
export const sendCommentNotificationEmail = async (
  email: string,
  username: string,
  commenterName: string,
  postTitle: string,
  commentPreview: string,
  actionUrl: string,
  userId?: string
) => {
  try {
    // Check if user has opted in to comment emails
    if (!(await shouldSendEmail(userId, 'commentEmails'))) {
      logger.info(`Comment notification email skipped for ${email} - user opted out`);
      return;
    }

    const notification = {
      type: 'comment',
      content: `${commenterName} commented on your post "${postTitle}": "${commentPreview}"`,
      actionUrl,
    };

    await resend.emails.send({
      from: DEFAULT_FROM,
      to: email,
      subject: `${commenterName} commented on your post`,
      html: baseEmailTemplate(templates.notification(username, notification), notification.content.substring(0, 100)),
    });
    logger.info(`Comment notification email sent to ${email}`);
  } catch (error) {
    logger.error('Failed to send comment notification email:', error);
  }
};

/**
 * Send a like notification email (respects user preferences)
 */
export const sendLikeNotificationEmail = async (
  email: string,
  username: string,
  likerName: string,
  postTitle: string,
  actionUrl: string,
  userId?: string
) => {
  try {
    // Check if user has opted in to like emails
    if (!(await shouldSendEmail(userId, 'likeEmails'))) {
      logger.info(`Like notification email skipped for ${email} - user opted out`);
      return;
    }

    const notification = {
      type: 'like',
      content: `${likerName} liked your post "${postTitle}"`,
      actionUrl,
    };

    await resend.emails.send({
      from: DEFAULT_FROM,
      to: email,
      subject: `${likerName} liked your post`,
      html: baseEmailTemplate(templates.notification(username, notification), notification.content.substring(0, 100)),
    });
    logger.info(`Like notification email sent to ${email}`);
  } catch (error) {
    logger.error('Failed to send like notification email:', error);
  }
};

/**
 * Send a mention notification email (respects user preferences)
 */
export const sendMentionNotificationEmail = async (
  email: string,
  username: string,
  mentionerName: string,
  context: string,
  actionUrl: string,
  userId?: string
) => {
  try {
    // Check if user has opted in to mention emails
    if (!(await shouldSendEmail(userId, 'mentionEmails'))) {
      logger.info(`Mention notification email skipped for ${email} - user opted out`);
      return;
    }

    const notification = {
      type: 'mention',
      content: `${mentionerName} mentioned you: "${context}"`,
      actionUrl,
    };

    await resend.emails.send({
      from: DEFAULT_FROM,
      to: email,
      subject: `${mentionerName} mentioned you`,
      html: baseEmailTemplate(templates.notification(username, notification), notification.content.substring(0, 100)),
    });
    logger.info(`Mention notification email sent to ${email}`);
  } catch (error) {
    logger.error('Failed to send mention notification email:', error);
  }
};

/**
 * Send a marketing email (respects user preferences)
 */
export const sendMarketingEmail = async (
  email: string,
  username: string,
  subject: string,
  content: string,
  userId?: string
) => {
  try {
    // Check if user has opted in to marketing emails
    if (!(await shouldSendEmail(userId, 'marketingEmails'))) {
      logger.info(`Marketing email skipped for ${email} - user opted out`);
      return;
    }

    await resend.emails.send({
      from: DEFAULT_FROM,
      to: email,
      subject,
      html: baseEmailTemplate(`
        <h1>${subject}</h1>
        <p>Hi ${username},</p>
        ${content}
      `, subject),
    });
    logger.info(`Marketing email sent to ${email}`);
  } catch (error) {
    logger.error('Failed to send marketing email:', error);
  }
};

// ============================================================================
// NEW EMAIL FUNCTIONS
// ============================================================================

export const sendAccountDeletionScheduledEmail = async (
  email: string,
  username: string,
  deleteDate: Date,
  reactivateToken: string
) => {
  const reactivateUrl = `${process.env.FRONTEND_URL}/reactivate?token=${reactivateToken}`;

  try {
    await resend.emails.send({
      from: DEFAULT_FROM,
      to: email,
      subject: 'Your Gitgram account deletion is scheduled',
      html: baseEmailTemplate(templates.accountDeletionScheduled(username, deleteDate, reactivateUrl), 'Your account deletion has been scheduled'),
    });
    logger.info(`Account deletion scheduled email sent to ${email}`);
  } catch (error) {
    logger.error('Failed to send account deletion scheduled email:', error);
    throw error;
  }
};

export const sendAccountDeletedEmail = async (email: string, username: string) => {
  try {
    await resend.emails.send({
      from: DEFAULT_FROM,
      to: email,
      subject: 'Your Gitgram account has been deleted',
      html: baseEmailTemplate(templates.accountDeleted(username), 'Your account has been deleted'),
    });
    logger.info(`Account deleted email sent to ${email}`);
  } catch (error) {
    logger.error('Failed to send account deleted email:', error);
  }
};

export const sendSecurityAlertEmail = async (
  email: string,
  username: string,
  alert: SecurityAlertData
) => {
  try {
    await resend.emails.send({
      from: DEFAULT_FROM,
      to: email,
      subject: `Security Alert: ${alert.description}`,
      html: baseEmailTemplate(templates.securityAlert(username, alert), `Security alert for your account`),
    });
    logger.info(`Security alert email sent to ${email}`);
  } catch (error) {
    logger.error('Failed to send security alert email:', error);
    throw error;
  }
};

export const sendWeeklyDigestEmail = async (
  email: string,
  username: string,
  digest: WeeklyDigestData,
  userId?: string
) => {
  try {
    // Check if user has opted in to weekly digest emails
    if (!(await shouldSendEmail(userId, 'weeklyDigest'))) {
      logger.info(`Weekly digest email skipped for ${email} - user opted out`);
      return;
    }

    await resend.emails.send({
      from: DEFAULT_FROM,
      to: email,
      subject: 'Your Weekly Gitgram Digest',
      html: baseEmailTemplate(templates.weeklyDigest(username, digest), `${digest.profileViews} profile views, ${digest.newFollowers} new followers this week`),
    });
    logger.info(`Weekly digest email sent to ${email}`);
  } catch (error) {
    logger.error('Failed to send weekly digest email:', error);
  }
};

export const sendNewFollowerEmail = async (
  email: string,
  username: string,
  followerName: string,
  followerAvatar: string,
  userId?: string
) => {
  try {
    // Check if user has opted in to new follower emails
    if (!(await shouldSendEmail(userId, 'newFollowerEmails'))) {
      logger.info(`New follower email skipped for ${email} - user opted out`);
      return;
    }

    await resend.emails.send({
      from: DEFAULT_FROM,
      to: email,
      subject: `${followerName} started following you on Gitgram`,
      html: baseEmailTemplate(templates.newFollower(username, followerName, followerAvatar), `${followerName} is now following you`),
    });
    logger.info(`New follower email sent to ${email}`);
  } catch (error) {
    logger.error('Failed to send new follower email:', error);
  }
};

export const sendPostMilestoneEmail = async (
  email: string,
  username: string,
  postTitle: string,
  milestone: string,
  count: number
) => {
  try {
    await resend.emails.send({
      from: DEFAULT_FROM,
      to: email,
      subject: `Milestone: Your post reached ${count} ${milestone}!`,
      html: baseEmailTemplate(templates.postMilestone(username, postTitle, milestone, count), `Your post reached ${count} ${milestone}`),
    });
    logger.info(`Post milestone email sent to ${email}`);
  } catch (error) {
    logger.error('Failed to send post milestone email:', error);
  }
};

export const sendTwoFactorEnabledEmail = async (email: string, username: string) => {
  try {
    await resend.emails.send({
      from: DEFAULT_FROM,
      to: email,
      subject: 'Two-factor authentication enabled',
      html: baseEmailTemplate(templates.twoFactorEnabled(username), 'Two-factor authentication has been enabled'),
    });
    logger.info(`2FA enabled email sent to ${email}`);
  } catch (error) {
    logger.error('Failed to send 2FA enabled email:', error);
  }
};

export const sendTwoFactorDisabledEmail = async (email: string, username: string) => {
  try {
    await resend.emails.send({
      from: DEFAULT_FROM,
      to: email,
      subject: 'Two-factor authentication disabled',
      html: baseEmailTemplate(templates.twoFactorDisabled(username), 'Two-factor authentication has been disabled'),
    });
    logger.info(`2FA disabled email sent to ${email}`);
  } catch (error) {
    logger.error('Failed to send 2FA disabled email:', error);
  }
};

export const sendLoginFromNewDeviceEmail = async (
  email: string,
  username: string,
  deviceInfo: DeviceInfo
) => {
  try {
    await resend.emails.send({
      from: DEFAULT_FROM,
      to: email,
      subject: 'New sign-in to your Gitgram account',
      html: baseEmailTemplate(templates.loginFromNewDevice(username, deviceInfo), `New sign-in from ${deviceInfo.browser} on ${deviceInfo.os}`),
    });
    logger.info(`New device login email sent to ${email}`);
  } catch (error) {
    logger.error('Failed to send new device login email:', error);
  }
};

export const sendDataExportReadyEmail = async (
  email: string,
  username: string,
  downloadUrl: string,
  expiresAt: Date
) => {
  try {
    await resend.emails.send({
      from: DEFAULT_FROM,
      to: email,
      subject: 'Your Gitgram data export is ready',
      html: baseEmailTemplate(templates.dataExportReady(username, downloadUrl, expiresAt), 'Your data export is ready for download'),
    });
    logger.info(`Data export ready email sent to ${email}`);
  } catch (error) {
    logger.error('Failed to send data export ready email:', error);
    throw error;
  }
};

export const sendSubscriptionConfirmationEmail = async (
  email: string,
  username: string,
  plan: string,
  price: string
) => {
  try {
    await resend.emails.send({
      from: DEFAULT_FROM,
      to: email,
      subject: `Welcome to Gitgram ${plan}!`,
      html: baseEmailTemplate(templates.subscriptionConfirmation(username, plan, price), `Your ${plan} subscription is active`),
    });
    logger.info(`Subscription confirmation email sent to ${email}`);
  } catch (error) {
    logger.error('Failed to send subscription confirmation email:', error);
  }
};

export const sendSubscriptionCanceledEmail = async (
  email: string,
  username: string,
  endDate: Date
) => {
  try {
    await resend.emails.send({
      from: DEFAULT_FROM,
      to: email,
      subject: 'Your Gitgram subscription has been canceled',
      html: baseEmailTemplate(templates.subscriptionCanceled(username, endDate), 'Your subscription has been canceled'),
    });
    logger.info(`Subscription canceled email sent to ${email}`);
  } catch (error) {
    logger.error('Failed to send subscription canceled email:', error);
  }
};

export const generateVerificationToken = async (userId: string): Promise<string> => {
  const token = generateSecureToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await prisma.session.create({
    data: {
      userId,
      refreshToken: `verify_${token}`,
      expiresAt
    }
  });

  return token;
};

export const generatePasswordResetToken = async (userId: string): Promise<string> => {
  const token = generateSecureToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.session.create({
    data: {
      userId,
      refreshToken: `reset_${token}`,
      expiresAt
    }
  });

  return token;
};

export const verifyToken = async (token: string, type: 'verify' | 'reset'): Promise<string | null> => {
  const session = await prisma.session.findUnique({
    where: { refreshToken: `${type}_${token}` }
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  await prisma.session.delete({ where: { id: session.id } });
  return session.userId;
};

// Generic email sending function
export const sendEmail = async (options: {
  to: string;
  subject: string;
  html: string;
  useTemplate?: boolean;
  previewText?: string;
}): Promise<void> => {
  try {
    const htmlContent = options.useTemplate !== false
      ? baseEmailTemplate(options.html, options.previewText)
      : options.html;

    await resend.emails.send({
      from: DEFAULT_FROM,
      to: options.to,
      subject: options.subject,
      html: htmlContent,
    });
    logger.info(`Email sent to ${options.to}: ${options.subject}`);
  } catch (error) {
    logger.error('Failed to send email:', error);
    throw error;
  }
};

// ============================================================================
// EMAIL SCHEDULING & QUEUE SYSTEM
// ============================================================================

interface ScheduledEmail {
  id: string;
  to: string;
  subject: string;
  templateName: keyof EmailTemplates;
  templateData: Record<string, any>;
  scheduledFor: Date;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  lastError?: string;
}

// In-memory queue for scheduled emails (replace with Redis/DB in production)
const emailQueue: ScheduledEmail[] = [];

export const scheduleEmail = (
  to: string,
  subject: string,
  templateName: keyof EmailTemplates,
  templateData: Record<string, any>,
  scheduledFor: Date
): string => {
  const id = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  emailQueue.push({
    id,
    to,
    subject,
    templateName,
    templateData,
    scheduledFor,
    status: 'pending',
    attempts: 0,
  });

  logger.info(`Email scheduled: ${id} for ${scheduledFor.toISOString()}`);
  return id;
};

export const cancelScheduledEmail = (id: string): boolean => {
  const index = emailQueue.findIndex(e => e.id === id && e.status === 'pending');
  if (index !== -1) {
    emailQueue.splice(index, 1);
    logger.info(`Scheduled email canceled: ${id}`);
    return true;
  }
  return false;
};

export const getScheduledEmails = (status?: 'pending' | 'sent' | 'failed'): ScheduledEmail[] => {
  if (status) {
    return emailQueue.filter(e => e.status === status);
  }
  return [...emailQueue];
};

// Process scheduled emails (call this from a cron job)
export const processScheduledEmails = async (): Promise<{ processed: number; failed: number }> => {
  const now = new Date();
  const pendingEmails = emailQueue.filter(
    e => e.status === 'pending' && e.scheduledFor <= now
  );

  let processed = 0;
  let failed = 0;

  for (const email of pendingEmails) {
    try {
      // Get the template function and generate HTML
      const templateFn = templates[email.templateName];
      if (!templateFn) {
        throw new Error(`Unknown template: ${email.templateName}`);
      }

      // Apply template with data (this is a simplified approach)
      const templateArgs = Object.values(email.templateData);
      const htmlContent = (templateFn as Function)(...templateArgs);

      await resend.emails.send({
        from: DEFAULT_FROM,
        to: email.to,
        subject: email.subject,
        html: baseEmailTemplate(htmlContent),
      });

      email.status = 'sent';
      processed++;
      logger.info(`Scheduled email sent: ${email.id}`);
    } catch (error) {
      email.attempts++;
      email.lastError = error instanceof Error ? error.message : 'Unknown error';

      if (email.attempts >= 3) {
        email.status = 'failed';
        failed++;
        logger.error(`Scheduled email failed permanently: ${email.id}`, error);
      } else {
        // Retry in 5 minutes
        email.scheduledFor = new Date(Date.now() + 5 * 60 * 1000);
        logger.warn(`Scheduled email retry scheduled: ${email.id}, attempt ${email.attempts}`);
      }
    }
  }

  return { processed, failed };
};

// ============================================================================
// EXPORT TYPES
// ============================================================================

export type {
  NotificationData,
  SecurityAlertData,
  WeeklyDigestData,
  DeviceInfo,
  ScheduledEmail,
  EmailPreferenceType,
};

// Export base template for custom usage
export { baseEmailTemplate, templates, BRAND_COLORS };

// Export preference checking utility for use by other services
export { shouldSendEmail };
