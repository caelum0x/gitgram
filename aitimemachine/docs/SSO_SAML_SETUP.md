# SSO/SAML Enterprise Setup Guide

This guide explains how to configure SAML SSO for enterprise organizations using Gitgram TimeMachine.

## Overview

SSO/SAML is available for **Enterprise** plan organizations. It enables:
- Single Sign-On with your identity provider (IdP)
- Centralized user management
- Just-in-time user provisioning
- Enforced authentication policies
- Domain-restricted access

---

## Supported Identity Providers

Gitgram TimeMachine supports SAML 2.0 SSO with any compatible IdP:

| Provider | Status | Setup Guide |
|----------|--------|-------------|
| Okta | Fully Supported | [Okta Setup](#okta-setup) |
| Azure AD | Fully Supported | [Azure AD Setup](#azure-ad-setup) |
| Google Workspace | Fully Supported | [Google Setup](#google-workspace-setup) |
| OneLogin | Fully Supported | [OneLogin Setup](#onelogin-setup) |
| Auth0 | Fully Supported | [Auth0 Setup](#auth0-setup) |
| Other SAML 2.0 | Supported | [Generic SAML Setup](#generic-saml-setup) |

---

## Prerequisites

1. **Enterprise Plan** - SSO requires an Enterprise subscription
2. **Admin Access** - You must be an organization owner
3. **IdP Access** - Admin access to your identity provider
4. **Verified Domain** - Your email domain must be verified

---

## API Endpoints

### Get SSO Configuration
```bash
GET /v1/sso/config/{org_id}
Authorization: Bearer {api_key}
```

### Update SSO Configuration
```bash
PUT /v1/sso/config/{org_id}
Authorization: Bearer {api_key}
Content-Type: application/json

{
  "enabled": true,
  "provider": "saml",
  "enforceSSO": false,
  "allowedDomains": ["yourcompany.com"],
  "jitProvisioning": true,
  "defaultRole": "member"
}
```

### Verify Domain
```bash
POST /v1/sso/verify-domain/{org_id}
Authorization: Bearer {api_key}
Content-Type: application/json

{
  "domain": "yourcompany.com"
}
```

### List Supported Providers
```bash
GET /v1/sso/providers
```

---

## Okta Setup

### Step 1: Create SAML App in Okta

1. Log in to Okta Admin Console
2. Go to **Applications** → **Applications**
3. Click **Create App Integration**
4. Select **SAML 2.0** → **Next**
5. Configure:
   - **App name**: Gitgram TimeMachine
   - **App logo**: (optional)
6. Click **Next**

### Step 2: Configure SAML Settings

Enter the following values:

| Setting | Value |
|---------|-------|
| Single sign-on URL | `https://clerk.gitgram.app/v1/saml` |
| Audience URI (SP Entity ID) | `https://clerk.gitgram.app` |
| Name ID format | EmailAddress |
| Application username | Email |

### Step 3: Attribute Statements

Add these attribute mappings:

| Name | Value |
|------|-------|
| email | user.email |
| firstName | user.firstName |
| lastName | user.lastName |

### Step 4: Complete Setup

1. Click **Next** → **Finish**
2. Go to **Sign On** tab
3. Click **View SAML setup instructions**
4. Copy the **Identity Provider metadata URL**

### Step 5: Configure in Gitgram TimeMachine

```bash
PUT /v1/sso/config/{org_id}
{
  "enabled": true,
  "provider": "saml",
  "saml": {
    "metadataUrl": "https://your-org.okta.com/app/xxx/sso/saml/metadata"
  },
  "allowedDomains": ["yourcompany.com"]
}
```

---

## Azure AD Setup

### Step 1: Create Enterprise Application

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **Enterprise applications**
3. Click **New application** → **Create your own application**
4. Name: `Gitgram TimeMachine`
5. Select **Integrate any other application (Non-gallery)**
6. Click **Create**

### Step 2: Configure Single Sign-On

1. Go to **Single sign-on** → **SAML**
2. Edit **Basic SAML Configuration**:

| Setting | Value |
|---------|-------|
| Identifier (Entity ID) | `https://clerk.gitgram.app` |
| Reply URL (ACS URL) | `https://clerk.gitgram.app/v1/saml` |
| Sign on URL | `https://timemachine.gitgram.app/sso/{org_slug}` |

### Step 3: Attributes & Claims

Configure claims mapping:
- `emailaddress` → user.mail
- `givenname` → user.givenname
- `surname` → user.surname

### Step 4: Get Federation Metadata

1. In **SAML Signing Certificate** section
2. Copy **App Federation Metadata Url**

### Step 5: Configure in Gitgram TimeMachine

```bash
PUT /v1/sso/config/{org_id}
{
  "enabled": true,
  "provider": "saml",
  "saml": {
    "metadataUrl": "https://login.microsoftonline.com/{tenant}/federationmetadata/2007-06/federationmetadata.xml"
  }
}
```

---

## Google Workspace Setup

### Step 1: Create SAML App

1. Go to [Google Admin Console](https://admin.google.com)
2. Navigate to **Apps** → **Web and mobile apps**
3. Click **Add app** → **Add custom SAML app**
4. Name: `Gitgram TimeMachine`
5. Click **Continue**

### Step 2: Download IdP Metadata

1. Download the **IdP metadata** XML file
2. Or copy the **SSO URL**, **Entity ID**, and **Certificate**

### Step 3: Configure Service Provider

Enter these values:

| Setting | Value |
|---------|-------|
| ACS URL | `https://clerk.gitgram.app/v1/saml` |
| Entity ID | `https://clerk.gitgram.app` |
| Name ID format | EMAIL |
| Name ID | Basic Information > Primary email |

### Step 4: Attribute Mapping

| Google Directory | App Attribute |
|-----------------|---------------|
| Primary email | email |
| First name | firstName |
| Last name | lastName |

### Step 5: Enable for Users

1. Click **User access**
2. Enable for your organization or specific OUs

---

## Generic SAML Setup

For other SAML 2.0 providers:

### Required Information from IdP

You'll need:
- **IdP Metadata URL** or XML
- **IdP SSO URL**
- **IdP Entity ID**
- **X.509 Certificate**

### Service Provider Details

Provide to your IdP:

| Setting | Value |
|---------|-------|
| SP Entity ID | `https://clerk.gitgram.app` |
| ACS URL | `https://clerk.gitgram.app/v1/saml` |
| SLO URL | `https://clerk.gitgram.app/v1/saml/logout` |
| Name ID Format | `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress` |

### Required Attributes

| Attribute | Required | Description |
|-----------|----------|-------------|
| email | Yes | User's email address |
| firstName | No | User's first name |
| lastName | No | User's last name |

---

## Enforcing SSO

Once SSO is working, you can enforce it for all organization members:

```bash
PUT /v1/sso/config/{org_id}
{
  "enforceSSO": true
}
```

When enforced:
- Users must authenticate via SSO
- Password login is disabled
- API keys still work normally

---

## Just-in-Time Provisioning

JIT provisioning automatically creates user accounts on first SSO login:

```bash
PUT /v1/sso/config/{org_id}
{
  "jitProvisioning": true,
  "defaultRole": "member"
}
```

Options:
- `jitProvisioning`: true/false
- `defaultRole`: "member" or "admin"

---

## Domain Verification

Before enabling SSO, verify your domain:

### Step 1: Request Verification Token
```bash
POST /v1/sso/verify-domain/{org_id}
{ "domain": "yourcompany.com" }
```

Response:
```json
{
  "domain": "yourcompany.com",
  "verification_method": "dns",
  "verification_token": "aitm-verify-xxx",
  "instructions": [
    "Add TXT record: _gitgram-timemachine.yourcompany.com",
    "Value: aitm-verify-xxx"
  ]
}
```

### Step 2: Add DNS Record

Add a TXT record:
- **Name**: `_gitgram-timemachine`
- **Value**: The verification token

### Step 3: Verify
```bash
POST /v1/sso/verify-domain/{org_id}/check
{ "domain": "yourcompany.com" }
```

---

## Troubleshooting

### "SAML Response Invalid"
- Check clock synchronization between IdP and SP
- Verify ACS URL is correct
- Ensure certificate hasn't expired

### "User Not Found"
- Enable JIT provisioning
- Verify email attribute is mapped correctly
- Check domain restrictions

### "Access Denied"
- Verify user is assigned to the SAML app in IdP
- Check organization membership
- Ensure SSO is enabled for the org

---

## Security Recommendations

1. **Enable SSO enforcement** for all enterprise orgs
2. **Restrict domains** to your company's email domains
3. **Regular audits** of SSO access logs
4. **Certificate rotation** - Update SAML certificates before expiry
5. **Test thoroughly** before enabling enforcement

---

## Support

For enterprise SSO support:
- Email: enterprise@gitgram.app
- Documentation: https://timemachine.gitgram.app/docs/enterprise
- API Reference: https://timemachine.gitgram.app/docs/api/sso
