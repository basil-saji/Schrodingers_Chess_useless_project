import { supabase } from '../lib/supabase';
import type { Move, Power, PublicPiece, PublicState, Side, Square } from '../game/engine';

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

export type MultiplayerRealtimePayload = MultiplayerPrivateState & {
  gameId: string;
  side: Side;
  stateVersion: number;
};

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

export async function privateChannelName(gameId: string, token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const tokenHash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `game:${gameId}:${tokenHash}`;
}

const sameSquare = (a: Square, b: Square) => a.row === b.row && a.col === b.col;
const otherSide = (side: Side): Side => side === 'white' ? 'black' : 'white';

/**
 * Applies only the visible consequences of a locally validated move. The
 * authoritative engine still decides legality and the server event reconciles
 * this optimistic state. Opponent powers are never needed or inferred here.
 */
export function applyOptimisticPublicMove(state: PublicState, move: Move): PublicState {
  const moving = state.pieces.find(piece => sameSquare(piece.square, move.from));
  if (!moving) return state;

  let pieces = state.pieces.filter(piece => !sameSquare(piece.square, move.to));
  const isEnPassant = moving.power === 'pawn' && move.from.col !== move.to.col && !state.pieces.some(piece => sameSquare(piece.square, move.to));
  if (isEnPassant) {
    const capturedSquare = { row: move.to.row + (moving.side === 'white' ? 1 : -1), col: move.to.col };
    pieces = pieces.filter(piece => !sameSquare(piece.square, capturedSquare));
  }

  const moved: PublicPiece = { ...moving, square: { ...move.to }, hasMoved: true, power: move.promotion ?? moving.power };
  pieces = pieces.filter(piece => piece.id !== moving.id).concat(moved);

  if (moving.power === 'king' && move.from.row === move.to.row && Math.abs(move.to.col - move.from.col) === 2) {
    const rookColumn = move.to.col === 6 ? 7 : 0;
    const rookTargetColumn = move.to.col === 6 ? 5 : 3;
    pieces = pieces.map(piece => piece.side === moving.side && piece.power === 'rook' && piece.square.row === move.from.row && piece.square.col === rookColumn
      ? { ...piece, square: { row: move.from.row, col: rookTargetColumn }, hasMoved: true }
      : piece);
  }

  return {
    pieces,
    turn: otherSide(state.turn),
    lastMove: { ...move, promotion: moved.power === 'pawn' ? move.promotion : move.promotion },
    moveNumber: state.moveNumber + (state.turn === 'black' ? 1 : 0),
  };
}

export function publicPiecesWithOwnPowers(state: PublicState, ownPowers: Record<string, Power>) {
  return state.pieces.map(piece => piece.side === 'white' || piece.side === 'black' ? { ...piece, power: ownPowers[piece.id] } : piece);
}
