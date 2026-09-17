export type Side = 'white' | 'black';
export type Power = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';
export type Visual = Power;
export type Square = { row: number; col: number };
export type Piece = { id: string; side: Side; visual: Visual; power: Power; square: Square; hasMoved: boolean };
export type Move = { from: Square; to: Square; promotion?: Power };
export type CastlingRights = { white: { kingSide: boolean; queenSide: boolean }; black: { kingSide: boolean; queenSide: boolean } };
export type EnPassantState = { target: Square; captureSquare: Square; pawnId: string };
export type GameState = { pieces: Piece[]; turn: Side; lastMove?: Move; history: Move[]; castling: CastlingRights; enPassant?: EnPassantState; status: 'playing' | 'over'; winner?: Side; reason?: string; moveNumber: number; promotionsCount?: Record<Side, number>; halfMoveClock?: number; positionCounts?: Record<string, number> };
export type PublicPiece = Omit<Piece, 'power'> & { power?: Power };
export type PublicState = { pieces: PublicPiece[]; turn: Side; lastMove?: Move; history: Move[]; castling: CastlingRights; enPassant?: EnPassantState; moveNumber: number; promotionsCount: Record<Side, number>; halfMoveClock: number; positionCounts?: Record<string, number> };
export type RandomSource = () => number;

