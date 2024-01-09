/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import {WebSocket} from 'ws';

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
  n: string; /** note, string */// TODO: number style notes?
  d: number; /** delay, when receiving from the server, number? */
  s: boolean; /** isStop; when receiving from the server, number? */
  v: number /** velocity; Float 0~1, When receiving from the server, number? */
}

interface Participant {
  id?: string; /** participant id */
  _id?: string; /** unique id */
  name?: string;
  color?: string;
  x?: number; /** cursor position X, from 0 to 100. */
  y?: number; /** cursor position Y, from 0 to 100. */
}

interface Channel {
  _id: string;
  id?: string; /** For MPPnet, same as _id */
  settings: ChannelSettings;
  crown?: {
    participantId?: string; /** id of owner (not _id) */
    userId: string; /** _id of owner (if crown dropped: _id of who dropped crown) */
    time: number; /** Server time */
    startPos: { /** Crown start drop from */
      x: number;
      y: number;
    };
    endPos: { /** Crown will dropped to */
      x: number;
      y: number;
    };
  };
  count: number; /** How many people in channel */
}
interface ChannelSettings {
  chat?: boolean;
  color?: string;
  visible?: boolean;
  color2?: string;
  lobby?: boolean;
  crownsolo?: boolean;
  'no cussing'?: boolean;
}


// Server -> client
// Client (self) -> Client (self)

interface ChatEvent {
  m: 'a';
  a: string; /** chat message */
  p: Participant; /** participant who chatted */
  t: number; /** server time */
}

interface ByeEvent {
  m: 'bye';
  p: string; /** Participant ID, not _id */
}

interface ChatHistoryEvent {
  m: 'c';
  c: ChatEvent[]; /** Chat history that contains ChatEvent */
  t: number; /** server time */
}

interface ChannelEvent {
  m: 'ch';
  ch: Channel;
  ppl: Participant[];
  p: string; /** Your Participant ID */
}

interface HiEvent {
  m: 'hi';
  t: number; /** Server time */
  u: Participant; /** Your participant information except id(=participant ID, not means _id(unique ID)) */
  motd: string;
  e?: number;
}

interface LSEvent {
  m: 'ls';
  c: boolean; /** is a complete list of channels ? "u" is an array with every channel : "u" is an array with channels to update information for. */
  u: Channel[];
}

interface MouseEvent { // fuck libdom.d.ts !!!!!!!!!!!!!!!!!!!!!!!!!!!!
  m: 'm';
  id: string; /** Participant ID, not _id */
  readonly x: number;
  readonly y: number;
}

interface NotificationEvent {
  m: 'notification';
  duration?: number;
  class?: string;
  id?: string;
  title?: string;
  text?: string;
  html?: string;
  target?: string;
}

interface NoteEvent {
  m: 'n';
  n: Note[]; /**  */// TODO: Check is another servers can send n which is just Note, not Note[]
  p: Participant; /** Participant */
  t: number; /** Server time */
}

interface NoteQuotaEvent {
  m: 'nq';
  maxHistLen: number; /** How many periods of 2 seconds should be buffered. This is always 3. (copy of https://github.com/mppnet/frontend/blob/main/docs/protocol.md#nq) */
  allowance: number; /** The amount of note on or offs that a participant can send per 2 seconds consistently. (copy of https://github.com/mppnet/frontend/blob/main/docs/protocol.md#nq) */
  max: number /** The maximum amount of note on or offs that a participant can send per 6 seconds. (copy of https://github.com/mppnet/frontend/blob/main/docs/protocol.md#nq) */
}

interface ParticipantEvent extends Participant { /** A "p" message is usually sent when a participant is added from the client's channel. Sometimes participant additions sent with "ch" messages instead. (description copy of https://github.com/mppnet/frontend/blob/main/docs/protocol.md#p) */
  m?: 'p';
}

interface PingEvent {
  m: 't';
  t: number; /** Server time */
  e?: number; /** Client time, echo. */
}

type EventListeners = {
  'a': (event: ChatEvent) => void;
  'bye': (event: ByeEvent) => void;
  'c': (event: ChatHistoryEvent) => void;
  'ch': (event: ChannelEvent) => void;
  'hi': (event: HiEvent) => void;
  'ls': (event: LSEvent) => void;
  'm': (event: MouseEvent) => void;
  'n': (event: NoteEvent) => void;
  'nq': (event: NoteQuotaEvent) => void;
  'p': (event: ParticipantEvent) => void;
  't': (event: PingEvent) => void;
  'notification': (event: NotificationEvent) => void;

  'wsmessage': (data: any) => void; /** ws.onmessage = emit('wsmessaage',evt.data) */
  'wserror': (error: any) => void;
  'connect': () => void;
  'disconnect': (data?: any) => void;
  'participant added': (event: ParticipantEvent) => void;
  'participant update': (event: ParticipantEvent) => void;
  'participant removed': (event: ParticipantEvent) => void;
  'status': (event: string) => void;
  'count': (data: number) => void;

//  [key: string]: (...data: any) => any;
};

