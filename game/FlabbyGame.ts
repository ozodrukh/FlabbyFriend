import {App} from "../app";

export class FlabbyGame {
  readonly state = new GameState();

  constructor(players: Array<Player>) {
    this.state.players.push(...players);
  }

  isActivePlayer(player: Player): boolean {
    return player.id == this.state.activePlayer.id
  }

  onCommandReceived(command: ThrowFlabbyStateCommand): Message {
    if (command.requiresRunningGame() && this.state.isGameOver()) {
      return new Message("/start@flabby_bot new game");
    }

    App.print("Game", command.constructor.name);
    return command.perform(this.state)
  }
}

export class GameState {
  readonly players = Array<Player>();
  readonly flabbyPlayers = Array<Player>();

  public get activePlayer(): Player {
    return this.flabbyPlayers[this.flabbyPlayers.length - 1];
  }

  public hasPlayer(player: Player): boolean {
    return this.players.findIndex(p => player.id == p.id) >= 0;
  }

  public isGameOver(): boolean {
    return this.players.length == 0;
  }

  public playersCount(): number {
    return this.players.length + this.flabbyPlayers.length;
  }

  markPlayerFlabby(player: Player): boolean {
    const playerIndex = this.players.findIndex(t => t.id == player.id);
    if (playerIndex >= 0) {
      this.players.splice(playerIndex, 1);
      this.flabbyPlayers.push(player);
      return true;
    } else {
      return false;
    }
  }

  reset(): void {
    this.players.push(...this.flabbyPlayers)
  }
}

export interface Player {
  id: number | string
  name: string
}

export class Message {
  readonly text: string;

  constructor(text: string) {
    this.text = text;
  }
}


export abstract class ThrowFlabbyStateCommand {
  readonly owner: Player;
  readonly target: Player;

  constructor(owner: Player, target: Player) {
    this.owner = owner;
    this.target = target;
  }

  requiresRunningGame(): boolean {
    return true;
  }

  perform(state: GameState): Message {
    if (state.markPlayerFlabby(this.target)) {
      return new Message(`че там по вялому ${this.target.name}?`);
    } else {
      return new Message(`${this.target.name} он уже следит за своей коженной флейтой.`);
    }
  }
}

export class StartNewGame extends ThrowFlabbyStateCommand {
  constructor(owner: Player, target: Player) {
    super(owner, target);
  }

  requiresRunningGame(): boolean {
    return false;
  }

  perform(state: GameState): Message {
    state.reset();
    state.markPlayerFlabby(this.owner);
    return super.perform(state);
  }
}

export class CastFlabby extends ThrowFlabbyStateCommand {
  constructor(owner: Player, target: Player) {
    super(owner, target);
  }

  perform(state: GameState): Message {
    if (this.owner.id == state.activePlayer.id) {
      return super.perform(state)
    } else {
      return new Message("_(цокаю)_ не твой черед братишка.");
    }
  }
}