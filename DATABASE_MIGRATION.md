# Firebase to Supabase User Sync

## Overview

Since you're now using Firebase for authentication but Supabase for your database, you'll need to ensure Firebase user IDs (`uid`) are properly stored in your Supabase database.

## Database Migration Required

### Update Existing Tables

Your existing tables reference `user_id`. You need to update these to use Firebase UIDs:

```sql
-- Update workspaces table to use Firebase UIDs
-- (Do this for each table with user_id foreign key)

-- 1. First, backup your data!
CREATE TABLE workspaces_backup AS SELECT * FROM workspaces;

-- 2. Update user_id column to match Firebase UID format
-- You'll need to manually map old Supabase user IDs to new Firebase UIDs
-- This depends on your migration strategy

-- Option A: Clear existing data and start fresh (if no production data)
TRUNCATE TABLE workspaces CASCADE;
TRUNCATE TABLE quick_studies CASCADE;
TRUNCATE TABLE documents CASCADE;
-- etc...

-- Option B: Migrate existing users
-- Ask each user to re-register, or manually map old IDs to new Firebase UIDs
```

### Update RLS Policies

Since Supabase auth is no longer used, you'll need to update Row Level Security (RLS) policies:

**IMPORTANT:** Standard RLS policies like `auth.uid()` won't work because you're not using Supabase auth.

You have two options:

#### Option 1: Disable RLS (Quick but less secure)
```sql
ALTER TABLE workspaces DISABLE ROW LEVEL SECURITY;
ALTER TABLE quick_studies DISABLE ROW LEVEL SECURITY;
-- etc...
```

#### Option 2: Use Service Role Key (Recommended)
In your frontend, when making Supabase database calls, ensure you're checking authorization manually:

```javascript
// In your components, always verify the user owns the resource
const { data, error } = await supabase
  .from('workspaces')
  .select('*')
  .eq('user_id', user.id); // user.id is Firebase UID

// Check ownership before updates/deletes
const workspace = data.find(w => w.id === workspaceId);
if (workspace.user_id !== user.id) {
  throw new Error('Unauthorized');
}
```

## Using Optional User Sync

If you want to maintain a `users` table in Supabase (optional), follow these steps:

### 1. Create Users Table

Run this in Supabase SQL Editor:

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,  -- Firebase UID
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  photo_url TEXT,
  email_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 2. Update AuthContext to Sync Users

Modify [src/context/AuthContext.jsx](../src/context/AuthContext.jsx):

```javascript
import { syncUserToSupabase } from '../utils/userSync';

// Inside useEffect, after Firebase auth:
const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
  if (firebaseUser) {
    // Sync to Supabase database (optional)
    await syncUserToSupabase(firebaseUser);
    
    setUser({
      id: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
      emailVerified: firebaseUser.emailVerified
    });
  } else {
    setUser(null);
  }
  setLoading(false);
});
```

## Testing Checklist

- [ ] Firebase users can sign up
- [ ] Firebase users can log in
- [ ] `user.id` in context is Firebase UID
- [ ] New workspaces are created with correct `user_id`
- [ ] Users can only see their own workspaces
- [ ] Quick studies work with Firebase UID
- [ ] File uploads associate with correct user
- [ ] Sign out clears Firebase session

## Common Issues

### Issue: "Cannot insert duplicate key"
**Solution:** Make sure you're not inserting Supabase auth user IDs anymore.

### Issue: RLS prevents data access
**Solution:** Either disable RLS or use service role key with manual authorization checks.

### Issue: Existing data not visible
**Solution:** Your old data uses Supabase user IDs. You need to migrate or clear old data.
