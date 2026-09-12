export type Side = 'white' | 'black';
export type Power = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';
export type Visual = Power;
export type Square = { row: number; col: number };
export type Piece = { id: string; side: Side; visual: Visual; power: Power; square: Square; hasMoved: boolean };
export type Move = { from: Square; to: Square; promotion?: Power };
export type CastlingRights = { white: { kingSide: boolean; queenSide: boolean }; black: { kingSide: boolean; queenSide: boolean } };
export type EnPassantState = { target: Square; captureSquare: Square; pawnId: string };
export type GameState = { pieces: Piece[]; turn: Side; lastMove?: Move; history: Move[]; castling: CastlingRights; enPassant?: EnPassantState; status: 'playing' | 'over'; winner?: Side; reason?: string; moveNumber: number };
export type PublicPiece = Omit<Piece, 'power'> & { power?: Power };
export type PublicState = { pieces: PublicPiece[]; turn: Side; lastMove?: Move; moveNumber: number };

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
  return {pieces,turn:'white',history:[],castling:freshCastling(),status:'playing',moveNumber:1};
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
  return {...future,lastMove:recorded,history:[...state.history,recorded],moveNumber:state.moveNumber+(state.turn==='black'?1:0),status,winner:status==='over'&&checked?state.turn:undefined,reason:status==='over'?(checked?'Checkmate':'Stalemate'):undefined};
}
export function toPublicState(state:GameState,observer:Side):PublicState{return{pieces:state.pieces.map(piece=>piece.side===observer?{...piece}:{...piece,power:undefined}),turn:state.turn,lastMove:state.lastMove,moveNumber:state.moveNumber};}
export type BeliefState=Record<string,Power[]>;
export function createBeliefs(state:GameState,observer:Side):BeliefState{const candidates:Power[]=['pawn','knight','bishop','rook','queen','king'];return Object.fromEntries(state.pieces.filter(piece=>piece.side!==observer).map(piece=>[piece.id,candidates]));}
export function chooseAiMove(publicState:PublicState,_beliefs:BeliefState):Move|null{
  const mine=publicState.pieces.filter(piece=>piece.side==='black'&&piece.power),occupied=new Set(publicState.pieces.map(piece=>key(piece.square))),candidates:Move[]=[];
  mine.forEach(piece=>{const add=(square:Square)=>{if(!inside(square))return;const target=publicState.pieces.find(candidate=>same(candidate.square,square));if((!target||target.side==='white')&&!(piece.power==='pawn'&&square.col!==piece.square.col&&!target))candidates.push({from:piece.square,to:square});};
    if(piece.power==='king'||piece.power==='knight'){const offsets=piece.power==='king'?[...diagonals,...orthogonals]:[{row:-2,col:-1},{row:-2,col:1},{row:-1,col:-2},{row:-1,col:2},{row:1,col:-2},{row:1,col:2},{row:2,col:-1},{row:2,col:1}];offsets.forEach(offset=>add({row:piece.square.row+offset.row,col:piece.square.col+offset.col}));}
    else if(piece.power==='pawn'){add({row:piece.square.row+1,col:piece.square.col});add({row:piece.square.row+1,col:piece.square.col-1});add({row:piece.square.row+1,col:piece.square.col+1});}
    else{const directions=piece.power==='bishop'?diagonals:piece.power==='rook'?orthogonals:[...diagonals,...orthogonals];directions.forEach(delta=>{for(let distance=1;distance<8;distance+=1){const square={row:piece.square.row+delta.row*distance,col:piece.square.col+delta.col*distance};if(!inside(square))break;const target=publicState.pieces.find(candidate=>same(candidate.square,square));if(target){if(target.side==='white')add(square);break;}add(square);}});}
  });
  void occupied;return candidates.length?candidates[Math.floor(secureRandom()*candidates.length)]:null;
}
