import { supabase } from '../lib/supabase';
import type { Move, Power, PublicState, Side, Square } from '../game/engine';

export type MultiplayerPrivateState = {
  state: PublicState;
  legalMoves: Record<string, Square[]>;
  status: 'waiting' | 'active' | 'finished' | 'abandoned';
  winner?: Side;
  reason?: string;
  inCheck?: boolean;
  checkSquare?: Square;
};
export type MultiplayerSession = MultiplayerPrivateState & { gameId: string; joinCode: string; token: string; side: Side; stateVersion: number };

async function invoke(body: Record<string, unknown>) {
  const result = await supabase.functions.invoke('multiplayer', { body });
  if (result.error) {
    let message = result.error.message;
    const context = (result.error as { context?: unknown }).context;
    if (context && typeof context === 'object' && 'clone' in context && typeof context.clone === 'function') {
      try {
        const payload = await (context as Response).clone().json() as { error?: string };
        if (payload.error) message = payload.error;
      } catch {
        // Keep Supabase's original error when the response is unavailable or not JSON.
      }
    }
    throw new Error(message);
  }
  const data = result.data as { error?: string };
  if (data.error) throw new Error(data.error);
  return result.data as MultiplayerSession;
}

export const createMultiplayerGame = () => invoke({ action: 'create' });
export const joinMultiplayerGame = (joinCode: string) => invoke({ action: 'join', joinCode });
export const syncMultiplayerGame = (session: Pick<MultiplayerSession, 'gameId' | 'token'>) => invoke({ action: 'state', gameId: session.gameId, token: session.token });
export const submitMultiplayerMove = (session: Pick<MultiplayerSession, 'gameId' | 'token' | 'stateVersion'>, move: Move) => invoke({ action: 'move', gameId: session.gameId, token: session.token, expectedVersion: session.stateVersion, move });
export const disconnectMultiplayerGame = (session: Pick<MultiplayerSession, 'gameId' | 'token'>) => invoke({ action: 'disconnect', gameId: session.gameId, token: session.token });

export function publicPiecesWithOwnPowers(state: PublicState, ownPowers: Record<string, Power>) {
  return state.pieces.map(piece => piece.side === 'white' || piece.side === 'black' ? { ...piece, power: ownPowers[piece.id] } : piece);
}
