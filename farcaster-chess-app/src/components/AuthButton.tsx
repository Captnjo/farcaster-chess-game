'use client';

import React, { useState, useEffect } from 'react';
import { getSignInMessage, signIn } from '@farcaster/auth-client';

// Define the structure for the sign-in message data expected from the backend
interface SignInMessageResponse {
  message: string;
  nonce: string;
  domain: string;
  uri: string;
  // Add other fields if your backend returns them
}

// Define the structure for the verification response from the backend
interface VerifySignInResponse {
  success: boolean;
  fid?: number;
  error?: string;
  details?: string;
}

interface AuthButtonProps {
  onAuthChange: (fid: number | null) => void;
}

const AuthButton: React.FC<AuthButtonProps> = ({ onAuthChange }) => {
  const [fid, setFid] = useState<number | null>(null); // Keep local state for button display
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === 'true';
  const testFid = 123; // Predefined test FID for dev mode

  // TODO: Check for existing session/token on component mount
  useEffect(() => {
    // Placeholder for checking session status
    // const checkSession = async () => { ... };
    // checkSession();
  }, []);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);

    if (isDevMode) {
      console.log('DEV MODE: Bypassing Farcaster sign-in, using test FID:', testFid);
      setFid(testFid);
      onAuthChange(testFid);
      setLoading(false);
      return; // Exit early in dev mode
    }

    try {
      // 1. Request sign-in message details from the backend
      const apiResponse = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'requestSignIn' }),
      });

      if (!apiResponse.ok) {
        const errorData = await apiResponse.json();
        throw new Error(errorData.error || 'Failed to request sign-in message');
      }

      const signInData: SignInMessageResponse = await apiResponse.json();

      // 2. Redirect user to the Farcaster sign-in URI
      if (signInData.uri) {
        // Redirect the user to the sign-in page provided by the backend
        window.location.href = signInData.uri;
        // Note: The verification step (step 3 & 4) needs to happen *after* the user
        // authenticates via the URI and is redirected back to your app, or via
        // polling the /api/auth endpoint for status. This logic is removed from here.
      } else {
        throw new Error('Sign-in URI not received from backend.');
      }

      // Verification and state update logic needs to be handled separately
      // after the redirect flow completes.

    } catch (err: any) {
      console.error('Sign-in error:', err);
      setError(err.message || 'An unexpected error occurred during sign-in.');
    } finally {
      // Only set loading to false here if not in dev mode (handled earlier)
      if (!isDevMode) {
         setLoading(false);
      }
    }
  };

  const handleSignOut = () => {
    // TODO: Implement sign-out logic (clear session/token, update state)
    setFid(null);
    onAuthChange(null); // Call the callback
    console.log('Signed out');
  };

  return (
    <div>
      {fid ? (
        <div>
          <p>Signed in as FID: {fid}</p>
          <button onClick={handleSignOut} className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
            Sign Out
          </button>
        </div>
      ) : (
        <button
          onClick={handleSignIn}
          disabled={loading}
          className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
        >
          {loading ? 'Signing In...' : 'Sign in with Farcaster'}
        </button>
      )}
      {error && <p className="text-red-500 mt-2">Error: {error}</p>}
    </div>
  );
};

export default AuthButton;