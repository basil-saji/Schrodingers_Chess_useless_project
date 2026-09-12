import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { allLegalMoves, applyMove, createGame, inCheck, legalMoves, royal, toPublicState, type GameState, type Move, type Power, type Side } from "./engine.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(supabaseUrl, serviceKey);
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Action = "create" | "join" | "state" | "move" | "disconnect";
type RequestBody = { action: Action; gameId?: string; joinCode?: string; token?: string; move?: Move; expectedVersion?: number };

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } }); }
function randomToken() { const bytes = new Uint8Array(32); crypto.getRandomValues(bytes); return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join(""); }
async function hashToken(token: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)); return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join(""); }
function makeCode() { const bytes = new Uint8Array(5); crypto.getRandomValues(bytes); return [...bytes].map(byte => alphabet[byte % alphabet.length]).join(""); }
function publicState(state: GameState) { return { ...toPublicState(state, "white"), pieces: state.pieces.map(({ power: _power, ...piece }) => piece), status: state.status, winner: state.winner, reason: state.reason }; }
function privateState(state: GameState, side: Side, sessionStatus: "waiting" | "active" | "finished" | "abandoned") { const checked = inCheck(state, state.turn); return { state: toPublicState(state, side), legalMoves: Object.fromEntries(state.pieces.filter(piece => piece.side === side).map(piece => [piece.id, legalMoves(state, piece)])), status: sessionStatus, winner: state.winner, reason: state.reason, inCheck: checked, checkSquare: checked ? royal(state, state.turn)?.square : undefined }; }
async function broadcast(gameId: string, event: string, payload: unknown) { await admin.channel(`game:${gameId}`).send({ type: "broadcast", event, payload }); }
async function findPlayer(gameId: string, token: string) {
  const tokenHash = await hashToken(token);
  const { data } = await admin.from("multiplayer_players").select("side").eq("game_id", gameId).eq("token_hash", tokenHash).maybeSingle();
  return data as { side: Side } | null;
}
async function gameFor(gameId: string) {
  const { data, error } = await admin.from("multiplayer_games").select("*").eq("id", gameId).maybeSingle();
  if (error || !data) throw new Error("Game not found");
  return data as { id: string; status: string; public_state: unknown; authoritative_state: GameState; state_version: number; turn: Side; winner?: Side; reason?: string };
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await request.json() as RequestBody;
    if (body.action === "create") {
      const game = createGame();
      const token = randomToken();
      const tokenHash = await hashToken(token);
      let code = makeCode();
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const { data } = await admin.from("multiplayer_games").select("id").eq("join_code", code).maybeSingle();
        if (!data) break;
        code = makeCode();
      }
      const { data: created, error } = await admin.from("multiplayer_games").insert({ join_code: code, public_state: publicState(game), authoritative_state: game, state_version: 0, status: "waiting", turn: "white" }).select("id, join_code, status, public_state, state_version, turn").single();
      if (error || !created) throw new Error("Could not create game");
      const player = await admin.from("multiplayer_players").insert({ game_id: created.id, side: "white", token_hash: tokenHash }).select("side").single();
      if (player.error) throw new Error("Could not reserve player seat");
      return response({ gameId: created.id, joinCode: created.join_code, token, side: "white", stateVersion: 0, ...privateState(game, "white", "waiting") });
    }
    if (body.action === "join") {
      const code = body.joinCode?.trim().toUpperCase();
      if (!code || !/^[A-Z2-9]{5}$/.test(code)) return response({ error: "Enter a valid five-character game code." }, 400);
      const { data: gameRow } = await admin.from("multiplayer_games").select("*").eq("join_code", code).maybeSingle();
      if (!gameRow) return response({ error: "Game code not found." }, 404);
      if (gameRow.status !== "waiting") return response({ error: "That game is no longer joinable." }, 409);
      const token = randomToken();
      const player = await admin.from("multiplayer_players").insert({ game_id: gameRow.id, side: "black", token_hash: await hashToken(token) });
      if (player.error) return response({ error: "That game is already full." }, 409);
      const state = gameRow.authoritative_state as GameState;
      const { error } = await admin.from("multiplayer_games").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", gameRow.id).eq("status", "waiting");
      if (error) throw error;
      await broadcast(gameRow.id, "opponent_joined", { status: "active" });
      return response({ gameId: gameRow.id, joinCode: code, token, side: "black", stateVersion: 0, ...privateState(state, "black", "active") });
    }
    if (!body.gameId || !body.token) return response({ error: "Missing game session." }, 401);
    const player = await findPlayer(body.gameId, body.token);
    if (!player) return response({ error: "Invalid game session." }, 401);
    await admin.from("multiplayer_players").update({ connected: body.action !== "disconnect", last_seen_at: new Date().toISOString() }).eq("game_id", body.gameId).eq("side", player.side);
    const gameRow = await gameFor(body.gameId);
    if (body.action === "disconnect") { await broadcast(body.gameId, "presence", { side: player.side, connected: false }); return response({ ok: true }); }
    if (body.action === "state") return response({ gameId: body.gameId, side: player.side, ...privateState(gameRow.authoritative_state, player.side, gameRow.status as "waiting" | "active" | "finished" | "abandoned"), stateVersion: gameRow.state_version });
    if (body.action !== "move" || !body.move) return response({ error: "Unsupported action." }, 400);
    if (gameRow.status !== "active") return response({ error: "Game is not active." }, 409);
    if (gameRow.turn !== player.side) return response({ error: "It is not your turn." }, 409);
    if (body.expectedVersion !== gameRow.state_version) return response({ error: "Stale game state. Resynchronize and try again." }, 409);
    const next = applyMove(gameRow.authoritative_state, body.move);
    if (!next) return response({ error: "Illegal move." }, 422);
    const nextStatus = next.status === "over" ? "finished" : "active";
    const update = await admin.from("multiplayer_games").update({ authoritative_state: next, public_state: publicState(next), state_version: gameRow.state_version + 1, status: nextStatus, turn: next.turn, winner: next.winner ?? null, reason: next.reason ?? null, updated_at: new Date().toISOString() }).eq("id", body.gameId).eq("state_version", gameRow.state_version).eq("turn", player.side).eq("status", "active").select("state_version").maybeSingle();
    if (update.error || !update.data) return response({ error: "Move conflicted with another update. Resynchronize." }, 409);
    await broadcast(body.gameId, "state", { publicState: publicState(next), stateVersion: gameRow.state_version + 1, status: nextStatus, turn: next.turn, winner: next.winner, reason: next.reason });
    return response({ gameId: body.gameId, side: player.side, stateVersion: gameRow.state_version + 1, ...privateState(next, player.side, nextStatus) });
  } catch (error) {
    console.error(error);
    return response({ error: error instanceof Error ? error.message : "Unexpected multiplayer error." }, 500);
  }
});
