import {WebSocket} from "ws";
type EventNames = 
| 'status'
| 'wserror' | 'wsmessage'
| 'connect'
| 'disconnect'
| 'participant update'
| 'participant added'
| 'participant removed'
| 'count'
| 'a'
| 'b'
| 'bye'
| 'c'
| 'ch'
| 'hi'
| 'ls'
| 'm'
| 'n'
| 'notification'
| 'nq'
| 'p'
| 't';

interface Note {
  n: string; // note, string // TODO: Check if number style notes
  d: number; // delay, when receiving from the server, number?
  s: boolean; // means stop; when receiving from the server, number?
  v: number // velocity; Float 0~1, When receiving from the server, number?
}

interface Participant {
  id?: string; // participant id
  _id: string; // unique id
  name: string;
  color: string;
  x?: number; // cursor position X, from 0 to 100.
  y?: number; // cursor position Y, from 0 to 100.
}

interface Channel {
  _id: string;
  settings: ChannelSettings;
  crown?: {
    participantId?: string;
    userId: string;
    time: number;
    startPos: {
      x: number;
      y: number;
    };
    endPos: {
      x: number;
      y: number;
    };
  };
  count: number;
}
interface ChannelSettings {
  chat?: boolean;
  color: string;
  visible?: boolean;
  color2?: string;
  lobby?: boolean;
  crownsolo?: boolean;
  'no cussing'?: boolean;
}


interface ChatEvent {
  m: 'a';
  a: string;
  p: Participant;
}

interface ChatHistoryEvent {
  m: 'c';
  c: ChatEvent[];
  t: number;
}

interface NoteEvent {
  m: 'n';
  // Add properties specific to NoteEvent
}

interface MouseEvent {
  m: 'm';
  // Add properties specific to MouseEvent
}

// Union type for all event types
type AllEvents = ChatEvent | ChatHistoryEvent | NoteEvent | MouseEvent;

type EventListeners = {
  'a': (data: ChatEvent) => void;
  'c': (data: ChatHistoryEvent) => void;
  'n': (data: NoteEvent) => void;
  'm': (data: MouseEvent) => void;
  // Add more event types as needed
};


/**
 * @typedef {'status' | 'wserror' | 'wsmessage' | 'connect' | 'disconnect' | 'participant update' | 'participant added' | 'participant removed' | 'count' | 'a' | 'b' | 'bye' | 'c' | 'ch' | 'hi' | 'ls' | 'm' | 'n' | 'notification' | 'nq' | 'p' | 't'} EventNames
 */
class MyEventEmitter {
  private listeners: Map<string, Function[]> = new Map();

  constructor() {
    this.listeners = new Map();
  }
  /**
   * @param {EventNames} event
   * @param {Function} listener
   */
  on(event: EventNames, listener: Function): void {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)?.push(listener);
    return;
  }
  

  /**
   * @param {EventNames} event
   * @param {Function} listener
   */
  off(event: EventNames, listener: Function): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index !== -1) {
        eventListeners.splice(index, 1);
      }
    }
    return;
  }

  /**
   * @param {EventNames} event
   * @param {Function} listener
   */
  once(event: EventNames, listener: Function): void {
    const wrapper = (...args: any[]) => {
      this.off(event, wrapper);
      listener.apply(null, args);
    };
    return this.on(event, wrapper);
  }

  /**
   * @param {EventNames} event
   * @param {Function} listener
   */
  emit(event: EventNames, ...args: any) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      for (const listener of eventListeners) {
        listener.apply(null, args);
      }
    }
  }
}

class Client extends MyEventEmitter {
  uri: string;
  ws?: WebSocket;
  serverTimeOffset: number = 0;
  user?: Participant;
  participantId?: string;
  channel?: Channel;
  ppl: { [key: string]: Participant } = {};
  connectionTime?: number;
  desiredChannelId?: string;
  desiredChannelSettings: ChannelSettings = { color:"#ecfaed" };
  pingInterval?: NodeJS.Timeout;
  canConnect: boolean = false;
  noteBuffer: Note[] = [];
  noteBufferTime: number = 0;
  noteFlushInterval?: NodeJS.Timeout;
  token?: string;
  offlineParticipant: Participant = { _id: "", name: "", color: "#777" };