type AllEvents = Parameters<Exclude<(EventListeners[keyof EventListeners]), (...args: any[]) => any>>[0]; // ChatGPT Edition

class EventEmitter {
  /* eslint-disable @typescript-eslint/ban-types */
  private listeners: Map<string, Function[]> = new Map();

  constructor() {
    this.listeners = new Map();
  }

  /** Add a listener function for the specified event.
   * @param {keyof EventListeners} event
   * @param {(data: AllEvents) => void} listener - The function to be called when the event occurs.
   */
  on<T extends keyof EventListeners>(event: T, listener: EventListeners[T]): void {
    if (!this.listeners.has(event as string)) this.listeners.set(event, []);
    this.listeners.get(event as string)?.push(listener);
    return;
  }

  /** Remove a listener function for the specified event.
   * @param {EventNames} event
   * @param {Function} listener - The listener function to be removed.
   */
  off(event: EventNames | string, listener: Function): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index !== -1) {
        eventListeners.splice(index, 1);
      }
    }
    return;
  }

  /** Add a one-time listener function for the specified event.
   * @param {keyof EventListeners} event
   * @param {(data: AllEvents) => void} listener - The function to be called once when the event occurs.
   */
  once<T extends keyof EventListeners>(event: T, listener: EventListeners[T]): void {
    const wrapper = (...args: any[]) => {
      this.off(event, wrapper);
      listener(args);
    };
    return this.on(event, wrapper);
  }

  /** Emit an event, calling all registered listener functions for that event.
   * @param {EventNames} event
   * @param {...any} args - Arguments to be passed to the event listener functions.
   */
  emit(event: EventNames | string, ...args: any) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      for (const listener of eventListeners) {
        listener(null, args);
      }
    }
  }
}

class Client extends EventEmitter {
  uri: string;
  ws?: WebSocket;
  serverTimeOffset: number = 0;
  user?: Participant;
  participantId?: string;
  channel?: Channel;
  ppl: { [key: string]: Participant } = {};
  connectionTime?: number;
  desiredChannelId?: string;
  desiredChannelSettings: ChannelSettings = {color: '#ecfaed'};
  pingInterval?: NodeJS.Timeout;
  canConnect: boolean = false;
  noteBuffer: Note[] = [];
  noteBufferTime: number = 0;
  noteFlushInterval?: NodeJS.Timeout;
  offlineParticipant: Participant = {_id: '', name: '', color: '#777'};

  constructor(uri?: string/*, token?: string, proxy?: string*/) { // TODO: Support token for MPPnet and proxy for another servers (piano.owop?)
    super();
    this.uri = uri || 'wss://game.multiplayerpiano.com:443';
    this.bindEventListeners();
    this.emit('status', '(Offline mode)');
  }

  isSupported(): boolean {
    return typeof WebSocket === 'function';
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
    this.emit('status', 'Connecting...');
    this.ws = new WebSocket(this.uri, {
      origin: 'https://game.multiplayerpiano.com',
    });

    if (this.ws) {
      this.ws.addEventListener('close', (evt) => {
        this.user = undefined;
        this.participantId = undefined;
        this.channel = undefined;
        this.setParticipants([]);
        clearInterval(this.pingInterval!);
        clearInterval(this.noteFlushInterval!);

        this.emit('disconnect', evt);
        this.emit('status', 'Offline mode');

        // reconnect
        if (this.connectionTime) {
          this.connectionTime = undefined;
        }
        setTimeout(this.connect.bind(this), 25);
      });

      this.ws.addEventListener('error', (err) => {
        this.emit('wserror', err);
        if (this.ws) {
          this.ws.close();
        }
      });

      this.ws.addEventListener('open', (evt) => {
        this.connectionTime = Date.now();
        this.sendArray([{m: 'hi', x: 1, y: 1 || undefined}]);
        this.pingInterval = setInterval(() => {
          this.sendArray([{m: 't', e: Date.now()}]);
        }, 20000);
        this.sendArray([{m: 't', e: Date.now()}]);
        this.noteBuffer = [];
        this.noteBufferTime = 0;
        this.noteFlushInterval = setInterval(() => {
          if (this.noteBufferTime && this.noteBuffer.length > 0) {
            this.sendArray([
              {m: 'n', t: this.noteBufferTime + this.serverTimeOffset, n: this.noteBuffer},
            ]);
            this.noteBufferTime = 0;
            this.noteBuffer = [];
          }
        }, 100);

        this.emit('connect');
        this.emit('status', 'Joining channel...');
      });

      this.ws.addEventListener('message', (evt) => {
        this.emit('wsmessage', evt.data);
        const transmission = JSON.parse(evt.data as string);
        for (let i = 0; i < transmission.length; i++) {
          const msg = transmission[i];
          this.emit(msg.m, msg);
        }
      });
    }
  }

