import { useEffect, useRef, useState } from 'react';
import { allLegalMoves, applyMove, createBeliefs, createGame, forfeitGame, inCheck, legalMoves, toPublicState, updateBeliefs, type AiSearchReport, type BeliefState, type GameState, type Move, type Piece, type Power, type Side } from '../game/engine';
import { downloadGameExport, getGameOverBoardPieces, type GameOverBoardView } from '../game/export';
import { MultiplayerGame } from './MultiplayerGame';

const glyph: Record<string,string> = { king:'♔', queen:'♕', rook:'♖', bishop:'♗', knight:'♘', pawn:'♙' };
const powerLabel: Record<Power,string> = { pawn:'Pawn', knight:'Knight', bishop:'Bishop', rook:'Rook', queen:'Queen', king:'King' };
const files = 'abcdefgh';
const other = (side: Side): Side => side === 'white' ? 'black' : 'white';
const same = (a:{row:number;col:number},b:{row:number;col:number}) => a.row === b.row && a.col === b.col;
const squareName = (s:{row:number;col:number}) => `${files[s.col]}${8-s.row}`;
const formatTime = (seconds:number) => `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;

export function App() {
  const [screen,setScreen] = useState<'landing'|'game'|'over'|'multiplayer'>('landing');
  const [game,setGame] = useState<GameState|null>(null);
  const [playerSide,setPlayerSide] = useState<Side>('white');
  const [initialPieces,setInitialPieces] = useState<Piece[]>([]);
  const [beliefs,setBeliefs] = useState<BeliefState|null>(null);
  const [selected,setSelected] = useState<Piece|null>(null);
  const [moves,setMoves] = useState<Move['to'][]>([]);
  const [thinking,setThinking] = useState(false);
  const [elapsed,setElapsed] = useState(0);
  const [animation,setAnimation] = useState(0);
  const [promotionMove,setPromotionMove] = useState<Move|null>(null);
  const [telemetry,setTelemetry] = useState<Array<AiSearchReport & { ply: number }>>([]);
  const workerRef = useRef<Worker|null>(null);
  const mountedRef = useRef(true);
  const epochRef = useRef(0);
  const historyScrollRef = useRef<HTMLDivElement|null>(null);

  const createWorker = () => { const worker = new Worker(new URL('../ai/ai.worker.ts', import.meta.url), { type:'module' }); workerRef.current = worker; };
  const terminateWorker = () => { workerRef.current?.terminate(); workerRef.current = null; };
  const exitToMenu = () => { epochRef.current += 1; terminateWorker(); setThinking(false); setScreen('landing'); };
  const forfeit = () => { if (!game || game.status === 'over') return; epochRef.current += 1; terminateWorker(); setThinking(false); finish(forfeitGame(game,other(playerSide))); };
  useEffect(() => { mountedRef.current = true; createWorker(); return () => { mountedRef.current = false; epochRef.current += 1; terminateWorker(); }; }, []);
  useEffect(() => { if (screen !== 'game') { epochRef.current += 1; terminateWorker(); setThinking(false); } }, [screen]);
  useEffect(() => { const node = historyScrollRef.current; if (node) node.scrollTop = node.scrollHeight; }, [game?.history.length]);
  useEffect(() => { if (import.meta.env.DEV && screen === 'game' && game) { const humanKing = game.pieces.find(piece => piece.side === playerSide && piece.power === 'king'); console.debug('[singleplayer check]', { playerSide, inCheck: inCheck(game, playerSide), kingSquare: humanKing?.square }); } }, [game, playerSide, screen]);
  useEffect(() => { if (screen !== 'game' || game?.status !== 'playing') return; const timer = window.setInterval(() => setElapsed(value => value + 1),1000); return () => window.clearInterval(timer); }, [screen,game?.status]);
  useEffect(() => { if (screen !== 'game' || !game) return; const panel=document.querySelector<HTMLElement>('.game-layout > .side-panel'); if (!panel) return; panel.classList.add('singleplayer-side-panel'); const controls=document.createElement('div'); controls.className='gameplay-controls'; const exportButton=document.createElement('button'); exportButton.className='secondary-button'; exportButton.textContent='EXPORT GAME'; exportButton.onclick=()=>downloadGameExport(game,{humanSide:playerSide,aiSide:other(playerSide),telemetry}); const forfeitButton=document.createElement('button'); forfeitButton.className='resign-button'; forfeitButton.textContent='FORFEIT'; forfeitButton.onclick=forfeit; controls.append(exportButton,forfeitButton); panel.appendChild(controls); return () => { controls.remove(); panel.classList.remove('singleplayer-side-panel'); }; }, [screen,game,playerSide,telemetry]);
  useEffect(() => { document.documentElement.style.setProperty('--single-game-timer', JSON.stringify(screen === 'game' ? `LIVE ${formatTime(elapsed)}` : '')); return () => { document.documentElement.style.removeProperty('--single-game-timer'); }; }, [screen,elapsed]);

  const finish = (next:GameState) => { if (!mountedRef.current) return; setGame(next); setSelected(null); setMoves([]); setPromotionMove(null); if (next.lastMove) setAnimation(value => value + 1); if (next.status === 'over') setScreen('over'); };
  const start = () => { epochRef.current += 1; terminateWorker(); createWorker(); const next = createGame(); const side:Side = Math.random() < .5 ? 'white' : 'black'; const aiSide = other(side); const initialBeliefs = createBeliefs(next,aiSide); setPlayerSide(side); setGame(next); setInitialPieces(next.pieces); setBeliefs(initialBeliefs); setTelemetry([]); setSelected(null); setMoves([]); setPromotionMove(null); setElapsed(0); setThinking(false); setScreen('game'); if (side === 'black') makeAiMove(next,initialBeliefs,aiSide); };
  const requestAiMove = (state:ReturnType<typeof toPublicState>, currentBeliefs:BeliefState) => new Promise<AiSearchReport|null>((resolve,reject) => { const worker=workerRef.current; if (!worker) { resolve(null); return; } const onMessage=(event:MessageEvent<AiSearchReport>)=>{worker.removeEventListener('message',onMessage);worker.removeEventListener('error',onError);resolve(event.data);}; const onError=(event:ErrorEvent)=>{worker.removeEventListener('message',onMessage);worker.removeEventListener('error',onError);reject(event.error??new Error(event.message));}; worker.addEventListener('message',onMessage);worker.addEventListener('error',onError);worker.postMessage({publicState:JSON.parse(JSON.stringify(state)),beliefs:JSON.parse(JSON.stringify(currentBeliefs))}); });
  const makeAiMove = (current:GameState,currentBeliefs:BeliefState,aiSide:Side) => { setThinking(true); const epoch=epochRef.current; window.setTimeout(() => { let settled=false; let timer=0; const complete=(report:AiSearchReport|null)=>{if(settled||epoch!==epochRef.current)return;settled=true;window.clearTimeout(timer);if(report){setTelemetry(items=>[...items,{...report,ply:current.history.length+1}]);}const proposed=report?.selectedMove??null;let next=proposed?applyMove(current,proposed):null;if(!next){const fallback=allLegalMoves(current,aiSide)[0];next=fallback?applyMove(current,fallback):current;}finish(next??current);if(mountedRef.current)setThinking(false);}; timer=window.setTimeout(()=>complete(null),2200); requestAiMove(toPublicState(current,aiSide),currentBeliefs).then(complete).catch(()=>complete(null)); },16); };
  const continueAfterHuman = (next:GameState,previous:GameState) => { if (!beliefs) return; const aiSide=other(playerSide); const revised=updateBeliefs(beliefs,toPublicState(previous,aiSide),toPublicState(next,aiSide)); setBeliefs(revised); finish(next); if (next.status === 'playing') makeAiMove(next,revised,aiSide); };
  const choosePromotion = (power:Power) => { if (!game||!promotionMove) return; const next=applyMove(game,{...promotionMove,promotion:power}); if(next)continueAfterHuman(next,game); };
  const clickSquare = (row:number,col:number) => { if(!game||!beliefs||game.status==='over'||thinking||game.turn!==playerSide||promotionMove)return; const piece=game.pieces.find(item=>same(item.square,{row,col})); if(selected){const destination={row,col};if(moves.some(square=>same(square,destination))){const move={from:selected.square,to:destination};setSelected(null);setMoves([]);if(selected.power==='pawn'&&(row===0||row===7)){setPromotionMove(move);return;}const next=applyMove(game,move);if(next)continueAfterHuman(next,game);return;}if(piece?.side===playerSide){setSelected(piece);setMoves(legalMoves(game,piece));}else{setSelected(null);setMoves([]);}}else if(piece?.side===playerSide){setSelected(piece);setMoves(legalMoves(game,piece));} };

  if(screen==='landing')return <main className="landing-screen"><section className="landing-card"><div className="brand-mark">♞</div><p className="eyebrow">Human versus AI · Hidden powers</p><h1>Schrödinger&apos;s<br/><em>Chess</em></h1><p className="landing-copy">Every piece looks familiar.<br/>Nothing moves the way you expect.</p><div className="mode-buttons"><button className="primary-button" onClick={start}>SINGLEPLAYER <span>→</span></button><button className="secondary-button" onClick={()=>setScreen('multiplayer')}>MULTIPLAYER <span>↔</span></button></div></section></main>;
  if(screen==='multiplayer')return <MultiplayerGame onExit={exitToMenu}/>;
  if(!game)return null;
  if(screen==='over')return <GameOverReveal game={game} playerSide={playerSide} onPlay={start} onExport={()=>downloadGameExport(game,{humanSide:playerSide,aiSide:other(playerSide),telemetry})}/>;
  const aiSide=other(playerSide); const captured=initialPieces.filter(initial=>!game.pieces.some(piece=>piece.id===initial.id)); const capturedBy=(side:Side)=>captured.filter(piece=>piece.side===side); const selectedId=selected?.id;
  return <main className="app-shell"><header className="topbar"><button className="mini-brand" onClick={exitToMenu}>♞ <span>Schrödinger&apos;s Chess</span></button><div className="top-status"><span className="live-dot"/> LIVE GAME</div><button className="icon-button" onClick={exitToMenu}>×</button></header><div className="game-layout"><section className="board-column"><div className="mobile-title"><span>{game.turn===playerSide?'Your turn':'AI is thinking'}</span><small>Game {game.moveNumber}</small></div><PlayerBar side={aiSide} name="Schrödinger AI" captured={capturedBy(playerSide)} thinking={thinking}/><div className="board-wrap"><div className="chess-board">{Array.from({length:64},(_,index)=>{const displayRow=Math.floor(index/8),displayCol=index%8,row=playerSide==='white'?displayRow:7-displayRow,col=playerSide==='white'?displayCol:7-displayCol,destination={row,col},piece=game.pieces.find(item=>same(item.square,destination)),isMove=moves.some(square=>same(square,destination)),isLast=!!game.lastMove&&(same(game.lastMove.from,destination)||same(game.lastMove.to,destination)),isCheck=!!(piece&&piece.side===playerSide&&piece.power==='king'&&inCheck(game,playerSide)),arrived=!!(piece&&game.lastMove&&same(piece.square,game.lastMove.to)),isSelected=!!(selectedId&&piece&&selectedId===piece.id);return <button key={index} className={`square ${(displayRow+displayCol)%2?'dark':'light'} ${isSelected?'selected':''} ${isLast?'last-move':''} ${isCheck?'in-check':''}`} onClick={()=>clickSquare(row,col)} aria-label={squareName(destination)}>{piece&&<span key={`${piece.id}-${arrived?animation:0}`} className={`piece ${piece.side} ${arrived&&animation?'piece-arrival':''}`}>{glyph[piece.visual]}</span>}{isMove&&<span className={piece?'capture-ring':'move-dot'}/>}<span className="coord file">{displayRow===7&&files[col]}</span><span className="coord rank">{displayCol===0&&8-row}</span></button>;})}</div></div><PlayerBar side={playerSide} name="You" captured={capturedBy(aiSide)} thinking={false}/></section><aside className="side-panel"><div className="side-heading"><div><span className="eyebrow">Game in progress</span><h2>{game.turn===playerSide?'Your turn':'AI turn'}</h2></div><div className="turn-pill">{formatTime(elapsed)}</div></div><section className="history-panel"><div className="panel-title">MOVE HISTORY</div><div className="history-scroll-container" ref={historyScrollRef}><table className="history-table"><thead><tr><th>#</th><th>White</th><th>Black</th></tr></thead><tbody>{Array.from({length:Math.ceil(game.history.length/2)},(_,turn)=><tr key={turn}><td>{turn+1}</td><td>{game.history[turn*2]?`${squareName(game.history[turn*2].from)} → ${squareName(game.history[turn*2].to)}`:''}</td><td>{game.history[turn*2+1]?`${squareName(game.history[turn*2+1].from)} → ${squareName(game.history[turn*2+1].to)}`:''}</td></tr>)}</tbody></table>{game.history.length===0&&<p className="empty-panel">Game begins</p>}</div></section><div className="hint-card"><span className="hint-icon">◌</span><div><strong>Trust your eyes less.</strong><p>Your pieces know their powers. The opponent&apos;s pieces are a mystery.</p></div></div><button className="resign-button" onClick={exitToMenu}>EXIT GAME</button></aside></div>{promotionMove&&<div className="promotion-modal" role="dialog" aria-label="Choose promotion power"><div className="promotion-card"><span className="eyebrow">Promotion</span><h2>Choose a movement power</h2><div className="promotion-options">{(['queen','rook','bishop','knight'] as Power[]).map(power=><button key={power} onClick={()=>choosePromotion(power)}>{glyph[power]}<span>{power}</span></button>)}</div></div></div>}</main>;
}

function PlayerBar({side,name,captured,thinking}:{side:Side;name:string;captured:Piece[];thinking:boolean}){const human=name==='You';return <div className={`player-bar ${human?'bottom':''}`}><div className={`avatar ${human?'human-avatar':'ai-avatar'}`}>{human?'YOU':'AI'}</div><div><strong>{name}</strong>{thinking&&<span>Thinking…</span>}{human&&<span>Your move</span>}</div><div className={`inline-captured ${side}`} aria-label={`${name} captured pieces`}>{captured.map(piece=><span key={piece.id}>{glyph[piece.visual]}</span>)}</div>{!human&&<div className="clock">{thinking?'…':'—'}</div>}</div>;}

export function resultTitle(game:GameState):string {
  if(game.reason==='Checkmate') return 'CHECKMATE';
  if(game.reason==='King captured') return 'KING CAPTURED';
  if(game.reason==='Forfeit') return 'FORFEIT';
  if(game.reason?.startsWith('Draw')) return 'DRAW';
  return game.status==='over' ? 'GAME OVER' : 'GAME IN PROGRESS';
}

export function resultMessage(game:GameState):string {
  if(game.winner) {
    const reason=game.reason==='King captured'?'king capture':(game.reason ?? 'victory').toLowerCase();
    return `${game.winner === 'white' ? 'White' : 'Black'} won by ${reason}`;
  }
  return game.reason ?? 'Draw';
}

export function GameOverReveal({
  game,
  playerSide,
  onPlay,
  onExport,
}: {
  game: GameState;
  playerSide: Side;
  onPlay: () => void;
  onExport: () => void;
}) {
  const [view, setView] = useState<GameOverBoardView>('reveal');
  const aiSide = other(playerSide);

  return (
    <main className="gameover-screen">
      <section className="result-hero">
        <h1>{resultTitle(game)}</h1>
        <p>{resultMessage(game)}</p>
      </section>
      <div className="game-layout gameover-layout">
        <section className="board-column gameover-board-column">
          <div className="gameover-toggle-wrap">
            <div className="view-toggle" role="tablist" aria-label="Board view selection">
              <button
                type="button"
                role="tab"
                aria-selected={view === 'reveal'}
                className={`toggle-option ${view === 'reveal' ? 'active' : ''}`}
                onClick={() => setView('reveal')}
              >
                ORIGINAL REVEAL
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === 'final'}
                className={`toggle-option ${view === 'final' ? 'active' : ''}`}
                onClick={() => setView('final')}
              >
                FINAL POSITION
              </button>
            </div>
          </div>
          <div className="gameover-board-stage">
            <GameOverBoard game={game} playerSide={playerSide} view={view} />
          </div>
        </section>
        <aside className="side-panel gameover-side-panel">
          <div className="gameover-summary">
            <p>Human: <strong>{playerSide}</strong></p>
            <p>AI: <strong>{aiSide}</strong></p>
          </div>
          <section className="history-panel gameover-history-panel">
            <div className="panel-title">MOVE HISTORY</div>
            <div className="history-scroll-container">
              {game.history.length ? (
                game.history.map((move, index) => (
                  <div className="gameover-move" key={`${index}-${move.from.row}-${move.from.col}`}>
                    <span>
                      {index + 1}. {squareName(move.from)} → {squareName(move.to)}
                    </span>
                    <small>
                      {move.capturedPieceId ? 'Capture · ' : ''}
                      {move.isCastling ? 'Castling · ' : ''}
                      {move.isEnPassant ? 'En passant · ' : ''}
                      {move.promotion ? `Promote ${powerLabel[move.promotion]}` : ''}
                    </small>
                  </div>
                ))
              ) : (
                <p className="empty-panel">No moves recorded.</p>
              )}
            </div>
          </section>
          <div className="gameover-actions">
            <button type="button" className="primary-button" onClick={onExport}>
              EXPORT GAME
            </button>
            <button type="button" className="secondary-button" onClick={onPlay}>
              START NEW GAME <span>→</span>
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}

export function GameOverBoard({
  game,
  playerSide,
  view,
}: {
  game: GameState;
  playerSide: Side;
  view: GameOverBoardView;
}) {
  const pieces = getGameOverBoardPieces(game, view);

  return (
    <div className="board-wrap reveal-board-wrap">
      <div className="chess-board reveal-board">
        {Array.from({ length: 64 }, (_, index) => {
          const displayRow = Math.floor(index / 8);
          const displayCol = index % 8;
          const row = playerSide === 'white' ? displayRow : 7 - displayRow;
          const col = playerSide === 'white' ? displayCol : 7 - displayCol;
          const destination = { row, col };
          const piece = pieces.find(item => same(item.square, destination));
          const isDark = (displayRow + displayCol) % 2 === 1;
          const isLast = view === 'final' && !!game.lastMove && (same(game.lastMove.from, destination) || same(game.lastMove.to, destination));

          return (
            <div
              key={index}
              className={`square reveal-square ${isDark ? 'dark' : 'light'} ${isLast ? 'last-move' : ''}`}
              aria-label={
                piece
                  ? view === 'reveal'
                    ? `${piece.side} ${piece.power} (originally ${piece.visual}) on ${squareName(destination)}`
                    : `${piece.side} ${piece.visual} on ${squareName(destination)}`
                  : squareName(destination)
              }
            >
              {piece && (
                <span className={`piece ${piece.side} ${view === 'reveal' ? 'reveal-piece' : ''}`}>
                  {glyph[piece.glyphType]}
                </span>
              )}
              <span className="coord file">{displayRow === 7 && files[col]}</span>
              <span className="coord rank">{displayCol === 0 && 8 - row}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const GameOverReveal3 = GameOverReveal;
export const RevealBoard3 = GameOverBoard;

export default App;
