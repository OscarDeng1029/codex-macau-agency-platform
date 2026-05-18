# Supabase Google Login Review Claim Setup

The browser can read legacy anonymous review ids from `localStorage`, but it must not update arbitrary `reviews` rows directly with the public anon key. The `/api/claim-reviews` endpoint verifies the current Supabase session token, then uses the Supabase service role key on the server to attach those local anonymous reviews to the logged-in Google user.

## Required Vercel Environment Variables

Set these in Vercel project settings:

```text
SUPABASE_URL=https://dvhwdirwpraorehlzdar.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your Supabase service_role key
```

Do not expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code.

## Required Supabase Auth URL Settings

If production login redirects to `http://localhost:3000/`, Supabase is falling back to the project Auth URL configuration instead of accepting the deployed callback URL.

In Supabase Dashboard -> Authentication -> URL Configuration, set:

```text
Site URL: https://www.macauagencyreview.com
```

Add every deployed origin you use to Redirect URLs, for example:

```text
https://www.macauagencyreview.com/**
https://macauagencyreview.com/**
https://*.vercel.app/**
http://127.0.0.1:5500/**
http://localhost:5500/**
```

Keep the localhost entries only for local testing. The production domain must be present, otherwise OAuth may fall back to a localhost Site URL and Chrome will show an unsafe cross-origin navigation error.

## What This Fixes

The previous browser-side migration called:

```js
supabase.from('reviews').update({ user_id }).in('id', localIds)
```

That fails with `permission denied for table reviews` when Row Level Security does not allow authenticated users to update those rows. The new server endpoint avoids that client-side `PATCH` and keeps the write behind a verified API request.