  bindEventListeners(): void {
    /* eslint-disable @typescript-eslint/no-this-alias */
    /* eslint-disable prefer-const */
    let self = this;
    this.on('hi', (msg) => {
      self.user = msg.u;
      self.receiveServerTime(msg.t, msg.e || undefined);
      if (self.desiredChannelId) {
        self.setChannel();
      }
    });

    this.on('t', (msg) => {
      self.receiveServerTime(msg.t, msg.e || undefined);
    });

    this.on('ch', (msg) => {
      self.desiredChannelId = msg.ch._id;
      self.desiredChannelSettings = msg.ch.settings;
      self.channel = msg.ch;
      if (msg.p) self.participantId = msg.p;
      self.setParticipants(msg.ppl);
    });

    this.on('p', (msg) => {
      self.participantUpdate(msg);
      msg.id && self.emit("participant update", self.findParticipantById(msg.id));
    });

    this.on("m", (msg) => {
      self.participantUpdate(msg);
    });

    this.on("bye", (msg) => {
      self.removeParticipant(msg.p);
    });
  }

  send(raw: string): void {
    if (this.isConnected() && this.ws) {
      this.ws.send(raw);
    }
  }

  sendArray(arr: object[]): void {
    this.send(JSON.stringify(arr));
  }

  setChannel(id?: string, set?: ChannelSettings): void {
    this.desiredChannelId = id || this.desiredChannelId || "lobby";
    this.desiredChannelSettings = set || this.desiredChannelSettings || undefined;
    this.sendArray([{ m: "ch", _id: this.desiredChannelId, set: this.desiredChannelSettings }]);
  }

  getChannelSetting(key: string): string | boolean | undefined {
    let keys: keyof ChannelSettings; // @ts-ignore; next line
    if (!this.isConnected() || !this.channel?.settings || !keys.includes(key)) {
      return key == 'color' ? '#ecfaed' : undefined // my old shit: key == 'color' && '#ecfaed' || undefined
    } // @ts-ignore; next line
    return this.channel?.settings[key];
  }

  setChannelSettings(settings: ChannelSettings): void {
    if (!this.isConnected() || !this.channel || !this.channel.settings) {
      return;
    }
    if (this.desiredChannelSettings) {
      let keys: keyof ChannelSettings;
      for (const key in settings) {
        if (Object.prototype.hasOwnProperty.call(settings, key)) { // @ts-ignore; next line
          if (keys.includes(key)) return this.desiredChannelSettings[key] = settings[key];
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
      if (Object.prototype.hasOwnProperty.call(ppl, id)) {
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
    return Object.keys(this.ppl).length;
  }

  participantUpdate(update: Participant | MouseEvent): void {
    if(!update.id) return;
    let part = this.ppl[update.id] || null;
    if (part === null) {
      this.ppl[update.id] = update;
      this.emit("participant added", update);
      this.emit("count", this.countParticipants());
    } else {
      if(update.x)          part.x = update.x;
      if(update.y)          part.y = update.y;
      if('name' in update)  part.name = update.name || part.name;
      if('color' in update) part.color = update.color || part.color;
    }
    return;
  }

  removeParticipant(id: string): void {
    if (Object.prototype.hasOwnProperty.call(this.ppl, id)) {
      const part = this.ppl[id];
      delete this.ppl[id];
      this.emit('participant removed', part);
      this.emit('count', this.countParticipants());
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
      if (this.noteBufferTime) {
        this.noteBuffer.push({d: Date.now() - this.noteBufferTime, n: note, v: +(vel.toFixed(3)), s: false});
      } else {
        this.noteBufferTime = Date.now();
        this.noteBuffer.push({ d: 0, n: note, v: +(vel.toFixed(3)), s: false});
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


  say(message: string): void {
    this.sendArray([{m: 'a', message}]);
  }

  userset(set: Participant) {
    this.sendArray([{m: 'userset', set}]);
    if(set.x || set.y) this.moveMouse(set.x,set.y);
  }

  setName(name: string) {
    this.userset({name});
  }

  moveMouse(x: number = NaN, y: number = NaN) {
    this.sendArray([{m: 'm', x, y}]);
  }

  kickBan(_id: string, ms: number) {
    this.ban(_id, ms);
  }

  kickban(_id: string, ms: number) {
    this.ban(_id, ms);
  }

  ban(_id: string, ms: number = 0) {
    this.sendArray([{m: 'kickban', _id, ms}]);
  }

  kick(_id: string) {
    this.ban(_id, 0);
  }

  chown(id: string) {
    this.sendArray([{m: 'chown', id}]);
  }

  chset(set: ChannelSettings) {
    this.sendArray([{m: 'chset', set}]);
  }

  unban(_id: string) {
    this.sendArray([{m:'unban', _id}]);
  }
}

export default Client;
module.exports = Client;
