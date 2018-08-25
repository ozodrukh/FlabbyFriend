import * as TelegramBot from "node-telegram-bot-api";
import {CastFlabby, FlabbyGame, Message, Player, StartNewGame, ThrowFlabbyStateCommand} from "./game/FlabbyGame";
import chalk from "chalk";
import {Constructor} from "ava";

export interface User {
  id: string | number,
  name: string,
  mentionLink: string
}

export abstract class Command {
  private performingCommandMessage: TelegramBot.Message;
  protected readonly app: App;

  constructor(app: App) {
    this.app = app;
  }

  protected get message(): TelegramBot.Message {
    return this.performingCommandMessage;
  }

  protected get from(): TelegramBot.User {
    return this.performingCommandMessage.from
  }

  protected get chat(): TelegramBot.Chat {
    return this.performingCommandMessage.chat
  }

  protected getUsers(text: string, entities: Array<TelegramBot.MessageEntity>): Array<User> {
    const foundMentions = Array<User>();

    entities.forEach(entry => {
      if (entry.type === "text_mention" && !entry.user.is_bot) {
        let initials = entry.user.first_name;
        if (entry.user.last_name && entry.user.last_name.length > 0) {
          initials += " " + entry.user.last_name;
        }

        const user: User = {
          id: entry.user.id,
          name: initials,
          mentionLink: "tg://user?id=" + entry.user.id
        };

        foundMentions.push(user);
      } else if (entry.type === "mention") {
        const username = text.substr(entry.offset, entry.length);

        if (!username.toLowerCase().endsWith("bot")) {
          const user: User = {
            id: username,
            name: username,
            mentionLink: username
          };

          foundMentions.push(user);
        }
      }
    });

    return foundMentions;
  }

  execute(rawCommand: string, message: TelegramBot.Message): boolean {
    this.performingCommandMessage = message;

    if (rawCommand.indexOf("@") >= 0) {
      const command = rawCommand.substring(0, rawCommand.indexOf("@"));
      this.onExecuting(command)
    } else {
      this.onExecuting(rawCommand);
    }

    return true;
  }

  protected abstract onExecuting(command: string): void

  reply(message: Message) {
    this.app.replyWithMessage(this.performingCommandMessage.chat.id,
      this.performingCommandMessage.message_id, message)
  }
}

export abstract class GameCommand extends Command {
  private cachedGameInstance: FlabbyGame;

  constructor(app: App) {
    super(app);
  }

  get fromPlayer(): Player {
    return GameCommand.createPlayer(this.from)
  }

  get runningGame(): FlabbyGame {
    return this.cachedGameInstance
  }

  get isGameRunning(): boolean {
    return this.cachedGameInstance != null && !this.cachedGameInstance.state.isGameOver()
  }

  execute(rawCommand: string, message: TelegramBot.Message): boolean {
    this.cachedGameInstance = this.app.gameRooms.get(message.chat.id);
    return super.execute(rawCommand, message);
  }

  initiateGame(...players: Array<Player>) {
    if (this.runningGame == null) {
      this.cachedGameInstance = new FlabbyGame(players);
      this.app.gameRooms.set(this.chat.id, this.cachedGameInstance);
    }
  }

  protected static createPlayer(user: TelegramBot.User): Player {
    if (user.username && user.username.length > 0) {
      return {
        id: user.username,
        name: user.username
      }
    } else return {
      id: user.id,
      name: user.first_name + " " + user.last_name,
    }
  }
}

export class ThrowCommand extends GameCommand {

  protected checkMentionsSatisfied(mentions: Array<User>): boolean {
    if (!this.isGameRunning) {
      this.reply(new Message("набери /start@flabby_bot и перечисли username чуваков кто играют, " +
        "учти первый кого ты упомянешь сразу станет вялым"));
      return false;
    }

    if (mentions.length < 1) {
      this.reply(new Message("ты забыл назвать следующего вялого"));
      return false;
    } else {
      if (mentions.length > 1 && this.isGameRunning) {
        this.reply(new Message("чувачок, за раз только один вялый, я выберу первог"))
      }

      if (mentions.length == 1 && !this.runningGame.state.hasPlayer(mentions[0])) {
        this.reply(new Message("ehm... He isn't listed in the current game, take him next time"));
        return false;
      }

      return true;
    }
  }

  protected canInitiateNewGame(): boolean {
    return false;
  }

  protected makeCommand(mentions: Array<User>): ThrowFlabbyStateCommand {
    return new CastFlabby(this.fromPlayer, mentions[0])
  }

