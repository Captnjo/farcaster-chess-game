import { WebSocketServer } from 'ws';
import { Chess } from 'chess.js';
import express from 'express';
import cors from 'cors';
import { createGame, joinGame, recordMove, updateGameState, getGame, getGameMoves } from './services/database.js';
import { v4 as uuidv4 } from 'uuid';
import pkg from 'chess-ai';
const { play: aiPlay } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

// In-memory game storage (for active games)
const activeGames = new Map();
const pendingChallenges = new Map(); // New map for challenges
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
        const game = activeGames.get(gameId);
        if (game) {
          // Notify opponent if it's not an AI game
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
          activeGames.delete(gameId); // Remove from active games
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
      if (!['ai', 'specific'].includes(data.opponentType)) {
        ws.send(JSON.stringify({ type: 'error', message: `Invalid opponent type: ${data.opponentType}` }));
        return;
      }
      await handleCreateGame(ws, data);
      break;
    case 'join_challenge':
      await handleJoinChallenge(ws, data);
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
async function handleCreateGame(ws, data) {
  console.log('Received create game/challenge request:', data);
  const { mode, opponentType, timeControls, preferredColor } = data;
  
  const creatorId = ws.playerId;
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
    difficulty: opponentType === 'ai' ? (data.difficulty || 'medium') : null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Handle different opponent types
  if (opponentType === 'ai') {
    console.log(`Creating AI game for player ${creatorId}`);
    game.status = 'in_progress';
    game.game = new Chess(game.fen);
    
    if ((preferredColor || 'white') === 'black') {
      game.white_player_fid = 'ai';
      game.black_player_fid = creatorId;
    } else {
      game.white_player_fid = creatorId;
      game.black_player_fid = 'ai';
    }
    
    // Create game in DB for AI game
    console.log(`Attempting to create game record in DB for AI game ${gameId}`);
    const { id: dbGameId, error: dbError } = await createGame(game);
    if (dbError) {
      console.error(`Failed to create AI game ${gameId} in database:`, dbError);
      ws.send(JSON.stringify({ type: 'error', message: 'Failed to create AI game in database.' }));
      return; // Stop if DB fails
    }
    console.log(`Successfully created AI game record in DB with ID: ${dbGameId}`);

    activeGames.set(gameId, game);
    notifyGameStarted(game);

    // Add to playerGames if needed
    if (!playerGames.has(creatorId)) playerGames.set(creatorId, new Set());
    playerGames.get(creatorId).add(gameId);

  } else if (opponentType === 'specific') {
    console.log(`Player ${creatorId} creating challenge link ${gameId}.`);
    const challenge = {
      id: gameId,
      creator_fid: creatorId,
      status: 'challenge_pending', 
      mode, 
      timeControls,
      join_permission: 'any_fid',
      created_at: new Date().toISOString(),
    };

    // Store the challenge
    pendingChallenges.set(gameId, challenge);
    
    // Store challenge reference for the creator
    if (!playerGames.has(creatorId)) playerGames.set(creatorId, new Set());
    playerGames.get(creatorId).add(gameId);

    // Generate join link (adjust URL if needed)
    const joinLink = `http://localhost:3002/join/${gameId}`;

    // Notify the creator
    ws.send(JSON.stringify({
      type: 'challenge_created', 
      gameId: challenge.id, 
      challenge,
      joinLink
    }));
    
    // Set a timeout for the challenge? (e.g., 1 hour)
    setTimeout(() => {
      if (pendingChallenges.has(gameId)) {
        console.log(`Challenge ${gameId} expired.`);
        pendingChallenges.delete(gameId);
        // Notify creator? 
      }
    }, 60 * 60 * 1000); // 1 hour timeout

  } else {
    console.error('Invalid opponent type for creation:', opponentType);
    ws.send(JSON.stringify({
      type: 'error',
      message: `Opponent type '${opponentType}' is not supported.`
    }));
    return;
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

async function handleJoinChallenge(ws, data) {
  console.log(`Received join_challenge request:`, data);
  const { gameId } = data;
  const joinerId = ws.playerId;

  if (!gameId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing gameId for join challenge.'}));
    return;
  }

  const challenge = pendingChallenges.get(gameId);
  if (!challenge) {
    ws.send(JSON.stringify({ type: 'error', message: 'Challenge not found or expired.'}));
    return;
  }

  if (challenge.creator_fid === joinerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Cannot join your own challenge.'}));
    return;
  }
  
  console.log(`Player ${joinerId} joining challenge ${gameId} created by ${challenge.creator_fid}`);
  
  const initialFEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const now = new Date().toISOString();
  const game = {
    id: challenge.id,
    fen: initialFEN,
    status: 'in_progress', 
    white_player_fid: null,
    black_player_fid: null,
    mode: challenge.mode,
    timeControls: challenge.timeControls,
    difficulty: null,
    created_at: challenge.created_at,
    updated_at: now,
  };

  if (Math.random() < 0.5) {
    game.white_player_fid = challenge.creator_fid;
    game.black_player_fid = joinerId;
  } else {
    game.white_player_fid = joinerId;
    game.black_player_fid = challenge.creator_fid;
  }

  const { error: dbError } = await createGame(game);
  if (dbError) {
    console.error(`Failed to create game ${game.id} in database from challenge:`, dbError);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to start game in database.' }));
    return; 
  }
  
  game.game = new Chess(game.fen);
  activeGames.set(game.id, game);
  if (!playerGames.has(joinerId)) playerGames.set(joinerId, new Set());
  playerGames.get(joinerId).add(game.id);
  pendingChallenges.delete(challenge.id);
  notifyGameStarted(game);
}

async function makeMoveHandler(ws, data) {
  const game = activeGames.get(data.gameId);
  if (!game || !game.game) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Game not found or not initialized'
    }));
    return;
  }

  const humanPlayerId = ws.playerId;
  const humanColor = game.white_player_fid === humanPlayerId ? 'w' : 'b';

  // Verify it's the player's turn
  if (game.game.turn() !== humanColor) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Not your turn'
    }));
    return;
  }

  // Validate the move using a temporary instance (optional but good practice)
  const tempChess = new Chess(game.fen);
  const humanMove = tempChess.move({
    from: data.from,
    to: data.to,
    promotion: data.promotion || undefined
  });

  if (!humanMove) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Invalid move'
    }));
    return;
  }

  // Apply the valid move to the actual game instance
  game.game.move({ from: data.from, to: data.to, promotion: data.promotion || undefined });
  game.fen = game.game.fen(); // Update in-memory FEN
  game.updated_at = new Date().toISOString();

  try {
    // Log parameters before calling recordMove
    const playerIdString = String(humanPlayerId); // Convert number to string
    console.log(`Attempting to record move: gameId=${game.id}, from=${data.from}, to=${data.to}, playerId=${playerIdString}, promotion=${data.promotion}`);
    
    // Record human move in DB - Pass the string version of the ID
    const { error: moveError } = await recordMove(
      game.id,
      data.from,
      data.to,
      playerIdString, // Pass the string version
      data.promotion
    );
    if (moveError) {
      console.error(`Error recording human move for game ${game.id}:`, moveError); // Log the specific DB error
      ws.send(JSON.stringify({ type: 'error', message: 'Failed to record move' }));
      return; // Stop processing if DB fails
    }

    // Update game state in DB
    const status = game.game.isCheckmate() ? 'checkmate' :
                  game.game.isDraw() ? 'draw' : 'in_progress';
    console.log(`Updating game state in DB for game ${game.id}, Status: ${status}`);
    const { error: stateError } = await updateGameState(
      game.id,
      game.game.fen(),
      status
    );

    if (stateError) {
      console.error(`Error updating game state after human move for game ${game.id}:`, stateError);
      // Continue anyway? The game state is updated in memory.
    }

    // Broadcast the human move to the opponent (if human)
    broadcastMove(game, {
      from: data.from,
      to: data.to,
      promotion: data.promotion
    });

    // Check if game is over AFTER human move
    if (game.game.isGameOver()) {
      await handleGameOver(game);
      return; // Stop if game ended
    }

    // --- Trigger AI move if applicable ---
    const isAiGame = game.white_player_fid === 'ai' || game.black_player_fid === 'ai';
    const aiColor = game.white_player_fid === 'ai' ? 'w' : 'b';
    const isAiTurn = isAiGame && game.game.turn() === aiColor;

    if (isAiTurn) {
      // Trigger AI move asynchronously (don't block the handler)
      // Use setImmediate or similar to avoid blocking
      setImmediate(async () => {
        await triggerAiMove(game);
      });
      // triggerAiMove(game); // Could potentially block if AI calculation is long
    }
  } catch (error) {
    console.error(`Error during AI move calculation/execution for game ${game.id}:`, error);
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
  if (!game || !game.game) { // Also check game.game exists before reset
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Game not found or not initialized'
    }));
    return;
  }

  console.log(`Resetting game ${game.id}`);

  // Reset the chess game instance
  game.game.reset(); // Use the reset method of chess.js instance
  game.fen = game.game.fen();
  game.updated_at = new Date().toISOString(); // Update timestamp
  game.status = 'in_progress'; // Reset status to in_progress

  // Update game state in database
  // Use status: 'in_progress' or maybe 'active' if preferred
  const { error } = await updateGameState(game.id, game.fen, 'in_progress'); 
  if (error) {
      console.error(`Error updating game state after reset for game ${game.id}:`, error);
      // Should we notify? For now, just log.
  }

  // Notify both players of the reset
  const resetMessage = JSON.stringify({
    type: 'game_reset',
    gameId: game.id,
    fen: game.fen // Send the new initial FEN
  });

  // Find and notify white player (if human)
  if (game.white_player_fid !== 'ai') {
      const whiteConnections = playerConnections.get(game.white_player_fid);
      if (whiteConnections) {
          whiteConnections.forEach(conn => conn.send(resetMessage));
      }
  }
  // Find and notify black player (if human)
  if (game.black_player_fid !== 'ai') {
      const blackConnections = playerConnections.get(game.black_player_fid);
      if (blackConnections) {
          blackConnections.forEach(conn => conn.send(resetMessage));
      }
  }
  console.log(`Sent game_reset notification for game ${game.id}`);
}