const powers: Power[] = ['pawn','pawn','pawn','pawn','pawn','pawn','pawn','pawn','knight','knight','bishop','bishop','rook','rook','queen','king'];
const back: Visual[] = ['rook','knight','bishop','queen','king','bishop','knight','rook'];
const diagonals: Square[] = [{row:1,col:1},{row:1,col:-1},{row:-1,col:1},{row:-1,col:-1}];
const orthogonals: Square[] = [{row:1,col:0},{row:-1,col:0},{row:0,col:1},{row:0,col:-1}];
const same = (a: Square,b: Square) => a.row===b.row && a.col===b.col;
const inside = (s: Square) => s.row>=0 && s.row<8 && s.col>=0 && s.col<8;
const other = (side: Side): Side => side==='white'?'black':'white';
const key = (s: Square) => `${s.row},${s.col}`;
const rank = (side: Side) => side==='white'?7:0;
const direction = (side: Side) => side==='white'?-1:1;
function secureRandom():number{const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]/2**32;}
function shuffle<T>(items:T[],random:RandomSource=secureRandom){const result=[...items];for(let i=result.length-1;i>0;i-=1){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
const freshCastling=():CastlingRights=>({white:{kingSide:true,queenSide:true},black:{kingSide:true,queenSide:true}});

export function createGame(random:RandomSource=secureRandom):GameState{
  const pieces:Piece[]=[];
  (['black','white'] as Side[]).forEach(side=>{const home=rank(side), pawnRow=side==='white'?6:1, assigned=shuffle(powers,random);
    back.forEach((visual,col)=>pieces.push({id:`${side}-${visual}-${col}`,side,visual,power:assigned[col],square:{row:home,col},hasMoved:false}));
    for(let col=0;col<8;col+=1)pieces.push({id:`${side}-pawn-${col}`,side,visual:'pawn',power:assigned[8+col],square:{row:pawnRow,col},hasMoved:false});
  });
  const initial={pieces,turn:'white' as Side,history:[],castling:freshCastling(),status:'playing' as const,moveNumber:1,promotionsCount:{white:0,black:0},halfMoveClock:0};
  return {...initial,positionCounts:{[positionHash(initial)]:1}};
}
function at(state:GameState,square:Square){return state.pieces.find(piece=>same(piece.square,square));}
export function positionHash(state:GameState):string{return `${state.turn}|${JSON.stringify(state.castling)}|${state.enPassant?`${key(state.enPassant.target)}:${state.enPassant.pawnId}`:'-'}|${state.pieces.map(piece=>`${piece.side}:${piece.power}:${key(piece.square)}`).sort().join(';')}`;}
function ray(state:GameState,piece:Piece,directions:Square[],attacks=false){const result:Square[]=[];directions.forEach(delta=>{let square={row:piece.square.row+delta.row,col:piece.square.col+delta.col};while(inside(square)){const target=at(state,square);if(!target)result.push({...square});else{if(target.side!==piece.side)result.push({...square});break;}square={row:square.row+delta.row,col:square.col+delta.col};}});return result;}
function castleTarget(piece:Piece,target:Square){return piece.power==='king'&&piece.square.row===rank(piece.side)&&piece.square.col===4&&target.row===piece.square.row&&(target.col===2||target.col===6);}
function rookColumn(target:Square){return target.col===6?7:0;}
function canCastle(state:GameState,piece:Piece,target:Square){
  if(!castleTarget(piece,target)||piece.hasMoved||inCheck(state,piece.side))return false;
  const rights=state.castling[piece.side], kingSide=target.col===6;
  if(!(kingSide?rights.kingSide:rights.queenSide))return false;
  const rook=at(state,{row:piece.square.row,col:rookColumn(target)});
  if(!rook||rook.side!==piece.side||rook.power!=='rook'||rook.hasMoved)return false;
  const start=kingSide?5:1,end=kingSide?6:3;
  for(let col=start;col<=end;col+=1)if(at(state,{row:piece.square.row,col}))return false;
  const transit={row:piece.square.row,col:kingSide?5:3};
  const transitState=simulate(state,piece,transit);
  const destinationState=simulate(state,piece,target);
  return !isAttacked(transitState,transit,other(piece.side))&&!isAttacked(destinationState,target,other(piece.side));
}
function enPassantTarget(state:GameState,piece:Piece,target:Square){
  const ep=state.enPassant;
  return piece.power==='pawn'&&!!ep&&same(ep.target,target)&&Math.abs(target.col-piece.square.col)===1&&target.row===piece.square.row+direction(piece.side)&&!!at(state,ep.captureSquare)&&at(state,ep.captureSquare)!.id===ep.pawnId&&at(state,ep.captureSquare)!.side!==piece.side&&at(state,ep.captureSquare)!.power==='pawn';
}
function pseudo(state:GameState,piece:Piece,attacks=false){
  const {row,col}=piece.square;
  if(piece.power==='bishop')return ray(state,piece,diagonals,attacks);
  if(piece.power==='rook')return ray(state,piece,orthogonals,attacks);
  if(piece.power==='queen')return ray(state,piece,[...diagonals,...orthogonals],attacks);
  if(piece.power==='king'){
    const result=[...diagonals,...orthogonals].map(delta=>({row:row+delta.row,col:col+delta.col})).filter(inside).filter(square=>{const target=at(state,square);return !target||target.side!==piece.side;});
    if(!attacks)[2,-2].forEach(offset=>{const target={row,col:col+offset};if(canCastle(state,piece,target))result.push(target);});
    return result;
  }
  if(piece.power==='knight')return [{row:-2,col:-1},{row:-2,col:1},{row:-1,col:-2},{row:-1,col:2},{row:1,col:-2},{row:1,col:2},{row:2,col:-1},{row:2,col:1}].map(delta=>({row:row+delta.row,col:col+delta.col})).filter(inside).filter(square=>{const target=at(state,square);return !target||target.side!==piece.side;});
  const result:Square[]=[];const dir=direction(piece.side);
  [-1,1].forEach(delta=>{const square={row:row+dir,col:col+delta};const target=inside(square)?at(state,square):undefined;if(inside(square)&&(attacks||(target&&target.side!==piece.side)||enPassantTarget(state,piece,square)))result.push(square);});
  if(attacks)return result;
  const one={row:row+dir,col};if(inside(one)&&!at(state,one)){result.push(one);const two={row:row+2*dir,col};const start=piece.side==='white'?6:1;if(!piece.hasMoved&&row===start&&inside(two)&&!at(state,two))result.push(two);}
  return result;
}
export function isAttacked(state:GameState,square:Square,by:Side){return state.pieces.filter(piece=>piece.side===by).some(piece=>pseudo(state,piece,true).some(target=>same(target,square)));}
export function royal(state:GameState,side:Side){return state.pieces.find(piece=>piece.side===side&&piece.power==='king');}
export function inCheck(state:GameState,side:Side){const king=royal(state,side);return !!king&&isAttacked(state,king.square,other(side));}
function doublePawn(piece:Piece,to:Square){return piece.power==='pawn'&&piece.square.col===to.col&&Math.abs(piece.square.row-to.row)===2;}
function simulate(state:GameState,piece:Piece,to:Square,promotion?:Power){
  const castle=castleTarget(piece,to), ep=enPassantTarget(state,piece,to), capturedId=ep?state.enPassant?.pawnId:at(state,to)?.side!==piece.side?at(state,to)?.id:undefined;
  let pieces=state.pieces.filter(candidate=>candidate.id!==capturedId).map(candidate=>candidate.id===piece.id?{...candidate,square:{...to},hasMoved:true,power:promotion??candidate.power}:candidate);
  if(castle){const rook=at(state,{row:piece.square.row,col:rookColumn(to)}),rookTarget={row:piece.square.row,col:to.col===6?5:3};if(rook)pieces=pieces.map(candidate=>candidate.id===rook.id?{...candidate,square:rookTarget,hasMoved:true}:candidate);}
  return {...state,pieces};
}
export function legalMoves(state:GameState,piece:Piece){return pseudo(state,piece).filter(to=>!inCheck(simulate(state,piece,to),piece.side));}
export function allLegalMoves(state:GameState,side:Side){return state.pieces.filter(piece=>piece.side===side).flatMap(piece=>legalMoves(state,piece).map(to=>({from:piece.square,to})));}
function updateCastling(rights:CastlingRights,piece:Piece,captured?:Piece){const next:CastlingRights={white:{...rights.white},black:{...rights.black}};if(piece.power==='king'){next[piece.side].kingSide=false;next[piece.side].queenSide=false;}if(piece.power==='rook'&&piece.square.row===rank(piece.side)){if(piece.square.col===7)next[piece.side].kingSide=false;if(piece.square.col===0)next[piece.side].queenSide=false;}if(captured?.power==='rook'&&captured.square.row===rank(captured.side)){if(captured.square.col===7)next[captured.side].kingSide=false;if(captured.square.col===0)next[captured.side].queenSide=false;}return next;}
export function isInsufficientMaterial(state:GameState):boolean{const active=state.pieces; if(active.length===2)return active.every(piece=>piece.power==='king'); if(active.length!==3)return false; const nonKings=active.filter(piece=>piece.power!=='king'); return active.filter(piece=>piece.power==='king').length===2&&nonKings.length===1&&(nonKings[0].power==='bishop'||nonKings[0].power==='knight');}
export function applyMove(state:GameState,move:Move):GameState|null{
  const piece=at(state,move.from);if(!piece||piece.side!==state.turn||!legalMoves(state,piece).some(square=>same(square,move.to)))return null;
  const ep=enPassantTarget(state,piece,move.to), captured=ep?at(state,state.enPassant!.captureSquare):at(state,move.to);const promotionRank=piece.power==='pawn'&&(move.to.row===0||move.to.row===7);const promotion=promotionRank?(move.promotion??'queen'):undefined;
  if(promotion&&!['queen','rook','bishop','knight'].includes(promotion))return null;
  const next=simulate(state,piece,move.to,promotion), nextTurn=other(state.turn), nextCastling=updateCastling(state.castling,piece,captured), nextEnPassant=doublePawn(piece,move.to)?{target:{row:(piece.square.row+move.to.row)/2,col:move.to.col},captureSquare:{...move.to},pawnId:piece.id}:undefined;
  const recorded={...move,promotion}, halfMoveClock=piece.power==='pawn'||!!captured?0:(state.halfMoveClock??0)+1;
  const future={...next,turn:nextTurn,castling:nextCastling,enPassant:nextEnPassant,halfMoveClock};const moves=allLegalMoves(future,nextTurn), checked=inCheck(future,nextTurn);
  const previousCounts=state.positionCounts??{[positionHash(state)]:1}; const nextHash=positionHash(future); const positionCounts={...previousCounts,[nextHash]:(previousCounts[nextHash]??0)+1};
  const promotionsCount = state.promotionsCount ?? {white:0,black:0};
  if(captured?.power==='king') return {...future,lastMove:recorded,history:[...state.history,recorded],positionCounts,moveNumber:state.moveNumber+(state.turn==='black'?1:0),promotionsCount:{...promotionsCount,[state.turn]:promotionsCount[state.turn]+(promotion?1:0)},status:'over',winner:state.turn,reason:'King captured'};
  const checkmate=!moves.length&&checked; const insufficient=isInsufficientMaterial(future); const automaticDraw=!checkmate&&!insufficient&&(halfMoveClock>=100||positionCounts[nextHash]>=3); const status=moves.length&&!automaticDraw&&!insufficient?'playing':'over';
  const reason=checkmate?'Checkmate':insufficient?'Draw by Insufficient Material':automaticDraw?(halfMoveClock>=100?'Draw by 50-Move Rule':'Draw by Threefold Repetition'):status==='over'?'Stalemate':undefined;
  return {...future,lastMove:recorded,history:[...state.history,recorded],positionCounts,moveNumber:state.moveNumber+(state.turn==='black'?1:0),promotionsCount:{...promotionsCount,[state.turn]:promotionsCount[state.turn]+(promotion?1:0)},status,winner:checkmate?state.turn:undefined,reason};
}

export type BeliefState = Record<string, Power[] | number | Side> & { promotionsCount: number; observer: Side };
const allPowers: Power[] = ['pawn','knight','bishop','rook','queen','king'];
const standardCapacity: Record<Power, number> = {pawn:8,knight:2,bishop:2,rook:2,queen:1,king:1};
const value: Record<Power, number> = {pawn:100,knight:320,bishop:330,rook:500,queen:900,king:20000};

export function toPublicState(state:GameState,observer:Side):PublicState{return{
  pieces:state.pieces.map(piece=>piece.side===observer?{...piece}:{...piece,power:undefined}),
  turn:state.turn,lastMove:state.lastMove,history:state.history,castling:state.castling,enPassant:state.enPassant,
  moveNumber:state.moveNumber,promotionsCount:state.promotionsCount ?? {white:0,black:0},halfMoveClock:state.halfMoveClock??0,positionCounts:state.positionCounts
};}

export function createBeliefs(state:GameState,observer:Side):BeliefState{
  const result:Record<string,Power[]> = {};
  for(const piece of state.pieces.filter(item=>item.side!==observer)) result[piece.id]=[...allPowers];
  return Object.assign(result,{promotionsCount:state.promotionsCount?.[other(observer)] ?? 0,observer}) as BeliefState;
}

function movementShape(power:Power, from:Square, to:Square, state:PublicState, side:Side):boolean {
  const dr=to.row-from.row, dc=to.col-from.col, distance=Math.max(Math.abs(dr),Math.abs(dc));
  if(!inside(to)||(!dr&&!dc)) return false;
  if(power==='king') return distance===1 || (dr===0&&Math.abs(dc)===2&&from.col===4);
  if(power==='knight') return Math.abs(dr)*Math.abs(dc)===2;
  if(power==='pawn') return dc===0 ? (dr===direction(side) || dr===2*direction(side)) : Math.abs(dc)===1&&dr===direction(side);
  const diagonal=Math.abs(dr)===Math.abs(dc), straight=dr===0||dc===0;
  if(power==='bishop'&&!diagonal || power==='rook'&&!straight || power==='queen'&&!(diagonal||straight)) return false;
  if(power==='bishop'||power==='rook'||power==='queen'){
    const step={row:Math.sign(dr),col:Math.sign(dc)}; for(let i=1;i<distance;i++) if(state.pieces.some(piece=>same(piece.square,{row:from.row+step.row*i,col:from.col+step.col*i}))) return false;
  }
  return true;
}

/** Incorporates only public evidence; it never turns a belief into engine ground truth. */
export function updateBeliefs(previousBeliefs:BeliefState, previous:PublicState, current:PublicState):BeliefState {
  const next:Record<string,Power[]> = Object.fromEntries(Object.entries(previousBeliefs).filter(([id])=>id!=='promotionsCount'&&id!=='observer').map(([id,candidates])=>[id,[...(candidates as Power[])]]));
  let promotionsCount=previousBeliefs.promotionsCount;
  const move=current.lastMove; if(!move) return Object.assign(next,{promotionsCount:previousBeliefs.promotionsCount,observer:previousBeliefs.observer}) as BeliefState;
  const moved=previous.pieces.find(piece=>same(piece.square,move.from));
  if(moved?.side===other(previousBeliefs.observer)){
    const candidates=next[moved.id] ?? [...allPowers];
    next[moved.id]=candidates.filter(power=>movementShape(power,move.from,move.to,previous,moved.side));
    if (next[moved.id].length===0) next[moved.id]=['pawn','knight','bishop','rook','queen'];
    const wasEmpty=!previous.pieces.some(piece=>same(piece.square,move.to));
    if(wasEmpty&&Math.abs(move.to.col-move.from.col)===1&&Math.abs(move.to.row-move.from.row)===1) next[moved.id]=['pawn'];
    if(Math.abs(move.to.col-move.from.col)===2&&move.from.col===4){
      next[moved.id]=['king'];
      const rookFrom={row:move.from.row,col:move.to.col===6?7:0}; const rook=previous.pieces.find(piece=>same(piece.square,rookFrom)); if(rook) next[rook.id]=['rook'];
    }
    if((move.to.row===0||move.to.row===7)&&next[moved.id]?.includes('pawn')){next[moved.id]=['queen','rook','bishop','knight']; promotionsCount+=1;}
  }
  return Object.assign(next,{promotionsCount,observer:previousBeliefs.observer}) as unknown as BeliefState;
}

function worldFromPublic(publicState:PublicState):GameState {
  return {pieces:publicState.pieces.map(piece=>({...piece,power:piece.power ?? 'pawn'})),turn:publicState.turn,lastMove:publicState.lastMove,history:publicState.history,castling:publicState.castling,enPassant:publicState.enPassant,status:'playing',moveNumber:publicState.moveNumber,promotionsCount:publicState.promotionsCount,halfMoveClock:publicState.halfMoveClock,positionCounts:publicState.positionCounts};
}

/** Completes hidden powers subject to candidate sets and per-side global capacities. */
export function sampledWorlds(publicState:PublicState, beliefs:BeliefState, count=2, random:RandomSource=secureRandom):GameState[] {
  const hidden=publicState.pieces.filter(piece=>piece.power===undefined);
  const worlds:GameState[]=[]; const limits={...standardCapacity};
  for(const power of ['queen','rook','bishop','knight'] as Power[]) limits[power]+=beliefs.promotionsCount;
  for(let attempt=0;attempt<count*12&&worlds.length<count;attempt++){
    const used:Record<Power,number>={pawn:0,knight:0,bishop:0,rook:0,queen:0,king:0};
    const assignment:Record<string,Power>={}; let valid=true;
    const hiddenSide=hidden[0]?.side;
    for(const piece of publicState.pieces.filter(item=>item.power!==undefined&&item.side===hiddenSide)) used[piece.power!]+=1;
    const shuffled=shuffle(hidden,random);
    const assign=(index:number):boolean=>{if(index===shuffled.length)return used.king===1; const piece=shuffled[index];
      const options=shuffle(((beliefs[piece.id] as Power[]|undefined)??allPowers).filter(power=>used[power]<limits[power]),random);
      for(const chosen of options){assignment[piece.id]=chosen;used[chosen]+=1;if(assign(index+1))return true;used[chosen]-=1;delete assignment[piece.id];} return false;
    };
    valid=assign(0);
    if(!valid||used.king!==1) continue;
    const base=worldFromPublic(publicState); worlds.push({...base,pieces:base.pieces.map(piece=>piece.power==='pawn'&&assignment[piece.id]?{...piece,power:assignment[piece.id]}:assignment[piece.id]?{...piece,power:assignment[piece.id]}:piece)});
  }
  return worlds.length?worlds:[worldFromPublic(publicState)];
}

const makePst=(power:Power,endgame:boolean)=>Array.from({length:64},(_,index)=>{const row=Math.floor(index/8),col=index%8,center=3.5-Math.max(Math.abs(3.5-row),Math.abs(3.5-col));if(power==='pawn')return (7-row)*(endgame?7:4)+Math.max(0,3-Math.abs(3.5-col));if(power==='knight')return center*(endgame?9:6)-Math.abs(row-3.5)*(endgame?1:2);if(power==='bishop')return center*(endgame?6:4)+(row===col||row+col===7?3:0);if(power==='rook')return (7-row)*(endgame?2:1)+(col===0||col===7?0:2);if(power==='queen')return center*(endgame?3:2);return endgame?center*8:((row>=6?8:0)-Math.max(0,center)*2);});
const pstMid:Record<Power,number[]>=Object.fromEntries((['pawn','knight','bishop','rook','queen','king'] as Power[]).map(power=>[power,makePst(power,false)])) as Record<Power,number[]>;
const pstEnd:Record<Power,number[]>=Object.fromEntries((['pawn','knight','bishop','rook','queen','king'] as Power[]).map(power=>[power,makePst(power,true)])) as Record<Power,number[]>;
const phaseWeight:Record<Power,number>={pawn:0,knight:1,bishop:1,rook:2,queen:4,king:0};
function gamePhase(state:GameState){return Math.min(1,state.pieces.reduce((sum,piece)=>sum+phaseWeight[piece.power],0)/24);}
function pstBonus(piece:Piece,phase:number):number{const row=piece.side==='white'?7-piece.square.row:piece.square.row,index=row*8+piece.square.col;return pstMid[piece.power][index]*phase+pstEnd[piece.power][index]*(1-phase);}
function mobilityScore(state:GameState,side:Side){const weights:Record<Power,number>={pawn:1,knight:2,bishop:3,rook:3,queen:4,king:1};return state.pieces.filter(piece=>piece.side===side).reduce((sum,piece)=>sum+pseudo(state,piece).length*weights[piece.power],0);}
function kingSafety(state:GameState,side:Side,phase:number){const king=royal(state,side);if(!king)return 0;const direction=side==='white'?-1:1;let shield=0;for(let offset=-1;offset<=1;offset+=1){const square={row:king.square.row+direction,col:king.square.col+offset};if(state.pieces.some(piece=>piece.side===side&&piece.power==='pawn'&&same(piece.square,square)))shield+=8;}return shield*phase;}

const centerDistance=(square:Square)=>Math.max(Math.abs(3.5-square.row),Math.abs(3.5-square.col));
const chebyshev=(a:Square,b:Square)=>Math.max(Math.abs(a.row-b.row),Math.abs(a.col-b.col));
function materialEdge(state:GameState,forSide:Side){const enemy=other(forSide);const sum=(side:Side)=>state.pieces.filter(piece=>piece.side===side).reduce((total,piece)=>total+value[piece.power],0);return sum(forSide)-sum(enemy);}
/** Strong endgame king-hunt: force the enemy king to the edge/corner, restrict mobility, reward checks and piece proximity. */
function mopUpBonus(state:GameState,forSide:Side){
  const edge=materialEdge(state,forSide);
  const pieceCount=state.pieces.length;
  // Activate once we have a clear material advantage; the scale below already tapers by piece count
  if(edge<400) return 0;
  const enemy=other(forSide),myKing=royal(state,forSide),theirKing=royal(state,enemy);
  if(!myKing||!theirKing) return 0;
  const scale=Math.min(1.4, Math.max(0.35, (edge-200)/900) * (pieceCount<=8 ? 1.35 : pieceCount<=12 ? 1.1 : 0.85));
  let bonus=centerDistance(theirKing.square)*18*scale; // push to edge harder
  // Bishop corner trapping
  for(const piece of state.pieces)if(piece.side===forSide&&piece.power==='bishop'){
    const light=(piece.square.row+piece.square.col)%2===0;
    const corners:Square[]=light?[{row:0,col:0},{row:7,col:7}]:[{row:0,col:7},{row:7,col:0}];
    bonus+=(7-Math.min(...corners.map(c=>chebyshev(theirKing.square,c))))*5*scale;
  }
  // Bring our king closer and reduce enemy king mobility aggressively
  bonus+=(7-chebyshev(myKing.square,theirKing.square))*12*scale;
  const enemyKingMoves=legalMoves(state,theirKing).length;
  bonus+=(8-enemyKingMoves)*10*scale;
  if(inCheck(state,enemy)) bonus+=70*scale;
  // Reward every one of our pieces that is close to the enemy king (forces coordination)
  for(const piece of state.pieces){
    if(piece.side!==forSide||piece.power==='king') continue;
    const dist=chebyshev(piece.square,theirKing.square);
    if(dist<=3) bonus+=(4-dist)*6*scale;
  }
  // Extra when opponent is down to king + at most one minor
  if(pieceCount<=4) bonus+=80*scale;
  return bonus;
}
/** Penalize leaving our own pieces adjacent to enemy king when unprotected. */
function kingRadiusExposurePenalty(state:GameState,forSide:Side){
  const enemy=other(forSide),theirKing=royal(state,enemy);
  if(!theirKing) return 0;
  let penalty=0;
  for(const piece of state.pieces){
    if(piece.side!==forSide||chebyshev(piece.square,theirKing.square)!==1) continue;
    const defended=isAttacked(state,piece.square,forSide);
    const canCapture=legalMoves(state,theirKing).some(square=>same(square,piece.square));
    if(canCapture&&!defended) penalty+=value[piece.power]*1.8;
  }
  return penalty;
}
/** Heavy penalty for opponent pieces that have infiltrated our half of the board (especially high-value ones). */
function infiltratorPenalty(state:GameState,forSide:Side):number{
  const enemy=other(forSide);
  const ourHome=forSide==='white'?[4,5,6,7]:[0,1,2,3]; // rows that belong more to us
  let penalty=0;
  for(const piece of state.pieces){
    if(piece.side!==enemy) continue;
    const advanced=ourHome.includes(piece.square.row);
    if(!advanced) continue;
    // Base infiltration cost scaled by power value
    const depthFactor=forSide==='white'?(piece.square.row-3.5):(3.5-piece.square.row);
    const base=value[piece.power]*0.18 + Math.max(0,depthFactor)*25;
    // Extra if the infiltrator is currently safe (not under attack) – forces us to eliminate it
    const underFire=isAttacked(state,piece.square,forSide);
    penalty+=underFire?base*0.55:base*1.25;
  }
  return penalty;
}
/** Bonus for attacking high-value enemy pieces (encourages active defence). */
function attackPressure(state:GameState,forSide:Side):number{
  const enemy=other(forSide);
  let pressure=0;
  for(const piece of state.pieces){
    if(piece.side!==enemy) continue;
    if(isAttacked(state,piece.square,forSide)){
      const defended=isAttacked(state,piece.square,enemy);
      // Prefer attacking undefended high-value pieces hardest
      pressure+=value[piece.power]*(defended?0.12:0.35);
    }
  }
  return pressure;
}
const DRAW_SCORE=0;
const MATE_SCORE=1000000;

export function evaluateChampion(state:GameState,forSide:Side='black'):number {
  if(state.status==='over')return state.winner?(state.winner===forSide?MATE_SCORE:-MATE_SCORE):DRAW_SCORE;
  const enemy=other(forSide); let score=0;const phase=gamePhase(state);
  for(const piece of state.pieces){
    const sign=piece.side===forSide?1:-1;
    let contribution=value[piece.power]+pstBonus(piece,phase);
    const attacked=isAttacked(state,piece.square,enemy), defended=isAttacked(state,piece.square,piece.side);
    // Stronger hanging-piece logic: almost full value loss when hanging, extra for high-value
    if(attacked&&!defended){
      const hangFactor=piece.power==='queen'||piece.power==='rook'?1.05:0.92;
      contribution-=value[piece.power]*hangFactor;
    }
    score+=sign*contribution;
  }
  // More aggressive check rewards / penalties
  if(inCheck(state,enemy)) score+=180+Math.round((1-phase)*60);
  if(inCheck(state,forSide)) score-=220-Math.round(phase*40);
  score+=(mobilityScore(state,forSide)-mobilityScore(state,enemy))*((phase*2.2+1)/3);
  score+=kingSafety(state,forSide,phase)-kingSafety(state,enemy,phase);
  score+=mopUpBonus(state,forSide)-mopUpBonus(state,enemy);
  score-=kingRadiusExposurePenalty(state,forSide);
  score+=kingRadiusExposurePenalty(state,enemy)*0.7;
  // Core new terms for the reported problems
  score-=infiltratorPenalty(state,forSide);           // punish enemy pieces deep on our side
  score+=infiltratorPenalty(state,enemy)*0.85;       // reward our own infiltration
  score+=attackPressure(state,forSide)-attackPressure(state,enemy)*0.7;
  return score;
}

const zobristTable=new Int32Array(2*64*6+64);let zobristSeed=0x6d2b79f5;for(let index=0;index<zobristTable.length;index+=1){zobristSeed|=0;zobristSeed=(zobristSeed+0x6d2b79f5)|0;let value=zobristSeed;value=Math.imul(value^(value>>>15),1|value);value^=value+Math.imul(value^(value>>>7),61|value);zobristTable[index]=value^(value>>>14);}
const powerIndex:Record<Power,number>={pawn:0,knight:1,bishop:2,rook:3,queen:4,king:5};
export function zobristHash(state:GameState):number{let hash=state.turn==='white'?0x9e3779b9:0x85ebca6b;for(const piece of state.pieces){const index=((piece.side==='white'?0:1)*64+piece.square.row*8+piece.square.col)*6+powerIndex[piece.power];hash^=zobristTable[index];if(piece.hasMoved)hash^=zobristTable[768+piece.square.row*8+piece.square.col];}const rights=state.castling;hash^=rights.white.kingSide?0x13579bdf:0;hash^=rights.white.queenSide?0x2468ace0:0;hash^=rights.black.kingSide?0x369c2581:0;hash^=rights.black.queenSide?0x48ace013:0;if(state.enPassant)hash^=zobristTable[768+state.enPassant.target.row*8+state.enPassant.target.col];return hash|0;}
export type SearchTelemetry = { nodes:number; ttHits:number; ttStores:number; quiescenceNodes:number };
type SearchContext = { deadline: number; table: Map<number, number>; timedOut: boolean; aiSide: Side; killers: Map<number,string[]>; history: Map<string,number>; telemetry?:SearchTelemetry };
const AI_SEARCH_TIME_BUDGET_MS=1800; // more time for deeper / more aggressive search
const DIRECT_SEARCH_TIME_BUDGET_MS=250;
const QUIESCENCE_DEPTH=4;
const MATE_TT_THRESHOLD=MATE_SCORE-10000;
function terminalScore(state:GameState,aiSide:Side,ply:number){if(state.status==='over')return state.winner?(state.winner===aiSide?MATE_SCORE-ply:-MATE_SCORE+ply):DRAW_SCORE;return undefined;}
function restoreTtScore(score:number,ply:number){return score>=MATE_TT_THRESHOLD?score-ply:score<=-MATE_TT_THRESHOLD?score+ply:score;}
function storeTtScore(score:number,ply:number){return score>=MATE_TT_THRESHOLD?score+ply:score<=-MATE_TT_THRESHOLD?score-ply:score;}
function isCaptureMove(state:GameState,move:Move):boolean{const target=at(state,move.to);return !!target&&target.side!==state.turn||!!enPassantTarget(state,at(state,move.from)!,move.to);}
function givesCheckAfter(state:GameState,move:Move):boolean{const moving=at(state,move.from);if(!moving)return false;const next=simulate(state,moving,move.to,move.promotion);return inCheck(next,other(state.turn));}
function quiescence(state:GameState,alpha:number,beta:number,aiSide:Side,depthGuard=8,context?:SearchContext,ply=0):number{
  if(context){context.telemetry??={nodes:0,ttHits:0,ttStores:0,quiescenceNodes:0};context.telemetry.quiescenceNodes+=1;}
  const terminal=terminalScore(state,aiSide,ply);if(terminal!==undefined)return terminal;
  if(context&&performance.now()>=context.deadline){context.timedOut=true;return evaluateChampion(state,aiSide);}
  const moves=allLegalMoves(state,state.turn);if(!moves.length)return inCheck(state,state.turn)?(state.turn===aiSide?-MATE_SCORE+ply:MATE_SCORE-ply):DRAW_SCORE;
  const maximizing=state.turn===aiSide, evading=inCheck(state,state.turn), standPat=evaluateChampion(state,aiSide);
  // A side in check cannot "stand pat" - it must resolve the check, even via a quiet move, so every legal evasion is searched.
  if(!evading){
    if(depthGuard<=0)return standPat;
    if(maximizing){if(standPat>=beta)return beta;alpha=Math.max(alpha,standPat);}else{if(standPat<=alpha)return alpha;beta=Math.min(beta,standPat);}
  }
  // Prioritise captures of high-value / infiltrating pieces and checks; when in check, every legal escape is a candidate
  const noisyMoves=(evading?moves:moves.filter(move=>isCaptureMove(state,move)||givesCheckAfter(state,move))).sort((a,b)=>moveOrderValue(state,b)-moveOrderValue(state,a));
  if(!noisyMoves.length)return standPat;
  for(const move of noisyMoves){if(context&&performance.now()>=context.deadline){context.timedOut=true;break;}const next=applyMove(state,move);if(!next)continue;const score=quiescence(next,alpha,beta,aiSide,depthGuard-1,context,ply+1);if(maximizing){alpha=Math.max(alpha,score);if(alpha>=beta)break;}else{beta=Math.min(beta,score);if(beta<=alpha)break;}}
  return maximizing?alpha:beta;
}
function moveKey(move:Move){return `${key(move.from)}-${key(move.to)}`;}
function moveOrderValue(state:GameState,move:Move,context?:SearchContext,ply=0):number {
  const moving=at(state,move.from);
  const captured=at(state,move.to)??(moving&&enPassantTarget(state,moving,move.to)?at(state,state.enPassant!.captureSquare):undefined);
  let score=0;
  if(captured&&moving){
    // MVV-LVA with extra weight on high-value targets and on captures inside our territory
    score=value[captured.power]*12 - value[moving.power];
    const ourTerritory=moving.side==='white'?captured.square.row>=4:captured.square.row<=3;
    if(ourTerritory) score+=value[captured.power]*4; // strongly prefer killing infiltrators
    if(captured.power==='queen'||captured.power==='rook') score+=800;
    if(!isAttacked(state,move.to,captured.side)) score+=250; // free/undefended capture: good regardless of guessed power
  }
  const next=moving?simulate(state,moving,move.to,move.promotion):undefined;
  if(next&&inCheck(next,other(state.turn))) score+=6500; // checks first
  // Prefer moves that attack the enemy king more closely in endgames
  if(next){
    const theirKing=royal(next,other(state.turn));
    if(theirKing&&moving){
      const before=chebyshev(moving.square,theirKing.square);
      const after=chebyshev(move.to,theirKing.square);
      if(after<before) score+=180*(before-after);
    }
  }
  const id=moveKey(move);
  if(context?.killers.get(ply)?.includes(id)) score+=4500;
  score+=context?.history.get(id)??0;
  return score;
}
function positionKey(state:GameState,depth:number){return (zobristHash(state)^Math.imul(depth+1,0x45d9f3b))|0;}

export function search(state:GameState,depth:number,alpha=-Infinity,beta=Infinity,context?:SearchContext,ply=0):number {
  if(!context)context={deadline:performance.now()+DIRECT_SEARCH_TIME_BUDGET_MS,table:new Map(),timedOut:false,aiSide:'black',killers:new Map(),history:new Map(),telemetry:{nodes:0,ttHits:0,ttStores:0,quiescenceNodes:0}};
  context.telemetry??={nodes:0,ttHits:0,ttStores:0,quiescenceNodes:0};
  context.telemetry.nodes+=1;
  const aiSide=context?.aiSide??'black',terminal=terminalScore(state,aiSide,ply);if(terminal!==undefined)return terminal;
  if(context&&performance.now()>=context.deadline){context.timedOut=true;return evaluateChampion(state,aiSide);}
  const cached=context.table.get(positionKey(state,depth)); if(cached!==undefined){context.telemetry.ttHits+=1;return restoreTtScore(cached,ply);}
  const moves=allLegalMoves(state,state.turn).sort((a,b)=>moveOrderValue(state,b,context,ply)-moveOrderValue(state,a,context,ply));
  if(!moves.length)return inCheck(state,state.turn)?(state.turn===aiSide?-MATE_SCORE+ply:MATE_SCORE-ply):DRAW_SCORE;
  if(depth<=0)return quiescence(state,alpha,beta,aiSide,QUIESCENCE_DEPTH,context,ply);
  const maximizing=state.turn===aiSide; let best=maximizing?-Infinity:Infinity; let cutoff=false;
  for(const move of moves){if(context&&performance.now()>=context.deadline){context.timedOut=true;break;} const next=applyMove(state,move); if(!next) continue; const score=search(next,depth-1,alpha,beta,context,ply+1);
    if(maximizing){best=Math.max(best,score);alpha=Math.max(alpha,best);}else{best=Math.min(best,score);beta=Math.min(beta,best);} if(beta<=alpha){cutoff=true;if(context&&!isCaptureMove(state,move)){const id=moveKey(move),list=context.killers.get(ply)??[];if(!list.includes(id))context.killers.set(ply,[id,...list].slice(0,2));context.history.set(id,(context.history.get(id)??0)+depth*depth);}break;}
  } if(!context.timedOut&&!cutoff){context.table.set(positionKey(state,depth),storeTtScore(best,ply));context.telemetry.ttStores+=1;} return best;
}

export type AiSearchReport = { elapsedMs:number; completedDepth:number; nodes:number; ttHits:number; ttStores:number; quiescenceNodes:number; sampledWorlds:number; perWorldRootScores:number[]; finalCandidateScores:Array<{move:Move;perWorld:number[];average:number}>; selectedMove:Move|null; timedOut:boolean; rootCandidates:number };
export type AiSearchOptions = { random?:RandomSource; timeBudgetMs?:number };

/** Conservative public-information legality gate: a move is allowed only if no
 * possible hidden power can expose the AI royal piece after the move. */
function robustRootLegal(publicState:PublicState,beliefs:BeliefState,move:Move):boolean{
  const base=worldFromPublic(publicState), hidden=publicState.pieces.filter(piece=>piece.power===undefined);
  for(const piece of hidden){
    const candidates=(beliefs[piece.id] as Power[]|undefined)??allPowers;
    for(const power of candidates){
      const hypothetical={...base,pieces:base.pieces.filter(item=>item.power!==undefined||item.id===piece.id).map(item=>item.id===piece.id?{...item,power}:item)};
      const next=applyMove(hypothetical,move);
      if(next&&inCheck(next,beliefs.observer))return false;
    }
  }
  return true;
}

export async function chooseAiMoveReport(publicState:PublicState,beliefs:BeliefState,options:AiSearchOptions={}):Promise<AiSearchReport> {
  const aiSide=beliefs.observer;
  const startTime=performance.now(), deadline=startTime+(options.timeBudgetMs??AI_SEARCH_TIME_BUDGET_MS);
  // Sample 3 worlds for better belief coverage; still fast enough with improved ordering
  const worlds=sampledWorlds(publicState,beliefs,3,options.random), candidates=new Map<string,Move>();
  const legalSets=worlds.map(world=>new Set(allLegalMoves(world,aiSide).map(move=>`${key(move.from)}-${key(move.to)}`)));
  for(const move of allLegalMoves(worlds[0],aiSide)){
    const id=`${key(move.from)}-${key(move.to)}`;
    if(legalSets.every(set=>set.has(id))&&robustRootLegal(publicState,beliefs,move))candidates.set(id,move);
  }
  const rootOrderValue=(move:Move)=>Math.max(...worlds.map(world=>moveOrderValue(world,move)));
  const orderedCandidates=[...candidates.values()].sort((a,b)=>rootOrderValue(b)-rootOrderValue(a));
  let best:Move|null=orderedCandidates[0]??null;const table=new Map<number,number>();let completedDepth=0;let timedOut=false;let telemetry:SearchTelemetry={nodes:0,ttHits:0,ttStores:0,quiescenceNodes:0};let finalCandidateScores:Array<{move:Move;perWorld:number[];average:number}>=[];
  // Iterative deepening up to depth 9; aggressive move ordering + stronger eval lets us find the obvious captures and mates faster
  for(let depth=1;depth<=9;depth+=1){
    if(best){const priorIndex=orderedCandidates.findIndex(move=>same(move.from,best!.from)&&same(move.to,best!.to));if(priorIndex>0){const [priorMove]=orderedCandidates.splice(priorIndex,1);orderedCandidates.unshift(priorMove);}}
    const context:SearchContext={deadline,table,timedOut:false,aiSide,killers:new Map(),history:new Map(),telemetry};
    let depthBest:Move|null=null,depthScore=-Infinity;
    const depthScores:Array<{move:Move;perWorld:number[];average:number}>=[];
    for(let index=0;index<orderedCandidates.length;index+=1){
      if(performance.now()>=deadline){context.timedOut=true;break;}
      if(index%3===0) await new Promise<void>(resolve=>setTimeout(resolve,0));
      const move=orderedCandidates[index];
      let total=0;const perWorld:number[]=[];
      for(const world of worlds){
        const next=applyMove(world,move);
        const score=next?search(next,depth-1,-Infinity,Infinity,context):-100000; perWorld.push(score); total+=score;
        if(context.timedOut) break;
      }
      if(context.timedOut) break;
      const score=total/worlds.length;
      depthScores.push({move,perWorld,average:score});
      if(score>depthScore){depthScore=score;depthBest=move;}
    }
    if(context.timedOut||!depthBest){timedOut=context.timedOut;break;}
    best=depthBest;
    completedDepth=depth;finalCandidateScores=depthScores;
  }
  const selectedScores=finalCandidateScores.find(item=>best&&same(item.move.from,best.from)&&same(item.move.to,best.to));
  return {elapsedMs:performance.now()-startTime,completedDepth,nodes:telemetry.nodes,ttHits:telemetry.ttHits,ttStores:telemetry.ttStores,quiescenceNodes:telemetry.quiescenceNodes,sampledWorlds:worlds.length,perWorldRootScores:selectedScores?.perWorld??[],finalCandidateScores,selectedMove:best,timedOut,rootCandidates:orderedCandidates.length};
}

export async function chooseAiMove(publicState:PublicState,beliefs:BeliefState):Promise<Move|null> {
  return (await chooseAiMoveReport(publicState,beliefs)).selectedMove;
}
