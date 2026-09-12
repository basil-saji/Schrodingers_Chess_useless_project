<img width="1280" height="640" alt="git (1)" src="https://github.com/user-attachments/assets/8920b256-2ba8-4988-b824-5351134eb4bd" />

# Schrödinger's Chess 🎯
Project Link : https://useless-chess.vercel.app/

## Basic Details
### Team Name: Void


### Team Members
- Member 1: Basil Saji - Adi Shankara Institute of Engineering & Technology, Kalady
- Member 2: Albert M Paul - Adi Shankara Institute of Engineering & Technology, Kalady

### Project Description

Schrödinger's Chess is what happens when you look at a perfectly normal chessboard and decide that every piece is lying to you.

The pieces look exactly like normal chess pieces and start in their usual positions, but at the beginning of every game their movement powers are randomly shuffled. That innocent-looking Pawn might secretly be a Bishop. That Queen might move like a Knight. And yes, there can be a King hiding where you absolutely weren't expecting one.

You know what your own pieces can actually do. Your opponent doesn't. Their pieces remain a mystery, so you have to figure them out by watching what they do.

The project currently supports:
- **Singleplayer** — play against a computer that also has to deal with the hidden powers.
- **Multiplayer** — challenge another human by joining the same game with a code.

Basically, we took chess, removed the assumption that chess pieces behave like chess pieces, and somehow decided this was a good idea.

### The Problem (that doesn't exist)

Chess has a serious problem.

It's too predictable.

You see a Pawn → you know it's a Pawn.  
You see a Rook → you know it's a Rook.  
You see a Queen → congratulations, you know exactly what it does.

Where's the fun in that?

We felt that chess needed significantly more confusion, suspicion, and completely unnecessary questioning of your life choices.

### The Solution (that nobody asked for)

We left almost everything about chess looking completely normal.

Same board.  
Same pieces.  
Same starting positions.  
Same familiar little icons.

Then we shuffled their movement powers.

At the start of every game, the standard chess movement powers are randomly distributed among the pieces while keeping the normal number of each power. The visual appearance of a piece does **not** tell you what it can actually do.

Your pieces? You know their secrets.

Your opponent's pieces? Absolutely not.

So when their innocent-looking Pawn suddenly moves like a Bishop, you have learned something. When their "Rook" starts behaving suspiciously, you better remember it. And when you think you've finally figured everything out... well, good luck.

Even the computer has to play under the same hidden-information concept instead of simply being handed all the answers.

We didn't improve chess.

We just made chess significantly more confusing for absolutely no reason.

## Technical Details
### Technologies/Components Used
For Software:
- TypeScript
- React
- Vite
- Progressive Web App (PWA)
- Supabase
- Supabase Realtime / WebSockets
- HTML5
- CSS3
- Vitest
- ESLint
- Git / GitHub

For Hardware:
- No hardware required

### Implementation
For Software:

# Installation

### 1. Clone the repository
```bash
git clone <repository-url>
cd <repository-folder>
npm run dev

```

# Screenshots

*Main Menu*
<img width="1600" height="900" alt="WhatsApp Image 2026-09-12 at 8 19 51 AM" src="https://github.com/user-attachments/assets/9df12ff7-893e-4c59-8da6-8a112a62297c" />

*Single-player mode (Human VS Computer)*
<img width="1600" height="900" alt="WhatsApp Image 2026-09-12 at 8 19 51 AM (1)" src="https://github.com/user-attachments/assets/f089d957-8580-4ccc-9346-2f9bf023f546" />

*Multiplayer game menu*
<img width="1600" height="900" alt="WhatsApp Image 2026-09-12 at 8 19 51 AM (2)" src="https://github.com/user-attachments/assets/2f757383-b043-4600-b2d0-2347f1b8a63b" />


*Multiplayer game mode*
<img width="1600" height="900" alt="WhatsApp Image 2026-09-12 at 8 19 51 AM (3)" src="https://github.com/user-attachments/assets/330d02b0-218b-42a1-8804-f7e6f85e4e9a" />

