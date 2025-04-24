import { Chess, Move, Square } from 'chess.js';

/**
 * Service for validating chess moves on the frontend
 */
export class ChessValidationService {
  private game: Chess;

  constructor(fen: string) {
    this.game = new Chess(fen);
  }

  /**
   * Validates if a move is legal
   * @param from - Starting square (e.g., 'e2')
   * @param to - Target square (e.g., 'e4')
   * @param promotion - Optional promotion piece (e.g., 'q' for queen)
   * @returns Object containing validation result and error message if invalid
   */
  validateMove(from: string, to: string, promotion?: string): { isValid: boolean; message?: string } {
    // Create a temporary copy of the game to test the move
    const tempGame = new Chess(this.game.fen());
    
    try {
      // Attempt the move
      const move = tempGame.move({
        from,
        to,
        promotion: promotion || undefined
      });

      if (!move) {
        return { isValid: false, message: 'Invalid move' };
      }

      // If the move is valid, check if it puts the opponent in check
      if (tempGame.isCheck()) {
        // This is a valid move that puts the opponent in check - this is allowed!
        return { isValid: true };
      }

      // Move is valid and doesn't put anyone in check
      return { isValid: true };
    } catch (error) {
      console.error('Error validating move:', error);
      return { isValid: false, message: 'Invalid move' };
    }
  }

  /**
   * Gets all legal moves for a given square
   * @param square - The square to check (e.g., 'e2')
   * @returns Array of legal target squares
   */
  getLegalMoves(square: string): string[] {
    const moves = this.game.moves({ square: square as Square, verbose: true }) as Move[];
    return moves.map(move => move.to);
  }

  /**
   * Updates the internal board state
   * @param fen - The new FEN string
   */
  updateBoardState(fen: string): void {
    this.game.load(fen);
  }

  /**
   * Gets the current FEN string
   */
  getFen(): string {
    return this.game.fen();
  }
} 