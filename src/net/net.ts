/* =========================================================================
   Rift Dodge — netcode réteg (Supabase Realtime)

   Egyetlen csatorna szobánként (`arena:<KÓD>`):
   • PRESENCE  → lobbi tagság (id, név, hős, ready) + host-választás
   • BROADCAST → játékesemények egyetlen "m" eseménybe csomagolva ({ t, ... })

   Kliens-authoritatív modell: mindenki a saját avatárja és a saját lövedékei
   fölött úr. A host (a legkisebb id-jű tag) futtatja a pálya-széli NPC-ket és
   a power-upokat. A host determinisztikusan választódik, így nincs külön
   "host átadás" logika — ha a host kilép, a következő legkisebb id veszi át.
   ========================================================================= */

import { createClient, SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

export interface Member {
  id: string;
  name: string;
  champ: string;
  ready: boolean;
}

export type NetHandler = (payload: any, fromId: string) => void;

let _client: SupabaseClient | null = null;
function client(): SupabaseClient {
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 30 } },
    });
  }
  return _client;
}

/** Rövid, jól megosztható szobakód (pl. "K7QF9"). */
export function makeRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

export class Net {
  readonly id = makeId();
  room = "";
  private channel: RealtimeChannel | null = null;
  private handlers = new Map<string, NetHandler[]>();
  private presenceCb: ((members: Member[]) => void) | null = null;
  private self: Omit<Member, "id"> = { name: "Játékos", champ: "ezreal", ready: false };

  /** Csatlakozás a szobához. A `self` a kezdeti presence-állapot. */
  async join(room: string, self: Omit<Member, "id">): Promise<void> {
    if (this.channel) await this.leave();
    this.room = room.toUpperCase();
    this.self = { ...self };
    const ch = client().channel(`arena:${this.room}`, {
      config: { presence: { key: this.id }, broadcast: { self: false } },
    });
    this.channel = ch;

    ch.on("broadcast", { event: "m" }, (msg: any) => {
      const p = msg.payload || {};
      const from = p._f as string;
      const t = p.t as string;
      const list = this.handlers.get(t);
      if (list) for (const h of list) h(p, from);
    });

    ch.on("presence", { event: "sync" }, () => this.emitPresence());

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) { settled = true; reject(new Error("Időtúllépés a kapcsolódásnál")); }
      }, 12000);
      ch.subscribe(async (status, err) => {
        if (settled) return;
        if (status === "SUBSCRIBED") {
          settled = true; clearTimeout(timer);
          await ch.track(this.self);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          settled = true; clearTimeout(timer);
          reject(err ?? new Error("Kapcsolódási hiba: " + status));
        }
      });
    });
  }

  /** Presence frissítése (pl. hős-váltás / ready). */
  async setPresence(partial: Partial<Omit<Member, "id">>): Promise<void> {
    this.self = { ...this.self, ...partial };
    if (this.channel) await this.channel.track(this.self);
  }

  onPresence(cb: (members: Member[]) => void): void {
    this.presenceCb = cb;
    this.emitPresence();
  }

  members(): Member[] {
    if (!this.channel) return [];
    const state = this.channel.presenceState() as Record<string, any[]>;
    const out: Member[] = [];
    for (const key of Object.keys(state)) {
      const meta = state[key][0] || {};
      out.push({
        id: key,
        name: meta.name ?? "Játékos",
        champ: meta.champ ?? "ezreal",
        ready: Boolean(meta.ready),
      });
    }
    out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return out;
  }

  /** Host = a legkisebb id-jű jelenlévő tag. Determinisztikus mindenkinél. */
  hostId(): string {
    const m = this.members();
    return m.length ? m[0].id : this.id;
  }

  isHost(): boolean {
    return this.hostId() === this.id;
  }

  private emitPresence(): void {
    if (this.presenceCb) this.presenceCb(this.members());
  }

  /** Minden esemény-feliratkozás törlése (jelenetváltáskor, hogy ne halmozódjanak). */
  clearHandlers(): void {
    this.handlers.clear();
  }

  /** Esemény-feliratkozás típus szerint (a `t` mező). */
  on(type: string, handler: NetHandler): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  /** Broadcast egy eseményről a szoba összes többi tagjának. */
  send(type: string, payload: Record<string, any> = {}): void {
    if (!this.channel) return;
    this.channel.send({
      type: "broadcast",
      event: "m",
      payload: { ...payload, t: type, _f: this.id },
    });
  }

  async leave(): Promise<void> {
    this.handlers.clear();
    this.presenceCb = null;
    if (this.channel) {
      try {
        await this.channel.untrack();
      } catch {
        /* ignore */
      }
      await client().removeChannel(this.channel);
      this.channel = null;
    }
  }
}

/** Egyetlen, jelenetek közt megosztott Net-példány. */
export const net = new Net();
