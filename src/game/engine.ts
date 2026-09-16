export type Side = 'white' | 'black';
export type Power = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';
export type Visual = Power;
export type Square = { row: number; col: number };
export type Piece = { id: string; side: Side; visual: Visual; power: Power; square: Square; hasMoved: boolean };
export type Move = { from: Square; to: Square; promotion?: Power };
export type CastlingRights = { white: { kingSide: boolean; queenSide: boolean }; black: { kingSide: boolean; queenSide: boolean } };
export type EnPassantState = { target: Square; captureSquare: Square; pawnId: string };
export type GameState = { pieces: Piece[]; turn: Side; lastMove?: Move; history: Move[]; castling: CastlingRights; enPassant?: EnPassantState; status: 'playing' | 'over'; winner?: Side; reason?: string; moveNumber: number; promotionsCount?: Record<Side, number> };
export type PublicPiece = Omit<Piece, 'power'> & { power?: Power };
export type PublicState = { pieces: PublicPiece[]; turn: Side; lastMove?: Move; history: Move[]; castling: CastlingRights; enPassant?: EnPassantState; moveNumber: number; promotionsCount: Record<Side, number> };

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
function secureRandom(){const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]/2**32;}
function shuffle<T>(items:T[]){const result=[...items];for(let i=result.length-1;i>0;i-=1){const j=Math.floor(secureRandom()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
const freshCastling=():CastlingRights=>({white:{kingSide:true,queenSide:true},black:{kingSide:true,queenSide:true}});

export function createGame():GameState{
  const pieces:Piece[]=[];
  (['black','white'] as Side[]).forEach(side=>{const home=rank(side), pawnRow=side==='white'?6:1, assigned=shuffle(powers);
    back.forEach((visual,col)=>pieces.push({id:`${side}-${visual}-${col}`,side,visual,power:assigned[col],square:{row:home,col},hasMoved:false}));
    for(let col=0;col<8;col+=1)pieces.push({id:`${side}-pawn-${col}`,side,visual:'pawn',power:assigned[8+col],square:{row:pawnRow,col},hasMoved:false});
  });
  return {pieces,turn:'white',history:[],castling:freshCastling(),status:'playing',moveNumber:1,promotionsCount:{white:0,black:0}};
}
function at(state:GameState,square:Square){return state.pieces.find(piece=>same(piece.square,square));}
function ray(state:GameState,piece:Piece,directions:Square[],attacks=false){const result:Square[]=[];directions.forEach(delta=>{let square={row:piece.square.row+delta.row,col:piece.square.col+delta.col};while(inside(square)){const target=at(state,square);if(!target)result.push({...square});else{if(target.side!==piece.side&&(attacks||target.power!=='king'))result.push({...square});break;}square={row:square.row+delta.row,col:square.col+delta.col};}});return result;}
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
    const result=[...diagonals,...orthogonals].map(delta=>({row:row+delta.row,col:col+delta.col})).filter(inside).filter(square=>{const target=at(state,square);return !target||target.side!==piece.side&&(attacks||target.power!=='king');});
    if(!attacks)[2,-2].forEach(offset=>{const target={row,col:col+offset};if(canCastle(state,piece,target))result.push(target);});
    return result;
  }
  if(piece.power==='knight')return [{row:-2,col:-1},{row:-2,col:1},{row:-1,col:-2},{row:-1,col:2},{row:1,col:-2},{row:1,col:2},{row:2,col:-1},{row:2,col:1}].map(delta=>({row:row+delta.row,col:col+delta.col})).filter(inside).filter(square=>{const target=at(state,square);return !target||target.side!==piece.side&&target.power!=='king';});
  const result:Square[]=[];const dir=direction(piece.side);
  [-1,1].forEach(delta=>{const square={row:row+dir,col:col+delta};const target=inside(square)?at(state,square):undefined;if(inside(square)&&(attacks||(target&&target.side!==piece.side&&target.power!=='king')||enPassantTarget(state,piece,square)))result.push(square);});
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
export function legalMoves(state:GameState,piece:Piece){return pseudo(state,piece).filter(to=>{const target=at(state,to);return target?.power!=='king'&&!inCheck(simulate(state,piece,to),piece.side);});}
export function allLegalMoves(state:GameState,side:Side){return state.pieces.filter(piece=>piece.side===side).flatMap(piece=>legalMoves(state,piece).map(to=>({from:piece.square,to})));}
function updateCastling(rights:CastlingRights,piece:Piece,captured?:Piece){const next:CastlingRights={white:{...rights.white},black:{...rights.black}};if(piece.power==='king'){next[piece.side].kingSide=false;next[piece.side].queenSide=false;}if(piece.power==='rook'&&piece.square.row===rank(piece.side)){if(piece.square.col===7)next[piece.side].kingSide=false;if(piece.square.col===0)next[piece.side].queenSide=false;}if(captured?.power==='rook'&&captured.square.row===rank(captured.side)){if(captured.square.col===7)next[captured.side].kingSide=false;if(captured.square.col===0)next[captured.side].queenSide=false;}return next;}
export function applyMove(state:GameState,move:Move):GameState|null{
  const piece=at(state,move.from);if(!piece||piece.side!==state.turn||!legalMoves(state,piece).some(square=>same(square,move.to)))return null;
  const ep=enPassantTarget(state,piece,move.to), captured=ep?at(state,state.enPassant!.captureSquare):at(state,move.to);const promotionRank=piece.power==='pawn'&&(move.to.row===0||move.to.row===7);const promotion=promotionRank?(move.promotion??'queen'):undefined;
  if(promotion&&!['queen','rook','bishop','knight'].includes(promotion))return null;
  const next=simulate(state,piece,move.to,promotion), nextTurn=other(state.turn), nextCastling=updateCastling(state.castling,piece,captured), nextEnPassant=doublePawn(piece,move.to)?{target:{row:(piece.square.row+move.to.row)/2,col:move.to.col},captureSquare:{...move.to},pawnId:piece.id}:undefined;
  const recorded={...move,promotion}, future={...next,turn:nextTurn,castling:nextCastling,enPassant:nextEnPassant};const moves=allLegalMoves(future,nextTurn), checked=inCheck(future,nextTurn), status=moves.length?'playing':'over';
  const promotionsCount = state.promotionsCount ?? {white:0,black:0};
  return {...future,lastMove:recorded,history:[...state.history,recorded],moveNumber:state.moveNumber+(state.turn==='black'?1:0),promotionsCount:{...promotionsCount,[state.turn]:promotionsCount[state.turn]+(promotion?1:0)},status,winner:status==='over'&&checked?state.turn:undefined,reason:status==='over'?(checked?'Checkmate':'Stalemate'):undefined};
}

export type BeliefState = Record<string, Power[] | number | Side> & { promotionsCount: number; observer: Side };
const allPowers: Power[] = ['pawn','knight','bishop','rook','queen','king'];
const standardCapacity: Record<Power, number> = {pawn:8,knight:2,bishop:2,rook:2,queen:1,king:1};
const value: Record<Power, number> = {pawn:100,knight:320,bishop:330,rook:500,queen:900,king:20000};

export function toPublicState(state:GameState,observer:Side):PublicState{return{
  pieces:state.pieces.map(piece=>piece.side===observer?{...piece}:{...piece,power:undefined}),
  turn:state.turn,lastMove:state.lastMove,history:state.history,castling:state.castling,enPassant:state.enPassant,
  moveNumber:state.moveNumber,promotionsCount:state.promotionsCount ?? {white:0,black:0}
};}

export function createBeliefs(state:GameState,observer:Side):BeliefState{
  const result:Record<string,Power[]> = {};
  for(const piece of state.pieces.filter(item=>item.side!==observer)) result[piece.id]=[...allPowers];
  return Object.assign(result,{promotionsCount:state.promotionsCount?.[other(observer)] ?? 0,observer}) as BeliefState;
}

function movementShape(power:Power, from:Square, to:Square, state:PublicState):boolean {
  const dr=to.row-from.row, dc=to.col-from.col, distance=Math.max(Math.abs(dr),Math.abs(dc));
  if(!inside(to)||(!dr&&!dc)) return false;
  if(power==='king') return distance===1 || (dr===0&&Math.abs(dc)===2&&from.col===4);
  if(power==='knight') return Math.abs(dr)*Math.abs(dc)===2;
  if(power==='pawn') return dc===0 ? (dr===direction('white') || dr===2*direction('white')) : Math.abs(dc)===1&&dr===direction('white');
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
    next[moved.id]=candidates.filter(power=>movementShape(power,move.from,move.to,previous));
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
  return {pieces:publicState.pieces.map(piece=>({...piece,power:piece.power ?? 'pawn'})),turn:publicState.turn,lastMove:publicState.lastMove,history:publicState.history,castling:publicState.castling,enPassant:publicState.enPassant,status:'playing',moveNumber:publicState.moveNumber,promotionsCount:publicState.promotionsCount};
}

/** Completes hidden powers subject to candidate sets and per-side global capacities. */
export function sampledWorlds(publicState:PublicState, beliefs:BeliefState, count=2):GameState[] {
  const hidden=publicState.pieces.filter(piece=>piece.power===undefined);
  const worlds:GameState[]=[]; const limits={...standardCapacity};
  for(const power of ['queen','rook','bishop','knight'] as Power[]) limits[power]+=beliefs.promotionsCount;
  limits.pawn+=beliefs.promotionsCount;
  for(let attempt=0;attempt<count*12&&worlds.length<count;attempt++){
    const used:Record<Power,number>={pawn:0,knight:0,bishop:0,rook:0,queen:0,king:0};
    const assignment:Record<string,Power>={}; let valid=true;
    const hiddenSide=hidden[0]?.side;
    for(const piece of publicState.pieces.filter(item=>item.power!==undefined&&item.side===hiddenSide)) used[piece.power!]+=1;
    const shuffled=[...hidden].sort(()=>secureRandom()-.5);
    const assign=(index:number):boolean=>{if(index===shuffled.length)return used.king===1; const piece=shuffled[index];
      const options=((beliefs[piece.id] as Power[]|undefined)??allPowers).filter(power=>used[power]<limits[power]).sort(()=>secureRandom()-.5);
      for(const chosen of options){assignment[piece.id]=chosen;used[chosen]+=1;if(assign(index+1))return true;used[chosen]-=1;delete assignment[piece.id];} return false;
    };
    valid=assign(0);
    if(!valid||used.king!==1) continue;
    const base=worldFromPublic(publicState); worlds.push({...base,pieces:base.pieces.map(piece=>piece.power==='pawn'&&assignment[piece.id]?{...piece,power:assignment[piece.id]}:assignment[piece.id]?{...piece,power:assignment[piece.id]}:piece)});
  }
  return worlds.length?worlds:[worldFromPublic(publicState)];
}

const knightPst=[-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,5,5,0,-20,-40,-30,5,10,15,15,10,5,-30,-30,0,15,20,20,15,0,-30,-30,5,15,20,20,15,5,-30,-30,0,10,15,15,10,0,-30,-40,-20,0,0,0,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50];
function pstBonus(piece:Piece):number { const index=piece.square.row*8+piece.square.col; if(piece.power==='knight') return knightPst[piece.side==='white'?index:56-(index-index%8)+index%8]; if(piece.power==='pawn') return (piece.side==='black'?piece.square.row:7-piece.square.row)*8; return 0; }

export function evaluateChampion(state:GameState,forSide:Side='black'):number {
  const enemy=other(forSide); let score=0;
  for(const piece of state.pieces){const sign=piece.side===forSide?1:-1; let contribution=value[piece.power]+pstBonus(piece);
    const attacked=isAttacked(state,piece.square,enemy), defended=isAttacked(state,piece.square,piece.side);
    if(attacked&&!defended) contribution-=value[piece.power]*.8;
    score+=sign*contribution;
  }
  if(inCheck(state,enemy)) score+=120; if(inCheck(state,forSide)) score-=180;
  return score;
}

function moveOrderValue(state:GameState,move:Move):number { const captured=at(state,move.to); return captured?value[captured.power]:0; }

export function search(state:GameState,depth:number,alpha=-Infinity,beta=Infinity):number {
  const moves=allLegalMoves(state,state.turn).sort((a,b)=>moveOrderValue(state,b)-moveOrderValue(state,a)); if(depth<=0||!moves.length) return evaluateChampion(state);
  const maximizing=state.turn==='black'; let best=maximizing?-Infinity:Infinity;
  for(const move of moves){const next=applyMove(state,move); if(!next) continue; const score=search(next,depth-1,alpha,beta);
    if(maximizing){best=Math.max(best,score);alpha=Math.max(alpha,best);}else{best=Math.min(best,score);beta=Math.min(beta,best);} if(beta<=alpha) break;
  } return best;
}

export async function chooseAiMove(publicState:PublicState,beliefs:BeliefState):Promise<Move|null> {
  const worlds=sampledWorlds(publicState,beliefs,2), candidates=new Map<string,Move>();
  for(const world of worlds) for(const move of allLegalMoves(world,'black')) candidates.set(`${key(move.from)}-${key(move.to)}`,move);
  const orderedCandidates=[...candidates.values()].sort((a,b)=>{
    const world=worlds[0]; return moveOrderValue(world,b)-moveOrderValue(world,a);
  });
  let best:Move|null=null,bestScore=-Infinity;
  for(let index=0;index<orderedCandidates.length;index+=1){
    if(index%4===0) await new Promise<void>(resolve=>setTimeout(resolve,0));
    const move=orderedCandidates[index];
    let total=0;
    for(const world of worlds){const next=applyMove(world,move); total+=next?search(next,2):-100000;}
    const score=total/worlds.length; if(score>bestScore){bestScore=score;best=move;}
  } return best;
}
