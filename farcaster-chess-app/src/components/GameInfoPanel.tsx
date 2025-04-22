'use client';

import React from 'react';
import { Chess, PieceSymbol, Color } from 'chess.js';

interface GameInfoPanelProps {
  game: Chess;
  playerColor?: 'white' | 'black' | null;
}

const pieceUnicode: { [key in PieceSymbol]: string } = {
  p: '♙', // White Pawn
  n: '♘', // White Knight
  b: '♗', // White Bishop
  r: '♖', // White Rook
  q: '♕', // White Queen
  k: '♔', // White King
};

const blackPieceUnicode: { [key in PieceSymbol]: string } = {
  p: '♟', // Black Pawn
  n: '♞', // Black Knight
  b: '♝', // Black Bishop
  r: '♜', // Black Rook
  q: '♛', // Black Queen
  k: '♚', // Black King
};

const GameInfoPanel: React.FC<GameInfoPanelProps> = ({ game, playerColor }) => {

  // Function to calculate captured pieces
  const calculateCapturedPieces = () => {
    const initialPieces: { [key in PieceSymbol]: number } = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
    const currentPieces: { w: { [key in PieceSymbol]: number }, b: { [key in PieceSymbol]: number } } = {
      w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
      b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    };

    // Count current pieces on the board
    game.board().forEach(row => {
      row.forEach(square => {
        if (square) {
          currentPieces[square.color][square.type]++;
        }
      });
    });

    const capturedByWhite: { piece: PieceSymbol; color: Color }[] = [];
    const capturedByBlack: { piece: PieceSymbol; color: Color }[] = [];

    // Calculate captured black pieces (captured by white)
    for (const pieceType in initialPieces) {
      const p = pieceType as PieceSymbol;
      const diff = initialPieces[p] - currentPieces.b[p];
      if (diff > 0) {
        for (let i = 0; i < diff; i++) {
          capturedByWhite.push({ piece: p, color: 'b' });
        }
      }
    }

    // Calculate captured white pieces (captured by black)
    for (const pieceType in initialPieces) {
      const p = pieceType as PieceSymbol;
      const diff = initialPieces[p] - currentPieces.w[p];
      if (diff > 0) {
        for (let i = 0; i < diff; i++) {
          capturedByBlack.push({ piece: p, color: 'w' });
        }
      }
    }

    // Sort captured pieces for consistent display (optional)
    const pieceOrder: PieceSymbol[] = ['q', 'r', 'b', 'n', 'p'];
    capturedByWhite.sort((a, b) => pieceOrder.indexOf(a.piece) - pieceOrder.indexOf(b.piece));
    capturedByBlack.sort((a, b) => pieceOrder.indexOf(a.piece) - pieceOrder.indexOf(b.piece));


    return { capturedByWhite, capturedByBlack };
  };

  const { capturedByWhite, capturedByBlack } = calculateCapturedPieces();
  const isPlayerTurn = (game.turn() === 'w' && playerColor === 'white') || 
                      (game.turn() === 'b' && playerColor === 'black');

  return (
    <div className="p-3 sm:p-4 border border-gray-300 rounded-lg bg-gray-50 w-full max-w-[600px] mx-auto text-gray-800">
      <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4 text-black">Game Info</h2>

      <div className="mb-3 sm:mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-base sm:text-lg font-medium text-gray-900">You are</h3>
          <span className={`text-base sm:text-lg font-medium ${isPlayerTurn ? 'text-green-600' : 'text-gray-600'}`}>
            {playerColor === 'white' ? '⚪' : '⚫'}
            {isPlayerTurn && ' (Your turn)'}
          </span>
        </div>
      </div>

      <div className="mb-3 sm:mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-base sm:text-lg font-medium text-gray-900">⚪ Captured</h3>
          <div className="flex flex-wrap gap-1 text-lg sm:text-xl text-black">
            {capturedByWhite.map((p, index) => (
              <span key={index} title={`${p.color === 'w' ? 'White' : 'Black'} ${p.piece}`}>
                {blackPieceUnicode[p.piece]}
              </span>
            ))}
            {capturedByWhite.length === 0 && <span className="text-sm text-gray-600">None</span>}
          </div>
        </div>
      </div>

      <div className="mb-3 sm:mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-base sm:text-lg font-medium text-gray-900">⚫ Captured</h3>
          <div className="flex flex-wrap gap-1 text-lg sm:text-xl text-black">
            {capturedByBlack.map((p, index) => (
              <span key={index} title={`${p.color === 'w' ? 'White' : 'Black'} ${p.piece}`}>
                {pieceUnicode[p.piece]}
              </span>
            ))}
            {capturedByBlack.length === 0 && <span className="text-sm text-gray-600">None</span>}
          </div>
        </div>
      </div>

      <div className="border-t border-gray-300 pt-3 sm:pt-4">
        <h3 className="text-base sm:text-lg font-medium mb-1 sm:mb-2 text-gray-900">Status</h3>
        {game.isCheckmate() && <p className="text-red-700 font-bold text-sm sm:text-base">Checkmate! {game.turn() === 'b' ? 'White wins.' : 'Black wins.'}</p>}
        {game.isStalemate() && <p className="text-yellow-700 font-bold text-sm sm:text-base">Stalemate!</p>}
        {game.isDraw() && <p className="text-gray-700 font-bold text-sm sm:text-base">Draw!</p>}
        {game.isCheck() && !game.isCheckmate() && <p className="text-orange-600 font-bold text-sm sm:text-base">Check!</p>}
        {!game.isGameOver() && !game.isCheck() && <p className="text-gray-600 text-sm sm:text-base">In progress...</p>}
      </div>
    </div>
  );
};

export default GameInfoPanel;