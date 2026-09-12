import { describe, expect, it } from 'vitest';
import {
  applyMove,
  allLegalMoves,
  createGame,
  inCheck,
  legalMoves,
  royal,
  type CastlingRights,
  type GameState,
  type Piece,
  type Power,
  type Side,
} from './engine';

const rights: CastlingRights = {
  white: { kingSide: true, queenSide: true },
  black: { kingSide: true, queenSide: true },
};

function piece(id: string, side: Side, power: Power, row: number, col: number, visual: Power = power, hasMoved = false): Piece {
  return { id, side, power, visual, square: { row, col }, hasMoved };
}

function state(pieces: Piece[], turn: Side = 'white'): GameState {
  return { pieces, turn, history: [], castling: structuredClone(rights), status: 'playing', moveNumber: 1 };
}

describe('Schrödinger special rules', () => {
  it('creates exactly one independent randomized power permutation per side', () => {
    const game = createGame();
    for (const side of ['white', 'black'] as Side[]) {
      const counts = game.pieces.filter(item => item.side === side).reduce<Record<Power, number>>((result, item) => {
        result[item.power] = (result[item.power] ?? 0) + 1;
        return result;
      }, {} as Record<Power, number>);
      expect(counts).toEqual({ pawn: 8, knight: 2, bishop: 2, rook: 2, queen: 1, king: 1 });
      expect(game.pieces.filter(item => item.side === side && item.power === 'king')).toHaveLength(1);
    }
    expect(game.pieces.filter(item => item.side === 'white').map(item => item.power)).not.toBe(game.pieces.filter(item => item.side === 'black').map(item => item.power));
  });

  it('keeps power assignments stable through ordinary moves', () => {
    const game = state([
      piece('white-king', 'white', 'king', 7, 4), piece('white-pawn', 'white', 'pawn', 6, 0),
      piece('black-king', 'black', 'king', 0, 4),
    ]);
    const next = applyMove(game, { from: { row: 6, col: 0 }, to: { row: 5, col: 0 } });
    expect(next?.pieces.find(item => item.id === 'white-pawn')?.power).toBe('pawn');
    expect(next?.pieces.find(item => item.id === 'white-king')?.power).toBe('king');
  });

  it('uses PAWN power for direction, double advance, captures, and blocking', () => {
    const game = state([
      piece('white-royal', 'white', 'king', 7, 4), piece('white-pawn', 'white', 'pawn', 6, 3, 'rook'),
      piece('black-royal', 'black', 'king', 0, 4), piece('black-target', 'black', 'knight', 5, 4),
    ]);
    expect(legalMoves(game, game.pieces[1])).toEqual(expect.arrayContaining([{ row: 5, col: 3 }, { row: 4, col: 3 }, { row: 5, col: 4 }]));
    const blocked = { ...game, pieces: [...game.pieces, piece('white-blocker', 'white', 'rook', 5, 3)] };
    expect(legalMoves(blocked, blocked.pieces[1])).not.toContainEqual({ row: 4, col: 3 });
    const fakePawn = { ...game, pieces: game.pieces.map(item => item.id === 'white-pawn' ? { ...item, power: 'rook' as Power } : item) };
    expect(legalMoves(fakePawn, fakePawn.pieces[1])).toContainEqual({ row: 3, col: 3 });
  });
  it('castles kingside using KING and ROOK powers, not visual identity', () => {
    const game = state([
      piece('white-royal', 'white', 'king', 7, 4, 'knight'),
      piece('white-rook', 'white', 'rook', 7, 7, 'bishop'),
      piece('black-royal', 'black', 'king', 0, 4),
    ]);
    const king = game.pieces[0];
    expect(legalMoves(game, king)).toContainEqual({ row: 7, col: 6 });
    const next = applyMove(game, { from: king.square, to: { row: 7, col: 6 } });
    expect(next?.pieces.find(item => item.id === 'white-royal')?.square).toEqual({ row: 7, col: 6 });
    expect(next?.pieces.find(item => item.id === 'white-rook')?.square).toEqual({ row: 7, col: 5 });
  });

  it('rejects castling through an attacked square and when blocked', () => {
    const blocked = state([
      piece('white-royal', 'white', 'king', 7, 4), piece('white-rook', 'white', 'rook', 7, 7),
      piece('white-blocker', 'white', 'bishop', 7, 5), piece('black-royal', 'black', 'king', 0, 4),
    ]);
    expect(legalMoves(blocked, blocked.pieces[0])).not.toContainEqual({ row: 7, col: 6 });
    const attacked = state([
      piece('white-royal', 'white', 'king', 7, 4), piece('white-rook', 'white', 'rook', 7, 7),
      piece('black-royal', 'black', 'king', 0, 4), piece('black-rook', 'black', 'rook', 3, 5),
    ]);
    expect(legalMoves(attacked, attacked.pieces[0])).not.toContainEqual({ row: 7, col: 6 });
  });

  it('supports both sides of castling rights through actual movement', () => {
    const game = state([
      piece('white-royal', 'white', 'king', 7, 4), piece('white-left-rook', 'white', 'rook', 7, 0),
      piece('black-royal', 'black', 'king', 0, 4),
    ]);
    expect(legalMoves(game, game.pieces[0])).toContainEqual({ row: 7, col: 2 });
    const moved = { ...game, pieces: game.pieces.map(item => item.id === 'white-royal' ? { ...item, hasMoved: true } : item) };
    expect(legalMoves(moved, moved.pieces[0])).not.toContainEqual({ row: 7, col: 2 });
  });

  it('supports black queenside castling with power-based identities', () => {
    const game = state([
      piece('black-royal', 'black', 'king', 0, 4, 'queen'), piece('black-rook', 'black', 'rook', 0, 0, 'knight'),
      piece('white-royal', 'white', 'king', 7, 4),
    ], 'black');
    const next = applyMove(game, { from: { row: 0, col: 4 }, to: { row: 0, col: 2 } });
    expect(next?.pieces.find(item => item.id === 'black-royal')?.square).toEqual({ row: 0, col: 2 });
    expect(next?.pieces.find(item => item.id === 'black-rook')?.square).toEqual({ row: 0, col: 3 });
  });

  it('rejects castling into an attack revealed by moving the king', () => {
    const game = state([
      piece('white-royal', 'white', 'king', 7, 4), piece('white-rook', 'white', 'rook', 7, 7),
      piece('black-royal', 'black', 'king', 0, 0), piece('black-rook', 'black', 'rook', 7, 0),
    ]);
    expect(legalMoves(game, game.pieces[0])).not.toContainEqual({ row: 7, col: 6 });
  });

  it('handles immediate en passant and removes the captured PAWN-powered piece', () => {
    const game = state([
      piece('white-king', 'white', 'king', 7, 4), piece('white-pawn', 'white', 'pawn', 3, 4, 'queen'),
      piece('black-king', 'black', 'king', 0, 4), piece('black-pawn', 'black', 'pawn', 1, 3),
    ], 'black');
    const afterDouble = applyMove(game, { from: { row: 1, col: 3 }, to: { row: 3, col: 3 } });
    expect(afterDouble?.enPassant?.target).toEqual({ row: 2, col: 3 });
    const afterCapture = applyMove(afterDouble!, { from: { row: 3, col: 4 }, to: { row: 2, col: 3 } });
    expect(afterCapture?.pieces.some(item => item.id === 'black-pawn')).toBe(false);
    expect(afterCapture?.pieces.find(item => item.id === 'white-pawn')?.square).toEqual({ row: 2, col: 3 });
  });

  it('supports black en passant with a non-pawn visual identity', () => {
    const game = state([
      piece('white-king', 'white', 'king', 7, 4), piece('white-pawn', 'white', 'pawn', 6, 3, 'rook'),
      piece('black-king', 'black', 'king', 0, 4), piece('black-pawn', 'black', 'pawn', 3, 4, 'bishop'),
    ], 'white');
    const afterDouble = applyMove(game, { from: { row: 6, col: 3 }, to: { row: 4, col: 3 } })!;
    expect(legalMoves(afterDouble, afterDouble.pieces.find(item => item.id === 'black-pawn')!)).toContainEqual({ row: 4, col: 3 });
    const afterCapture = applyMove(afterDouble, { from: { row: 3, col: 4 }, to: { row: 4, col: 3 } });
    expect(afterCapture?.pieces.find(item => item.id === 'white-pawn')).toBeUndefined();
  });

  it('rejects en passant for a visually-pawn piece without PAWN power', () => {
    const game = state([
      piece('white-king', 'white', 'king', 7, 0), piece('white-pawn', 'white', 'pawn', 6, 3),
      piece('black-king', 'black', 'king', 0, 4), piece('black-fake-pawn', 'black', 'rook', 3, 4, 'pawn'),
    ], 'white');
    const afterDouble = applyMove(game, { from: { row: 6, col: 3 }, to: { row: 4, col: 3 } })!;
    expect(legalMoves(afterDouble, afterDouble.pieces.find(item => item.id === 'black-fake-pawn')!)).not.toContainEqual({ row: 4, col: 3 });
  });

  it('expires en passant after one intervening move', () => {
    const game = state([
      piece('white-king', 'white', 'king', 7, 4), piece('white-pawn', 'white', 'pawn', 3, 4),
      piece('black-king', 'black', 'king', 0, 4), piece('black-pawn', 'black', 'pawn', 1, 3),
    ], 'black');
    const afterDouble = applyMove(game, { from: { row: 1, col: 3 }, to: { row: 3, col: 3 } })!;
    const quiet = applyMove(afterDouble, { from: { row: 7, col: 4 }, to: { row: 6, col: 4 } })!;
    expect(quiet.enPassant).toBeUndefined();
    expect(legalMoves(quiet, quiet.pieces.find(item => item.id === 'white-pawn')!)).not.toContainEqual({ row: 2, col: 3 });
  });

  it('promotes a PAWN-powered non-pawn visual while preserving its visual identity', () => {
    const game = state([
      piece('white-promoter', 'white', 'pawn', 1, 0, 'knight'), piece('white-king', 'white', 'king', 7, 4),
      piece('black-king', 'black', 'king', 0, 4),
    ]);
    const next = applyMove(game, { from: { row: 1, col: 0 }, to: { row: 0, col: 0 }, promotion: 'rook' });
    const promoted = next?.pieces.find(item => item.id === 'white-promoter');
    expect(promoted?.power).toBe('rook');
    expect(promoted?.visual).toBe('knight');
  });

  it('allows only Queen, Rook, Bishop, and Knight promotion powers', () => {
    for (const promotion of ['queen', 'rook', 'bishop', 'knight'] as Power[]) {
      const game = state([
        piece('white-promoter', 'white', 'pawn', 1, 0, 'bishop'), piece('white-king', 'white', 'king', 7, 4),
        piece('black-king', 'black', 'king', 0, 4),
      ]);
      expect(applyMove(game, { from: { row: 1, col: 0 }, to: { row: 0, col: 0 }, promotion })?.pieces.find(item => item.id === 'white-promoter')?.power).toBe(promotion);
    }
    const game = state([
      piece('white-promoter', 'white', 'pawn', 1, 0), piece('white-king', 'white', 'king', 7, 4),
      piece('black-king', 'black', 'king', 0, 4),
    ]);
    expect(applyMove(game, { from: { row: 1, col: 0 }, to: { row: 0, col: 0 }, promotion: 'king' })).toBeNull();
  });

  it('does not promote a visually-pawn piece whose power is not PAWN', () => {
    const game = state([
      piece('white-fake-pawn', 'white', 'rook', 1, 0, 'pawn'), piece('white-king', 'white', 'king', 7, 4),
      piece('black-king', 'black', 'king', 0, 4),
    ]);
    const next = applyMove(game, { from: { row: 1, col: 0 }, to: { row: 0, col: 0 }, promotion: 'queen' });
    expect(next?.pieces.find(item => item.id === 'white-fake-pawn')?.power).toBe('rook');
    expect(next?.pieces.find(item => item.id === 'white-fake-pawn')?.visual).toBe('pawn');
  });

  it('uses the KING-powered piece for royal status, check, and self-check', () => {
    const game = state([
      piece('white-royal', 'white', 'king', 7, 4, 'bishop'), piece('white-visual-king', 'white', 'rook', 6, 2, 'king'),
      piece('black-royal', 'black', 'king', 0, 0), piece('black-rook', 'black', 'rook', 3, 4),
    ]);
    expect(royal(game, 'white')?.id).toBe('white-royal');
    expect(inCheck(game, 'white')).toBe(true);
    expect(allLegalMoves(game, 'white').some(move => move.from.row === 7 && move.from.col === 4)).toBe(true);
  });

  it('distinguishes checkmate from stalemate using the KING-powered piece', () => {
    const checkmate = state([
      piece('white-royal', 'white', 'king', 7, 7), piece('black-royal', 'black', 'king', 5, 5), piece('black-queen', 'black', 'queen', 6, 6),
    ]);
    expect(inCheck(checkmate, 'white')).toBe(true);
    expect(allLegalMoves(checkmate, 'white')).toEqual([]);
    const stalemate = state([
      piece('white-royal', 'white', 'king', 7, 7), piece('black-royal', 'black', 'king', 6, 5), piece('black-queen', 'black', 'queen', 5, 6),
    ]);
    expect(inCheck(stalemate, 'white')).toBe(false);
    expect(allLegalMoves(stalemate, 'white')).toHaveLength(0);
  });
});