  onExecuting(command: string): void {
    const mentions = this.getUsers(this.message.text, this.message.entities);

    if (!this.checkMentionsSatisfied(mentions)) {
      return;
    }

    if (this.canInitiateNewGame()) {
      this.initiateGame(this.fromPlayer, ...mentions);
    }

    if (command === "/start" && !this.runningGame.state.isGameOver()) {
      return this.reply(new Message("Так блэт, игра итак идет, че там по-вялому "
        + this.runningGame.state.activePlayer.name + "?"))
    }

    const gameCommand = this.makeCommand(mentions);
    const gameAnswer = this.runningGame.onCommandReceived(gameCommand);
    return this.reply(gameAnswer);
  }
}

export class StartNewGameCommand extends ThrowCommand {
  protected checkMentionsSatisfied(mentions: Array<User>) {
    if (mentions.length >= 1) {
      if (mentions.length == 1) {
        this.reply(new Message("Зови больше народу, один на один слишком легко, братишка"))
      }
      return true;
    }
    return super.checkMentionsSatisfied(mentions);
  }

  protected canInitiateNewGame(): boolean {
    if (this.runningGame == null) {
      return true;
    } else {
      this.reply(new Message("game is already running"));
      return false;
    }
  }

  protected makeCommand(mentions: Array<User>): ThrowFlabbyStateCommand {
    return new StartNewGame(this.fromPlayer, mentions[0])
  }
}

export class App {
  static debug: boolean = true;
  static tagColors = new Map<string, string>();

  static addTag(tagName: string, colorify: (...text: string[]) => string) {
    this.tagColors.set(tagName, colorify(` ${tagName} `));
  }

  static print(tagName: string, ...message: any[]) {
    if (App.debug) {
      let coloredTag = App.tagColors.get(tagName);
      if (!coloredTag) {
        coloredTag = chalk.bgBlack.white(tagName)
      }
      console.log(App.tagColors.get(tagName), ...message);
    }
  }

  private readonly bot: TelegramBot;
  private readonly rooms = new Map<number | string, FlabbyGame>();
  private readonly commands = new Map<string, Constructor>();

  constructor(token: string) {
    this.bot = new TelegramBot(token, {
      polling: {
        autoStart: false
      }
    });

    this.commands.set("/start", StartNewGameCommand);
    this.commands.set("/cast", ThrowCommand);

    this.bot.on("message", this.onMessage.bind(this))
  }

  start() {
    this.bot.startPolling()
      .catch(App.onExceptionCaught)
      .then(() => {
        App.print("App", chalk.green("Launched"))
      })
  }

  protected static onExceptionCaught(error: any) {
    console.error(error)
  }

  get gameRooms(): Map<string | number, FlabbyGame> {
    return this.rooms;
  }

  public replyWithMessage(chatId: number | string, messageId: number, message: Message) {
    const promise = this.bot.sendMessage(chatId, message.text, {
      parse_mode: "Markdown",
      reply_to_message_id: messageId
    });

    promise.catch(App.onExceptionCaught)
  }

  protected onMessage(message: TelegramBot.Message) {
    App.print("Message", message);

    const commandEntry = message.entities.find(v => v.type === "bot_command");

    if (commandEntry) {
      const rawCommand = message.text.substr(commandEntry.offset, commandEntry.length);
      this.onCommand(rawCommand, message);
    }
  }

  protected onCommand(commandRaw: string, message: TelegramBot.Message) {
    let command: Command = this.findCommandExecutor(commandRaw);

    if (command == null) {
      App.print("Error", `unknown command ${command}`);
    } else {
      command.execute(commandRaw, message);
    }
  }

  protected findCommandExecutor(commandName: string): Command {
    const commands = this.commands.keys();
    let result = commands.next();

    while (true) {
      const cmd = result.value;
      if (commandName.startsWith(cmd)) {
        const commandConstructor = this.commands.get(cmd);
        return new commandConstructor(this);
      }

      if (result.done) {
        break;
      }

      result = commands.next();
    }

    return null;
  }
}

App.debug = true;
App.addTag("App", chalk.bgBlackBright.black);
App.addTag("Game", chalk.bgBlackBright.black);
App.addTag("Message", chalk.bgGreenBright.black);
App.addTag("Reply", chalk.bgGreenBright.black);
App.addTag("Error", chalk.bgRedBright.black);

const app = new App("654421385:AAHBhHd1jBGSZFUkz9FZ7cf6AJbe37lhavY");
app.start();