import type { AiSearchReport, GameState, Move, Piece, Power, Side, Square } from './engine';

const files = 'ABCDEFGH';
const name = (square: Square) => `${files[square.col]}${8 - square.row}`;
const title = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const pieceForMove = (move: Move, state: GameState) => state.initialPieces?.find(piece => piece.id === move.pieceId);

export type ExportOptions = { humanSide: Side; aiSide: Side; telemetry?: Array<AiSearchReport & { ply: number }> };

export type GameOverBoardView = 'reveal' | 'final';

export interface GameOverDisplayPiece {
  id: string;
  side: Side;
  square: Square;
  glyphType: Power;
  visual: Power;
  power: Power;
}

/** Returns the complete initialized arrangement for the end-game reveal. */
export function revealPieces(state: GameState): Piece[] {
  return (state.initialPieces ?? state.pieces).map(piece => ({
    ...piece,
    square: { ...piece.initialSquare },
  }));
}

/** Returns pieces positioned and typed for the chosen Game Over board view. */
export function getGameOverBoardPieces(state: GameState, view: GameOverBoardView): GameOverDisplayPiece[] {
  if (view === 'reveal') {
    return revealPieces(state).map(piece => ({
      id: piece.id,
      side: piece.side,
      square: { ...piece.square },
      glyphType: piece.power,
      visual: piece.visual,
      power: piece.power,
    }));
  }
  return state.pieces.map(piece => ({
    id: piece.id,
    side: piece.side,
    square: { ...piece.square },
    glyphType: piece.visual,
    visual: piece.visual,
    power: piece.power,
  }));
}

export function buildGameExport(state: GameState, options: ExportOptions): string {
  const originals = state.initialPieces ?? state.pieces;
  const result = state.status === 'playing' ? 'In Progress' : state.winner ? `${state.winner === options.humanSide ? 'Human' : 'AI'} — ${title(state.winner)}` : 'Draw';
  const lines = [
    '# Schrödinger\'s Chess — Game Debug Export', '',
    '## Game', '',
    `- Human: ${title(options.humanSide)}`, `- AI: ${title(options.aiSide)}`, `- Result: ${result}`, `- End reason: ${state.status === 'playing' ? '—' : state.reason ?? '—'}`, '',
    '## Piece Mapping', '', '`Side | Initial Square | Visual Identity | Movement Power`', '',
    ...[...originals].sort((a, b) => a.side.localeCompare(b.side) || a.initialSquare.row - b.initialSquare.row || a.initialSquare.col - b.initialSquare.col)
      .map(piece => `${title(piece.side)} | ${name(piece.initialSquare)} | ${title(piece.visual)} | ${title(piece.power)}`), '',
    '## Move History', '', '`Ply | Side | Piece | From → To | Event`', '',
    ...(state.history.length ? state.history.map((move, index) => moveLine(move, index + 1, state, originals)) : ['No moves recorded.']), '',
  ];
  if (options.telemetry?.length) {
    lines.push('## AI Search Telemetry', '', '`Ply | Depth | Nodes | Q-Nodes | TT Hits | TT Stores | Root Candidates | Selected Move`', '',
      ...options.telemetry.map(report => `${report.ply} | ${report.completedDepth} | ${report.nodes} | ${report.quiescenceNodes} | ${report.ttHits} | ${report.ttStores} | ${report.rootCandidates} | ${report.selectedMove ? `${name(report.selectedMove.from)} → ${name(report.selectedMove.to)}` : '—'}`), '');
  }
  lines.push('## Final Position', '', state.status === 'playing' ? 'Current position (game in progress):' : 'Final position:', '',
    ...(state.pieces.length ? state.pieces.map(piece => `${title(piece.side)} | ${name(piece.square)} | ${title(piece.visual)} | ${title(piece.power)} (original ${name(piece.initialSquare)})`) : ['No pieces remain.']), '');
  return lines.join('\n');
}

function moveLine(move: Move, ply: number, state: GameState, originals: Piece[]): string {
  const original = pieceForMove(move, state) ?? originals.find(piece => piece.initialSquare.row === move.from.row && piece.initialSquare.col === move.from.col);
  const events: string[] = [];
  if (move.capturedPieceId) {
    const captured = originals.find(piece => piece.id === move.capturedPieceId);
    events.push(`Captured ${captured ? `${title(captured.side)} ${name(captured.initialSquare)}` : move.capturedPieceId}`);
  }
  if (move.promotion) events.push(`Promotion to ${title(move.promotion)}`);
  if (move.isCastling) events.push(move.to.col === 6 ? 'Castling kingside' : 'Castling queenside');
  if (move.isEnPassant) events.push('En passant');
  return `${ply} | ${title(original?.side ?? state.turn)} | ${original ? name(original.initialSquare) : move.pieceId ?? 'Unknown'} | ${name(move.from)} → ${name(move.to)}${events.length ? ` | ${events.join('; ')}` : ''}`;
}

export function downloadGameExport(state: GameState, options: ExportOptions, now = new Date()): void {
  const stamp = now.toISOString().replace('T', '-').replace(/:/g, '-').slice(0, 19);
  const blob = new Blob([buildGameExport(state, options)], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `schrodingers-chess-game-${stamp}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}