# Diagrams
## System Architecture & Workflow

```text
                         ┌──────────────────────────┐
                         │       Schrödinger's      │
                         │           Chess          │
                         └────────────┬─────────────┘
                                      │
                                      ▼
                         ┌──────────────────────────┐
                         │       React + Vite       │
                         │        PWA Frontend      │
                         └────────────┬─────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    ▼                                   ▼
          ┌────────────────────┐              ┌────────────────────┐
          │    Singleplayer    │              │    Multiplayer     │
          │    vs Computer     │              │   Join with Code   │
          └─────────┬──────────┘              └─────────┬──────────┘
                    │                                   │
                    │                                   ▼
                    │                         ┌────────────────────┐
                    │                         │      Supabase      │
                    │                         │  Realtime / WS     │
                    │                         └─────────┬──────────┘
                    │                                   │
                    │                          Game Code / State
                    │                                   │
                    └─────────────────┬─────────────────┘
                                      ▼
                         ┌──────────────────────────┐
                         │       Game Engine        │
                         │      TypeScript Core     │
                         └────────────┬─────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
              ▼                       ▼                       ▼
   ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
   │ Random Power     │    │ Movement &       │    │ Special Rules    │
   │ Permutation      │    │ Capture Engine   │    │                  │
   │                  │    │                  │    │ • Castling       │
   │ Normal power     │    │ • Pawn           │    │ • En Passant     │
   │ counts preserved │    │ • Knight         │    │ • Promotion      │
   │ per side         │    │ • Bishop         │    │ • Check          │
   └────────┬─────────┘    │ • Rook           │    │ • Checkmate      │
            │              │ • Queen          │    │ • Stalemate      │
            │              │ • King           │    └────────┬─────────┘
            │              └────────┬─────────┘             │
            └───────────────────────┼───────────────────────┘
                                    ▼
                         ┌──────────────────────────┐
                         │       Game State         │
                         │                          │
                         │ • Board Position         │
                         │ • Visual Identity        │
                         │ • Hidden Movement Power  │
                         │ • Turn / History         │
                         │ • Castling Rights        │
                         │ • En Passant State       │
                         └────────────┬─────────────┘
                                      │
                         ┌────────────┴────────────┐
                         │                         │
                         ▼                         ▼
              ┌────────────────────┐    ┌────────────────────┐
              │   Human Player     │    │    Computer AI     │
              │                    │    │                    │
              │ Own powers known   │    │ Own powers known   │
              │ Opponent powers    │    │ Opponent powers    │
              │ remain hidden      │    │ remain hidden      │
              └─────────┬──────────┘    └─────────┬──────────┘
                        │                         │
                        │       Observe Moves     │
                        │◄────────────────────────┤
                        │                         │
                        └────────────┬────────────┘
                                     ▼
                         ┌──────────────────────────┐
                         │      Move Validation     │
                         │                          │
                         │  Legal → Apply Move      │
                         │  Illegal → Reject Move   │
                         └────────────┬─────────────┘
                                      │
                                      ▼
                         ┌──────────────────────────┐
                         │       Updated Board      │
                         │                          │
                         │ Continue until:          │
                         │ Checkmate / Stalemate /  │
                         │ Capture of King-powered  │
                         │ piece / Game End         │
                         └────────────┬─────────────┘
                                      │
                                      ▼
                         ┌──────────────────────────┐
                         │       End Game UI        │
                         │                          │
                         │ Reveal remaining hidden  │
                         │ movement-power mapping   │
                         └──────────────────────────┘

```


### Project Demo

# Video
https://drive.google.com/file/d/1dqLOmJzqJn-PLZ3yvaEbTopUmeRr2Weu/view?usp=sharing

The demo video walks through both the single-player and multiplayer modes. It demonstrates how a piece shaped like a pawn can move like a rook or a bishop. Additionally, it highlights multiplayer gameplay—showing how players can deduce a piece's movement ability by observing its motion, adjusting their strategies with every move.
