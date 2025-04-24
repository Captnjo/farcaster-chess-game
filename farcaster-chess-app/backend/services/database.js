import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ziarjloovewbwlqapzmw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppYXJqbG9vdmV3YndscWFwem13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUzMzQxNzgsImV4cCI6MjA2MDkxMDE3OH0.6vYQm3yO8ABmc5epQrBD-l0_Dm9KakliGvqAAvfzbvk';

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Creates a new game record in the database.
 * Assumes gameData contains necessary fields like id, fen, white_player_fid, black_player_fid, status, mode etc.
 * @param {object} gameData - The complete game object to insert.
 * @returns {Promise<{id: string, error: string|null}>} The game ID and any error.
 */
export async function createGame(gameData) {
  console.log('Creating game record in DB:', gameData);
  
  // Ensure essential fields are present
  const { id, fen, white_player_fid, black_player_fid, status, mode, timeControls, created_at, updated_at } = gameData;
  if (!id || !fen || !white_player_fid || !black_player_fid || !status || !mode) {
    console.error('Missing essential fields for DB game creation:', gameData);
    return { id: null, error: 'Missing essential fields for game creation.' };
  }

  try {
    // Use upsert to handle potential race conditions or retries if needed,
    // although insert should be fine if ID generation is reliable.
    const { data, error } = await supabase
      .from('games')
      .insert([
        {
          id, 
          fen,
          white_player_fid,
          black_player_fid,
          status, 
          created_at: created_at || new Date().toISOString(),
          updated_at: updated_at || new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Supabase error creating game record:', error);
      return { id: null, error: error.message };
    }

    console.log('Game record created successfully in DB:', data);
    // Return the ID from the inserted data to be sure
    return { id: data.id, error: null }; 
  } catch (error) {
    console.error('Unexpected error creating game record:', error);
    return { id: null, error: error.message };
  }
}

/**
 * Joins an existing game
 * @param {string} gameId - The game ID
 * @param {string} blackPlayerFid - The Farcaster ID of the black player
 * @returns {Promise<{error: string|null}>} Any error that occurred
 */
export async function joinGame(gameId, blackPlayerFid) {
  const { error } = await supabase
    .from('games')
    .update({
      black_player_fid: blackPlayerFid,
      status: 'active'
    })
    .eq('id', gameId);

  if (error) {
    console.error('Error joining game:', error);
    return { error: error.message };
  }

  return { error: null };
}

/**
 * Records a move in the database
 * @param {string} gameId - The game ID
 * @param {string} from - The starting square
 * @param {string} to - The target square
 * @param {string} playerFid - The Farcaster ID of the player making the move
 * @param {string} promotion - Optional promotion piece
 * @returns {Promise<{error: string|null}>} Any error that occurred
 */
export async function recordMove(gameId, from, to, playerFid, promotion = null) {
  const { error } = await supabase
    .from('moves')
    .insert([
      {
        game_id: gameId,
        from_square: from,
        to_square: to,
        player_fid: playerFid,
        promotion
      }
    ]);

  if (error) {
    console.error('Error recording move:', error);
    return { error: error.message };
  }

  return { error: null };
}

/**
 * Updates the game state (FEN and status)
 * @param {string} gameId - The game ID
 * @param {string} fen - The new FEN string
 * @param {string} status - The new game status
 * @returns {Promise<{error: string|null}>} Any error that occurred
 */
export async function updateGameState(gameId, fen, status) {
  const { error } = await supabase
    .from('games')
    .update({
      fen,
      status
    })
    .eq('id', gameId);

  if (error) {
    console.error('Error updating game state:', error);
    return { error: error.message };
  }

  return { error: null };
}

/**
 * Gets a game by ID
 * @param {string} gameId - The game ID
 * @returns {Promise<{game: object|null, error: string|null}>} The game data and any error
 */
export async function getGame(gameId) {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();

  if (error) {
    console.error('Error getting game:', error);
    return { game: null, error: error.message };
  }

  return { game: data, error: null };
}

/**
 * Gets all moves for a game
 * @param {string} gameId - The game ID
 * @returns {Promise<{moves: array, error: string|null}>} The moves and any error
 */
export async function getGameMoves(gameId) {
  const { data, error } = await supabase
    .from('moves')
    .select('*')
    .eq('game_id', gameId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error getting game moves:', error);
    return { moves: [], error: error.message };
  }

  return { moves: data, error: null };
}

/**
 * Gets all available games (waiting for players)
 * @returns {Promise<{games: array, error: string|null}>} The games and any error
 */
export async function getAvailableGames() {
  const tenMinutesAgo = new Date();
  tenMinutesAgo.setMinutes(tenMinutesAgo.getMinutes() - 10);

  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('status', 'waiting')
    .gte('created_at', tenMinutesAgo.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error getting available games:', error);
    return { games: [], error: error.message };
  }

  return { games: data, error: null };
}

/**
 * Cleans up abandoned games (waiting games older than 10 minutes)
 * @returns {Promise<{deleted: number, error: string|null}>} Number of deleted games and any error
 */
export async function cleanupAbandonedGames() {
  const tenMinutesAgo = new Date();
  tenMinutesAgo.setMinutes(tenMinutesAgo.getMinutes() - 10);

  const { data, error } = await supabase
    .from('games')
    .delete()
    .eq('status', 'waiting')
    .lt('created_at', tenMinutesAgo.toISOString());

  if (error) {
    console.error('Error cleaning up abandoned games:', error);
    return { deleted: 0, error: error.message };
  }

  return { deleted: data?.length || 0, error: null };
} 