// Helper to broadcast move to relevant player(s)
function broadcastMove(game, moveData) {
  const { from, to, promotion, fen } = moveData;
  console.log(`Broadcasting move for game ${game.id}: ${from}-${to}`);

  const message = JSON.stringify({
    type: 'move_made',
    gameId: game.id,
    from,
    to,
    promotion,
    fen: game.fen, // Use the game object's current FEN
    turn: game.game.turn(),
    isCheck: game.game.isCheck(),
    isCheckmate: game.game.isCheckmate(),
    isDraw: game.game.isDraw()
  });

  // Send to White Player (if not AI)
  if (game.white_player_fid !== 'ai') {
    const whiteConnections = playerConnections.get(game.white_player_fid);
    if (whiteConnections) {
      whiteConnections.forEach(ws => ws.send(message));
    }
  }
  // Send to Black Player (if not AI)
  if (game.black_player_fid !== 'ai') {
    const blackConnections = playerConnections.get(game.black_player_fid);
    if (blackConnections) {
      blackConnections.forEach(ws => ws.send(message));
    }
  }
}

// Helper to handle game over state
async function handleGameOver(game) {
  console.log(`Game ${game.id} is over.`);
  const result = game.game.isCheckmate() ? 'checkmate' : game.game.isDraw() ? 'draw' : 'unknown'; // Add other draw types if needed
  const winner = result === 'checkmate' ? (game.game.turn() === 'b' ? 'white' : 'black') : null;

  // Update DB status
  await updateGameState(game.id, game.fen, result);

  const gameOverMessage = JSON.stringify({
    type: 'game_over',
    gameId: game.id,
    result,
    winner
  });

  // Notify players
  if (game.white_player_fid !== 'ai') {
    const whiteConnections = playerConnections.get(game.white_player_fid);
    if (whiteConnections) whiteConnections.forEach(ws => ws.send(gameOverMessage));
  }
  if (game.black_player_fid !== 'ai') {
    const blackConnections = playerConnections.get(game.black_player_fid);
    if (blackConnections) blackConnections.forEach(ws => ws.send(gameOverMessage));
  }

  // Remove game from active memory
  activeGames.delete(game.id);
  // Clean up playerGames references? (Optional)
}

