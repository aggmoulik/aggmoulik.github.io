ORIGINAL DRAFT — preserved for reference, not rendered to the published page.

ORIGINAL TITLE: Building a React Native CI/CD Pipeline from Scratch with GitHub Actions at Grip Invest
ORIGINAL DESCRIPTION: How I rebuilt the Grip Invest React Native CI/CD pipeline from scratch on GitHub Actions — parallel iOS/Android builds, dynamic per-environment Secrets.ts generation, 21-secret runtime injection, and zero hardcoded credentials in the repo.

ORIGINAL ROCK.JS NOTE: I evaluated Rock.js as a higher-level RN build toolchain. Strong on paper, but rolling our own focused GitHub Actions setup gave us full control...

ORIGINAL TRIGGER (production): "Push to develop" — the app shipped from the develop branch.

ORIGINAL XCODE SCHEMES (now sanitized to Dev/Stage/Prod): GripDev, GripStage, Grip
ORIGINAL ENV NAMES: ENV = 'STAGING', ENV_NAME = 'Staging'; ENV = 'PROD', ENV_NAME = 'Production'

ORIGINAL 21 NAMED SECRETS (sanitized to category descriptions above):
Environment Configuration:
  - BASE_URL_PROD (API base URL)
  - STRAPI_BASE_URL (Strapi API URL)
  - WEBVIEW_URL_PROD (Webview URL)

Third-party service tokens:
  - NEWRELIC_IOS_TOKEN
  - NEWRELIC_ANDROID_TOKEN
  - MO_ENGAGE_APP_ID
  - MO_ENGAGE_WORKSPACE_ID
  - RUDDERSTACK_WRITE_KEY
  - RUDDERSTACK_DATA_PLANE_URL

Firebase configuration:
  - IOS_FIREBASE_WEB_CLIENT_ID
  - ANDROID_FIREBASE_WEB_CLIENT_ID

Security & encryption:
  - APP_SECRET_KEY
  - ENCRYPTION_SECRET_STORE
  - PRIMARY_PUBLIC_HASH (SSL pinning)
  - BACKUP_PUBLIC_HASH (SSL pinning)
  - STATIC_IMAGES (asset CDN SSL hash)
  - DIGIO_SHA (third-party SDK SHA pin)

Monitoring:
  - SENTRY_DNS

ORIGINAL VALIDATOR EXAMPLE OUTPUT mentioned BASE_URL_STAGING, STRAPI_BASE_URL_STAGING, WEBVIEW_URL_STAGING — sanitized example used CMS_BASE_URL_STAGING in place of STRAPI_BASE_URL_STAGING.

ORIGINAL EXAMPLE SECRET CONFIG: BASE_URL_PROD = https://app.gripinvest.in/api

═══════════════════════════════════════════════════════
SANITIZATION DIFF SUMMARY:
- Title: dropped "at Grip Invest"
- Description: dropped Grip Invest mention; "21-secret" → "runtime"
- All 21 specific secret names → category descriptions
- Brand-named services (NewRelic, MoEngage, Rudderstack, Digio, Sentry, Strapi) → generic categories (APM, push/engagement, analytics SDK, third-party SDK, error tracking, CMS)
- Xcode schemes (GripDev, GripStage, Grip) → Dev/Stage/Prod
- "Push to develop" → "Push to release branch" (specific branch name removed)
- Brand URL example (app.gripinvest.in/api) → not shown in published version
- "Our" / "we" → first-person ("I") and neutral framing
- All architecture, validation logic, caching strategy, security posture preserved verbatim
═══════════════════════════════════════════════════════
