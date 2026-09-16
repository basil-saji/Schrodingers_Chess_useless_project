import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { applyOptimisticPublicMove, createMultiplayerGame, disconnectMultiplayerGame, joinMultiplayerGame, privateChannelName, submitMultiplayerMove, syncMultiplayerGame, type MultiplayerRealtimePayload, type MultiplayerSession } from '../multiplayer/api';
import type { Move, Power, PublicPiece, Side, Square } from '../game/engine';

const glyph: Record<string, string> = { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' };
const files = 'abcdefgh';
const promotionPowers: Power[] = ['queen', 'rook', 'bishop', 'knight'];
const same = (a: Square, b: Square) => a.row === b.row && a.col === b.col;

type Props = { onExit: () => void };

export function MultiplayerGame({ onExit }: Props) {
  const [session, setSession] = useState<MultiplayerSession | null>(null);
  const [view, setView] = useState<'lobby' | 'join' | 'waiting' | 'game'>('lobby');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<PublicPiece | null>(null);
  const [promotionMove, setPromotionMove] = useState<Move | null>(null);
  const leaving = useRef(false);
  const sessionRef = useRef<MultiplayerSession | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const syncInFlight = useRef(false);

  const updateSession = (next: MultiplayerSession) => {
    if (leaving.current) return;
    sessionRef.current = next;
    setSession(next);
    localStorage.setItem('schrodinger-multiplayer-session', JSON.stringify(next));
    setView(next.status === 'waiting' ? 'waiting' : 'game');
  };
  const sync = async (current: MultiplayerSession, force = false) => {
    if (leaving.current || syncInFlight.current) return;
    syncInFlight.current = true;
    try {
      const next = await syncMultiplayerGame(current);
      if (leaving.current) return;
      const latest = sessionRef.current;
      if (!latest || latest.gameId !== next.gameId) return;
      if (!force && next.stateVersion < latest.stateVersion) return;
      updateSession({ ...latest, ...next });
    } catch {
      if (!leaving.current) setError('Connection lost. Try reconnecting.');
    } finally {
      syncInFlight.current = false;
    }
  };

  const applyRealtime = (payload: unknown) => {
    if (leaving.current || !payload || typeof payload !== 'object') return;
    const incoming = payload as Partial<MultiplayerRealtimePayload>;
    const current = sessionRef.current;
    if (!current || !incoming.gameId || incoming.gameId !== current.gameId || incoming.side !== current.side || typeof incoming.stateVersion !== 'number' || !incoming.state) return;
    if (incoming.state.pieces.some(piece => piece.side !== current.side && piece.power !== undefined)) return;
    if (incoming.stateVersion < current.stateVersion) return;
    updateSession({ ...current, ...incoming } as MultiplayerSession);
    if (incoming.status) setView(incoming.status === 'waiting' ? 'waiting' : 'game');
  };

  useEffect(() => {
    const stored = localStorage.getItem('schrodinger-multiplayer-session');
    if (!stored) return;
    try {
      const current = JSON.parse(stored) as MultiplayerSession;
      setBusy(true);
      sessionRef.current = current;
      sync(current).finally(() => setBusy(false));
    } catch { localStorage.removeItem('schrodinger-multiplayer-session'); }
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const subscribedSession = session;
    const subscribe = async () => {
      const name = await privateChannelName(subscribedSession.gameId, subscribedSession.token);
      if (cancelled) return;
      const channel = supabase.channel(name, { config: { private: false } })
        .on('broadcast', { event: 'state' }, ({ payload }) => applyRealtime(payload))
        .on('broadcast', { event: 'opponent_joined' }, ({ payload }) => applyRealtime(payload))
        .subscribe(status => {
          if (status === 'SUBSCRIBED') {
            // Recover a join/move committed before this subscription finished.
            // The in-flight guard keeps reconnect callbacks from multiplying reads.
            void sync(sessionRef.current ?? subscribedSession);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setError('Realtime connection interrupted. Reconnecting…');
            void sync(sessionRef.current ?? subscribedSession);
          }
        });
      channelRef.current = channel;
    };
    void subscribe();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void sync(sessionRef.current ?? subscribedSession);
    };
    const onUnload = () => { const current = sessionRef.current; if (current) void disconnectMultiplayerGame(current); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('beforeunload', onUnload);
      if (channelRef.current) {
        const channel = channelRef.current;
        channelRef.current = null;
        void supabase.removeChannel(channel);
      }
    };
  }, [session?.gameId, session?.token]);

  const create = async () => { setBusy(true); setError(''); try { updateSession(await createMultiplayerGame()); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create game.'); } finally { setBusy(false); } };
  const join = async () => { setBusy(true); setError(''); try { updateSession(await joinMultiplayerGame(joinCode)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not join game.'); } finally { setBusy(false); } };
  const submit = async (move: Move) => {
    if (!session) return;
    const beforeMove = session;
    const optimistic: MultiplayerSession = {
      ...session,
      state: applyOptimisticPublicMove(session.state, move),
      stateVersion: session.stateVersion + 1,
      legalMoves: {},
    };
    updateSession(optimistic);
    setSelected(null); setPromotionMove(null); setBusy(true); setError('');
    try { updateSession(await submitMultiplayerMove(beforeMove, move)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Move rejected.'); await sync(beforeMove, true); }
    finally { setBusy(false); }
  };
  const returnToMenu = () => {
    leaving.current = true;
    localStorage.removeItem('schrodinger-multiplayer-session');
    if (session) void disconnectMultiplayerGame(session);
    setSession(null);
    setView('lobby');
    onExit();
  };

  if (view === 'lobby' && !session) return <main className="landing-screen"><section className="lobby-card"><button className="back-link" onClick={onExit}>← Main menu</button><p className="eyebrow">Online human versus human</p><h1>Multiplayer</h1><p className="landing-copy">Share a code. Keep your powers secret.</p><div className="lobby-actions"><button className="primary-button" onClick={create} disabled={busy}>CREATE GAME <span>→</span></button><button className="secondary-button" onClick={() => { setView('join'); setError(''); }}>JOIN GAME</button></div>{error&&<p className="error-message">{error}</p>}</section></main>;
  if (view === 'join' && !session) return <main className="landing-screen"><section className="lobby-card"><button className="back-link" onClick={() => setView('lobby')}>← Multiplayer</button><p className="eyebrow">Join a live game</p><h1>Enter code</h1><input className="code-input" value={joinCode} onChange={event => setJoinCode(event.target.value.toUpperCase())} maxLength={5} placeholder="K7P4X" autoFocus/><button className="primary-button" onClick={join} disabled={busy||joinCode.length!==5}>JOIN GAME <span>→</span></button>{error&&<p className="error-message">{error}</p>}</section></main>;
  if (!session) return null;
  if (view === 'waiting') return <main className="landing-screen"><section className="lobby-card"><button className="back-link" onClick={returnToMenu}>← Main menu</button><p className="eyebrow">Waiting for opponent</p><h1 className="game-code">{session.joinCode}</h1><p className="landing-copy">Your game code<br/><small>Share it with your opponent.</small></p><div className="waiting-pulse"><span className="live-dot"/> Waiting for opponent…</div>{error&&<p className="error-message">{error}</p>}</section></main>;
  return <MultiplayerBoard session={session} selected={selected} setSelected={setSelected} promotionMove={promotionMove} setPromotionMove={setPromotionMove} submit={submit} busy={busy} onExit={returnToMenu}/>;
}

function MultiplayerBoard({ session, selected, setSelected, promotionMove, setPromotionMove, submit, busy, onExit }: { session: MultiplayerSession; selected: PublicPiece | null; setSelected: (piece: PublicPiece | null) => void; promotionMove: Move | null; setPromotionMove: (move: Move | null) => void; submit: (move: Move) => Promise<void>; busy: boolean; onExit: () => void }) {
  const pieces = session.state.pieces;
  const ordered = useMemo(() => Array.from({ length: 64 }, (_, index) => { const screenRow = Math.floor(index / 8); const screenCol = index % 8; return session.side === 'white' ? { row: screenRow, col: screenCol } : { row: 7 - screenRow, col: 7 - screenCol }; }), [session.side]);
  const legal = selected ? session.legalMoves[selected.id] ?? [] : [];
  const click = (square: Square) => {
    if (busy || session.state.turn !== session.side || session.status !== 'active' || promotionMove) return;
    const piece = pieces.find(candidate => same(candidate.square, square));
    if (selected && legal.some(target => same(target, square))) {
      const move = { from: selected.square, to: square };
      if (selected.power === 'pawn' && (square.row === 0 || square.row === 7)) setPromotionMove(move);
      else void submit(move);
      return;
    }
    if (piece?.side === session.side) setSelected(piece); else setSelected(null);
  };
  const checkSquare = session.inCheck ? session.checkSquare : undefined;
  return <main className="app-shell"><header className="topbar"><button className="mini-brand" onClick={onExit}>♞ <span>Schrödinger&apos;s Chess</span></button><div className="top-status"><span className="live-dot"/> ONLINE MATCH · {session.side.toUpperCase()}</div><button className="icon-button" onClick={onExit}>×</button></header><div className="game-layout"><section className="board-column"><div className="mobile-title"><span>{session.state.turn===session.side?'Your turn':'Opponent&apos;s turn'}</span><small>{session.status==='finished'?(session.reason??'Game over'):`Game ${session.state.moveNumber}`}</small></div><div className="player-bar"><div className="avatar ai-avatar">OPP</div><div><strong>Opponent</strong><span>{session.state.turn===session.side?'Waiting for move':'Their turn'}</span></div><div className="clock">{session.status==='active'?'LIVE':'—'}</div></div><div className="board-wrap"><div className="chess-board multiplayer-board">{ordered.map((square,index)=>{const piece=pieces.find(candidate=>same(candidate.square,square));const isMove=legal.some(target=>same(target,square));const isSelected=Boolean(selected&&piece&&selected.id===piece.id);const isLast=session.state.lastMove&&(same(session.state.lastMove.from,square)||same(session.state.lastMove.to,square));const isCheck=checkSquare&&same(checkSquare,square);return <button type="button" key={index} className={`square ${(square.row+square.col)%2?'dark':'light'} ${isSelected?'selected':''} ${isLast?'last-move':''} ${isCheck?'in-check':''}`} onClick={()=>click(square)} aria-label={`${files[square.col]}${8-square.row}`}>{piece&&<span className={`piece ${piece.side}`}>{glyph[piece.visual]}</span>}{isMove&&<span className={piece?'capture-ring':'move-dot'}/>}<span className="coord file">{square.row===(session.side==='white'?7:0)&&files[session.side==='white'?square.col:7-square.col]}</span><span className="coord rank">{square.col===(session.side==='white'?0:7)&&8-square.row}</span></button>;})}</div></div><div className="player-bar bottom"><div className="avatar human-avatar">YOU</div><div><strong>You · {session.side}</strong><span>{session.state.turn===session.side?'Your move':'Waiting for opponent'}</span></div><div className="power-note">Private movement powers active</div></div></section><aside className="side-panel"><div className="side-heading"><div><span className="eyebrow">Online match</span><h2>{session.state.turn===session.side?'Your turn':'Opponent turn'}</h2></div><div className="turn-pill">{session.state.moveNumber}</div></div><div className="move-panel"><div className="move-panel-header"><span>MOVE STATUS</span><span>{session.joinCode}</span></div><div className="move-list"><p><span>•</span><span>{session.status==='finished'?(session.reason??'Game complete'):session.inCheck?'Check':session.state.turn===session.side?'Make your move':'Opponent is thinking'}</span><span>✦</span></p></div></div><div className="hint-card"><span className="hint-icon">◌</span><div><strong>Your powers stay private.</strong><p>The opponent can see where pieces are, never what powers they have.</p></div></div><button className="resign-button" onClick={onExit}>EXIT GAME</button></aside></div>{promotionMove&&<div className="promotion-modal" role="dialog" aria-label="Choose promotion power"><div className="promotion-card"><span className="eyebrow">Promotion</span><h2>Choose a movement power</h2><div className="promotion-options">{promotionPowers.map(power=><button key={power} onClick={()=>void submit({...promotionMove,promotion:power})}>{glyph[power]}<span>{power}</span></button>)}</div></div></div>}</main>;
}
