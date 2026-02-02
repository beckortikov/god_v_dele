# Supabase API Integration Guide

## Architecture

To avoid exposing Supabase credentials on the client, use API routes as a bridge:

```
Client (Next.js Client Component)
    ↓
API Routes (Server-side)
    ↓
Supabase Database
```

## Example: Participants API Route

Create `/app/api/participants/route.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase with service role key (server-side only)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Fetch all participants
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('participants')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    return Response.json({ data }, { status: 200 })
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}

// POST - Create new participant
export async function POST(req: Request) {
  try {
    const body = await req.json()

    const { data, error } = await supabase
      .from('participants')
      .insert([body])
      .select()

    if (error) throw error

    return Response.json({ data }, { status: 201 })
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
```

## Client-Side Usage

In your components, fetch from the API route:

```typescript
'use client'

import { useEffect, useState } from 'react'

export function ParticipantsList() {
  const [participants, setParticipants] = useState([])

  useEffect(() => {
    fetch('/api/participants')
      .then(res => res.json())
      .then(data => setParticipants(data.data))
  }, [])

  return (
    // ...
  )
}
```

## Required Environment Variables

Add these in your Vercel/v0 project settings:

```
# Public (safe to expose)
NEXT_PUBLIC_SUPABASE_URL=https://eomplkylimclahqhnqsm.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=sb_publishable_NlJe991Ux_H-HOYCmuKNxw_XIzAXzJ9

# Private (server-side only)
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

## Getting Service Role Key

1. Go to Supabase Dashboard
2. Navigate to Settings → API
3. Copy the "Service Role" key (keep this secret!)
4. Add to environment variables as `SUPABASE_SERVICE_ROLE_KEY`

## API Routes to Create

```
/api/participants          - GET, POST
/api/participants/[id]     - GET, PUT, DELETE
/api/monthly-payments      - GET, POST
/api/offline-events        - GET, POST
/api/expenses              - GET, POST
/api/forecasts             - GET, POST
```

## Benefits of This Approach

✅ Credentials never exposed to client
✅ Server-side validation and security
✅ Database operations controlled
✅ Easier to add authentication checks
✅ Better error handling
