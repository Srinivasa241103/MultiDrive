# Session Fixes

## Google OAuth Flow

- **401 on userinfo** — dynamic `import('googleapis')` broke auth headers → switched to `oauthClient.request()` directly
- **Missing scopes** → added `userinfo.email`, `userinfo.profile`, `drive.metadata.readonly` to `SCOPES` in `oauthService.ts`
- **P2003 FK error on account upsert** — `userId: 'system'` doesn't exist → upsert `User` first, then link `Account` to `user.id`
- **403 on storage quota** — Drive API not enabled in Google Cloud Console → enabled it; also wrapped quota fetch in try/catch so it's non-fatal
- **Debugging tip** — added response body to quota error message to expose Google's actual error reason
