import { WebSocketServer } from 'ws';
import { Chess } from 'chess.js';
import express from 'express';
import cors from 'cors';
import { createGame, joinGame, recordMove, updateGameState, getGame, getGameMoves, getAvailableGames, cleanupAbandonedGames } from './services/database.js';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(cors());
app.use(express.json());

// In-memory game storage (for active games)
const activeGames = new Map();
const waitingGames = new Map();
const playerGames = new Map();
const playerConnections = new Map();

// Local testing bypass
const TEST_FID = 123;
const TEST_USERNAME = 'test_user';
let nextTestFid = TEST_FID; // Counter for unique test FIDs

// Create HTTP server
const server = app.listen(8000, () => {
  console.log('Server running on port 8000');
});

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Handle WebSocket connections
wss.on('connection', (ws) => {
  console.log('New client connecting...');
  
  // Assign a unique ID for testing if no real FID is available
  // In a real app, you'd get this from auth
  ws.playerId = nextTestFid++; 
  console.log(`Client connected with assigned Player ID: ${ws.playerId}`);

  // Store the WebSocket connection
  const playerId = ws.playerId;
  if (!playerConnections.has(playerId)) {
    playerConnections.set(playerId, new Set());
  }
  playerConnections.get(playerId).add(ws);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received WebSocket message:', data);
      handleMessage(ws, data);
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    // Clean up player and game data
    if (playerConnections.has(playerId)) {
      playerConnections.get(playerId).delete(ws);
      if (playerConnections.get(playerId).size === 0) {
        playerConnections.delete(playerId);
      }
    }
    
    // Clean up player's games
    if (playerGames.has(playerId)) {
      for (const gameId of playerGames.get(playerId)) {
        const game = activeGames.get(gameId) || waitingGames.get(gameId);
        if (game) {
          if (game.status === 'waiting') {
            waitingGames.delete(gameId);
          } else {
            // Notify opponent that player disconnected
            const opponent = game.white_player_fid === playerId ? game.black_player_fid : game.white_player_fid;
            if (opponent && opponent !== 'ai') {
              const opponentConnections = playerConnections.get(opponent);
              if (opponentConnections) {
                opponentConnections.forEach(opponentWs => {
                  opponentWs.send(JSON.stringify({
                    type: 'opponent_disconnected',
                    gameId
                  }));
                });
              }
            }
            activeGames.delete(gameId);
          }
        }
      }
      playerGames.delete(playerId);
    }
  });
});

async function handleMessage(ws, data) {
  console.log('Received WebSocket message:', data);
  
  switch (data.type) {
    case 'create_game':
      if (!data.mode || !data.opponentType) {
        console.error('Missing required parameters:', data);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Missing required parameters: mode and opponentType'
        }));
        return;
      }
      handleCreateGame(ws, data);
      break;
    case 'join_game':
      await joinGameHandler(ws, data);
      break;
    case 'make_move':
      await makeMoveHandler(ws, data);
      break;
    case 'resign':
      await resignGameHandler(ws, data);
      break;
    case 'reset_game':
      await resetGameHandler(ws, data);
      break;
    default:
      console.log('Unknown message type:', data.type);
  }
}

