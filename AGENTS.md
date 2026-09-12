# AGENTS.md

## Project

**Schrödinger's Chess** is a Progressive Web App chess game in which every piece retains its normal visual identity but receives a randomly assigned movement power at the beginning of each game.

Phase 1 consists exclusively of:

> **Human vs AI core gameplay**

Later phases may add additional systems, but Phase 1 must remain independently playable.

---

# Absolute Rules

These rules are non-negotiable.

## 1. Movement Power Is the Source of Truth

**Movement Power has absolute precedence over Visual Identity.**

Never use visual identity to determine gameplay behavior.

Visual identity is primarily a rendering/appearance property.

Movement power determines:

* legal movement;
* captures;
* attack generation;
* check;
* checkmate;
* royal status;
* promotion eligibility;
* promotion behavior;
* castling;
* en passant;
* all other gameplay-critical rules.

---

## 2. Piece Distribution

Each player begins with exactly 16 pieces.

Visual identities:

* 8 Pawn
* 2 Knight
* 2 Bishop
* 2 Rook
* 1 Queen
* 1 King

Movement powers:

* 8 Pawn
* 2 Knight
* 2 Bishop
* 2 Rook
* 1 Queen
* 1 King

The movement powers are randomly permuted among the visual pieces.

Each side receives an independent permutation.

---

## 3. Visual Identity

Visual identity never changes during normal gameplay.

A piece remains visually the same piece type throughout the game.

Promotion changes movement power, not visual identity.

---

## 4. Royal Piece

The piece whose current movement power is **KING** is the royal piece.

There is exactly one KING-powered piece per side at game initialization.

A visually-King piece is NOT automatically royal.

A visually non-King piece CAN be royal if its movement power is KING.

Never implement royal status using visual identity.

---

## 5. Standard Chess Rules

Use standard chess rules wherever applicable, but determine piece behavior from **actual movement power**.

This includes:

* Pawn movement;
* Knight movement;
* Bishop movement;
* Rook movement;
* Queen movement;
* King movement;
* captures;
* check;
* checkmate;
* stalemate;
* self-check;
* castling;
* en passant;
* promotion.

---

## 6. Promotion

Promotion eligibility is determined by **PAWN movement power**, never visual identity.

A piece that looks like a Pawn but does not have PAWN movement power does not promote.

A non-Pawn-looking piece with PAWN movement power can promote.

Promotion follows standard chess promotion choices:

* Queen
* Rook
* Bishop
* Knight

The visual identity remains unchanged after promotion.

---

## 7. AI Information Boundary

The AI must NEVER receive the opponent's hidden movement-power mapping as part of its decision-making state.

The AI may know:

* its own actual movement powers;
* public board state;
* public move history;
* public captures;
* public special moves;
* public promotions;
* its own internal belief state.

The AI must not access:

* opponent actual movement powers;
* opponent hidden mapping;
* randomization seed;
* hidden ground-truth information specifically unavailable to the AI.

Ground truth and AI belief state must remain separate.

---

# Architecture Rules

## Ground Truth

The game engine owns the actual game state.

## AI Belief State

The AI owns its own approximation of hidden opponent powers.

The AI must never overwrite ground truth.

The game engine must never treat AI beliefs as facts.

---

# AI Behaviour

The AI must:

* maintain uncertainty;
* make incorrect classifications when evidence is insufficient;
* revise beliefs;
* reassess high-confidence assumptions;
* react to new evidence;
* account for promotion;
* use global movement-power counts;
* make decisions using its belief state.

The AI must NOT instantly know every opponent piece.

---

# Phase Boundaries

### Phase 1

Implement:

* Human vs AI;
* randomized movement powers;
* complete core game rules;
* AI belief engine;
* AI move-selection engine;
* responsive PWA UI;
* game screen;
* end-game mapping reveal.

### Phase 2

Reserved for:

* AI personality;
* Malayalam/movie dialogue reactions;
* contextual reactions and other personality features.

Do not implement Phase 2 during Phase 1 unless explicitly requested.

### Phase 3

Reserved for:

* online multiplayer;
* two-device play;
* multiplayer synchronization;
* networking/backend infrastructure.

Do not implement Phase 3 infrastructure during Phase 1 unless required by a genuine architectural dependency.

---

# Coding Principles

1. Prefer simple, explicit implementations over unnecessary abstraction.
2. Keep game rules deterministic and testable.
3. Separate game logic from UI.
4. Separate AI belief state from ground truth.
5. Avoid hidden global state.
6. Avoid introducing dependencies unless they provide substantial value.
7. Write tests for every unusual chess rule.
8. Do not silently reinterpret project rules.
9. If a requirement conflicts with this file, stop and ask rather than inventing a new rule.
10. Preserve extension points for later phases without implementing those phases prematurely.

---

# Required Development Workflow

Before implementing a feature:

1. Read the relevant documentation.
2. Determine whether it belongs to Phase 1.
3. Implement the smallest coherent version.
4. Test it.
5. Verify that it does not violate the movement-power hierarchy.
6. Only then proceed to the next feature.

Never implement multiple large systems simultaneously without verification.

---

# Critical Warning

The most dangerous implementation mistake is accidentally treating visual identity as gameplay identity.

For example, this is WRONG:

```text
if (piece.type === KING) {
    isRoyal = true;
}
```

The correct conceptual model is:

```text
isRoyal = piece.movementPower === KING;
```

The same principle applies to every movement-dependent rule.