  constructor(uri?: string, token?: string) {
    super();
    this.uri = uri || "wss://game.multiplayerpiano.com:443";
    this.token = token;
    this.bindEventListeners();
    this.emit("status", "(Offline mode)");
  }

  isSupported(): boolean {
    return typeof WebSocket === "function";
  }

  isConnected(): boolean {
    return (this.isSupported() && this.ws && this.ws.readyState === WebSocket.OPEN) || false;
  }

  isConnecting(): boolean {
    return (this.isSupported() && this.ws && this.ws.readyState === WebSocket.CONNECTING) || false;
  }

  start(): void {
    this.canConnect = true;
    this.connect();
  }

  stop(): void {
    this.canConnect = false;
    if (this.ws) {
      this.ws.close();
    }
  }

  connect(): void {
    if (!this.canConnect || !this.isSupported() || this.isConnected() || this.isConnecting()) {
      return;
    }
    this.emit("status", "Connecting...");
    this.ws = new WebSocket(this.uri, {
      origin: "https://game.multiplayerpiano.com",
    });

    if (this.ws) {
      this.ws.addEventListener("close", (evt) => {
        this.user = undefined;
        this.participantId = undefined;
        this.channel = undefined;
        this.setParticipants([]);
        clearInterval(this.pingInterval!);
        clearInterval(this.noteFlushInterval!);

        this.emit("disconnect", evt);
        this.emit("status", "Offline mode");

        // reconnect
        if (this.connectionTime) {
          this.connectionTime = undefined;
        }
        setTimeout(this.connect.bind(this), 25);
      });

      this.ws.addEventListener("error", (err) => {
        this.emit("wserror", err);
        if (this.ws) {
          this.ws.close();
        }
      });

      this.ws.addEventListener("open", (evt) => {
        this.connectionTime = Date.now();
        this.sendArray([{ m: "hi", x: 1, y: 1, token: this.token }]);
        this.pingInterval = setInterval(() => {
          this.sendArray([{ m: "t", e: Date.now() }]);
        }, 20000);
        this.sendArray([{ m: "t", e: Date.now() }]);
        this.noteBuffer = [];
        this.noteBufferTime = 0;
        this.noteFlushInterval = setInterval(() => {
          if (this.noteBufferTime && this.noteBuffer.length > 0) {
            this.sendArray([
              { m: "n", t: this.noteBufferTime + this.serverTimeOffset, n: this.noteBuffer },
            ]);
            this.noteBufferTime = 0;
            this.noteBuffer = [];
          }
        }, 100);

        this.emit("connect");
        this.emit("status", "Joining channel...");
      });

      this.ws.addEventListener("message", (evt) => {
        console.log(evt.data);
        this.emit('wsmessage', evt.data as string);
        const transmission = JSON.parse(evt.data as string);
        for (let i = 0; i < transmission.length; i++) {
          const msg = transmission[i];
          this.emit(msg.m, msg);
        }
      });
    }
  }

  bindEventListeners(): void {
    let self = this;
    this.on("hi", (msg) => {
      self.user = msg.u;
      self.receiveServerTime(msg.t, msg.e || undefined);
      if (self.desiredChannelId) {
        self.setChannel();
      }
    });

    this.on("t", (msg) => {
      self.receiveServerTime(msg.t, msg.e || undefined);
    });

    this.on("ch", (msg) => {
      self.desiredChannelId = msg.ch._id;
      self.desiredChannelSettings = msg.ch.settings;
      self.channel = msg.ch;
      if (msg.p) self.participantId = msg.p;
      self.setParticipants(msg.ppl);
    });

    this.on("p", (msg) => {
      self.participantUpdate(msg);
      self.emit("participant update", self.findParticipantById(msg.id));
    });

    this.on("m", (msg) => {
      if (self.ppl.hasOwnProperty(msg.id)) {
        self.participantUpdate(msg);
      }
    });

    this.on("bye", (msg) => {
      self.removeParticipant(msg.p);
    });
  }

  send(raw: string): void {
    if (this.isConnected() && this.ws) {
      this.ws.send(raw);
      console.log(raw)
    }
  }

  sendArray(arr: object[]): void {
    console.log(arr)
    this.send(JSON.stringify(arr));
  }