// Game creation handler
function handleCreateGame(ws, data) {
  console.log('Received create game request:', data);
  const { mode, opponentType, timeControls, specificUsername, preferredColor } = data;
  
  // Check for required parameters
  if (!mode || !opponentType) {
    console.error('Missing required parameters in create game request:', data);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Missing required parameters: mode and opponentType'
    }));
    return;
  }

  const playerId = ws.playerId;
  
  // Create new game structure
  const gameId = uuidv4();
  const initialFEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  
  const game = {
    id: gameId,
    fen: initialFEN,
    status: 'waiting', 
    white_player_fid: null,
    black_player_fid: null,
    mode,
    timeControls,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    // We'll use creator_fid temporarily for matchmaking
  };

  // Handle different opponent types
  if (opponentType === 'ai') {
    console.log(`Creating AI game for player ${playerId}`);
    const playerColor = preferredColor || 'white';
    game.status = 'in_progress';
    
    if (playerColor === 'white') {
      game.white_player_fid = playerId;
      game.black_player_fid = 'ai';
    } else {
      game.white_player_fid = 'ai';
      game.black_player_fid = playerId;
    }
    
    activeGames.set(gameId, game);
    // Notify the player immediately for AI games
    notifyGameStarted(game);

  } else if (opponentType === 'random') {
    console.log(`Player ${playerId} looking for random opponent in mode ${mode}`);
    let matched = false;
    
    // Look for a waiting game with the same mode and different player
    for (const [waitingId, waitingGame] of waitingGames.entries()) {
      console.log(`Checking waiting game ${waitingId} created by ${waitingGame.creator_fid}`);
      if (waitingGame.mode === mode && waitingGame.creator_fid !== playerId) {
        console.log(`Found matching game ${waitingId} for player ${playerId}`);
        // Match found! Randomly assign colors
        const isCreatorWhite = Math.random() < 0.5;
        
        if (isCreatorWhite) {
          waitingGame.white_player_fid = waitingGame.creator_fid;
          waitingGame.black_player_fid = playerId;
        } else {
          waitingGame.white_player_fid = playerId;
          waitingGame.black_player_fid = waitingGame.creator_fid;
        }
        
        // Remove temporary field and update status
        delete waitingGame.creator_fid;
        waitingGame.status = 'in_progress';
        waitingGame.updated_at = new Date().toISOString();
        
        // Move from waiting to active games
        activeGames.set(waitingId, waitingGame);
        waitingGames.delete(waitingId);
        
        // Notify both players
        console.log(`Game ${waitingId} starting between ${waitingGame.white_player_fid} and ${waitingGame.black_player_fid}`);
        notifyGameStarted(waitingGame);
        matched = true;
        break; // Exit loop once matched
      }
    }
    
    if (!matched) {
      // No match found, add this player to waiting games
      console.log(`No matching game found for ${playerId}, creating new waiting game ${gameId}`);
      game.creator_fid = playerId; // Store creator ID for matching
      waitingGames.set(gameId, game);
      
      // Set timeout for waiting game (e.g., 5 minutes)
      setTimeout(() => {
        const waitingGame = waitingGames.get(gameId);
        if (waitingGame && waitingGame.status === 'waiting') {
          console.log(`Waiting game ${gameId} timed out.`);
          waitingGames.delete(gameId);
          // Notify the creator if their connection is still active
          const creatorConnections = playerConnections.get(waitingGame.creator_fid);
          if (creatorConnections) {
            creatorConnections.forEach(creatorWs => {
              if (creatorWs.readyState === WebSocket.OPEN) {
                creatorWs.send(JSON.stringify({
                  type: 'error',
                  message: 'No opponent found in time. Game cancelled.'
                }));
              }
            });
          }
        }
      }, 5 * 60 * 1000); 
    }

  } else if (opponentType === 'specific' && specificUsername) {
    // Specific player challenge - store creator and challenge info
    console.log(`Player ${playerId} challenging ${specificUsername} for game ${gameId}`);
    game.creator_fid = playerId;
    game.specific_challenge = specificUsername;
    // Store in waiting games until the challenged player joins
    waitingGames.set(gameId, game); 
    // (Further implementation needed for challenge acceptance)

  } else {
    console.error('Invalid opponent type or missing specificUsername:', data);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Invalid opponent type or missing username for specific challenge.'
    }));
    return; // Exit if invalid parameters
  }

  // Add game reference to player's list (unless already matched and notified)
  if (game.status === 'waiting') {
    if (!playerGames.has(playerId)) {
      playerGames.set(playerId, new Set());
    }
    playerGames.get(playerId).add(gameId);
    
    // Notify the creator that their game is waiting
    ws.send(JSON.stringify({
      type: 'game_created', // Indicates the game is waiting for an opponent
      gameId: game.id,
      game // Send the initial game state
    }));
  }
}

// Helper function to notify both players when a game starts
function notifyGameStarted(game) {
  console.log('Notifying players of game start:', game);
  const whitePlayerConnections = playerConnections.get(game.white_player_fid);
  const blackPlayerConnections = game.black_player_fid === 'ai' ? null : playerConnections.get(game.black_player_fid);
  
  if (whitePlayerConnections) {
    whitePlayerConnections.forEach(ws => {
      ws.send(JSON.stringify({
        type: 'game_started',
        gameId: game.id,
        game,
        color: 'white'
      }));
    });
  }
  
  if (blackPlayerConnections) {
    blackPlayerConnections.forEach(ws => {
      ws.send(JSON.stringify({
        type: 'game_started',
        gameId: game.id,
        game,
        color: 'black'
      }));
    });
  }
}

async function joinGameHandler(ws, data) {
  const game = activeGames.get(data.gameId);
  if (!game) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Game not found'
    }));
    return;
  }

  if (game.players.length >= 2) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Game is full'
    }));
    return;
  }

  const { error } = await joinGame(data.gameId, data.playerFid || TEST_FID);
  if (error) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to join game'
    }));
    return;
  }

  game.players.push(ws);
  game.blackPlayer = ws;
  game.status = 'active';

  // Notify both players
  game.players.forEach(player => {
    player.send(JSON.stringify({
      type: 'game_started',
      gameId: game.id,
      fen: game.game.fen(),
      color: player === game.whitePlayer ? 'white' : 'black'
    }));
  });
}

