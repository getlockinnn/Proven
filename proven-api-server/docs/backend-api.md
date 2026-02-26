# Proven Backend API Documentation

This document describes all backend API endpoints exposed by the Proven service. It includes authentication requirements, request/response shapes, and example requests.

- Base URL (dev): `http://localhost:3001`
- Base URL (prod): `https://api.tryproven.fun`
- API Root: `http://localhost:3001/api`
- API Root (prod): `https://api.tryproven.fun/api`
- Content type: `application/json`

## Authentication

- Most endpoints under `/api` require a Supabase access token provided via the `Authorization` header.
- Format: `Authorization: Bearer <SUPABASE_ACCESS_TOKEN>`
- Obtain the token from your Supabase client after login.

Example header:

```http
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

## Rate Limiting

- Global: Max 500 requests per 15 minutes per user/IP across `/api`.
- Faucet: Max 3 requests per 5 minutes per IP for `POST /api/faucet/usdc`.
- Error response on limit:

```json
{
  "success": false,
  "message": "Too many requests. Please try again later."
}
```

## Health & Root

- `GET /health` — Returns service health.
  - 200 OK example:
    ```json
    {
      "status": "healthy",
      "timestamp": "2025-01-01T12:00:00.000Z",
      "uptime": 123.45,
      "environment": "development",
      "version": "1.0.0"
    }
    ```
- `GET /` — Returns `{ "message": "welcome to the Proven API" }`.

---

## Auth Endpoints

### POST `/api/auth/save-user`
- Purpose: Upserts a Supabase-authenticated user into the database.
- Auth: Not required.
- Body:
  ```json
  {
    "user": {
      "id": "<uuid>",
      "email": "user@example.com",
      "user_metadata": {
        "full_name": "Jane Doe",
        "avatar_url": "https://..."
      }
    },
    "accessToken": "<optional_supabase_access_token>"
  }
  ```
- 200 OK:
  ```json
  {
    "success": true,
    "message": "User saved successfully",
    "user": {
      "id": "<uuid>",
      "email": "user@example.com",
      "name": "Jane Doe",
      "image": "https://..."
    }
  }
  ```

### POST `/api/auth/verify-token`
- Purpose: Verifies a Supabase JWT.
- Auth: Not required.
- Body:
  ```json
  { "token": "<supabase_access_token>" }
  ```
- 200 OK:
  ```json
  {
    "success": true,
    "message": "Token is valid",
    "user": { "id": "<uuid>", "email": "user@example.com" }
  }
  ```
- 401 Invalid/expired token:
  ```json
  { "success": false, "message": "Invalid or expired token" }
  ```

### GET `/api/auth/me`
- Purpose: Returns the current authenticated user extracted from the token.
- Auth: Required.
- 200 OK:
  ```json
  { "success": true, "user": { "id": "<uuid>", "email": "user@example.com", "name": "..." } }
  ```

---

## User Endpoints

### GET `/api/users/me`
- Purpose: Returns the authenticated user’s profile and basic stats.
- Auth: Required.
- 200 OK:
  ```json
  {
    "id": "<uuid>",
    "name": "Jane Doe",
    "bio": "...",
    "email": "user@example.com",
    "image": "https://...",
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-02T00:00:00.000Z",
    "stats": { "active": 2, "completed": 1 }
  }
  ```

### PUT `/api/users/me`
- Purpose: Updates the authenticated user’s profile.
- Auth: Required.
- Body (any subset):
  ```json
  { "name": "Jane", "bio": "Runner", "image": "https://..." }
  ```
- 200 OK:
  ```json
  {
    "success": true,
    "message": "Profile updated successfully",
    "user": { "id": "<uuid>", "name": "Jane", "bio": "Runner", "email": "user@example.com", "image": "https://..." },
    "updated_fields": ["name", "bio", "image"]
  }
  ```
- 400 No valid fields:
  ```json
  { "success": false, "error": "No valid fields provided for update", "message": "Please provide at least one field to update (name, bio, or image)" }
  ```

### POST `/api/users/signout`
- Purpose: Invalidates sessions/tokens and clears cookies.
- Auth: Required.
- 200 OK:
  ```json
  { "success": true, "message": "Successfully signed out", "actions": ["Clear localStorage token", "Clear authentication cookies", "Redirect to login page"] }
  ```

---

## Challenge Endpoints

### GET `/api/challenges`
- Purpose: List all challenges.
- Auth: Not required.
- 200 OK (array):
  ```json
  [
    {
      "id": "<uuid>",
      "title": "30-Day Running",
      "type": "PHOTO",
      "sponsor": "Proven",
      "hostType": "PERSONAL",
      "duration": "30 days",
      "difficulty": "EASY|MEDIUM|HARD",
      "userStake": 10,
      "totalPrizePool": 20,
      "participants": 100,
      "metrics": "...",
      "trackingMetrics": ["Daily photo"],
      "image": "https://...",
      "description": "...",
      "rules": ["..."],
      "creator": { "id": "<uuid>", "name": "Admin", "image": "https://..." }
    }
  ]
  ```

### GET `/api/challenges/:id`
- Purpose: Get a single challenge by ID.
- Auth: Not required.
- 200 OK:
  ```json
  {
    "id": "<uuid>",
    "title": "30-Day Running",
    "type": "PHOTO",
    "sponsor": "Proven",
    "hostType": "PERSONAL",
    "duration": "30 days",
    "difficulty": "MEDIUM",
    "userStake": 10,
    "totalPrizePool": 20,
    "participants": 100,
    "metrics": "...",
    "trackingMetrics": ["Daily photo"],
    "image": "https://...",
    "description": "...",
    "rules": ["..."],
    "creator": { "id": "<uuid>", "name": "Admin", "image": "https://..." }
  }
  ```

### GET `/api/challenges/user`
- Purpose: Get the authenticated user’s joined challenges.
- Auth: Required.
- Query (optional): `status=ACTIVE|COMPLETED|FAILED`
- 200 OK:
  ```json
  {
    "success": true,
    "userChallenges": [
      {
        "id": "<userChallengeId>",
        "challengeId": "<uuid>",
        "userId": "<uuid>",
        "status": "ACTIVE",
        "progress": 33.3,
        "startDate": "2025-01-01T00:00:00.000Z",
        "endDate": null,
        "stakeAmount": 10,
        "challenge": { "id": "<uuid>", "title": "30-Day Running", "type": "PHOTO", "sponsor": "Proven", "duration": "30 days", "difficulty": "MEDIUM", "userStake": 10, "totalPrizePool": 20, "participants": 0, "metrics": "...", "trackingMetrics": ["Daily photo"], "image": "https://...", "description": "...", "reward": 20, "startDate": "...", "endDate": "..." }
      }
    ],
    "count": 1
  }
  ```

### POST `/api/challenges/join`
- Purpose: Join a challenge.
- Auth: Required.
- Body:
  ```json
  { "challengeId": "<uuid>", "stakeAmount": 10 }
  ```
- 201 Created:
  ```json
  {
    "success": true,
    "message": "Successfully joined the challenge",
    "data": {
      "userChallenge": { "id": "<userChallengeId>", "userId": "<uuid>", "challengeId": "<uuid>", "stakeAmount": 10, "status": "ACTIVE", "progress": 0, "startDate": "..." },
      "transaction": { "id": "<id>", "userId": "<uuid>", "challengeId": "<uuid>", "transactionType": "STAKE", "amount": 10, "status": "COMPLETED", "timestamp": "...", "metadata": { "challengeTitle": "...", "walletType": "simulated", "note": "..." } },
      "stakeAmount": 10,
      "challengeTitle": "...",
      "note": "Stake simulated - wallet integration will be added in future updates"
    }
  }
  ```

### GET `/api/challenges/:id/stake-quote`
- Purpose: Get a temporary quote for staking (lamports, escrow pubkey).
- Auth: Required.
- 200 OK:
  ```json
  { "success": true, "data": { "quoteId": "<id>", "amountLamports": 1000000000, "escrowPubkey": "11111111111111111111111111111111", "expiresAt": 1735689600000 } }
  ```

### GET `/api/challenges/:challengeId/check`
- Purpose: Check if the authenticated user already joined a challenge.
- Auth: Required.
- 200 OK:
  ```json
  { "success": true, "hasJoined": true, "userChallenge": { "id": "<userChallengeId>", "...": "..." } }
  ```

### GET `/api/challenges/:challengeId/results`
- Purpose: Challenge results and leaderboard (after completion).
- Auth: Required.
- 200 OK (truncated for brevity):
  ```json
  {
    "success": true,
    "data": {
      "challenge": { "id": "<uuid>", "title": "...", "description": "...", "startDate": "...", "endDate": "...", "image": "..." },
      "results": {
        "isCompleted": true,
        "statistics": { "totalParticipants": 10, "winners": 6, "losers": 4, "successRate": "60.0%", "averageProgress": "83.2%", "totalStaked": 100, "totalRewardsDistributed": 40 },
        "leaderboard": [ { "rank": 1, "user": { "id": "...", "name": "...", "email": "...", "image": "..." }, "performance": { "progress": 95, "progressFormatted": "95.0%", "status": "COMPLETED", "approvedSubmissions": 25, "stakeAmount": 10, "startDate": "...", "endDate": "..." }, "reward": { "amount": 16.6, "description": "...", "receivedAt": "..." } } ],
        "winners": [ { "userId": "...", "userName": "...", "progress": 95, "reward": 16.6 } ],
        "losers": [ { "userId": "...", "userName": "...", "progress": 40, "stakeLost": 10 } ]
      },
      "userResult": { "participated": true, "rank": 3, "progress": 85, "status": "COMPLETED", "stakeAmount": 10, "reward": 12.5, "message": "🎉 Congratulations! You completed the challenge!" }
    }
  }
  ```

### POST `/api/challenges/create` (Admin)
- Purpose: Create a new challenge.
- Auth: Required; admin only (allowlist in code).
- Body (validated):
  ```json
  {
    "title": "30-Day Running",
    "type": "PHOTO",
    "hostType": "PERSONAL",
    "sponsor": "Proven",
    "duration": "30 days",
    "difficulty": "MEDIUM",
    "userStake": 10,
    "totalPrizePool": 20,
    "participants": 0,
    "metrics": "...",
    "trackingMetrics": ["Daily photo"],
    "image": "https://...",
    "description": "...",
    "rules": ["..."],
    "startDate": "2025-10-01",
    "endDate": "2025-10-30",
    "verificationType": "PHOTO",
    "blockchainId": "optional",
    "transactionSignature": "optional"
  }
  ```
- 200 OK: `{ "success": true, "challenge": { ...created fields... } }`

### POST `/api/challenges/:challengeId/complete` (Admin)
- Purpose: Mark a challenge complete and distribute rewards.
- Auth: Required.
- Body (optional):
  ```json
  { "completionThreshold": 80 }
  ```
- 200 OK (includes results and transactions summary):
  ```json
  {
    "success": true,
    "message": "Challenge \"...\" completed successfully",
    "data": {
      "challenge": { "id": "...", "title": "...", "endDate": "...", "completionThreshold": "80%" },
      "results": { "totalParticipants": 10, "winners": [ { "userId": "...", "totalReward": 25 } ], "losers": [ { "userId": "...", "stakeAmount": 10 } ], "statistics": { "totalStaked": 100, "totalRewardsDistributed": 60, "averageCompletionRate": 82.5, "successRate": "60.0%" } },
      "transactionsSummary": { "rewardTransactions": 6, "lossRecords": 4 }
    }
  }
  ```

> Disabled (present in code but disabled in router): `POST /api/challenges/:challengeId/claim-rewards`, `POST /api/challenges/:challengeId/settle`.

---

## Submission Endpoints

### POST `/api/submissions/submit`
- Purpose: Submit a daily proof (image) for a challenge.
- Auth: Required.
- Body:
  ```json
  {
    "userChallengeId": "<uuid>",
    "imageUrl": "<image_path_or_public_url>",
    "imagePath": "<storage_path_optional>",
    "description": "optional note",
    "walletAddress": "optional if blockchainId is set on challenge"
  }
  ```
- 201 Created:
  ```json
  {
    "success": true,
    "message": "Proof submitted successfully and is pending review",
    "data": {
      "submission": {
        "id": "<uuid>",
        "imageUrl": "https://...signed-or-public...",
        "description": "optional note",
        "status": "PENDING",
        "submissionDate": "2025-01-05T00:00:00.000Z",
        "challengeTitle": "30-Day Running",
        "blockchainTxSignature": null,
        "explorerUrl": "...optional..."
      }
    }
  }
  ```

### GET `/api/submissions/my-submissions`
- Purpose: List the authenticated user’s submissions.
- Auth: Required.
- Query (optional): `userChallengeId=<uuid>&status=PENDING|APPROVED|REJECTED&page=1&limit=20`
- 200 OK (truncated):
  ```json
  {
    "success": true,
    "data": {
      "submissions": [
        {
          "id": "<uuid>",
          "imageUrl": "https://...",
          "description": "...",
          "submissionDate": "...",
          "status": "APPROVED",
          "statusMessage": "Approved - Progress updated",
          "reviewComments": null,
          "reviewedAt": "...",
          "daysSinceSubmission": 2,
          "challenge": { "id": "<uuid>", "title": "...", "endDate": "..." },
          "userChallenge": { "id": "<uuid>", "currentProgress": 33.3, "stakeAmount": 10 }
        }
      ],
      "pagination": { "currentPage": 1, "totalPages": 1, "totalCount": 1, "hasNextPage": false, "hasPrevPage": false, "limit": 20 },
      "summary": { "totalSubmissions": 1, "pending": 0, "approved": 1, "rejected": 0 }
    }
  }
  ```

### GET `/api/submissions/challenge/:challengeId/calendar`
- Purpose: Calendar view of submissions for a joined challenge.
- Auth: Required.
- 200 OK (truncated):
  ```json
  {
    "success": true,
    "data": {
      "challenge": { "id": "<uuid>", "title": "...", "startDate": "...", "endDate": "...", "duration": "30 days" },
      "userChallenge": { "id": "<uuid>", "progress": 33.3, "stakeAmount": 10 },
      "calendar": [
        { "date": "2025-10-01", "dayOfWeek": 3, "isToday": false, "isPast": true, "isFuture": false, "status": "approved", "submission": { "id": "...", "imageUrl": "https://...", "description": "...", "submissionDate": "...", "reviewComments": null, "reviewedAt": "..." }, "canSubmit": false },
        { "date": "2025-10-02", "dayOfWeek": 4, "isToday": true, "isPast": false, "isFuture": false, "status": "not_submitted", "submission": null, "canSubmit": true }
      ],
      "statistics": { "totalDays": 30, "submittedDays": 10, "approvedDays": 9, "rejectedDays": 1, "missedDays": 2, "completionRate": 30 }
    }
  }
  ```

### GET `/api/submissions/pending` (Admin-review queue)
- Purpose: List pending submissions for review.
- Auth: Required (admin responsibility; currently no explicit admin guard enforced on route).
- Query (optional): `challengeId=<uuid>&page=1&limit=10`
- 200 OK (truncated):
  ```json
  {
    "success": true,
    "data": {
      "submissions": [
        {
          "id": "<uuid>",
          "imageUrl": "https://...",
          "description": "...",
          "submissionDate": "...",
          "daysSinceSubmission": 1,
          "urgency": "low|medium|high",
          "user": { "id": "<uuid>", "name": "...", "email": "...", "image": "https://..." },
          "challenge": { "id": "<uuid>", "title": "...", "description": "...", "endDate": "..." },
          "userChallenge": { "id": "<uuid>", "currentProgress": 20, "stakeAmount": 10, "startDate": "..." }
        }
      ],
      "pagination": { "currentPage": 1, "totalPages": 1, "totalCount": 1, "hasNextPage": false, "hasPrevPage": false, "limit": 10 },
      "summary": { "totalPending": 1, "highUrgency": 0, "mediumUrgency": 0, "lowUrgency": 1 }
    }
  }
  ```

### PUT `/api/submissions/:submissionId/review`
- Purpose: Approve or reject a submission.
- Auth: Required (admin responsibility; currently no explicit admin guard enforced on route).
- Body:
  ```json
  { "status": "APPROVED", "reviewComments": "optional" }
  ```
- 200 OK:
  ```json
  {
    "success": true,
    "message": "Submission approved successfully",
    "data": {
      "submission": { "id": "<uuid>", "status": "APPROVED", "reviewedBy": "<uuid>", "reviewedAt": "...", "reviewComments": "optional" },
      "userProgress": 40.0,
      "challengeTitle": "...",
      "userName": "..."
    }
  }
  ```

---

## Storage Endpoints

### GET `/api/storage/proof?path=<storage_path>`
- Purpose: Returns image bytes for a private proof submission path in the `proof-submission` bucket.
- Auth: Required; only owner of `path` (prefix `<userId>/...`) or admin allowed.
- Response: Binary image data with appropriate `Content-Type`.

### POST `/api/storage/proof/signed-upload`
- Purpose: Create a one-time signed-upload URL for proof images.
- Auth: Required.
- Body:
  ```json
  { "challengeId": "<uuid>", "contentType": "image/png|image/jpeg|image/webp" }
  ```
- 200 OK:
  ```json
  { "success": true, "data": { "path": "<storage_path>", "signedUrl": "https://...", "token": "<token>" } }
  ```

---

## Transaction Endpoints

### GET `/api/transactions/history`
- Purpose: List the authenticated user’s transactions.
- Auth: Required.
- 200 OK:
  ```json
  {
    "success": true,
    "transactions": [
      {
        "challengeId": "<uuid>",
        "transactionType": "STAKE|REWARD",
        "amount": 10,
        "timestamp": "2025-01-01T00:00:00.000Z",
        "status": "COMPLETED",
        "challenge": { "id": "<uuid>", "title": "30-Day Running" }
      }
    ]
  }
  ```

---

## Faucet Endpoints

### POST `/api/faucet/usdc`
- Purpose: Request mock devnet USDC for testing.
- Auth: Not required. Rate-limited (3 per 5 minutes per IP).
- Body:
  ```json
  { "walletAddress": "<solana_pubkey>", "amount": 100 }
  ```
- 200 OK:
  ```json
  {
    "success": true,
    "message": "Successfully airdropped 100 devnet USDC",
    "data": {
      "signature": "<tx_sig>",
      "amount": 100,
      "walletAddress": "<pubkey>",
      "explorerUrl": "https://explorer.solana.com/tx/<tx_sig>?cluster=devnet",
      "network": "devnet",
      "note": "Mock faucet for development - real devnet integration coming soon"
    }
  }
  ```
- 400 Validation errors (missing/invalid address, invalid amount) or 429 on faucet cooldown.

### GET `/api/faucet/status`
- Purpose: Get faucet availability and limits.
- Auth: Not required.
- 200 OK:
  ```json
  {
    "success": true,
    "data": {
      "available": true,
      "limits": { "maxAmount": 1000, "minAmount": 1, "cooldown": 300 },
      "network": "devnet",
      "tokenMint": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      "note": "Mock faucet for development testing"
    }
  }
  ```

---

## Notification Endpoints

> Note: The list endpoint is present in code but currently disabled in routing. The mark-as-read endpoints are active.

### PUT `/api/notifications/:notificationId/read`
- Purpose: Mark a single notification as read.
- Auth: Required.
- 200 OK: `{ "success": true, "message": "Notification marked as read" }`

### PUT `/api/notifications/read-all`
- Purpose: Mark all user notifications as read.
- Auth: Required.
- 200 OK: `{ "success": true, "message": "All notifications marked as read" }`

<!-- Present but disabled in router: GET /api/notifications -->

---

## Error Responses

- Common error shape on many endpoints:
  ```json
  { "success": false, "message": "<human_readable_error>" }
  ```
- Some read endpoints (e.g., `GET /api/challenges`, `GET /api/challenges/:id`) return data directly without a `success` wrapper.

## Curl Examples

```bash
# Get challenges
curl -sS http://localhost:3001/api/challenges

# Get current user (requires token)
curl -sS -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/auth/me

# Join a challenge
curl -sS -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"challengeId":"<uuid>","stakeAmount":10}' \
  http://localhost:3001/api/challenges/join

# Submit proof
curl -sS -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userChallengeId":"<uuid>","imageUrl":"<public_or_storage_path>","description":"Day 1"}' \
  http://localhost:3001/api/submissions/submit
```

---

## Notes

- Dates are ISO 8601 unless otherwise noted.
- Some endpoints conditionally return fields (e.g., blockchain signature URLs) based on challenge configuration.
- Admin-only endpoints require the authenticated user to be included in the admin allowlist in server configuration.