  setChannel(id?: string, set?: ChannelSettings): void {
    this.desiredChannelId = id || this.desiredChannelId || "lobby";
    this.desiredChannelSettings = set || this.desiredChannelSettings || undefined;
    this.sendArray([{ m: "ch", _id: this.desiredChannelId, set: this.desiredChannelSettings }]);
  }

  getChannelSetting(key: string): string | boolean | undefined {
    if (!this.isConnected() || !this.channel || !this.channel.settings) {
      if(key=='color')return '#ecfaed';
      else return;
    }
    return this.channel.settings[key];
  }

  setChannelSettings(settings: ChannelSettings): void {
    if (!this.isConnected() || !this.channel || !this.channel.settings) {
      return;
    }
    if (this.desiredChannelSettings) {
      for (const key in settings) {
        if (settings.hasOwnProperty(key)) {
          let keys: keyof ChannelSettings;
          if(keys.includes(key)) return this.desiredChannelSettings[key] = settings[key]; // @ts-ignore VSCode Sucks
        }
      }
      this.sendArray([{ m: "chset", set: this.desiredChannelSettings }]);
    }
  }

  getOwnParticipant(): Participant | undefined {
    if(!this.participantId) return;
    return this.findParticipantById(this.participantId);
  }

  setParticipants(ppl: Participant[]): void {
    // remove participants who left
    for (const id in this.ppl) {
      if (this.ppl.hasOwnProperty(id)) {
        let found = false;
        for (let j = 0; j < ppl.length; j++) {
          if (ppl[j].id === id) {
            found = true;
            break;
          }
        }
        if (!found) {
          this.removeParticipant(id);
        }
      }
    }
    // update all
    for (let i = 0; i < ppl.length; i++) {
      this.participantUpdate(ppl[i]);
    }
  }

  countParticipants(): number {
    let count = 0;
    for (const i in this.ppl) {
      if (this.ppl.hasOwnProperty(i)) {
        ++count;
      }
    }
    return count;
  }

  participantUpdate(update: Participant): void {
    if(!update.id) return;
    let part = this.ppl[update.id] || null;
    if (part === null) {
      this.ppl[update.id] = update;
      this.emit("participant added", update);
      this.emit("count", this.countParticipants());
    } else {
      if(update.x)     part.x = update.x;
      if(update.y)     part.y = update.y;
      if(update.color) part.color = update.color;
      if(update.name)  part.name = update.name;
    }
    return;
  }

  removeParticipant(id: string): void {
    if (this.ppl.hasOwnProperty(id)) {
      const part = this.ppl[id];
      delete this.ppl[id];
      this.emit("participant removed", part);
      this.emit("count", this.countParticipants());
    }
  }

  findParticipantById(id: string): Participant {
    return this.ppl[id] || this.offlineParticipant;
  }

  isOwner(): boolean {
    return this.channel && this.channel.crown && this.channel.crown.participantId === this.participantId || false;
  }

  preventsPlaying(): boolean {
    return this.isConnected() && !this.isOwner() && this.getChannelSetting("crownsolo") === true;
  }

  receiveServerTime(time: number, echo?: number): void {
    const now = Date.now();
    const target = time - now;
    const duration = 1000;
    const steps = 50;
    const step_ms = duration / steps;
    const difference = target - this.serverTimeOffset;
    const inc = difference / steps;
    let step = 0;
    const iv = setInterval(() => {
      this.serverTimeOffset += inc;
      if (++step >= steps) {
        clearInterval(iv);
        this.serverTimeOffset = target;
      }
    }, step_ms);
  }

  startNote(note: string, vel: number = 0.5): void {
    if (this.isConnected()) {
      if (!this.noteBufferTime) {
        this.noteBufferTime = Date.now();
        this.noteBuffer.push({ d: 0, n: note, v: +(vel.toFixed(3)), s: false});
      } else {
        this.noteBuffer.push({ d: Date.now() - this.noteBufferTime, n: note, v: +(vel.toFixed(3)), s: false });
      }
    }
  }

  stopNote(note: string): void {
    if (this.isConnected()) {
      if (!this.noteBufferTime) {
        this.noteBufferTime = Date.now();
        this.noteBuffer.push({ d: 0, n: note, v: 0, s: true });
      } else {
        this.noteBuffer.push({ d: Date.now() - this.noteBufferTime, n: note, s: true, v: 0 });
      }
    }
  }
}

//module.exports = Client;
export default Client;
