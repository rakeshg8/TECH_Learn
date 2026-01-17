# Firebase Authentication Setup Guide

## What Changed?

Your authentication has been migrated from **Supabase Auth** to **Firebase Auth**, while keeping Supabase for database, storage, and other operations.

## Files Modified

1. **`src/firebase/config.js`** (NEW) - Firebase configuration and initialization
2. **`src/context/AuthContext.jsx`** - Updated to use Firebase auth state management
3. **`src/components/Login.jsx`** - Uses Firebase `signInWithEmailAndPassword` and Google Sign-In
4. **`src/components/Signup.jsx`** - Uses Firebase `createUserWithEmailAndPassword` and Google Sign-In

## Setup Instructions

### 1. Get Firebase Configuration

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select existing one
3. Go to Project Settings > General
4. Scroll down to "Your apps" section
5. Click on the Web icon (</>) to add a web app
6. Copy the `firebaseConfig` object

### 2. Add Environment Variables

Create a `.env` file in your project root and add:

```env
# Supabase (Keep these)
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Firebase (Add these)
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 3. Enable Authentication Methods in Firebase

1. In Firebase Console, go to **Authentication** > **Sign-in method**
2. Enable **Email/Password** provider
3. Enable **Google** provider (add your OAuth client ID)
4. Add authorized domains (localhost, your Vercel domain, etc.)

### 4. Update User ID References

**IMPORTANT:** Firebase uses `uid` instead of Supabase's `id`. Your user object now looks like:

```javascript
{
  id: firebaseUser.uid,  // This is the user ID
  email: firebaseUser.email,
  displayName: firebaseUser.displayName,
  photoURL: firebaseUser.photoURL,
  emailVerified: firebaseUser.emailVerified
}
```

You may need to update your Supabase database to store Firebase UIDs instead of Supabase user IDs in `user_id` columns.

### 5. Sync Firebase Users with Supabase Database (Optional)

If you want to maintain user records in Supabase, add this to your AuthContext after successful login:

```javascript
// After Firebase auth succeeds, create/update user in Supabase
const { data, error } = await supabase
  .from('users')
  .upsert({ 
    id: firebaseUser.uid, 
    email: firebaseUser.email 
  });
```

## What Still Uses Supabase?

- ✅ Database operations (workspaces, documents, chats, etc.)
- ✅ Storage (PDF uploads)
- ✅ Real-time subscriptions (if any)

## Testing

1. Restart your dev server: `npm run dev`
2. Try signing up with email/password
3. Try logging in with Google
4. Verify sign out works correctly

## Troubleshooting

### "Firebase: Error (auth/unauthorized-domain)"
- Add your domain to authorized domains in Firebase Console > Authentication > Settings

### "Firebase: Error (auth/popup-blocked)"
- Allow popups for your localhost/domain

### User ID mismatch in database
- Update all `user_id` foreign keys in Supabase to use Firebase UIDs

## Migration Checklist

- [ ] Add Firebase config to `.env`
- [ ] Enable Email/Password in Firebase Console
- [ ] Enable Google Sign-In in Firebase Console
- [ ] Add authorized domains in Firebase
- [ ] Test signup flow
- [ ] Test login flow
- [ ] Test Google sign-in
- [ ] Update existing user records if needed
- [ ] Update RLS policies in Supabase to use Firebase UIDs
