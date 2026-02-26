# Proven Social — Tapestry Integration Plan

> **Goal:** Turn Proven from a solo staking-habit app into a proof-based social accountability network.
> **Hackathon:** Solana Graveyard Hack — Onchain Social track (Tapestry sponsor, $5k prize)
> **Deadline:** Feb 27, 2026 (IST)
> **Philosophy:** No random posts. Only proof events, earnings, and rankings. Social pressure > engagement.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Phase 1 — Profiles + Follows + Global Leaderboard](#2-phase-1)
   - [Phase 1 — Detailed TODO Checklist](#phase-1--detailed-todo-checklist) (8 sub-phases, 22 tasks)
3. [Phase 2 — Proof Activity Feed + Likes + Comments](#3-phase-2)
4. [Phase 3 — Group Challenges + Invites + Accountability Partners](#4-phase-3)
5. [New Files Summary](#5-new-files-summary)
6. [Modified Files Summary](#6-modified-files-summary)
7. [Edge Cases & Gotchas](#7-edge-cases--gotchas)
8. [Trade-offs & Decisions](#8-trade-offs--decisions)

---

## 1. Architecture Overview

### How Tapestry Fits In

```
┌─────────────────────────────────────────────────┐
│                  Proven App (RN)                │
│                                                 │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐ │
│  │ Auth     │  │ Tapestry     │  │ Proven    │ │
│  │ Context  │──│ Context      │  │ Backend   │ │
│  │ (Google) │  │ (Social)     │  │ (Habits)  │ │
│  └──────────┘  └──────┬───────┘  └─────┬─────┘ │
│                       │                │        │
└───────────────────────┼────────────────┼────────┘
                        │                │
                        ▼                ▼
              ┌─────────────────┐  ┌──────────────┐
              │ Tapestry API    │  │ Proven API   │
              │ (Social Graph)  │  │ (Challenges) │
              │ api.usetapestry │  │ api.tryproven│
              │ .dev/v1/        │  │ .fun/api     │
              └─────────────────┘  └──────────────┘
```

### Key Decision: Use `socialfi` npm package (Tapestry's official SDK)

**Why?** Tapestry recommends it, and after inspecting the package:
- Published by the Tapestry team (`marcustap`, `joaogomestapestry` at usetapestry.dev)
- Auto-generated from their OpenAPI spec — 2,152 lines of TypeScript types, every endpoint fully typed
- Only dependency is `axios` — runs fine in React Native
- Has a built-in `getActivityFeed` endpoint we'd otherwise have to build manually
- Hackathon judges see we used their recommended SDK (looks better for track prize)
- Saves ~200 lines of manual client code + type definitions

```bash
npm install socialfi
```

### Tapestry Client Setup

```typescript
// New file: lib/tapestry/client.ts
import { SocialFi } from 'socialfi';

const API_URL = 'https://api.usetapestry.dev/v1/';
const API_KEY = process.env.EXPO_PUBLIC_TAPESTRY_API_KEY;

export const tapestry = new SocialFi({
  baseURL: API_URL,
});

export { API_KEY };
export const TAPESTRY_NAMESPACE = process.env.EXPO_PUBLIC_TAPESTRY_NAMESPACE || 'proven';
```

### New Environment Variables

```env
EXPO_PUBLIC_TAPESTRY_API_KEY=<get from https://app.usetapestry.dev/>
EXPO_PUBLIC_TAPESTRY_NAMESPACE=proven
```

---

## 2. Phase 1

### Ship Fast: Profiles + Follow System + Global Leaderboard

**Estimated effort:** ~4-5 hours
**Priority:** HIGHEST — this is the hackathon minimum viable submission

---

### 2.1 Tapestry Client Layer

#### New File: `lib/tapestry/client.ts`

Uses the `socialfi` npm package — Tapestry's official SDK with full TypeScript types.

```typescript
import { SocialFi } from 'socialfi';

// Tapestry SDK client — all endpoints fully typed
export const tapestry = new SocialFi({
  baseURL: process.env.EXPO_PUBLIC_TAPESTRY_BASE_URL || 'https://api.usetapestry.dev/v1/',
});

// Shared config
export const TAPESTRY_API_KEY = process.env.EXPO_PUBLIC_TAPESTRY_API_KEY || '';
export const TAPESTRY_NAMESPACE = process.env.EXPO_PUBLIC_TAPESTRY_NAMESPACE || 'proven';
export const TAPESTRY_BLOCKCHAIN = 'SOLANA' as const;
export const TAPESTRY_EXECUTION = 'FAST_UNCONFIRMED' as const;
```

**Usage pattern** (all methods are typed via the SDK):

```typescript
// Create profile
const profile = await tapestry.profiles.findOrCreateCreate(
  { apiKey: TAPESTRY_API_KEY },
  { walletAddress, username, bio, blockchain: 'SOLANA' }
);

// Follow user
await tapestry.followers.postFollowers(
  { apiKey: TAPESTRY_API_KEY },
  { startId: myId, endId: targetId }
);

// Get activity feed (built-in — no manual merge needed!)
const feed = await tapestry.activity.getActivity({
  apiKey: TAPESTRY_API_KEY,
  profileId: myId,
});
```

**No separate `config.ts` needed** — the SDK handles URL construction, JSON parsing, and typing. We just export the client instance + env vars.

---

### 2.2 Tapestry Service Layer

#### New File: `services/tapestryService.ts`

This is the main integration file. Organized by feature:

```typescript
// ═══════════════════════════════════════════
// PROFILES
// ═══════════════════════════════════════════

export interface TapestryProfile {
  id: string;
  username: string;
  bio: string;
  walletAddress: string;
  blockchain: string;
  namespace: string;
  customProperties: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface TapestryProfileWithSocial {
  profile: TapestryProfile;
  socialCounts: {
    followers: number;
    following: number;
    posts: number;
    likes: number;
  };
}

/**
 * Find or create a Tapestry profile for the current user.
 * Called once on sign-in, after AuthContext confirms the user.
 *
 * Maps Proven user data → Tapestry profile:
 *   - walletAddress: from user.walletAddress (if set)
 *   - username: from user.username (Proven username)
 *   - id: from user.id (Proven user ID — ensures 1:1 mapping)
 *   - bio: from user.name
 *   - customProperties: { provenUserId, avatar }
 */
export async function findOrCreateProfile(
  provenUser: { id: string; username: string; name: string; walletAddress: string | null; profilePicture: string }
): Promise<TapestryProfileWithSocial>;

/**
 * Get a Tapestry profile by ID (for viewing other users).
 */
export async function getProfile(profileId: string): Promise<TapestryProfileWithSocial | null>;

/**
 * Search profiles by wallet address (cross-app discovery).
 */
export async function searchProfilesByWallet(walletAddress: string): Promise<TapestryProfile[]>;

// ═══════════════════════════════════════════
// FOLLOWS
// ═══════════════════════════════════════════

/**
 * Follow a user.
 * startId = current user's Tapestry profile ID
 * endId   = target user's Tapestry profile ID
 */
export async function followUser(startId: string, endId: string): Promise<void>;

/**
 * Unfollow a user.
 */
export async function unfollowUser(startId: string, endId: string): Promise<void>;

/**
 * Check if current user follows target user.
 */
export async function checkFollowStatus(followerId: string, followeeId: string): Promise<{
  isFollowing: boolean;
  followId?: string;
  followedAt?: string;
}>;

/**
 * Get followers list with pagination.
 */
export async function getFollowers(profileId: string, limit?: number, offset?: number): Promise<{
  profiles: TapestryProfile[];
  pagination: { total: number; hasMore: boolean };
}>;

/**
 * Get following list with pagination.
 */
export async function getFollowing(profileId: string, limit?: number, offset?: number): Promise<{
  profiles: TapestryProfile[];
  pagination: { total: number; hasMore: boolean };
}>;

/**
 * Get follower/following counts.
 */
export async function getFollowCounts(profileId: string): Promise<{
  followers: number;
  following: number;
}>;
```

---

### 2.3 Tapestry Context (State Management)

#### New File: `context/TapestryContext.tsx`

```typescript
interface TapestryContextType {
  // Profile
  tapestryProfile: TapestryProfileWithSocial | null;
  tapestryProfileId: string | null;
  isProfileLoading: boolean;

  // Follow counts (own)
  followerCount: number;
  followingCount: number;

  // Following state cache (for UI: "am I following this person?")
  followingSet: Set<string>;  // set of profileIds the current user follows
  isFollowing: (profileId: string) => boolean;

  // Actions
  initProfile: () => Promise<void>;
  follow: (targetProfileId: string) => Promise<void>;
  unfollow: (targetProfileId: string) => Promise<void>;
  refreshFollowData: () => Promise<void>;
}
```

**Flow:**

1. `AuthContext` signs in → user object available
2. `TapestryContext.initProfile()` called inside `useEffect` watching `auth.user`
3. Calls `findOrCreateProfile()` with Proven user data
4. Stores `tapestryProfile` in state
5. Fetches following list → populates `followingSet` for instant UI checks

**Where it goes in provider tree:**

```
ThemeProvider
  SafeAreaProvider
    AuthProvider
      TapestryProvider  ← NEW (needs AuthContext.user)
        NotificationProvider
          NetworkProvider
            WalletProvider
              AppContent
```

---

### 2.4 Profile Screen Updates

#### Modified File: `app/(main)/profile.tsx`

**Changes:**
1. Import and use `useTapestry()` hook
2. Add follower/following counts below username
3. Add followers/following modal flow from profile header taps

```
Current:                        After:
┌──────────────────┐           ┌──────────────────┐
│    [avatar]      │           │    [avatar]       │
│    John Doe      │           │    John Doe       │
│    @johndoe      │           │    @johndoe       │
│    [Edit Profile]│           │  42 followers · 18 following  ← NEW
│                  │           │    [Edit Profile] │
│ ┌──────────────┐ │           │                   │
│ │ Wallet $12.50│ │           │ ┌──────────────┐  │
│ └──────────────┘ │           │ │ Wallet $12.50│  │
│                  │           │ └──────────────┘  │
│ Stats Grid       │           │                   │
│                  │           │ Stats Grid        │
│ Account ─────    │           │   (+ Followers, Following stats) │
│ Preferences ──   │           │                   │
│ Support ─────    │           │ Support ─────     │
│                  │           │                   │
│ [Log Out]        │           │ [Log Out]         │
│                  │           │                   │
│                  │           │ (tap followers/following opens modal)
└──────────────────┘           └──────────────────┘
```

#### Modified File: `components/profile/ProfileHeader.tsx`

**Changes:**
- Add follower/following count row (tappable to open followers/following list)
- Keep existing profile header layout and theme styles

```typescript
// New props:
interface ProfileHeaderProps {
  // ...existing
  followerCount?: number;   // NEW
  followingCount?: number;  // NEW
  onFollowersPress?: () => void;  // NEW
  onFollowingPress?: () => void;  // NEW
}
```

---

### 2.5 Leaderboard — Global + Follow Integration

#### Modified File: `app/(main)/leaderboard.tsx`

**Changes:**
1. Keep leaderboard global with existing periods (`'daily' | 'weekly'`)
2. Add follow/unfollow button on leaderboard rows (non-current users)
3. Tap a leaderboard row to open `user/[id]`
4. Handle 0, 1, 2, 3+ entries gracefully (empty state / partial podium / list rows)

```
Tabs: [Daily] [Weekly] (global)
```

**Logic added in leaderboard screen:**
```typescript
const showPodium = currentLeaderboard.length > 0;
const restOfLeaderboard = showPodium
  ? currentLeaderboard.slice(Math.min(3, currentLeaderboard.length))
  : currentLeaderboard;

// Row press -> /user/[id]
onPress={!entry.isCurrentUser && entry.userId
  ? () => router.push(`/user/${entry.userId}`)
  : undefined}
```

#### Modified File: `components/leaderboard/LeaderboardHeader.tsx`

**Changes:**
- Keep period type global (`'daily' | 'weekly'`)
- No friends filter/tab in Phase 1 scope

#### Modified File: `components/leaderboard/LeaderboardRow.tsx`

**Changes:**
- Add optional follow/unfollow button on the right side of each row
- Only show for non-current-user rows
- Uses `TapestryContext.follow()` / `unfollow()`
- Keep follow button press isolated (doesn't trigger row navigation)

```typescript
interface LeaderboardRowProps {
  // ...existing
  userId?: string;          // NEW — for follow lookup
  onPress?: () => void;     // NEW — row navigation to user profile
}
```

**Visual:**
```
┌──────────────────────────────────────────┐
│ 4  [avatar]  Alice          $42  [Follow]│  ← NEW button
│              +$5 to rank 3   earned      │
└──────────────────────────────────────────┘
```

---

### 2.6 User Profile View (View Other Users)

#### New File: `app/user/[id].tsx`

A new screen to view another user's profile (navigated from leaderboard row tap or followers list).

```
┌──────────────────────────┐
│  ← Back                  │
│                          │
│       [avatar]           │
│       Alice              │
│       @alice             │
│   12 followers · 8 following │
│                          │
│   [Following ✓]  or  [Follow] │
│                          │
│   ┌────────┐ ┌────────┐ │
│   │Proofs  │ │Earned  │ │
│   │ 45     │ │ $120   │ │
│   └────────┘ └────────┘ │
│                          │
│   Challenge Activity     │
│   (Phase 2 — empty now)  │
└──────────────────────────┘
```

**Data source:** Tapestry profile + Proven leaderboard entry (matched by userId).

---

### 2.7 Followers/Following List Modal

#### New File: `components/social/FollowListModal.tsx`

A reusable modal/screen showing a list of followers or following.

```typescript
interface FollowListModalProps {
  visible: boolean;
  onClose: () => void;
  profileId: string;
  type: 'followers' | 'following';
}
```

- Paginated list (20 per page, load more on scroll)
- Each row: avatar, name, follow/unfollow button
- Tap row → navigate to `user/[id]`

---

### Phase 1 — Files Summary

| Action | File | What Changes |
|--------|------|-------------|
| CREATE | `lib/tapestry/client.ts` | SocialFi SDK instance + config exports |
| CREATE | `services/tapestryService.ts` | All Tapestry API calls (wraps SDK) |
| CREATE | `context/TapestryContext.tsx` | Social state management |
| CREATE | `app/user/[id].tsx` | Other user's profile screen |
| CREATE | `components/social/FollowListModal.tsx` | Followers/following list |
| CREATE | `components/social/FollowButton.tsx` | Reusable follow/unfollow button |
| MODIFY | `app/_layout.tsx` | Add `TapestryProvider` to provider tree |
| MODIFY | `app/(main)/profile.tsx` | Add follower/following counts + FollowListModal integration |
| MODIFY | `app/(main)/leaderboard.tsx` | Keep global tabs + add follow integration + row navigation |
| MODIFY | `components/profile/ProfileHeader.tsx` | Add social counts row |
| MODIFY | `components/leaderboard/LeaderboardHeader.tsx` | Keep global daily/weekly period tabs |
| MODIFY | `components/leaderboard/LeaderboardRow.tsx` | Add follow button |
| MODIFY | `lib/offline/offlineStore.ts` | Add cache keys: `tapestryProfile`, `following` |
| MODIFY | `.env` | Add Tapestry env vars |

---

### Phase 1 — Detailed TODO Checklist

> Work through these in order. Each sub-phase builds on the previous.
> Mark `[x]` as you complete each task.

#### Sub-phase 1A: Foundation (Install SDK + Config)

- [x] **1A.1** — Install `socialfi` package and add env vars
  - Run `npm install socialfi`
  - Add to `.env`:
    - `EXPO_PUBLIC_TAPESTRY_API_KEY=<get from https://app.usetapestry.dev/>`
    - `EXPO_PUBLIC_TAPESTRY_NAMESPACE=proven`
  - Get API key from https://app.usetapestry.dev/ and paste it in

- [x] **1A.2** — Create `lib/tapestry/client.ts`
  - Import `SocialFi` from `socialfi`
  - Create and export `tapestry` client instance with `baseURL`
  - Export `TAPESTRY_API_KEY`, `TAPESTRY_NAMESPACE`, `TAPESTRY_BLOCKCHAIN`, `TAPESTRY_EXECUTION` constants
  - **Test manually:** make a test call (e.g. get a profile) to verify API key works

- [x] **1A.3** — Update `lib/offline/offlineStore.ts`
  - Add `tapestryProfile` to `CACHE_CONFIG` (TTL: 30 min, maxItems: 1)
  - Add `following` to `CACHE_CONFIG` (TTL: 5 min, maxItems: 1)
  - Add `tapestryFeed` to `CACHE_CONFIG` (TTL: 2 min, maxItems: 1) — for Phase 2 but add key now

---

#### Sub-phase 1B: Service Layer (Tapestry API Calls)

- [x] **1B.1** — Create `services/tapestryService.ts` — Profile functions
  - Import `tapestry`, `TAPESTRY_API_KEY`, etc. from `lib/tapestry/client`
  - Import types from `socialfi` (`ProfileSchema`, `FindOrCreateProfileSchema`, etc.)
  - Implement `findOrCreateProfile(provenUser)`:
    ```typescript
    tapestry.profiles.findOrCreateCreate(
      { apiKey: TAPESTRY_API_KEY },
      { walletAddress, username, bio, blockchain: 'SOLANA', execution: 'FAST_UNCONFIRMED',
        customProperties: [{ key: 'provenUserId', value: user.id }, { key: 'avatar', value: user.profilePicture }] }
    )
    ```
  - Implement `getProfile(profileId)` → `tapestry.profiles.getProfile(profileId, { apiKey })`
  - Implement `updateTapestryProfile(profileId, data)` → `tapestry.profiles.updateProfile({ apiKey }, data)`
  - **Test manually:** create a test profile, verify it appears on https://explorer.usetapestry.dev/

- [x] **1B.2** — Create `services/tapestryService.ts` — Follow functions
  - Implement `followUser(startId, endId)` → `tapestry.followers.postFollowers({ apiKey }, { startId, endId })`
  - Implement `unfollowUser(startId, endId)` → `tapestry.followers.deleteFollowers({ apiKey }, { startId, endId })`
  - Implement `checkFollowStatus(followerId, followeeId)` → `tapestry.followers.checkFollower({ followerId, followeeId, apiKey })`
  - Implement `getFollowers(profileId, limit?, offset?)` → `tapestry.profiles.getProfileFollowers(profileId, { apiKey, limit, offset })`
  - Implement `getFollowing(profileId, limit?, offset?)` → `tapestry.profiles.getProfileFollowing(profileId, { apiKey, limit, offset })`
  - Implement `getFollowCounts(profileId)` → parallel calls to followers/count + following/count
  - **Test manually:** follow/unfollow a test profile, verify counts update

---

#### Sub-phase 1C: State Management (TapestryContext)

- [x] **1C.1** — Create `context/TapestryContext.tsx`
  - Define `TapestryContextType` interface (profile, counts, followingSet, actions)
  - Implement `TapestryProvider` component
  - State: `tapestryProfile`, `followerCount`, `followingCount`, `followingSet` (Set<string>), `isProfileLoading`
  - Implement `initProfile()`:
    1. Call `findOrCreateProfile()` with data from `useAuth().user`
    2. Store result in state
    3. Fetch following list → build `followingSet`
    4. Cache profile to offline store
  - Implement `follow(targetId)`:
    1. Optimistic update: add to `followingSet`, increment `followingCount`
    2. Call `followUser()` API
    3. On failure: rollback optimistic update
  - Implement `unfollow(targetId)`:
    1. Optimistic update: remove from `followingSet`, decrement `followingCount`
    2. Call `unfollowUser()` API
    3. On failure: rollback
  - Implement `refreshFollowData()` — refetch following list + counts
  - Implement `isFollowing(profileId)` — check `followingSet.has(profileId)`
  - Export `useTapestry()` hook

- [x] **1C.2** — Wire `TapestryProvider` into `app/_layout.tsx`
  - Import `TapestryProvider` from `context/TapestryContext`
  - Insert between `AuthProvider` and `NotificationProvider`:
    ```
    AuthProvider → TapestryProvider → NotificationProvider → ...
    ```
  - **Test:** app boots without crash, TapestryContext initializes after login

- [x] **1C.3** — Add `useEffect` in TapestryProvider to auto-init on auth change
  - Watch `auth.user` — when it goes from null → User, call `initProfile()`
  - When it goes from User → null (logout), clear tapestry state
  - Handle edge case: user has no wallet address yet (pass null, update later)

---

#### Sub-phase 1D: Follow Button Component

- [x] **1D.1** — Create `components/social/FollowButton.tsx`
  - Props: `profileId: string`, `size?: 'sm' | 'md'`, `style?: ViewStyle`
  - Uses `useTapestry()` to check `isFollowing(profileId)` and call `follow`/`unfollow`
  - States: "Follow" (outline), "Following" (filled), "Loading" (spinner)
  - On press: toggle follow/unfollow with optimistic update
  - Don't render if `profileId === tapestryProfileId` (can't follow yourself)
  - Matches Proven design system: `colors.provenGreen`, `borderRadius.full`, `typography.caption`

- [x] **1D.2** — Create `components/social/index.ts`
  - Barrel export: `FollowButton`

---

#### Sub-phase 1E: Profile Screen Updates

- [x] **1E.1** — Modify `components/profile/ProfileHeader.tsx`
  - Add new props: `followerCount`, `followingCount`, `onFollowersPress`, `onFollowingPress`
  - Add a row between username and "Edit Profile" button:
    ```
    <Pressable onPress={onFollowersPress}>
      <Text>{followerCount} followers</Text>
    </Pressable>
    <Text> · </Text>
    <Pressable onPress={onFollowingPress}>
      <Text>{followingCount} following</Text>
    </Pressable>
    ```
  - Style: `typography.caption`, `colors.textMuted` for labels, `colors.textPrimary` + bold for numbers

- [x] **1E.2** — Create `components/social/FollowListModal.tsx`
  - Props: `visible`, `onClose`, `profileId`, `type: 'followers' | 'following'`
  - Modal with FlatList, paginated (20 per page)
  - Each row: avatar (40x40), username, name, FollowButton
  - Load more on scroll end (`onEndReached`)
  - Empty state: "No followers yet" / "Not following anyone yet"
  - Tap row → navigate to `user/[id]` screen (close modal first)

- [x] **1E.3** — Modify `app/(main)/profile.tsx`
  - Import `useTapestry()` — get `followerCount`, `followingCount`, `tapestryProfileId`
  - Pass counts to `ProfileHeader` component
  - Add state: `followListVisible`, `followListType`
  - Add handlers: `onFollowersPress` → open FollowListModal type=followers
  - Add handlers: `onFollowingPress` → open FollowListModal type=following
  - Render `FollowListModal` and route to `/user/[id]` from list rows

---

#### Sub-phase 1F: Leaderboard Social Integration

- [x] **1F.1** — Keep global leaderboard periods in `components/leaderboard/LeaderboardHeader.tsx`
  - Scope decision: no Friends tab in Phase 1
  - Keep `LeaderboardPeriod` as `'daily' | 'weekly'`

- [x] **1F.2** — Modify `components/leaderboard/LeaderboardRow.tsx`
  - Add new props: `userId?: string`, `onPress?: () => void`
  - Render `FollowButton` on the right side for non-current-user rows
  - Make entire row tappable → navigate to `user/[userId]`
  - Ensure follow button tap does not trigger row navigation

- [x] **1F.3** — Modify `app/(main)/leaderboard.tsx`
  - Keep leaderboard global (daily/weekly)
  - Add row-level navigation: `router.push(`/user/${entry.userId}`)`
  - Pass `userId` to rows for follow state and profile navigation
  - Add empty state + pull-to-refresh behavior

---

#### Sub-phase 1G: User Profile Screen (View Others)

- [x] **1G.1** — Create `app/user/[id].tsx`
  - Dynamic route: receives `id` param (Proven userId = Tapestry profileId)
  - Fetch Tapestry profile via `getProfile(id)` on mount
  - Fetch Proven leaderboard data for stats (earnings, streak) — reuse existing service
  - Layout:
    - Back button header
    - Avatar (from Tapestry customProperties.avatar or default)
    - Name, username
    - Follower/following counts (from Tapestry socialCounts)
    - FollowButton (follow/unfollow this user)
    - Stats cards: proofs submitted, challenges completed (from Tapestry customProperties or leaderboard)
    - "Challenge Activity" section (placeholder for Phase 2: "Coming soon")
  - Loading state: ActivityIndicator
  - Error state: "User not found"
  - Use existing design patterns: `FadeInDown`, `borderRadius.lg`, `colors.cardBackground`

- [x] **1G.2** — Wire up navigation from leaderboard rows
  - Verify `router.push(`/user/${userId}`)` works from LeaderboardRow tap
  - Verify back navigation works correctly

---

#### Sub-phase 1H: Integration Testing + Polish

- [x] **1H.1** — End-to-end flow test: Sign in → Tapestry profile created
  - [x] Login with Google → TapestryContext.initProfile() auto-called via useEffect
  - [x] findOrCreateProfile() creates/finds Tapestry profile (verified: 2 profiles exist on API)
  - [x] Handles missing walletAddress (passes undefined), missing API key (early return)
  - [x] Errors caught in try/catch, loading state reset in finally

- [x] **1H.2** — End-to-end flow test: Follow/unfollow from leaderboard
  - [x] FollowButton renders on non-self rows (loading placeholder while Tapestry initializing)
  - [x] Tap Follow → optimistic update (add to set + increment count) → API call
  - [x] Tap Following → optimistic unfollow (remove from set + decrement) → API call
  - [x] On failure → rollback optimistic update, error logged
  - [x] Profile screen followerCount/followingCount wired from TapestryContext

- [x] **1H.3** — End-to-end flow test: View other user's profile
  - [x] Tap leaderboard row → router.push(`/user/${userId}`) (disabled for own row)
  - [x] user/[id].tsx: loading state, error state ("User not found"), fallback chain
  - [x] FollowButton on profile screen works (size="md")
  - [x] Back button calls router.back()

- [x] **1H.4** — End-to-end flow test: Followers/following list
  - [x] Profile → tap follower/following count → FollowListModal opens
  - [x] FlatList pagination: onEndReached + loadMore (PAGE_SIZE=20)
  - [x] Empty states: "No followers yet" / "Not following anyone yet"
  - [x] Tap row → onClose() + setTimeout → router.push(`/user/${id}`)

- [x] **1H.5** — Edge case testing (code-verified)
  - [x] No wallet address → walletAddress: undefined passed, no crash
  - [x] Own profile/row → FollowButton returns null
  - [x] Empty leaderboard → "No rankings yet" empty state
  - [x] Missing Tapestry profile → fallback to leaderboard data, then stub
  - [x] Offline → all tapestryService functions try/catch, return null/empty
  - [x] Rapid tapping → `if (loading) return` + `disabled={loading}` guard
  - [x] Null tapestryProfileId → FollowButton shows loading spinner placeholder

- [x] **1H.6** — Visual polish
  - [x] Follow button uses colors.provenGreen (matches design system)
  - [x] Social counts on profile header tappable, well-spaced
  - [x] FollowListModal border uses colors.border (dark mode safe)
  - [x] All new components use useTheme() dynamic colors
  - NOTE: TransactionHistoryModal uses static colors (pre-existing, not Phase 1 scope)

---

#### Sub-phase 1 Completion Criteria

All of these must be true before moving to Phase 2:

- [x] User logs in → Tapestry profile auto-created
- [x] Profile screen shows follower/following counts
- [x] Leaderboard remains global (Daily + Weekly)
- [x] Follow/unfollow works from leaderboard rows
- [x] Tapping a leaderboard row opens that user's profile
- [x] User profile screen shows data + follow button
- [x] Followers/following list modal implemented
- [x] Followers/following list modal pagination implemented
- [x] All new UI matches Proven design system (light + dark mode)
- [x] No crashes on fresh install (no Tapestry profile yet)
- [x] No crashes when offline (graceful degradation)

---

## 3. Phase 2

### Proof Activity Feed + Likes + Short Encouragement Comments

**Estimated effort:** ~3-4 hours
**Priority:** HIGH — this is what makes the app a "social network"

---

### 3.1 Core Concept: Proof Events as Content

**This is NOT a general-purpose posting system.**

Content is created **automatically** when a proof is approved. No manual posting.

```
Trigger: Backend approves a proof submission
  → App posts to Tapestry:
      contentType: "proof_completion"
      content: "Completed Day 5 of No Sugar Challenge"
      customProperties: {
        challengeId: "...",
        challengeTitle: "No Sugar Challenge",
        dayNumber: 5,
        totalDays: 30,
        proofImageUrl: "...",
        earnedAmount: 2.50,
      }
```

**When does this happen?**

Option A (client-side): After `proofService.uploadAndSubmitProof()` succeeds and status = approved
Option B (backend webhook): Backend fires Tapestry content creation on approval

**Decision: Option A (client-side)** — faster to ship for hackathon, no backend changes needed.

The trigger point is in `app/challenge/[id].tsx` after a successful proof submission polling confirms approval.

---

### 3.2 Activity Feed Tab

#### Repurpose: `app/(main)/notifications.tsx` → Activity Tab

**The current "Activity" tab only shows system notifications. We split it:**

```
Current:                          After:
┌──────────────────────┐         ┌──────────────────────┐
│ Notifications        │         │ Activity             │
│                      │         │ [Feed]  [Alerts]     │ ← sub-tabs
│ • Proof approved     │         │                      │
│ • Daily reminder     │         │ FEED TAB:            │
│ • Challenge ending   │         │ ┌──────────────────┐ │
│                      │         │ │ [avatar] Alice   │ │
│                      │         │ │ Completed Day 5  │ │
│                      │         │ │ No Sugar Challenge│ │
│                      │         │ │ +$2.50 earned    │ │
│                      │         │ │ ♡ 3  💬 1  • 2h  │ │
│                      │         │ └──────────────────┘ │
│                      │         │ ┌──────────────────┐ │
│                      │         │ │ [avatar] Bob     │ │
│                      │         │ │ Completed Day 12 │ │
│                      │         │ │ Morning Workout  │ │
│                      │         │ │ +$1.00 earned    │ │
│                      │         │ │ ♡ 5  💬 2  • 4h  │ │
│                      │         │ └──────────────────┘ │
│                      │         │                      │
│                      │         │ ALERTS TAB:          │
│                      │         │ (existing notifs)    │
│                      │         └──────────────────────┘
```

**Feed data source:**
1. Get current user's following list from `TapestryContext.followingSet`
2. For each followed user, fetch their content: `GET /contents/profile/{profileId}`
3. Merge + sort by `createdAt` descending
4. Filter to `contentType === 'proof_completion'` only

**Optimization:** Fetch content for all followed users in parallel using `Promise.allSettled()`.

---

### 3.3 Feed Content Service

#### Modified File: `services/tapestryService.ts` (add to existing)

```typescript
// ═══════════════════════════════════════════
// CONTENT (Proof Events)
// ═══════════════════════════════════════════

export interface ProofEvent {
  id: string;
  profileId: string;
  content: string;
  contentType: 'proof_completion';
  customProperties: {
    challengeId: string;
    challengeTitle: string;
    dayNumber: number;
    totalDays: number;
    proofImageUrl?: string;
    earnedAmount?: number;
  };
  createdAt: string;
  engagement: {
    likes: number;
    comments: number;
  };
  // Joined from profile data
  authorName?: string;
  authorAvatar?: string;
  authorUsername?: string;
}

/**
 * Post a proof completion event to Tapestry.
 * Called after proof is approved.
 */
export async function postProofEvent(
  profileId: string,
  challengeTitle: string,
  dayNumber: number,
  totalDays: number,
  challengeId: string,
  proofImageUrl?: string,
  earnedAmount?: number
): Promise<ProofEvent>;

/**
 * Get activity feed for current user.
 * Fetches content from all followed profiles, filtered to proof_completion.
 */
export async function getActivityFeed(
  followingIds: string[],
  limit?: number
): Promise<ProofEvent[]>;

/**
 * Get a single user's proof events.
 */
export async function getUserProofEvents(
  profileId: string,
  limit?: number,
  offset?: number
): Promise<ProofEvent[]>;

// ═══════════════════════════════════════════
// LIKES
// ═══════════════════════════════════════════

export async function likeContent(profileId: string, contentId: string): Promise<void>;
export async function unlikeContent(profileId: string, contentId: string): Promise<void>;
export async function checkLikeStatus(profileId: string, contentId: string): Promise<boolean>;
export async function getLikeCount(contentId: string): Promise<number>;

// ═══════════════════════════════════════════
// COMMENTS
// ═══════════════════════════════════════════

export interface ProofComment {
  id: string;
  profileId: string;
  contentId: string;
  text: string;
  createdAt: string;
  authorName?: string;
  authorAvatar?: string;
}

export async function addComment(profileId: string, contentId: string, text: string): Promise<ProofComment>;
export async function getComments(contentId: string, limit?: number, offset?: number): Promise<{
  comments: ProofComment[];
  pagination: { total: number; hasMore: boolean };
}>;
export async function deleteComment(commentId: string): Promise<void>;
```

---

### 3.4 Feed UI Components

#### New File: `components/social/FeedCard.tsx`

The main feed item card showing a proof completion event.

```
┌──────────────────────────────────────────┐
│ [avatar]  Alice · @alice         2h ago  │
│                                          │
│  Completed Day 5 of No Sugar Challenge   │
│  ┌─────────────────────────────────┐     │
│  │ 🎯 No Sugar Challenge          │     │
│  │ Day 5/30 · +$2.50 earned       │     │
│  │ ████████░░░░░ 17%              │     │
│  └─────────────────────────────────┘     │
│                                          │
│  ♡ 3 likes  ·  💬 1 comment             │
│                                          │
│  [♡ Like]  [💬 Comment]  [🔥 Fire]      │
└──────────────────────────────────────────┘
```

- Tap card → navigate to challenge detail or user profile
- Tap like → instant optimistic update + Tapestry API call
- Tap comment → expand inline comment section (max 3 visible, "View all" link)

#### New File: `components/social/CommentSection.tsx`

Inline comment list + input field.

- Max 3 visible comments, "View all X comments" to expand
- Text input at bottom with send button
- Character limit: 280 chars (encouragement, not essays)

#### New File: `components/social/ActivityFeed.tsx`

FlatList wrapper that renders FeedCard items with pull-to-refresh.

---

### 3.5 Proof Submission Integration

#### Modified File: `services/proofService.ts`

After proof submission + approval polling:

```typescript
// In the proof submission success handler:
import { postProofEvent } from './tapestryService';

// After proof is confirmed approved:
await postProofEvent(
  tapestryProfileId,
  challenge.title,
  dayNumber,
  totalDays,
  challenge.id,
  proofImageUrl,
  earnedAmount
);
```

**Important:** This should be fire-and-forget (don't block UX on Tapestry write). Wrap in try/catch, log errors silently.

---

### 3.6 Modified Activity Screen

#### Modified File: `app/(main)/notifications.tsx`

Renamed conceptually to "Activity" (tab already says "Activity"):
- Add sub-tabs: **Feed** | **Alerts**
- Feed tab shows `ActivityFeed` component
- Alerts tab shows existing notifications list
- Default to Feed tab

---

### Phase 2 — Files Summary

| Action | File | What Changes |
|--------|------|-------------|
| CREATE | `components/social/FeedCard.tsx` | Proof event card |
| CREATE | `components/social/CommentSection.tsx` | Inline comments |
| CREATE | `components/social/ActivityFeed.tsx` | Feed list wrapper |
| CREATE | `components/social/index.ts` | Barrel exports |
| MODIFY | `services/tapestryService.ts` | Add content, likes, comments APIs |
| MODIFY | `app/(main)/notifications.tsx` | Add Feed sub-tab alongside Alerts |
| MODIFY | `services/proofService.ts` | Auto-post proof events to Tapestry |
| MODIFY | `context/TapestryContext.tsx` | Add feed state, like/comment helpers |
| MODIFY | `app/user/[id].tsx` | Show user's proof events on their profile |

---

## 4. Phase 3

### Group Challenges + Invites + Accountability Partners

**Estimated effort:** ~4-5 hours
**Priority:** MEDIUM — nice-to-have for hackathon, huge for retention

---

### 4.1 Challenge Invites

When viewing a challenge detail, add "Invite Friends" button:

#### Modified File: `app/challenge/[id].tsx`

```
┌──────────────────────────────────────┐
│  Morning Workout Challenge           │
│  ...                                 │
│                                      │
│  [Join Challenge - $5 USDC]          │
│  [Invite Friends]  ← NEW            │
│                                      │
└──────────────────────────────────────┘
```

Tap "Invite Friends" → opens modal with following list. Select friends → creates a Tapestry content node:

```json
{
  "contentType": "challenge_invite",
  "content": "Join me in Morning Workout Challenge!",
  "customProperties": {
    "challengeId": "...",
    "challengeTitle": "Morning Workout",
    "invitedUserIds": ["alice", "bob"],
    "stakeAmount": 5
  }
}
```

Invited users see this in their feed.

---

### 4.2 Accountability Partners

Mutual follows = potential accountability partners.

#### New File: `components/social/AccountabilityCard.tsx`

On the challenge detail screen, if any mutual follows are also in this challenge:

```
┌──────────────────────────────────────┐
│ 🤝 Accountability Partners          │
│                                      │
│ [avatar] Alice  Day 12/30  ✅ today  │
│ [avatar] Bob    Day 12/30  ❌ missed │
│                                      │
│ You're all in this together.         │
└──────────────────────────────────────┘
```

**Data source:** Cross-reference `followingSet` (mutual follows) with challenge participants from Proven backend.

---

### 4.3 Group Challenge Feed

When multiple friends are in the same challenge, the feed clusters their events:

```
┌──────────────────────────────────────┐
│ 🔥 No Sugar Challenge — Day 5       │
│                                      │
│ ✅ Alice completed · +$2.50         │
│ ✅ You completed · +$2.50           │
│ ⏳ Bob hasn't submitted yet         │
│                                      │
│ 2/3 friends done today              │
└──────────────────────────────────────┘
```

---

### Phase 3 — Files Summary

| Action | File | What Changes |
|--------|------|-------------|
| CREATE | `components/social/InviteFriendsModal.tsx` | Friend invite picker |
| CREATE | `components/social/AccountabilityCard.tsx` | Partners widget |
| CREATE | `components/social/GroupChallengeCard.tsx` | Clustered feed card |
| MODIFY | `app/challenge/[id].tsx` | Add invite + accountability sections |
| MODIFY | `components/social/ActivityFeed.tsx` | Add group clustering logic |
| MODIFY | `services/tapestryService.ts` | Add invite content type |

---

## 5. New Files Summary

```
lib/
  tapestry/
    client.ts          — SocialFi SDK instance + config exports (uses `socialfi` npm package)

services/
  tapestryService.ts   — All Tapestry API calls (profiles, follows, content, likes, comments)

context/
  TapestryContext.tsx   — Social state: profile, following set, feed

app/
  user/
    [id].tsx           — Other user's profile screen

components/
  social/
    index.ts           — Barrel exports
    FollowButton.tsx   — Follow/unfollow button (used everywhere)
    FollowListModal.tsx — Followers/following paginated list
    FeedCard.tsx        — Proof event card for feed (Phase 2)
    CommentSection.tsx  — Inline comments (Phase 2)
    ActivityFeed.tsx    — Feed FlatList wrapper (Phase 2)
    InviteFriendsModal.tsx — Friend invite picker (Phase 3)
    AccountabilityCard.tsx — Partners widget (Phase 3)
    GroupChallengeCard.tsx — Clustered group card (Phase 3)
```

---

## 6. Modified Files Summary

| File | Phase | Changes |
|------|-------|---------|
| `.env` | 1 | Add `EXPO_PUBLIC_TAPESTRY_*` vars |
| `app/_layout.tsx` | 1 | Add `TapestryProvider` in provider tree |
| `app/(main)/profile.tsx` | 1 | Social counts + followers/following modal integration |
| `app/(main)/leaderboard.tsx` | 1 | Global leaderboard + follow integration + profile navigation |
| `app/(main)/notifications.tsx` | 2 | Feed/Alerts sub-tabs |
| `app/challenge/[id].tsx` | 2,3 | Auto-post proof events, invite, accountability |
| `components/profile/ProfileHeader.tsx` | 1 | Follower/following count row |
| `components/leaderboard/LeaderboardHeader.tsx` | 1 | Global period tabs (Daily/Weekly) |
| `components/leaderboard/LeaderboardRow.tsx` | 1 | Follow button, row tap navigation |
| `lib/offline/offlineStore.ts` | 1 | Add cache keys for Tapestry data |
| `services/proofService.ts` | 2 | Auto-post to Tapestry on proof approval |

---

## 7. Edge Cases & Gotchas

### Profile Sync

- **Problem:** User changes name/avatar in Proven → Tapestry profile stale.
- **Solution:** After `updateUserProfile()` in `userService.ts`, also update Tapestry profile. Use `customProperties.avatar` and update `bio` field.

### Wallet Address Timing

- **Problem:** User might not have wallet address when they first sign in (wallet set later).
- **Solution:** `findOrCreate` initially without wallet. When wallet is set in profile, update Tapestry profile with `walletAddress`. Store Proven `userId` as the stable `id` field.

### Rate Limiting

- **Problem:** Fetching content for 50+ followed users in parallel could hit Tapestry rate limits.
- **Solution:** Batch requests (10 concurrent max). Use `Promise.allSettled()` so one failure doesn't break the feed. Cache aggressively (2-min TTL for feed content).

### Leaderboard User ID Mapping

- **Problem:** Leaderboard entries use Proven `userId`. Tapestry uses its own `profileId`. Need to map.
- **Solution:** Use Proven `userId` as Tapestry profile `id` during `findOrCreate`. Then they're the same. This is the cleanest approach.

### Offline Behavior

- **Problem:** Tapestry calls fail when offline.
- **Solution:** Follow/unfollow actions: queue for sync (reuse existing offline queue pattern). Feed: show cached feed with "Last updated X ago" badge. Profile: show cached social counts.

### Duplicate Proof Events

- **Problem:** User submits proof, app posts to Tapestry. If app crashes and retries, duplicate event.
- **Solution:** Use `challengeId + dayNumber + profileId` as an idempotency key in `customProperties`. Before posting, check if content with same key exists. Or simply accept occasional duplicates (hackathon pragmatism).

### Tapestry Namespace Isolation

- **Problem:** Other apps using Tapestry might show profiles from different namespaces.
- **Solution:** Always pass our namespace. Tapestry isolates by default. Only use `shouldIncludeExternalProfiles: true` if we want cross-app discovery (Phase 3+).

---

## 8. Trade-offs & Decisions

| Decision | Chosen | Alternative | Why |
|----------|--------|-------------|-----|
| HTTP client | `socialfi` npm package | Direct fetch | Official SDK, fully typed, has built-in activity feed, recommended by Tapestry, saves ~200 lines |
| Profile ID | Proven `userId` | Random UUID | 1:1 mapping, no lookup table needed |
| Feed trigger | Client-side on approval | Backend webhook | No backend changes, faster to ship |
| Feed architecture | Fetch per-user, merge client-side | Server-side aggregated feed | Tapestry has no "feed" endpoint; this is the only option |
| Activity screen | Sub-tabs (Feed/Alerts) | Separate tab | Keeps 5-tab layout, doesn't add a 6th tab |
| Follow button on leaderboard | Inline button | Separate follow screen | More social, encourages discovery |
| Comment length | 280 chars max | Unlimited | Encouragement, not essays. Keeps UX tight |
| Execution method | FAST_UNCONFIRMED | CONFIRMED_AND_PARSED | ~1s vs ~15s. UX > confirmation for social actions |

---

## Implementation Order (IST Timeline)

### Phase 1 — Do First (Ship fast for hackathon)
1. `lib/tapestry/config.ts` + `client.ts`
2. `services/tapestryService.ts` (profiles + follows only)
3. `context/TapestryContext.tsx`
4. `app/_layout.tsx` (add provider)
5. `components/social/FollowButton.tsx`
6. `components/profile/ProfileHeader.tsx` (social counts)
7. `app/(main)/profile.tsx` (follow list modal wiring)
8. `components/leaderboard/LeaderboardHeader.tsx` (keep global periods)
9. `components/leaderboard/LeaderboardRow.tsx` (follow button)
10. `app/(main)/leaderboard.tsx` (global follow integration)
11. `components/social/FollowListModal.tsx`
12. `app/user/[id].tsx`

### Phase 2 — Do Second
1. `services/tapestryService.ts` (add content + likes + comments)
2. `components/social/FeedCard.tsx`
3. `components/social/CommentSection.tsx`
4. `components/social/ActivityFeed.tsx`
5. `app/(main)/notifications.tsx` (add Feed tab)
6. `services/proofService.ts` (auto-post proof events)

### Phase 3 — If Time Permits
1. `components/social/InviteFriendsModal.tsx`
2. `components/social/AccountabilityCard.tsx`
3. `app/challenge/[id].tsx` (invite + accountability)

---

## Tapestry API Quick Reference

All endpoints: `https://api.usetapestry.dev/v1/`
Auth: `?apiKey=YOUR_KEY` on all requests

### Profiles
| Action | Method | Path |
|--------|--------|------|
| Create/Find | POST | `/profiles/findOrCreate?apiKey=KEY` |
| Get | GET | `/profiles/{id}?apiKey=KEY` |
| Update | PUT | `/profiles/update?apiKey=KEY` |
| Search by wallet | POST | `/profiles/search?apiKey=KEY` |

### Follows
| Action | Method | Path |
|--------|--------|------|
| Follow | POST | `/followers?apiKey=KEY` |
| Unfollow | DELETE | `/followers?apiKey=KEY` |
| Check | GET | `/followers/check?followerId=X&followeeId=Y&apiKey=KEY` |
| Followers list | GET | `/profiles/followers/{id}?apiKey=KEY&limit=N&offset=N` |
| Following list | GET | `/profiles/following/{id}?apiKey=KEY&limit=N&offset=N` |
| Followers count | GET | `/profiles/followers/{id}/count?apiKey=KEY` |
| Following count | GET | `/profiles/following/{id}/count?apiKey=KEY` |

### Content
| Action | Method | Path |
|--------|--------|------|
| Create | POST | `/contents/create?apiKey=KEY` |
| Get | GET | `/contents/{id}?apiKey=KEY` |
| User's posts | GET | `/contents/profile/{profileId}?apiKey=KEY&limit=N&offset=N` |
| Delete | POST | `/contents/delete?apiKey=KEY` |

### Likes
| Action | Method | Path |
|--------|--------|------|
| Like | POST | `/likes?apiKey=KEY` |
| Unlike | DELETE | `/likes?apiKey=KEY` |
| Check | GET | `/likes/check?profileId=X&contentId=Y&apiKey=KEY` |
| Count | GET | `/likes/count/{contentId}?apiKey=KEY` |

### Comments
| Action | Method | Path |
|--------|--------|------|
| Create | POST | `/comments?apiKey=KEY` |
| Get by content | GET | `/comments?contentId=X&limit=N&offset=N&apiKey=KEY` |
| Delete | DELETE | `/comments/{commentId}?apiKey=KEY` |

**Request body for all writes:**
```json
{
  "blockchain": "SOLANA",
  "execution": "FAST_UNCONFIRMED"
}
```
