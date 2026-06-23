# OAuth Provider Setup Guide

This guide explains how to enable GitHub and Google OAuth login for Gitgram TimeMachine using Clerk.

## Prerequisites

- Clerk account with application created
- Access to Clerk Dashboard
- (For production) OAuth app credentials from GitHub and Google

---

## 1. GitHub OAuth Setup

### Step 1: Create GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **"New OAuth App"**
3. Fill in the details:
   - **Application name**: `Gitgram TimeMachine`
   - **Homepage URL**: `https://timemachine.gitgram.app` (or your domain)
   - **Authorization callback URL**: `https://clerk.gitgram.app/v1/oauth_callback`
     - For development: `https://YOUR_CLERK_FRONTEND_API/v1/oauth_callback`
4. Click **"Register application"**
5. Copy the **Client ID**
6. Generate and copy a **Client Secret**

### Step 2: Configure in Clerk

1. Go to [Clerk Dashboard](https://dashboard.clerk.com)
2. Select your application
3. Navigate to **User & Authentication** → **Social Connections**
4. Find **GitHub** and click **Configure**
5. Enter:
   - **Client ID**: From GitHub OAuth App
   - **Client Secret**: From GitHub OAuth App
6. Enable the connection
7. (Optional) Select which scopes to request:
   - `read:user` - Basic profile information
   - `user:email` - Email addresses
   - `read:org` - Organization membership (for team features)

### Step 3: Test

1. Visit your application's sign-in page
2. Click "Continue with GitHub"
3. Authorize the application
4. Verify successful login

---

## 2. Google OAuth Setup

### Step 1: Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Navigate to **APIs & Services** → **Credentials**
4. Click **"Create Credentials"** → **"OAuth client ID"**
5. Configure consent screen if prompted:
   - User Type: External (or Internal for Google Workspace)
   - App name: Gitgram TimeMachine
   - User support email: your email
   - Developer contact: your email
6. Create OAuth Client:
   - Application type: **Web application**
   - Name: `Gitgram TimeMachine Clerk`
   - Authorized redirect URIs: `https://clerk.gitgram.app/v1/oauth_callback`
     - For development: `https://YOUR_CLERK_FRONTEND_API/v1/oauth_callback`
7. Copy **Client ID** and **Client Secret**

### Step 2: Configure in Clerk

1. Go to [Clerk Dashboard](https://dashboard.clerk.com)
2. Select your application
3. Navigate to **User & Authentication** → **Social Connections**
4. Find **Google** and click **Configure**
5. Enter:
   - **Client ID**: From Google Cloud Console
   - **Client Secret**: From Google Cloud Console
6. Enable the connection

### Step 3: Test

1. Visit your application's sign-in page
2. Click "Continue with Google"
3. Select Google account
4. Verify successful login

---

## 3. Quick Setup (Development Only)

For development/testing, Clerk provides pre-configured OAuth apps:

1. Go to Clerk Dashboard
2. Navigate to **User & Authentication** → **Social Connections**
3. Toggle ON for GitHub and/or Google
4. Use "Use Clerk's development credentials" option

**Note**: Development credentials have rate limits and should not be used in production.

---

## 4. Environment Variables

Ensure these are set in your deployment:

```bash
# Clerk Configuration
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...

# Frontend URLs
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
```

---

## 5. Additional OAuth Providers

Clerk supports many OAuth providers. To add more:

1. Go to Clerk Dashboard → Social Connections
2. Available providers include:
   - Microsoft / Azure AD
   - Apple
   - Discord
   - Slack
   - Twitter/X
   - LinkedIn
   - GitLab
   - Bitbucket
   - And many more

Each follows a similar pattern:
1. Create OAuth app with the provider
2. Get Client ID and Secret
3. Configure in Clerk Dashboard
4. Test the connection

---

## 6. Troubleshooting

### "Redirect URI mismatch" Error

- Ensure the redirect URI in your OAuth app exactly matches Clerk's callback URL
- Check for trailing slashes
- Verify protocol (https vs http)

### "Access Denied" Error

- Verify the OAuth app is published (not in testing mode)
- Check that required scopes are approved
- For Google: Ensure OAuth consent screen is configured

### User Not Created

- Check Clerk webhook configuration
- Verify the API server is receiving webhook events
- Check API server logs for errors

---

## 7. Security Best Practices

1. **Rotate secrets regularly** - Update OAuth secrets every 90 days
2. **Use production credentials** - Never use development credentials in production
3. **Limit scopes** - Only request the minimum necessary permissions
4. **Monitor access** - Review OAuth app access logs periodically
5. **Enable 2FA** - Require 2FA for accounts with OAuth app management access

---

## Related Documentation

- [Clerk Social Connections Docs](https://clerk.com/docs/authentication/social-connections)
- [GitHub OAuth Docs](https://docs.github.com/en/apps/oauth-apps)
- [Google OAuth Docs](https://developers.google.com/identity/protocols/oauth2)
- [Gitgram TimeMachine SSO/SAML Guide](./SSO_SAML_SETUP.md)
