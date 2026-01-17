// src/utils/userSync.js
// Helper to sync Firebase authenticated users with Supabase database

import { supabase } from '../supabase/client';

/**
 * Sync Firebase user data to Supabase database
 * Call this after successful Firebase authentication
 * 
 * @param {Object} firebaseUser - The Firebase user object
 * @returns {Promise<Object>} - The synced user data
 */
export async function syncUserToSupabase(firebaseUser) {
  if (!firebaseUser) return null;

  try {
    // Check if user exists in Supabase database
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('id', firebaseUser.uid)
      .single();

    if (existingUser) {
      // Update existing user
      const { data, error } = await supabase
        .from('users')
        .update({
          email: firebaseUser.email,
          display_name: firebaseUser.displayName,
          photo_url: firebaseUser.photoURL,
          email_verified: firebaseUser.emailVerified,
          updated_at: new Date().toISOString()
        })
        .eq('id', firebaseUser.uid)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      // Create new user
      const { data, error } = await supabase
        .from('users')
        .insert({
          id: firebaseUser.uid,
          email: firebaseUser.email,
          display_name: firebaseUser.displayName,
          photo_url: firebaseUser.photoURL,
          email_verified: firebaseUser.emailVerified,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  } catch (error) {
    console.error('Error syncing user to Supabase:', error);
    return null;
  }
}

/**
 * Optional: Create a users table in Supabase if it doesn't exist
 * Run this SQL in your Supabase SQL Editor:
 * 
 * CREATE TABLE IF NOT EXISTS users (
 *   id TEXT PRIMARY KEY,  -- Firebase UID
 *   email TEXT NOT NULL UNIQUE,
 *   display_name TEXT,
 *   photo_url TEXT,
 *   email_verified BOOLEAN DEFAULT false,
 *   created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
 *   updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
 * );
 * 
 * -- Enable RLS
 * ALTER TABLE users ENABLE ROW LEVEL SECURITY;
 * 
 * -- Policy: Users can read their own data
 * CREATE POLICY "Users can view own data" ON users
 *   FOR SELECT USING (auth.uid() = id);
 * 
 * -- Policy: Users can update their own data
 * CREATE POLICY "Users can update own data" ON users
 *   FOR UPDATE USING (auth.uid() = id);
 */
