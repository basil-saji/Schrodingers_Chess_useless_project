# Schrödinger's Chess

## Phase 1 Implementation Plan

## Phase 0 — Project Foundation

### Step 1 — Initialize

Set up:

* Vite
* React
* TypeScript
* PWA support
* linting
* formatting
* testing
* project structure

Recommended stack:

```text
Frontend:        React + TypeScript
Build:           Vite
Styling:         CSS / CSS Modules
PWA:             vite-plugin-pwa
Testing:         Vitest
E2E:             Playwright
AI/Game Engine:  TypeScript
State:           Lightweight React state + game-engine state
Backend:         None
Database:        None
```

Keep dependencies minimal.

---

# Phase 1 — Game Domain

Build the game engine before building the polished UI.

### Step 2 — Data Models

Implement:

* Piece;
* Side;
* VisualIdentity;
* MovementPower;
* Position;
* Move;
* GameState;
* GameResult;
* SpecialMoveState.

---

### Step 3 — Initialization

Implement:

* standard board;
* standard visual pieces;
* movement-power multiset;
* random permutation;
* independent permutations;
* validation.

Create deterministic test seeds.

---

### Step 4 — Movement Engine

Implement movement generation independently for:

* Pawn;
* Knight;
* Bishop;
* Rook;
* Queen;
* King.

Use movement power exclusively.

---

### Step 5 — Attack & Royal Logic

Implement:

* attack detection;
* KING-powered piece lookup;
* check;
* self-check;
* legal move filtering.

---

### Step 6 — Special Rules

Implement:

1. castling;
2. en passant;
3. promotion;
4. checkmate;
5. stalemate.

Each should have dedicated tests.

---

# Phase 2 — Human Gameplay

### Step 7 — Board

Implement:

* responsive chess board;
* piece rendering;
* selection;
* legal-move indicators;
* move execution;
* captures;
* turn handling.

---

### Step 8 — Chess-like Feedback

Implement:

* invalid move feedback;
* selected-square state;
* last-move indication;
* check indication;
* checkmate indication;
* promotion interface.

Keep the interface familiar and uncluttered.

---

# Phase 3 — AI Foundation

### Step 9 — AI Own-State View

Create the AI's restricted state representation.

Verify that opponent hidden powers cannot be accessed.

---

### Step 10 — Observation System

Convert public game events into AI observations.

Examples:

```text
Piece moved
Piece captured
Check occurred
Special move occurred
Promotion occurred
```

---

### Step 11 — Belief Engine

Implement:

* candidate powers;
* confidence;
* constraints;
* global power counts;
* evidence weighting;
* belief revision.

Test this independently from the search engine.

---

# Phase 4 — AI Search

### Step 12 — Conventional Search

First implement a normal search engine operating on a fully specified hypothetical state.

Verify:

* legal moves;
* evaluation;
* alpha-beta;
* move ordering;
* performance.

---

### Step 13 — Hidden-State Sampling

Connect belief engine to search.

Generate plausible hidden states.

Search each candidate state.

Aggregate evaluations.

---

### Step 14 — Uncertainty-Aware Decisions

Ensure AI decisions are based on plausible states rather than ground truth.

Add controlled uncertainty where appropriate.

---

### Step 15 — Tune Strength

Tune:

* search depth;
* time budget;
* number of sampled states;
* evaluation;
* move ordering.

Target approximately 2000–3000 Elo-equivalent performance where practical.

Do not sacrifice correctness for strength.

---

# Phase 5 — Game Integration

### Step 16 — Connect Human and AI

Implement:

```text
Human move
    ↓
Game engine
    ↓
Public event
    ↓
AI observation
    ↓
Belief update
    ↓
AI decision
    ↓
AI move
    ↓
Game engine
```

---

### Step 17 — End Game

Implement:

* result detection;
* end-game screen;
* surviving-piece mapping;
* new-game action.

---

# Phase 6 — PWA & Responsive Polish

### Step 18

Test:

* desktop Chrome;
* mobile Chrome;
* mobile Safari;
* different board sizes;
* portrait;
* landscape;
* touch interaction.

Implement:

* installability;
* manifest;
* service worker;
* responsive sizing.

---

# Phase 7 — Validation

### Step 19

Run:

* unit tests;
* integration tests;
* E2E tests;
* randomized game simulations;
* AI legality tests;
* AI information-boundary tests.

Run many automated games to find impossible positions and rule bugs.

---

# Phase 8 — Polish

Only after all core functionality works:

* animations;
* transitions;
* loading states;
* error handling;
* visual refinement;
* performance optimization.

Do not polish broken functionality.

---

# Phase 9 — Phase 1 Freeze

Before considering Phase 1 complete:

### Required

* Human vs AI works.
* Randomization works.
* All core chess rules work.
* Hidden-information AI works.
* Promotion works.
* End-game reveal works.
* Mobile works.
* Desktop works.
* PWA works.
* Tests pass.

### Explicitly do not add

* personality;
* dialogue;
* multiplayer;
* networking;
* additional modes.

Those belong to later phases.

---

# Future Extension Architecture

The core engine should expose game events such as:

```text
GAME_STARTED
MOVE_MADE
CAPTURE
CHECK
CHECKMATE
CASTLING
EN_PASSANT
PROMOTION
GAME_ENDED
```

These events can later support:

### Phase 2

AI personality/reaction system.

### Phase 3

Online multiplayer synchronization.

The Phase 1 engine should not depend on either future system.
