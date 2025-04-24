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

type GameMode = 'classic' | 'blitz' | 'rapid';
type OpponentType = 'ai' | 'random' | 'specific';
type PlayerColor = 'white' | 'black';

const gameModes = [
  { id: 'classic', name: 'Classic', description: 'Standard chess with no time limit' },
  { id: 'blitz', name: 'Blitz', description: '5 minutes per player' },
  { id: 'rapid', name: 'Rapid', description: '10 minutes per player' }
];

const opponentTypes = [
  { id: 'ai', name: 'Play vs AI', description: 'Challenge our AI at different difficulty levels' },
  { id: 'random', name: 'Random Opponent', description: 'Match with a random player' },
  { id: 'specific', name: 'Specific Player', description: 'Challenge a specific Farcaster user' }
];

export default function HomePageContent() {
  const searchParams = useSearchParams();
  const [userFid, setUserFid] = useState<number | null>(null);
  const [game, setGame] = useState(new Chess());
  const [currentPosition, setCurrentPosition] = useState(game.fen());
  const [isMiniApp, setIsMiniApp] = useState<boolean>(false);
  const [isTestMode, setIsTestMode] = useState<boolean>(false);
  const [availableGames, setAvailableGames] = useState<Array<{ id: string; status: string; players: number }>>([]);
  const [selectedMode, setSelectedMode] = useState<GameMode | null>(null);
  const [selectedOpponent, setSelectedOpponent] = useState<OpponentType | null>(null);
  const [selectedColor, setSelectedColor] = useState<PlayerColor>('white');
  const [specificUsername, setSpecificUsername] = useState('');

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

  const handleStartGame = async () => {
    if (!selectedMode || !selectedOpponent) return;
    
    const timeControls = {
      classic: null,
      blitz: { minutes: 5, increment: 0 },
      rapid: { minutes: 10, increment: 0 }
    };

    console.log('Starting game with:', {
      mode: selectedMode,
      opponentType: selectedOpponent,
      timeControls: timeControls[selectedMode],
      specificUsername: selectedOpponent === 'specific' ? specificUsername : undefined,
      preferredColor: selectedOpponent === 'ai' ? selectedColor : undefined
    });

    await createGame({
      mode: selectedMode,
      opponentType: selectedOpponent,
      timeControls: timeControls[selectedMode],
      specificUsername: selectedOpponent === 'specific' ? specificUsername : undefined,
      preferredColor: selectedOpponent === 'ai' ? selectedColor : undefined
    });
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
                  {/* Game Mode Selection */}
                  <div className="bg-gray-800 p-6 rounded-lg">
                    <h2 className="text-2xl font-semibold mb-4">Select Game Mode</h2>
                    <div className="grid grid-cols-1 gap-4">
                      {gameModes.map((mode) => (
                        <motion.button
                          key={mode.id}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className={`p-4 rounded-lg text-left transition-colors ${
                            selectedMode === mode.id
                              ? 'bg-blue-600'
                              : 'bg-gray-700 hover:bg-gray-600'
                          }`}
                          onClick={() => setSelectedMode(mode.id as GameMode)}
                        >
                          <h3 className="font-medium">{mode.name}</h3>
                          <p className="text-sm text-gray-300">{mode.description}</p>
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  {/* Opponent Selection */}
                  <div className="bg-gray-800 p-6 rounded-lg">
                    <h2 className="text-2xl font-semibold mb-4">Choose Opponent</h2>
                    <div className="grid grid-cols-1 gap-4">
                      {opponentTypes.map((type) => (
                        <motion.button
                          key={type.id}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className={`p-4 rounded-lg text-left transition-colors ${
                            selectedOpponent === type.id
                              ? 'bg-blue-600'
                              : 'bg-gray-700 hover:bg-gray-600'
                          }`}
                          onClick={() => setSelectedOpponent(type.id as OpponentType)}
                        >
                          <h3 className="font-medium">{type.name}</h3>
                          <p className="text-sm text-gray-300">{type.description}</p>
                        </motion.button>
                      ))}
                    </div>

                    {selectedOpponent === 'specific' && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-4"
                      >
                        <input
                          type="text"
                          placeholder="Enter Farcaster username"
                          className="w-full p-2 rounded bg-gray-700 text-white"
                          value={specificUsername}
                          onChange={(e) => setSpecificUsername(e.target.value)}
                        />
                      </motion.div>
                    )}

                    {selectedOpponent === 'ai' && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-4"
                      >
                        <h3 className="text-lg font-medium mb-2">Choose Your Color</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className={`p-4 rounded-lg text-center transition-colors ${
                              selectedColor === 'white'
                                ? 'bg-blue-600'
                                : 'bg-gray-700 hover:bg-gray-600'
                            }`}
                            onClick={() => setSelectedColor('white')}
                          >
                            <h3 className="font-medium">White</h3>
                            <p className="text-sm text-gray-300">Play as White</p>
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className={`p-4 rounded-lg text-center transition-colors ${
                              selectedColor === 'black'
                                ? 'bg-blue-600'
                                : 'bg-gray-700 hover:bg-gray-600'
                            }`}
                            onClick={() => setSelectedColor('black')}
                          >
                            <h3 className="font-medium">Black</h3>
                            <p className="text-sm text-gray-300">Play as Black</p>
                          </motion.button>
                        </div>
                      </motion.div>
                    )}
                  </div>

                  {/* Start Game Button */}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`w-full px-8 py-3 rounded-lg font-medium ${
                      selectedMode && selectedOpponent
                        ? 'bg-green-600 hover:bg-green-700'
                        : 'bg-gray-600 cursor-not-allowed'
                    }`}
                    onClick={handleStartGame}
                    disabled={!selectedMode || !selectedOpponent || !isConnected}
                  >
                    {isConnected ? 'Start Game' : 'Connecting...'}
                  </motion.button>
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