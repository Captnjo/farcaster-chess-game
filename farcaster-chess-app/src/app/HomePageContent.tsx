'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Chess, Square } from 'chess.js';
import { FaSync } from 'react-icons/fa';
import { motion } from 'framer-motion';
import AuthButton from '@/components/AuthButton';
import ChessboardComponent from '@/components/ChessboardComponent';
import GameInfoPanel from '@/components/GameInfoPanel';
import { useWebSocket } from '@/context/WebSocketContext';
import { toast } from 'react-hot-toast';

export default function HomePageContent() {
  const searchParams = useSearchParams();
  const [userFid, setUserFid] = useState<number | null>(null);
  const [game, setGame] = useState(new Chess());
  const [currentPosition, setCurrentPosition] = useState(game.fen());
  const [isMiniApp, setIsMiniApp] = useState<boolean>(false);
  const [isTestMode, setIsTestMode] = useState<boolean>(false);
  const [availableGames, setAvailableGames] = useState<Array<{ id: string; status: string; players: number }>>([]);

  const { 
    isConnected, 
    createGame, 
    joinGame, 
    makeMove: wsMakeMove,
    resetGame: wsResetGame,
    currentGame 
  } = useWebSocket();

  const handleAuthChange = useCallback((fid: number | null) => {
    setUserFid(fid);
    const newGame = new Chess();
    setGame(newGame);
    setCurrentPosition(newGame.fen());
  }, []);

  // Check for Farcaster Mini App context on mount
  useEffect(() => {
    const fidFromQuery = searchParams.get('fid');
    const contextParam = searchParams.get('context');
    const testMode = searchParams.get('test') === 'true';

    if (testMode) {
      setIsTestMode(true);
      handleAuthChange(123); // Use test FID
    } else if (fidFromQuery && !isNaN(parseInt(fidFromQuery, 10))) {
      const fidNumber = parseInt(fidFromQuery, 10);
      handleAuthChange(fidNumber);
      setIsMiniApp(true);
    } else if (contextParam === 'farcaster') {
      setIsMiniApp(true);
    }
  }, [searchParams, handleAuthChange]);

  // Fetch available games
  const fetchAvailableGames = useCallback(async () => {
    if (isConnected) {
      try {
        const response = await fetch('http://localhost:8000/api/games');
        const games = await response.json();
        setAvailableGames(games);
      } catch (error) {
        console.error('Error fetching games:', error);
        toast.error('Failed to fetch available games');
      }
    }
  }, [isConnected]);

  useEffect(() => {
    fetchAvailableGames();
  }, [fetchAvailableGames]);

  // Update local game state when server state changes
  useEffect(() => {
    if (currentGame.fen) {
      const newGame = new Chess();
      newGame.load(currentGame.fen);
      setGame(newGame);
    }
  }, [currentGame.fen]);

  const handleMove = (from: Square, to: Square): boolean => {
    if (!currentGame.id) return false;
    
    // Check if it's the player's turn
    const currentTurn = game.turn();
    if ((currentTurn === 'w' && currentGame.color !== 'white') || 
        (currentTurn === 'b' && currentGame.color !== 'black')) {
      toast.error("It's not your turn!");
      return false;
    }

    try {
      // Don't make the move locally, just send it to the server
      wsMakeMove(from, to);
      return true;
    } catch (error) {
      console.error('Error making move:', error);
      toast.error('Failed to make move');
      return false;
    }
  };

  const handleReset = () => {
    wsResetGame();
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-start p-2 sm:p-4 md:p-8">
      <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 sm:mb-6">Farcaster Chess</h1>
      
      {!isMiniApp && !userFid && !isTestMode && (
        <div className="mb-4 sm:mb-6">
          <AuthButton onAuthChange={handleAuthChange} />
        </div>
      )}

      {userFid ? (
        <div className="flex flex-col gap-4 w-full max-w-[400px] items-center">
          {isConnected ? (
            <>
              {currentGame.status === null && (
                <div className="w-full space-y-4">
                  <button
                    onClick={createGame}
                    className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                  >
                    Create New Game
                  </button>
                  
                  {availableGames.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">Available Games</h2>
                        <motion.button
                          onClick={fetchAvailableGames}
                          className="p-2 text-gray-600 hover:text-gray-800 transition-colors"
                          title="Refresh games"
                          whileTap={{ rotate: 180 }}
                          transition={{ duration: 0.3 }}
                        >
                          <FaSync className="w-5 h-5" />
                        </motion.button>
                      </div>
                      {availableGames.map(game => (
                        <button
                          key={game.id}
                          onClick={() => joinGame(game.id)}
                          className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                        >
                          Join Game {game.id}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {currentGame.status === 'waiting' && (
                <div className="text-center">
                  <p>Waiting for opponent to join...</p>
                  <p>Game ID: {currentGame.id}</p>
                </div>
              )}

              {currentGame.status === 'active' && (
                <>
                  <div className="w-full">
                    <GameInfoPanel 
                      game={game} 
                      playerColor={currentGame.color} 
                    />
                  </div>

                  <div className="w-full">
                    <ChessboardComponent
                      position={game.fen()}
                      onMove={handleMove}
                      boardOrientation={currentGame.color || 'white'}
                    />
                  </div>

                  <button
                    onClick={handleReset}
                    className="mt-4 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400 text-sm sm:text-base"
                  >
                    Reset Game
                  </button>
                </>
              )}
            </>
          ) : (
            <p>Connecting to server...</p>
          )}
        </div>
      ) : (
        !isMiniApp && !isTestMode && <p className="text-sm sm:text-base">Please sign in with Farcaster to play.</p>
      )}
    </main>
  );
}