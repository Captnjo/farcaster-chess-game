'use client';

import React from 'react';
import { Chessboard } from 'react-chessboard';
import { Square } from 'chess.js';

interface ChessboardComponentProps {
  position: string; // FEN string for the board position
  onMove: (sourceSquare: Square, targetSquare: Square) => boolean; // Callback when a move is attempted
  boardOrientation?: 'white' | 'black';
  // Add other props like custom pieces, etc. if needed
}

const ChessboardComponent: React.FC<ChessboardComponentProps> = ({ position, onMove, boardOrientation = 'white' }) => {

  // The onDrop function now simply calls the onMove prop passed from the parent
  function handlePieceDrop(sourceSquare: Square, targetSquare: Square, piece: string): boolean {
    // The 'piece' argument is provided by react-chessboard but not needed for chess.js move validation
    // The parent component (page.tsx) handles the move logic
    return onMove(sourceSquare, targetSquare);
  }

  return (
    <div className="w-full max-w-[600px] mx-auto">
      <Chessboard
        position={position}
        onPieceDrop={handlePieceDrop}
        boardOrientation={boardOrientation}
        customBoardStyle={{
          borderRadius: '4px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
        }}
        customDarkSquareStyle={{ backgroundColor: '#779556' }}
        customLightSquareStyle={{ backgroundColor: '#ebecd0' }}
      />
    </div>
  );
};

export default ChessboardComponent;