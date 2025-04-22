# Farcaster Chess Game

A real-time multiplayer chess game built for the Farcaster social network. Players can create and join games, make moves, and play against each other in real-time.

## Features

- Real-time multiplayer gameplay using WebSocket
- Move validation using chess.js
- Game state persistence using Supabase
- Clean and responsive UI
- Automatic cleanup of abandoned games

## Tech Stack

- Frontend: Next.js, React, TypeScript
- Backend: Node.js, Express, WebSocket
- Database: Supabase
- Chess Engine: chess.js
- UI: Tailwind CSS

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Supabase account (for database)

### Installation

1. Clone the repository:
```bash
git clone git@github.com:Captnjo/farcaster-chess-game.git
cd farcaster-chess-game
```

2. Install dependencies:
```bash
# Install frontend dependencies
cd farcaster-chess-app
npm install

# Install backend dependencies
cd backend
npm install
```

3. Set up environment variables:
Create a `.env.local` file in the `farcaster-chess-app` directory with your Supabase credentials:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Running the Application

1. Start the backend server:
```bash
cd backend
node server.js
```

2. Start the frontend development server:
```bash
cd farcaster-chess-app
npm run dev
```

The application will be available at:
- Frontend: http://localhost:3002
- Backend: http://localhost:8000

## Game Flow

1. Create a new game or join an existing one
2. Wait for an opponent to join
3. Make moves in real-time
4. The game ends when checkmate is achieved or a player resigns

## Development

### Testing

To test the application locally:
1. Open http://localhost:3002?test=true in your browser
2. Open another window with the same URL
3. Create a game in one window and join from the other

### Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m "Add amazing feature"`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
