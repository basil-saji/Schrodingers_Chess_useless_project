import { chooseAiMove, type BeliefState, type Move, type PublicState } from '../game/engine';

type AiRequest = { publicState: PublicState; beliefs: BeliefState };

self.onmessage = async (event: MessageEvent<AiRequest>) => {
  const move: Move | null = await chooseAiMove(event.data.publicState, event.data.beliefs);
  self.postMessage(move);
};
