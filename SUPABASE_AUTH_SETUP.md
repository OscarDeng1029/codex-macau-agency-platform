# Supabase Google Login Review Claim Setup

The browser can read legacy anonymous review ids from `localStorage`, but it must not update arbitrary `reviews` rows directly with the public anon key. The `/api/claim-reviews` endpoint verifies the current Supabase session token, then uses the Supabase service role key on the server to attach those local anonymous reviews to the logged-in Google user.

## Required Vercel Environment Variables

Set these in Vercel project settings:

```text
SUPABASE_URL=https://dvhwdirwpraorehlzdar.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your Supabase service_role key
```

Do not expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code.

## What This Fixes

The previous browser-side migration called:

```js
supabase.from('reviews').update({ user_id }).in('id', localIds)
```

That fails with `permission denied for table reviews` when Row Level Security does not allow authenticated users to update those rows. The new server endpoint avoids that client-side `PATCH` and keeps the write behind a verified API request.
