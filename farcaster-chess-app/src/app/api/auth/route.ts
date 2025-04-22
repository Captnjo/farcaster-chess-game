// /src/app/api/auth/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAppClient, viemConnector } from '@farcaster/auth-client';

// TODO: Replace with your actual relay server URL if not using the default
const FARCASTER_RELAY = 'https://relay.farcaster.xyz';

// Initialize the Farcaster App Client
// Ensure you have appropriate environment variables or configuration for Ethereum interaction if needed
const appClient = createAppClient({
  relay: FARCASTER_RELAY,
  ethereum: viemConnector(), // Uses default Viem connector
});

// Handle POST requests for authentication actions (e.g., initiating sign-in, verifying signature)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, ...params } = body;

    if (action === 'requestSignIn') {
      // Generate a sign-in request URL
      const { data, error } = await appClient.createSignInMessage({
        domain: process.env.NEXT_PUBLIC_DOMAIN || 'localhost:3000', // Ensure this matches your app's domain
        uri: `${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/auth`, // Callback URI
        // nonce: generateNonce(), // Implement nonce generation for security
      });

      if (error) {
        console.error('Farcaster Auth Error:', error);
        return NextResponse.json({ error: 'Failed to create sign-in message', details: error.message }, { status: 500 });
      }

      return NextResponse.json(data);

    } else if (action === 'verifySignIn') {
      // Verify the signature provided by the user's wallet app
      const { message, signature, nonce, fid } = params;

      if (!message || !signature || !nonce || !fid) {
        return NextResponse.json({ error: 'Missing parameters for verification' }, { status: 400 });
      }

      const { success, error, fid: verifiedFid } = await appClient.verifySignInMessage({ message, signature, nonce, domain: process.env.NEXT_PUBLIC_DOMAIN || 'localhost:3000' });

      if (error) {
        console.error('Farcaster Verification Error:', error);
        return NextResponse.json({ error: 'Failed to verify sign-in message', details: error.message }, { status: 500 });
      }

      if (!success || verifiedFid !== fid) {
        return NextResponse.json({ error: 'Sign-in verification failed' }, { status: 401 });
      }

      // TODO: Implement session management here (e.g., create a session token)
      console.log(`Successfully verified FID: ${verifiedFid}`);
      return NextResponse.json({ success: true, fid: verifiedFid });

    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error) {
    console.error('API Auth Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// Handle GET requests (e.g., fetching user status - implement as needed)
export async function GET(req: NextRequest) {
  // TODO: Implement logic to check user's authentication status based on session/token
  return NextResponse.json({ message: 'Auth status endpoint - not implemented' });
}

// Helper function for nonce generation (replace with a robust implementation)
// function generateNonce() {
//   // Implement a secure way to generate and manage nonces
//   return require('crypto').randomBytes(16).toString('hex');
// }