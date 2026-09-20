import { chooseAiMoveReport, type AiSearchReport, type BeliefState, type PublicState } from '../game/engine';

type AiRequest = { publicState: PublicState; beliefs: BeliefState };

self.onmessage = async (event: MessageEvent<AiRequest>) => {
  const report: AiSearchReport = await chooseAiMoveReport(event.data.publicState, event.data.beliefs);
  self.postMessage(report);
};
