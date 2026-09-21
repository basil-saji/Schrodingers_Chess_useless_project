import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createGame, type GameState } from '../game/engine';
import { GameOverReveal } from './App';

// @ts-expect-error test act environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('GameOverReveal component', () => {
  it('renders default Original Reveal view and allows switching without mutating game state', () => {
    const originalGame = createGame(() => 0.1);
    // Find pieces where we differentiate visual and power
    const modifiedOriginals = originalGame.initialPieces!.map((piece, idx) => {
      if (idx === 0) return { ...piece, visual: 'rook' as const, power: 'knight' as const };
      if (idx === 1) return { ...piece, visual: 'rook' as const, power: 'queen' as const };
      return piece;
    });
    const target = modifiedOriginals[0];
    const game: GameState = {
      ...originalGame,
      initialPieces: modifiedOriginals,
      pieces: modifiedOriginals.slice(1).map((piece, idx) =>
        idx === 0 ? { ...piece, square: { row: 4, col: 4 } } : piece
      ),
      status: 'over',
      reason: 'Checkmate',
      winner: 'white',
      history: [{ from: { row: 6, col: 4 }, to: { row: 4, col: 4 } }],
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const onPlay = vi.fn();
    const onExport = vi.fn();

    act(() => {
      root.render(<GameOverReveal game={game} playerSide="white" onPlay={onPlay} onExport={onExport} />);
    });

    // 1. Result hero: NO eyebrow
    expect(container.querySelector('.eyebrow')).toBeNull();
    expect(container.querySelector('h1')?.textContent).toBe('CHECKMATE');
    expect(container.textContent).toContain('White won by checkmate');

    // 2. Toggle control exists with two options
    const toggleButtons = container.querySelectorAll<HTMLButtonElement>('.view-toggle button');
    expect(toggleButtons).toHaveLength(2);
    expect(toggleButtons[0].textContent?.trim()).toBe('ORIGINAL REVEAL');
    expect(toggleButtons[1].textContent?.trim()).toBe('FINAL POSITION');

    // Default is ORIGINAL REVEAL
    expect(toggleButtons[0].classList.contains('active')).toBe(true);
    expect(toggleButtons[1].classList.contains('active')).toBe(false);
    expect(toggleButtons[0].getAttribute('aria-selected')).toBe('true');
    expect(toggleButtons[1].getAttribute('aria-selected')).toBe('false');

    // Exactly one board rendered
    expect(container.querySelectorAll('.chess-board')).toHaveLength(1);

    // In Original Reveal, the modified piece (id 0) is at initialSquare showing knight power glyph (♘)
    const initialSquareLabel = `${target.side} ${target.power} (originally ${target.visual}) on ${String.fromCharCode(97 + target.initialSquare.col)}${8 - target.initialSquare.row}`;
    const revealSquare = container.querySelector(`[aria-label="${initialSquareLabel}"]`);
    expect(revealSquare).not.toBeNull();
    expect(revealSquare?.textContent).toContain('♘'); // knight glyph

    // 3. Switch to Final Position
    const stateBeforeToggle = JSON.stringify(game);
    act(() => {
      toggleButtons[1].click();
    });

    // Toggle button active state changed
    expect(toggleButtons[0].classList.contains('active')).toBe(false);
    expect(toggleButtons[1].classList.contains('active')).toBe(true);

    // Switching does not mutate game state
    expect(JSON.stringify(game)).toBe(stateBeforeToggle);

    // Exactly one board still rendered
    expect(container.querySelectorAll('.chess-board')).toHaveLength(1);

    // In Final Position, captured piece 0 is NOT on the board
    const finalMissing = container.querySelector(`[aria-label="${initialSquareLabel}"]`);
    expect(finalMissing).toBeNull();

    // In Final Position, moved piece at (4,4) renders original visual glyph (rook: ♖), NOT power (queen: ♕)
    const finalMovedSquare = container.querySelector('[aria-label*="on e4"]');
    expect(finalMovedSquare).not.toBeNull();
    expect(finalMovedSquare?.textContent).toContain('♖'); // visual rook
    expect(finalMovedSquare?.textContent).not.toContain('♕'); // NOT queen power

    // 4. Switch back to Original Reveal
    act(() => {
      toggleButtons[0].click();
    });
    expect(toggleButtons[0].classList.contains('active')).toBe(true);
    expect(toggleButtons[1].classList.contains('active')).toBe(false);

    // 5. Actions exist
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('.gameover-actions button'));
    expect(buttons.map(b => b.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'EXPORT GAME',
      'START NEW GAME →',
    ]);

    act(() => {
      buttons[0].click();
      buttons[1].click();
    });
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onPlay).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });
});
