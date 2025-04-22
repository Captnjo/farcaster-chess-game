import { WebSocketServer } from 'ws';
import { Chess } from 'chess.js';
import express from 'express';
import cors from 'cors';
import { createGame, joinGame, recordMove, updateGameState, getGame, getGameMoves, getAvailableGames, cleanupAbandonedGames } from './services/database.js';

const app = express();
app.use(cors());
app.use(express.json());

// In-memory game storage (for active games)
const activeGames = new Map();
const players = new Map();

// Local testing bypass
const TEST_FID = 123;
const TEST_USERNAME = 'test_user';

// Create HTTP server
const server = app.listen(8000, () => {
  console.log('Server running on port 8000');
});

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Handle WebSocket connections
wss.on('connection', (ws) => {
  console.log('New client connected');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleMessage(ws, data);
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    // Clean up player and game data
    for (const [gameId, game] of activeGames.entries()) {
      if (game.players.includes(ws)) {
        activeGames.delete(gameId);
      }
    }
  });
});

async function handleMessage(ws, data) {
  switch (data.type) {
    case 'create_game':
      await createGameHandler(ws, data);
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

async function createGameHandler(ws, data) {
  console.log('Received create game request:', data);
  const game = new Chess();
  console.log('Initial FEN:', game.fen());
  
  const { id, error } = await createGame(game.fen(), data.playerFid || TEST_FID);
  
  if (error) {
    console.error('Failed to create game in database:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to create game: ' + error
    }));
    return;
  }

  console.log('Game created with ID:', id);
  activeGames.set(id, {
    id,
    game,
    players: [ws],
    whitePlayer: ws,
    blackPlayer: null,
    status: 'waiting',
    fen: game.fen()
  });

  ws.send(JSON.stringify({
    type: 'game_created',
    gameId: id,
    color: 'white',
    fen: game.fen()
  }));
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

  // Validate that it's the correct player's turn
  const isWhiteTurn = game.game.turn() === 'w';
  const isCorrectPlayer = (isWhiteTurn && ws === game.whitePlayer) || 
                         (!isWhiteTurn && ws === game.blackPlayer);

  if (!isCorrectPlayer) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Not your turn'
    }));
    return;
  }

  try {
    // Log the current state before making the move
    console.log('Current FEN:', game.game.fen());
    console.log('Attempting move:', data);

    // Create a temporary copy of the game to test the move
    const tempGame = new Chess(game.game.fen());
    const tempMove = tempGame.move({
      from: data.from,
      to: data.to,
      promotion: data.promotion || 'q'
    });

    if (!tempMove) {
      console.log('Invalid move rejected by chess.js');
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid move'
      }));
      return;
    }

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

    // Make the move on the real game
    const move = game.game.move({
      from: data.from,
      to: data.to,
      promotion: data.promotion || 'q'
    });

    // Update the game state in the database
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

// Run cleanup every minute
setInterval(async () => {
  const { deleted, error } = await cleanupAbandonedGames();
  if (error) {
    console.error('Error in scheduled cleanup:', error);
  } else if (deleted > 0) {
    console.log(`Cleaned up ${deleted} abandoned games`);
  }
}, 60 * 1000); // Run every minute

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
    
    const { games, error } = await getAvailableGames();
    
    if (error) {
      throw error;
    }

    res.json(games);
  } catch (error) {
    console.error('Error fetching games:', error);
    res.status(500).json({ error: 'Failed to fetch games' });
  }
}); 