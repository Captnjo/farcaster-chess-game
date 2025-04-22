import { Chess, Move, Square } from 'chess.js';

/**
 * Service for validating chess moves on the frontend
 */
export class ChessValidationService {
  private chess: Chess;

  constructor(fen?: string) {
    this.chess = new Chess(fen);
  }

  /**
   * Validates if a move is legal
   * @param from - Starting square (e.g., 'e2')
   * @param to - Target square (e.g., 'e4')
   * @param promotion - Optional promotion piece (e.g., 'q' for queen)
   * @returns Object containing validation result and error message if invalid
   */
  validateMove(from: string, to: string, promotion?: string): { isValid: boolean; error?: string } {
    try {
      // Create a temporary copy of the game to test the move
      const tempChess = new Chess(this.chess.fen());
      
      // Try to make the move on the temporary board
      const move = tempChess.move({
        from: from as Square,
        to: to as Square,
        promotion: promotion as 'q' | 'r' | 'b' | 'n' | undefined
      });

      if (!move) {
        return {
          isValid: false,
          error: 'Invalid move'
        };
      }

      // If we get here, the move is valid
      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: 'Invalid move'
      };
    }
  }

  /**
   * Gets all legal moves for a given square
   * @param square - The square to check (e.g., 'e2')
   * @returns Array of legal target squares
   */
  getLegalMoves(square: string): string[] {
    const moves = this.chess.moves({ square: square as Square, verbose: true }) as Move[];
    return moves.map(move => move.to);
  }

  /**
   * Updates the internal board state
   * @param fen - The new FEN string
   */
  updateBoardState(fen: string): void {
    this.chess.load(fen);
  }

  /**
   * Gets the current FEN string
   */
  getFen(): string {
    return this.chess.fen();
  }
} 