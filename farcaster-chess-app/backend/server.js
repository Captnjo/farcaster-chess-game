import { WebSocketServer } from 'ws';
import { Chess } from 'chess.js';
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// In-memory game storage (replace with database in production)
const games = new Map();
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
    for (const [gameId, game] of games.entries()) {
      if (game.players.includes(ws)) {
        games.delete(gameId);
      }
    }
  });
});

function handleMessage(ws, data) {
  switch (data.type) {
    case 'create_game':
      createGame(ws, data);
      break;
    case 'join_game':
      joinGame(ws, data);
      break;
    case 'make_move':
      makeMove(ws, data);
      break;
    case 'resign':
      resignGame(ws, data);
      break;
    case 'reset_game':
      resetGame(ws, data);
      break;
    default:
      console.log('Unknown message type:', data.type);
  }
}

function createGame(ws, data) {
  const gameId = generateGameId();
  const game = new Chess();
  
  games.set(gameId, {
    id: gameId,
    game,
    players: [ws],
    whitePlayer: ws,
    blackPlayer: null,
    status: 'waiting',
    fen: game.fen()
  });

  ws.send(JSON.stringify({
    type: 'game_created',
    gameId,
    color: 'white',
    fen: game.fen()  // Send initial FEN
  }));
}

function joinGame(ws, data) {
  const game = games.get(data.gameId);
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

function makeMove(ws, data) {
  const game = games.get(data.gameId);
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
    // Check if the king is in check before the move
    const isInCheck = game.game.isCheck();

    // Log the current state before making the move
    console.log('Current FEN:', game.game.fen());
    console.log('Attempting move:', data);

    const move = game.game.move({
      from: data.from,
      to: data.to,
      promotion: data.promotion || 'q'
    });

    if (!move) {
      console.log('Invalid move rejected by chess.js');
      // If we were in check before attempting the move, show the check-specific message
      ws.send(JSON.stringify({
        type: 'error',
        message: isInCheck ? 'Must address check first' : 'Invalid move'
      }));
      return;
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

function resignGame(ws, data) {
  const game = games.get(data.gameId);
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

  games.delete(data.gameId);
}

function resetGame(ws, data) {
  const game = games.get(data.gameId);
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

  // Notify both players of the reset
  game.players.forEach(player => {
    player.send(JSON.stringify({
      type: 'game_reset',
      gameId: game.id,
      fen: game.fen
    }));
  });
}

function generateGameId() {
  return Math.random().toString(36).substring(2, 8);
}

// HTTP endpoints for local testing
app.post('/api/test-auth', (req, res) => {
  res.json({
    fid: TEST_FID,
    username: TEST_USERNAME,
    isTest: true
  });
});

app.get('/api/games', (req, res) => {
  const gameList = Array.from(games.values()).map(game => ({
    id: game.id,
    status: game.status,
    players: game.players.length
  }));
  res.json(gameList);
}); 