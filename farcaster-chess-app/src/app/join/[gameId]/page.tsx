'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useWebSocket } from '@/context/WebSocketContext';

export default function JoinChallengePage() {
  const params = useParams();
  const router = useRouter();
  const { joinChallenge, isConnected } = useWebSocket();
  const [hasAttemptedJoin, setHasAttemptedJoin] = useState(false);

  const gameId = params.gameId as string; // Extract gameId from route params

  useEffect(() => {
    // Ensure we have the gameId, connection, and haven't already tried joining
    if (gameId && isConnected && !hasAttemptedJoin) {
      console.log(`Join page attempting to join challenge: ${gameId}`);
      joinChallenge(gameId); // Call the join function from context
      setHasAttemptedJoin(true); // Mark as attempted
      
      // Redirect back to the home page immediately after sending the join request.
      // The WebSocket context will handle the game_started/error message globally.
      router.push('/'); 
    }

    // Redirect home if already connected and no gameId is found (e.g., direct access to /join)
    if (!gameId && isConnected) {
      router.push('/');
    }

  }, [gameId, isConnected, joinChallenge, hasAttemptedJoin, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-2xl font-bold mb-4">Joining Challenge...</h1>
      {/* You can add a loading spinner here */} 
      {!isConnected && <p>Connecting to server...</p>}
      {gameId && isConnected && <p>Sending join request for game {gameId}...</p>}
      {!gameId && isConnected && <p>No challenge ID found, redirecting...</p>}
    </main>
  );
} 