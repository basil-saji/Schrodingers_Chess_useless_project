# Schrödinger's Chess

## Phase 1 Product & Technical Specification

---

# 1. Product Definition

Schrödinger's Chess is a chess game where the board and piece appearances look familiar, but the actual movement power of every piece is randomly assigned at the beginning of each game.

The player knows the movement powers of their own pieces.

The opponent's movement powers remain hidden.

The computer opponent operates under the same information limitation regarding the human player's pieces.

The central experience is:

> **You know what your pieces can do. You don't know what theirs can do.**

---

# 2. Phase 1 Objective

Build a complete, playable **Human vs AI** version.

The Phase 1 product must allow a user to:

1. Open the PWA.
2. Press **Play**.
3. Start a randomized game.
4. Play against the computer.
5. See legal moves for their selected pieces.
6. Play according to the hidden movement-power rules.
7. Complete the game normally.
8. See the surviving pieces' actual movement powers after the game.

---

# 3. Phase 1 Scope

## Included

* Landing screen.
* Play button.
* Chess board.
* Standard piece visuals.
* Randomized movement powers.
* Complete movement engine.
* Standard chess special rules adapted through movement power.
* Human player.
* AI opponent.
* AI hidden-information reasoning.
* AI search/evaluation.
* Legal-move indicators for the human's selected piece.
* Chess-like illegal-move feedback.
* Check/checkmate feedback.
* Promotion.
* End-game screen.
* Surviving-piece mapping reveal.
* Responsive mobile/desktop layout.
* PWA support.

## Explicitly excluded

* Online multiplayer.
* Local multiplayer.
* AI personality.
* Malayalam dialogue.
* Movie dialogue system.
* Additional game modes.
* Mid-game randomization.
* Random side switching.
* External LLM/API dependency.
* Accounts.
* Social features.
* Leaderboards.
* Cloud save.

---

# 4. User Experience

## Screen 1 — Landing

Minimal screen containing:

**Schrödinger's Chess**

and:

**PLAY**

The user should reach an actual game quickly.

---

## Screen 2 — Game

Primary elements:

* chess board;
* pieces;
* turn indicator;
* basic game status;
* selected-piece state;
* legal move indicators;
* promotion interface when necessary;
* standard game controls where required.

The design should be inspired by the clarity and interaction patterns of Chess.com without copying proprietary branding or assets.

---

## Screen 3 — Game Over

Display:

* game result;
* reason for ending;
* surviving-piece movement-power mapping;
* option to start another game.

Example:

```text
GAME OVER

Checkmate

Your surviving pieces:

Pawn → Bishop
Knight → Pawn
Bishop → Queen
King → Rook
...
```

Only pieces still present at the end need to be listed.

---

# 5. Core State Model

Every piece should conceptually contain:

```text
Piece
├── id
├── side
├── visualIdentity
├── movementPower
├── position
├── hasMoved
└── relevant movement/history state
```

Do not combine:

```text
visualIdentity
```

and:

```text
movementPower
```

into one property.

---

# 6. Game State

The game state should contain at minimum:

```text
Board
Active side
All pieces
Move history
Castling state
En-passant state
Promotion state
Game status
Winner/result
Randomization metadata
```

Randomization metadata should be usable for development/testing but must not be exposed to the AI as hidden opponent information.

---

# 7. Movement Engine

The movement engine is the authoritative source for legal moves.

Conceptually:

```text
getLegalMoves(piece, gameState)
```

must evaluate:

```text
piece.movementPower
```

rather than:

```text
piece.visualIdentity
```

The engine must account for:

* board boundaries;
* occupied squares;
* friendly pieces;
* enemy pieces;
* movement geometry;
* blocking;
* captures;
* check;
* self-check;
* special rules.

---

# 8. Randomization

At game initialization:

1. Construct the standard movement-power multiset.
2. Randomly shuffle it.
3. Assign one movement power to each visual piece.
4. Independently repeat for the other side.
5. Validate the resulting mapping.
6. Start the game.

The randomization implementation should use a high-quality unbiased shuffle suitable for application use.

Use a Fisher-Yates shuffle over a cryptographically secure/random source available in the browser.

For development/testing, support deterministic seeding through a dedicated test/debug mechanism rather than weakening production randomness.

---

# 9. AI Architecture

The AI consists of two major systems.

## System A — Belief Engine

Tracks what the AI believes about the opponent's movement powers.

## System B — Move Decision Engine

Uses the AI's own actual pieces plus the belief state to choose moves.

```text
Opponent observations
        ↓
   Evidence layer
        ↓
   Belief engine
        ↓
   Belief state
        ↓
Plausible hidden states
        ↓
    Search engine
        ↓
     AI move
```

---

# 10. AI Belief Model

For each unknown opponent piece, maintain candidate movement powers and confidence values.

Example:

```text
Piece 12

Pawn:    0.05
Knight:  0.10
Bishop:  0.15
Rook:    0.05
Queen:   0.60
King:    0.05
```

The probabilities need not represent mathematically perfect Bayesian probabilities.

They are a structured belief/confidence representation used to rank hypotheses.

---

# 11. AI Evidence

Evidence can originate from:

* observed movement;
* observed captures;
* observed checks;
* inability to make expected movements;
* special moves;
* castling;
* en passant;
* promotion;
* move history;
* remaining movement-power counts.

Each observation should be translated into constraints/evidence rather than directly declaring:

```text
piece = QUEEN
```

unless the evidence genuinely makes alternatives impossible.

---

# 12. Global Constraints

The AI must use the known movement-power distribution.

Initially each side has:

```text
Pawn:    8
Knight:  2
Bishop:  2
Rook:    2
Queen:   1
King:    1
```

As pieces are identified, captured, or promoted, the AI's model of remaining possible powers should be updated accordingly.

This global constraint system is a major component of the deduction engine.

---

# 13. Belief Revision

Beliefs are revisable.

A high-confidence hypothesis can be weakened or discarded when new evidence contradicts it.

Promotion is particularly important because it changes the movement power of a piece.

The AI must therefore avoid permanently locking a piece's identity merely because confidence reached 100%.

---

# 14. AI Decision Algorithm

Recommended Phase 1 approach:

### Belief-weighted determinization + Alpha-Beta search

The AI samples plausible hidden opponent states from its current belief model.

For each plausible state:

1. Construct a hypothetical game state.
2. Run a conventional search/evaluation process.
3. Evaluate candidate moves.
4. Aggregate results across plausible states.
5. Select a move that performs well given the AI's uncertainty.

The AI therefore reasons about:

> "What might the opponent's pieces actually be?"

rather than:

> "I know exactly what they are."

---

# 15. Search Engine

Use:

* iterative deepening;
* alpha-beta pruning;
* transposition table;
* move ordering;
* quiescence search where practical;
* configurable depth/time budget.

The evaluation function should consider:

* material;
* king safety;
* mobility;
* tactical threats;
* positional factors;
* uncertainty around opponent pieces.

The exact evaluation weights should be configurable.

---

# 16. Strength Target

Target:

> **Approximately 2000–3000 Elo-equivalent conventional chess strength as an engineering goal.**

This is not a certification requirement.

Priorities:

1. Correct game rules.
2. Correct hidden-information behavior.
3. Intelligent move selection.
4. Stable performance.
5. Strength optimization.

Do not compromise the hidden-information model merely to increase playing strength.

---

# 17. AI Information Firewall

The game engine may internally possess complete ground truth.

The AI decision layer must receive a restricted representation.

Conceptually:

```text
Game Engine
    │
    ├── Full Ground Truth
    │
    └── AI Public View
             │
             ├── AI own actual powers
             ├── public board state
             ├── public history
             └── AI belief state
```

The AI should not receive an object containing hidden opponent powers and simply be instructed not to look at it.

Prefer an API that makes hidden information unavailable to the AI decision layer.

---

# 18. Architecture for Future Phases

Phase 1 should use interfaces that permit future extensions.

Examples:

```text
GameEngine
AIEngine
ObservationSystem
UI
GameSession
```

Future multiplayer networking should eventually be able to replace/extend the local session layer without rewriting movement rules.

Future personality features should eventually consume game events without modifying core chess logic.

Do not implement those systems now.

---

# 19. Persistence

Phase 1 does not require a backend database.

Use in-memory game state for active games.

Optional local storage may be used for non-critical preferences/settings.

Do not introduce authentication or server infrastructure.

---

# 20. Testing Requirements

The test suite must cover:

### Movement

Every movement power.

### Randomization

* correct counts;
* independent sides;
* valid permutation;
* reproducibility in test mode.

### Royal logic

* KING movement power determines royal status;
* visual King does not automatically become royal;
* non-King visual piece can be royal.

### Special rules

* castling;
* en passant;
* promotion;
* check;
* checkmate;
* stalemate;
* self-check.

### AI

* cannot access hidden opponent powers;
* maintains beliefs;
* updates beliefs;
* handles contradictory evidence;
* handles promotion;
* makes legal moves.

### UI

* responsive board;
* legal-move indicators;
* promotion;
* game-over mapping.

---

# 21. Definition of Done

Phase 1 is complete when:

* a complete game can be played from beginning to end;
* movement powers are randomized correctly;
* all core chess rules work according to movement power;
* the player can see legal moves for their own selected piece;
* the AI can legally play;
* the AI does not use hidden opponent ground truth;
* the AI maintains and updates beliefs;
* promotion works;
* check/checkmate/stalemate work;
* the end-game mapping reveal works;
* the application works on desktop and mobile browsers;
* the PWA can be installed;
* automated tests cover critical game logic.
