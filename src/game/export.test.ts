import { describe, expect, it } from 'vitest';
import { allLegalMoves, applyMove, createGame, forfeitGame, type GameState, type Piece } from './engine';
import { buildGameExport, revealPieces } from './export';

describe('game debug export', () => {
  it('keeps initialization squares and exports both sides with actual powers', () => {
    const game = createGame(() => 0.1);
    expect(game.initialPieces).toHaveLength(32);
    expect(game.initialPieces?.every(piece => game.pieces.some(current => current.id === piece.id && current.initialSquare.row === piece.initialSquare.row && current.initialSquare.col === piece.initialSquare.col))).toBe(true);
    const move = allLegalMoves(game, 'white')[0];
    const next = applyMove(game, move)!;
    const moved = next.pieces.find(piece => piece.id === game.pieces.find(item => item.square.row === move.from.row && item.square.col === move.from.col)?.id);
    expect(moved?.initialSquare).toEqual(game.pieces.find(item => item.square.row === move.from.row && item.square.col === move.from.col)?.initialSquare);
    const markdown = buildGameExport(next, { humanSide: 'white', aiSide: 'black' });
    expect(markdown).toContain('- Human: White');
    expect(markdown).toContain('- AI: Black');
    expect(markdown).toContain('## Move History');
    expect(markdown).toContain('## Final Position');
    const mapping = markdown.split('## Move History')[0];
    expect(mapping.match(/^White \| /gm)).toHaveLength(16);
    expect(mapping.match(/^Black \| /gm)).toHaveLength(16);
    expect(markdown).toContain(`| ${next.pieces[0].power[0].toUpperCase()}${next.pieces[0].power.slice(1)}`);
  });

  it('records authoritative move metadata for special events', () => {
    const piece = (id: string, side: 'white'|'black', power: Piece['power'], row: number, col: number, visual = power): Piece => ({ id, side, power, visual, square: { row, col }, initialSquare: { row, col }, hasMoved: false });
    const state: GameState = { pieces: [piece('wk','white','king',7,4),piece('wr','white','rook',7,7),piece('bk','black','king',0,4)], turn:'white', history:[], castling:{white:{kingSide:true,queenSide:true},black:{kingSide:true,queenSide:true}}, status:'playing', moveNumber:1 };
    const next = applyMove(state, { from:{row:7,col:4}, to:{row:7,col:6} })!;
    expect(next.history[0].isCastling).toBe(true);
    expect(next.history[0].pieceId).toBe('wk');
  });

  it('records a forfeit as an authoritative AI win and exports it', () => {
    const game = createGame(() => 0.2);
    const forfeited = forfeitGame(game, 'black');
    expect(forfeited.status).toBe('over');
    expect(forfeited.winner).toBe('black');
    expect(forfeited.reason).toBe('Forfeit');
    const markdown = buildGameExport(forfeited, { humanSide: 'white', aiSide: 'black' });
    expect(markdown).toContain('- Result: AI — Black');
    expect(markdown).toContain('- End reason: Forfeit');
  });

  it('reconstructs all original pieces at initial squares using actual powers', () => {
    const game = createGame(() => 0.2);
    const original = game.initialPieces!;
    const initialPieces = original.map((piece,index) => index === 0 ? { ...piece, visual: 'rook' as const, power: 'knight' as const } : piece);
    const current = { ...game, initialPieces, pieces: game.pieces.slice(1).map(piece => piece.id === game.pieces[1].id ? { ...piece, square: { row: 3, col: 3 } } : piece) };
    const reveal = revealPieces(current);
    expect(reveal).toHaveLength(32);
    expect(reveal.filter(piece => piece.side === 'white')).toHaveLength(16);
    expect(reveal.filter(piece => piece.side === 'black')).toHaveLength(16);
    expect(reveal.some(piece => piece.id === original[0].id)).toBe(true);
    expect(reveal.every(piece => piece.square.row === piece.initialSquare.row && piece.square.col === piece.initialSquare.col)).toBe(true);
    expect(reveal[0].visual).toBe('rook');
    expect(reveal[0].power).toBe('knight');
  });
});
