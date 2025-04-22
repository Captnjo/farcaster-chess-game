# Farcaster Chess Game

A multiplayer chess game built for the Farcaster social network. Players can create games, join existing games, and play chess in real-time with other Farcaster users.

## Features

- Real-time multiplayer chess using WebSocket
- Farcaster authentication
- Live game state updates
- Move validation
- Captured pieces display
- Game status indicators
- Support for all standard chess rules

## Tech Stack

- Frontend: Next.js, TypeScript, TailwindCSS, React Chess
- Backend: Node.js, Express, WebSocket
- Game Logic: chess.js

## Setup

1. Clone the repository:
```bash
git clone git@github.com:Captnjo/farcaster-chess-game.git
cd farcaster-chess-app
```

2. Install dependencies:
```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
npm install
```

3. Start the development servers:

In one terminal:
```bash
# Start the backend server
cd backend
npm run dev
```

In another terminal:
```bash
# Start the frontend server
npm run dev
```

4. Open http://localhost:3000 in your browser

## Development

- Frontend runs on port 3000
- Backend WebSocket server runs on port 8000
- Backend REST API runs on port 8000

## License

MIT 