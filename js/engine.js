/*!
 * Copyright (c) 2026 Ed Cook - Three Legged Dog and Company 
 * All rights reserved.
 */

// BEGIN: js/engine.js

export function makeDoubleNSet(maxPip = 12) {
  const tiles = [];
  for (let a = 0; a <= maxPip; a++) {
    for (let b = a; b <= maxPip; b++) {
      tiles.push({ id: `${a}-${b}-${crypto.randomUUID()}`, a, b });
    }
  }
  return tiles;
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function isDouble(t) { return t.a === t.b; }
export function tileMatchesEnd(tile, end) { return tile.a === end || tile.b === end; }
export function otherEnd(tile, end) {
  if (tile.a === end) return tile.b;
  if (tile.b === end) return tile.a;
  return null;
}

function handPipSum(hand) {
  return hand.reduce((sum, t) => sum + t.a + t.b, 0);
}

function rankPlayers(players) {
  return players
    .map(p => ({ id: p.id, score: p.score }))
    .sort((a, b) => a.score - b.score);
}

const DEFAULT_RULES = {
  startDoubleDescending: true,
  drawUntilStartDouble: true,
  fallbackHighestDouble: true,

  // NOTE: Turn flow should be enforced in engine, not UI.
  // If true: after satisfying a pending double, player may continue playing in the same turn.
  allowMultipleAfterSatisfy: false,

  doubleMustBeSatisfied: true,
  unsatisfiedDoubleEndsRound: true,

  mexAlwaysOpen: true,
  openTrainOnNoMove: true,
};

export class GameEngine {
  constructor({ maxPip = 12, playerCount = 4, handSize = 15, roundsTotal = 13, rules = {} } = {}) {
    this.maxPip = maxPip;
    this.playerCount = playerCount;
    this.handSize = handSize;
    this.roundsTotal = roundsTotal;

    // Engine-level rules template (copied into state per game/round)
    this.rules = structuredClone({ ...DEFAULT_RULES, ...(rules || {}) });
    this.state = null;
  }

  newGame() {
    const players = Array.from({ length: this.playerCount }, (_, i) => ({
      id: i,
      hand: [],
      train: { owner: i, tiles: [], isOpen: false, openEnd: null },
      score: 0
    }));

    this.state = {
      maxPip: this.maxPip,
      roundsTotal: this.roundsTotal,
      round: 1,

      matchOver: false,
      roundOver: false,

      rules: structuredClone(this.rules),

      lastRoundSummary: null,
      roundResult: "",

      deck: [],
      players,

      mexicanTrain: { owner: "MEX", tiles: [], isOpen: true, openEnd: null },

      currentPlayer: 0,

      // If set, ONLY that train may be played (must satisfy the double)
      pendingDouble: null,

      // Turn flags
      turnHasPlayed: false,
      turnHasDrawn: false,
      doubleSatisfiedThisTurn: false,

      log: []
    };

    this._startRound({ carryScores: true });
    return this.getState();
  }

  startNextRound() {
    const s = this.state;
    if (s.matchOver) return this.getState();
    if (!s.roundOver) return this.getState();

    s.round += 1;

    if (s.round > s.roundsTotal) {
      s.matchOver = true;
      return this.getState();
    }

    this._startRound({ carryScores: true });
    return this.getState();
  }

  getState() {
    return structuredClone(this.state);
  }

  /**
   * Returns legal PLAY moves only.
   * (DRAW/PASS legality is handled by draw()/pass() methods and enforced there.)
   */
  getLegalMoves(playerId) {
    const s = this.state;
    const p = s.players[playerId];
    const trains = this._getPlayableTrainsForPlayer(playerId);

    const moves = [];
    for (const tile of p.hand) {
      for (const tr of trains) {
        const end = this._getRequiredEndForTrain(tr);
        if (tileMatchesEnd(tile, end)) {
          moves.push({
            tileId: tile.id,
            tile,
            target: tr.owner === "MEX"
              ? { kind: "MEX" }
              : { kind: "PLAYER", ownerId: tr.owner }
          });
        }
      }
    }
    return moves;
  }

  playTile(playerId, tileId, target) {
    const s = this.state;
    const rules = s.rules;

    if (s.matchOver) throw new Error("Match is over.");
    if (s.roundOver) throw new Error("Round is over.");
    if (playerId !== s.currentPlayer) throw new Error("Not your turn.");

    const p = s.players[playerId];
    const tile = p.hand.find(t => t.id === tileId);
    if (!tile) throw new Error("Tile not in hand.");

    const train = this._resolveTrain(target);

    const playable = this._getPlayableTrainsForPlayer(playerId);
    const allowed = playable.some(tr => this._trainKey(tr) === this._trainKey(train));
    if (!allowed) throw new Error("You can't play on that train right now.");

    // Turn limit:
    // - Normal: 1 play per turn
    // - If allowMultipleAfterSatisfy: after satisfying a pending double, you may keep playing this turn
    const canContinue = rules.allowMultipleAfterSatisfy && s.doubleSatisfiedThisTurn;

    if (!s.pendingDouble && s.turnHasPlayed && !canContinue) {
      throw new Error("One move per turn.");
    }

    const end = this._getRequiredEndForTrain(train);
    if (!tileMatchesEnd(tile, end)) throw new Error("Illegal move (doesn't match end).");

    // Track whether we were under a double obligation BEFORE this play
    const hadPendingBefore = !!s.pendingDouble;
    const pendingKeyBefore = s.pendingDouble?.trainKey || null;

    // Remove tile from hand and place it
    p.hand = p.hand.filter(t => t.id !== tileId);

    train.tiles.push(tile);
    train.openEnd = otherEnd(tile, end);

    s.log.push(`P${playerId} played ${tile.a}|${tile.b} on ${this._trainLabel(train)} -> end ${train.openEnd}`);

    // If you play on your own open train, close it
    if (train.owner !== "MEX" && train.owner === playerId && train.isOpen) {
      train.isOpen = false;
      s.log.push(`P${playerId}'s marker removed (train CLOSED).`);
    }

    s.turnHasPlayed = true;

    // ✅ If we were satisfying a pending double, clear it FIRST (even if tile is itself a double).
    if (hadPendingBefore && pendingKeyBefore && this._trainKey(train) === pendingKeyBefore) {
      s.pendingDouble = null;
      s.doubleSatisfiedThisTurn = true;
      s.log.push(`Double satisfied on ${this._trainLabel(train)}.`);
    }

    // If a double is played, (re)set pendingDouble AFTER satisfaction logic
    if (isDouble(tile)) {
      if (rules.doubleMustBeSatisfied) {
        s.pendingDouble = { trainKey: this._trainKey(train), pip: tile.a };
        s.log.push(`Double played! Must satisfy ${tile.a} on ${this._trainLabel(train)}.`);
      } else {
        s.log.push(`Double played, but doubles do NOT require satisfaction (house rule).`);
      }

      if (p.hand.length === 0) {
        this._endRound(`P${playerId} went out (emptied hand).`);
      }

      return this.getState();
    }

    if (p.hand.length === 0) {
      this._endRound(`P${playerId} went out (emptied hand).`);
      return this.getState();
    }

    return this.getState();
  }

  draw(playerId) {
    const s = this.state;
    const rules = s.rules;

    if (s.matchOver) throw new Error("Match is over.");
    if (s.roundOver) throw new Error("Round is over.");
    if (playerId !== s.currentPlayer) throw new Error("Not your turn.");
    if (s.deck.length === 0) throw new Error("Boneyard is empty.");
    if (s.turnHasDrawn) throw new Error("You already drew this turn.");

    const legalBefore = this.getLegalMoves(playerId);
    if (!s.pendingDouble && legalBefore.length > 0) {
      throw new Error("You have a playable move (play instead of drawing).");
    }

    const p = s.players[playerId];
    p.hand.push(s.deck.pop());
    s.turnHasDrawn = true;
    s.log.push(`P${playerId} drew a tile.`);

    const legalAfter = this.getLegalMoves(playerId);

    if (legalAfter.length === 0) {
      if (s.pendingDouble) {
        s.log.push(`P${playerId} cannot satisfy the double after drawing. Passing to next player.`);
        this._advanceTurn();
        this._checkStalemate();
        return this.getState();
      }

      // Open train on no move? (house rule)
      if (rules.openTrainOnNoMove) {
        const tr = s.players[playerId].train;
        if (!tr.isOpen) {
          tr.isOpen = true;
          s.log.push(`P${playerId} had no moves. Marker placed: train OPEN.`);
        } else {
          s.log.push(`P${playerId} had no moves. Train already OPEN.`);
        }
      } else {
        s.log.push(`P${playerId} had no moves. (House rule: do NOT open train).`);
      }

      this._advanceTurn();
      this._checkStalemate();
      return this.getState();
    }

    s.log.push(`P${playerId} has a playable move after drawing.`);
    return this.getState();
  }

  pass(playerId) {
    const s = this.state;
    const rules = s.rules;

    if (s.matchOver) throw new Error("Match is over.");
    if (s.roundOver) throw new Error("Round is over.");
    if (playerId !== s.currentPlayer) throw new Error("Not your turn.");

    // If player already played and no pending double, pass ends turn.
    if (!s.pendingDouble && s.turnHasPlayed) {
      s.log.push(`P${playerId} passes (turn ends).`);
      this._advanceTurn();
      this._checkStalemate();
      return this.getState();
    }

    // If a pending double exists, enforce the "must try" behavior
    if (s.pendingDouble) {
      const legal = this.getLegalMoves(playerId);
      if (legal.length > 0) throw new Error("You must satisfy the double (you have a move).");
      if (s.deck.length > 0 && !s.turnHasDrawn) throw new Error("You can still draw to try to satisfy the double.");

      if (rules.openTrainOnNoMove) {
        const tr = s.players[playerId].train;
        if (!tr.isOpen) {
          tr.isOpen = true;
          s.log.push(`P${playerId} could not satisfy the double. Marker placed: train OPEN.`);
        }
      } else {
        s.log.push(`P${playerId} could not satisfy the double. (House rule: do NOT open train).`);
      }

      s.log.push(`P${playerId} passes. Double obligation continues to next player.`);
      this._advanceTurn();
      this._checkStalemate();
      return this.getState();
    }

    // No pending double and no play made: only allowed if no legal moves and no draw possible
    const legal = this.getLegalMoves(playerId);
    if (legal.length > 0) throw new Error("You have a playable move; you cannot pass.");
    if (s.deck.length > 0 && !s.turnHasDrawn) throw new Error("You can still draw; you cannot pass.");

    if (rules.openTrainOnNoMove) {
      const tr = s.players[playerId].train;
      if (!tr.isOpen) {
        tr.isOpen = true;
        s.log.push(`P${playerId} is stuck. Marker placed: train OPEN.`);
      }
    } else {
      s.log.push(`P${playerId} is stuck. (House rule: do NOT open train).`);
    }

    s.log.push(`P${playerId} passes.`);
    this._advanceTurn();
    this._checkStalemate();
    return this.getState();
  }

  /* ---------- Round control ---------- */

  _startRound({ carryScores = true } = {}) {
    const s = this.state;
    const rules = s.rules;

    // Keep state.rules synced with engine rules template
    s.rules = structuredClone(this.rules);

    s.deck = shuffle(makeDoubleNSet(this.maxPip));

    for (const p of s.players) {
      p.hand = [];
      p.train.tiles = [];
      p.train.isOpen = false;
      p.train.openEnd = null;
      if (!carryScores) p.score = 0;
    }

    s.mexicanTrain = {
      owner: "MEX",
      tiles: [],
      isOpen: !!rules.mexAlwaysOpen,
      openEnd: null
    };

    // Deal
    for (let r = 0; r < this.handSize; r++) {
      for (const p of s.players) p.hand.push(s.deck.pop());
    }

    const requiredPip = rules.startDoubleDescending
      ? (this.maxPip - (s.round - 1))
      : this.maxPip;

    const start = this._findStartingDoubleAccordingToRules(requiredPip);
    const starter = start.tile;

    s.players[start.playerId].hand = s.players[start.playerId].hand.filter(t => t.id !== starter.id);

    // Hub starts with the round's required double
    s.mexicanTrain.tiles.push(starter);
    s.mexicanTrain.openEnd = requiredPip;

    // All player trains start with same open end as the hub
    for (const p of s.players) p.train.openEnd = s.mexicanTrain.openEnd;

    s.currentPlayer = start.playerId;
    s.pendingDouble = null;
    s.turnHasPlayed = false;
    s.turnHasDrawn = false;
    s.doubleSatisfiedThisTurn = false;

    s.roundOver = false;
    s.roundResult = "";
    s.lastRoundSummary = null;

    s.log.push(`--- Round ${s.round}/${s.roundsTotal} ---`);
    s.log.push(`Starter target: ${requiredPip}|${requiredPip}`);
    s.log.push(`Starter: P${start.playerId} played ${starter.a}|${starter.b} to hub.`);
    s.log.push(`Turn -> P${s.currentPlayer}`);

    // Debug accounting (safe to keep; remove later if you want a cleaner log)
    const totalTiles = (this.maxPip + 1) * (this.maxPip + 2) / 2;
    const inHands = s.players.reduce((sum, p) => sum + p.hand.length, 0);
    const onHub = s.mexicanTrain.tiles.length;
    const inBoneyard = s.deck.length;
    s.log.push(`DEBUG: tile accounting: total=${totalTiles} (hands=${inHands}, hub=${onHub}, boneyard=${inBoneyard})`);
  }

  _findStartingDoubleAccordingToRules(pip) {
    const s = this.state;
    const rules = s.rules;

    for (const p of s.players) {
      const found = p.hand.find(t => t.a === pip && t.b === pip);
      if (found) return { playerId: p.id, tile: found };
    }

    if (rules.drawUntilStartDouble) {
      let cursor = 0;
      while (s.deck.length > 0) {
        const drawn = s.deck.pop();
        s.players[cursor].hand.push(drawn);

        if (drawn.a === pip && drawn.b === pip) {
          s.log.push(`Starter double ${pip}|${pip} was not in hands. Found by drawing: P${cursor}.`);
          return { playerId: cursor, tile: drawn };
        }

        cursor = (cursor + 1) % s.players.length;
      }
      s.log.push(`WARNING: Deck exhausted while searching for starter ${pip}|${pip}.`);
    } else {
      s.log.push(`Starter ${pip}|${pip} not found in hands. (House rule: do NOT draw for starter).`);
    }

    if (rules.fallbackHighestDouble) {
      const fallback = this._findHighestDoubleInHands();
      s.log.push(`FALLBACK: Using highest double in hands: P${fallback.playerId} has ${fallback.tile.a}|${fallback.tile.b}.`);
      return fallback;
    }

    s.log.push(`WARNING: No fallbackHighestDouble. Using P0 first tile as starter (this is chaos).`);
    return { playerId: 0, tile: s.players[0].hand[0] };
  }

  _findHighestDoubleInHands() {
    const s = this.state;
    let best = null;

    for (const p of s.players) {
      for (const t of p.hand) {
        if (isDouble(t)) {
          if (!best || t.a > best.tile.a) best = { playerId: p.id, tile: t };
        }
      }
    }

    if (!best) best = { playerId: 0, tile: s.players[0].hand[0] };
    return best;
  }

  _endRound(reason) {
    const s = this.state;
    s.roundOver = true;

    const adds = s.players.map(p => handPipSum(p.hand));
    for (const p of s.players) p.score += handPipSum(p.hand);

    s.roundResult = `${reason} Round scores added: ${adds.map((v, i) => `P${i}+${v}`).join(", ")}.`;
    s.log.push(`ROUND OVER: ${s.roundResult}`);

    const ranking = rankPlayers(s.players);
    s.lastRoundSummary = {
      reason,
      round: s.round,
      winners: this._roundWinnersByAdds(adds),
      roundAdds: s.players.map((p, i) => ({ id: i, added: adds[i], total: p.score })),
      ranking
    };

    if (s.round >= s.roundsTotal) {
      s.matchOver = true;
      const min = Math.min(...s.players.map(p => p.score));
      const matchWinners = s.players.filter(p => p.score === min).map(p => p.id);
      s.log.push(`MATCH OVER: Winner(s) ${matchWinners.map(id => `P${id}`).join(", ")} with ${min} points.`);
    }
  }

  _roundWinnersByAdds(adds) {
    const minAdd = Math.min(...adds);
    const winners = [];
    adds.forEach((v, i) => { if (v === minAdd) winners.push(i); });
    return winners;
  }

  _canAnyoneSatisfyPendingDouble() {
    const s = this.state;
    if (!s.pendingDouble) return false;
    return s.players.some(p => this.getLegalMoves(p.id).length > 0);
  }

  _checkStalemate() {
    const s = this.state;
    const rules = s.rules;

    if (s.matchOver || s.roundOver) return;

    if (s.pendingDouble && s.deck.length === 0) {
      const canSatisfy = this._canAnyoneSatisfyPendingDouble();
      if (!canSatisfy) {
        if (rules.unsatisfiedDoubleEndsRound) {
          this._endRound(`Stalemate (unsatisfied double ${s.pendingDouble.pip} on ${s.pendingDouble.trainKey}, boneyard empty).`);
        } else {
          s.log.push(`Stalemate avoided (house rule): unsatisfied double cleared and play continues.`);
          s.pendingDouble = null;
        }
      }
      return;
    }

    if (s.pendingDouble) return;
    if (s.deck.length !== 0) return;

    const someoneCanPlay = s.players.some(p => this.getLegalMoves(p.id).length > 0);
    if (!someoneCanPlay) {
      this._endRound("Stalemate (boneyard empty and no legal moves).");
    }
  }

  /* ---------- helpers ---------- */

  _advanceTurn() {
    const s = this.state;
    s.turnHasPlayed = false;
    s.turnHasDrawn = false;
    s.doubleSatisfiedThisTurn = false;
    s.currentPlayer = (s.currentPlayer + 1) % s.players.length;
    s.log.push(`Turn -> P${s.currentPlayer}`);
    this._checkStalemate();
  }

  _resolveTrain(target) {
    const s = this.state;
    if (target.kind === "MEX") return s.mexicanTrain;
    if (target.kind === "PLAYER") return s.players[target.ownerId].train;
    throw new Error("Bad target.");
  }

  _getRequiredEndForTrain(train) {
    const s = this.state;
    if (s.pendingDouble && this._trainKey(train) === s.pendingDouble.trainKey) {
      return s.pendingDouble.pip;
    }
    return train.openEnd;
  }

  _getPlayableTrainsForPlayer(playerId) {
    const s = this.state;

    // If a double is pending, ONLY that train is playable by anyone
    if (s.pendingDouble) {
      const key = s.pendingDouble.trainKey;
      const all = [s.mexicanTrain, ...s.players.map(p => p.train)];
      return all.filter(tr => this._trainKey(tr) === key);
    }

    // Otherwise: your train + mexican + any open opponent trains
    const list = [];
    list.push(s.players[playerId].train);
    list.push(s.mexicanTrain);

    for (const p of s.players) {
      if (p.id !== playerId && p.train.isOpen) list.push(p.train);
    }
    return list;
  }

  _trainKey(train) {
    return train.owner === "MEX" ? "MEX" : `P${train.owner}`;
  }

  _trainLabel(train) {
    return train.owner === "MEX" ? "Mexican Train" : `P${train.owner}'s Train`;
  }
}

// END: js/engine.js