async function makeMoveHandler(ws, data) {
  const game = activeGames.get(data.gameId);
  if (!game) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Game not found'
    }));
    return;
  }

  // Verify it's the player's turn
  const isWhiteTurn = game.game.turn() === 'w';
  const isPlayerWhite = game.white_player_fid === ws.playerId;
  if ((isWhiteTurn && !isPlayerWhite) || (!isWhiteTurn && isPlayerWhite)) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Not your turn'
    }));
    return;
  }

  // Create a temporary chess instance to validate the move
  const tempChess = new Chess(game.game.fen());
  
  try {
    // Attempt the move
    const move = tempChess.move({
      from: data.from,
      to: data.to,
      promotion: data.promotion || undefined
    });

    if (!move) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid move'
      }));
      return;
    }

    // If we get here, the move is valid - apply it to the actual game
    game.game.move({
      from: data.from,
      to: data.to,
      promotion: data.promotion || undefined
    });

    // Record the move in the database
    const { error: moveError } = await recordMove(
      data.gameId,
      data.from,
      data.to,
      data.playerFid || TEST_FID,
      data.promotion
    );

    if (moveError) {
      console.error('Error recording move:', moveError);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to record move'
      }));
      return;
    }

    // Update game state
    const status = game.game.isCheckmate() ? 'checkmate' :
                  game.game.isDraw() ? 'draw' : 'active';
    
    const { error: stateError } = await updateGameState(
      data.gameId,
      game.game.fen(),
      status
    );

    if (stateError) {
      console.error('Error updating game state:', stateError);
    }

    // Update the game's FEN
    game.fen = game.game.fen();
    console.log('New FEN after move:', game.fen);

    // Notify both players of the move
    game.players.forEach(player => {
      player.send(JSON.stringify({
        type: 'move_made',
        from: data.from,
        to: data.to,
        fen: game.fen,
        turn: game.game.turn(),
        isCheck: game.game.isCheck(),
        isCheckmate: game.game.isCheckmate(),
        isDraw: game.game.isDraw()
      }));
    });

    // Check if the game is over
    if (game.game.isGameOver()) {
      handleGameOver(game);
    }
  } catch (error) {
    console.error('Error making move:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Invalid move'
    }));
  }
}

async function resignGameHandler(ws, data) {
  const game = activeGames.get(data.gameId);
  if (!game) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Game not found'
    }));
    return;
  }

  const winner = game.players.find(player => player !== ws);
  if (winner) {
    winner.send(JSON.stringify({
      type: 'game_over',
      result: 'win',
      reason: 'opponent_resigned'
    }));
  }

  ws.send(JSON.stringify({
    type: 'game_over',
    result: 'loss',
    reason: 'resigned'
  }));

  // Update game status in database
  await updateGameState(data.gameId, game.game.fen(), 'resigned');
  activeGames.delete(data.gameId);
}

async function resetGameHandler(ws, data) {
  const game = activeGames.get(data.gameId);
  if (!game) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Game not found'
    }));
    return;
  }

  // Reset the chess game
  game.game = new Chess();
  game.fen = game.game.fen();

  // Update game state in database
  await updateGameState(data.gameId, game.game.fen(), 'active');

  // Notify both players of the reset
  game.players.forEach(player => {
    player.send(JSON.stringify({
      type: 'game_reset',
      gameId: game.id,
      fen: game.fen
    }));
  });
}

// HTTP endpoints for local testing
app.post('/api/test-auth', (req, res) => {
  res.json({
    fid: TEST_FID,
    username: TEST_USERNAME,
    isTest: true
  });
});

app.get('/api/games', async (req, res) => {
  try {
    // Clean up abandoned games before fetching available ones
    await cleanupAbandonedGames();
    
    // Use the imported function to get available games
    const { games, error } = await getAvailableGames();
    
    if (error) {
      throw new Error(error); // Throw the error to be caught by the catch block
    }

    res.json(games);
  } catch (error) {
    console.error('Error fetching games:', error);
    res.status(500).json({ error: 'Failed to fetch games' });
  }
});

// Run cleanup every minute
setInterval(async () => {
  // Use the imported function for cleanup
  const { deleted, error } = await cleanupAbandonedGames();
  if (error) {
    console.error('Error in scheduled cleanup:', error);
  } else if (deleted > 0) {
    console.log(`Cleaned up ${deleted} abandoned games`);
  }
}, 60 * 1000); // Run every minute

// Start the server
console.log('Starting server...'); 