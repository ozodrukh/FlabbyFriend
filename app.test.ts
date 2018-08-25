import test, {skip} from "ava";
import {App, Command, StartNewGameCommand, ThrowCommand, User} from "./app";
import * as TelegramBot from "node-telegram-bot-api";
import {MessageEntity} from "node-telegram-bot-api";
import {FlabbyGame, Message} from "./game/FlabbyGame";

class TestApp extends App {
  static roomId = -1;

  readonly replies: Message[] = [];
  readonly executedCommands: Command[] = [];

  constructor() {
    super("no-token");
    App.debug = false;
  }

  get executedCommandNames(): string[] {
    return this.executedCommands.map(cmd => cmd.constructor.name)
  }

  start(): void {

  }

  get runningGame(): FlabbyGame {
    return this.gameRooms.get(-1);
  }

  dispatchNewMessage(command: string, ...mentions: Array<User>) {
    this.onMessage(this.createMessageWithMentions(command, mentions))
  }

  dispatchNewMessageFrom(from: string, command: string, ...mentions: Array<User>) {
    this.onMessage(this.createMessageWithMentions(command, mentions, TestApp.roomId, from))
  }

  replyWithMessage(chatId: number | string, messageId: number, message: Message): void {
    App.print("Reply", message.text);
    this.replies.push(message);
  }

  createMessageWithMentions(command: string, mentions: Array<User>,
                            chatId: number = TestApp.roomId, from: string = "@TonyStark"): TelegramBot.Message {

    let offset = command.length + 1;
    const mentionsText: string = mentions.map(m => m.name).join(" ");
    const mentionEntities: MessageEntity[] = mentions.map((mention) => {
      const start = offset;
      offset += mention.mentionLink.length + 1;
      return {
        type: "mention",
        offset: start,
        length: mention.name.length
      } as MessageEntity
    });

    const entities = [];
    entities.push({
      type: "bot_command",
      offset: 0,
      length: command.length
    });
    entities.push(...mentionEntities);

    return {
      text: `${command} ${mentionsText}`,
      chat: {
        id: chatId,
      },
      from: {
        username: from
      },
      entities: entities
    } as TelegramBot.Message
  }

  public onMessage(message: TelegramBot.Message): void {
    super.onMessage(message);
  }

  public onCommand(command: string, message: TelegramBot.Message): void {
    super.onCommand(command, message);
  }

  protected findCommandExecutor(commandName: string): Command {
    const found = super.findCommandExecutor(commandName);
    if (found != null) {
      this.executedCommands.push(found);
      App.print("Message", `command found ${found.constructor.name}`);
    }
    return found;
  }
}

function userOf(username: string): User {
  return {
    id: "@" + username,
    name: "@" + username,
    mentionLink: "@" + username
  }
}

test("test simulated message is same with receiving", a => {
  const app = new TestApp();
  const message = app.createMessageWithMentions("/start", [userOf("SteveRogers")]);
  a.is(message.text, "/start @SteveRogers");
  a.deepEqual(message.entities, [{
    type: "bot_command",
    offset: 0,
    length: 6,
  }, {
    type: "mention",
    offset: 7,
    length: 12,
  }] as MessageEntity[])
});

test("/start with single player, warns user and overs game", (a) => {
  const app = new TestApp();
  app.dispatchNewMessage("/start", userOf("SteveRogers"));

  a.deepEqual(app.executedCommandNames, ["StartNewGameCommand"]);
  a.is(app.replies.length, 2);
  a.is(app.runningGame.state.playersCount(), 2);
  a.is(app.runningGame.state.flabbyPlayers.length, 2);
  a.true(app.runningGame.state.isGameOver());
});


test("/start with multiple players", (a) => {
  const app = new TestApp();
  app.dispatchNewMessage("/start", userOf("SteveRogers"), userOf("DrStrange"));
  app.dispatchNewMessageFrom("@SteveRogers", "/cast", userOf("DrStrange"));

  a.deepEqual(app.executedCommandNames, ["StartNewGameCommand", "ThrowCommand"]);
  a.is(app.replies.length, 2);
  a.is(app.runningGame.state.playersCount(), 3);
  a.is(app.runningGame.state.flabbyPlayers.length, 3);
  a.true(app.runningGame.state.isGameOver());
});