// Function to trigger AI move calculation and execution
async function triggerAiMove(game) {
  if (!game || !game.game) {
    console.error(`Cannot trigger AI move for game ${game.id}: game object or chess instance missing.`);
    return;
  }

  const aiPlayerId = 'ai'; // Assuming AI is always identified as 'ai'
  const aiColor = game.white_player_fid === aiPlayerId ? 'w' : 'b';

  if (game.game.turn() !== aiColor) {
    console.error(`Triggered AI move for game ${game.id}, but it's not AI's turn (${game.game.turn()})`);
    return;
  }

  console.log(`Triggering AI move for game ${game.id} (Difficulty: ${game.difficulty})`);
  // Map difficulty to depth (adjust as needed)
  let depth = 3; // Default medium
  if (game.difficulty === 'easy') depth = 1;
  else if (game.difficulty === 'hard') depth = 5;

  try {
    // Call the correctly imported and aliased function
    const aiMoveData = aiPlay(game.fen, { depth }); 
    if (!aiMoveData || !aiMoveData.from || !aiMoveData.to) {
      console.error(`AI failed to produce a valid move for game ${game.id}. FEN: ${game.fen}`);
      return;
    }

    console.log(`AI Move for game ${game.id}: ${aiMoveData.from}-${aiMoveData.to}`);

    const moveResult = game.game.move({
      from: aiMoveData.from,
      to: aiMoveData.to,
      promotion: aiMoveData.promotion || undefined 
    });

    if (!moveResult) {
      console.error(`AI for game ${game.id} suggested an invalid move: ${aiMoveData.from}-${aiMoveData.to}. FEN: ${game.fen}`);
      return;
    }

    game.fen = game.game.fen();
    game.updated_at = new Date().toISOString();

    console.log(`Recording AI move ${aiMoveData.from}-${aiMoveData.to} for game ${game.id} in DB`);
    await recordMove(game.id, aiMoveData.from, aiMoveData.to, 'ai', aiMoveData.promotion);

    const status = game.game.isCheckmate() ? 'checkmate' : game.game.isDraw() ? 'draw' : 'in_progress'; 
    console.log(`Updating game state in DB for game ${game.id}, Status: ${status}`);
    await updateGameState(game.id, game.fen, status);

    broadcastMove(game, { 
      from: aiMoveData.from, 
      to: aiMoveData.to, 
      promotion: aiMoveData.promotion 
    });

    if (game.game.isGameOver()) {
      await handleGameOver(game);
    }
  } catch (error) {
    console.error(`Error during AI move calculation/execution for game ${game.id}:`, error);
  }
}

// Start the server
console.log('Starting server...'); 