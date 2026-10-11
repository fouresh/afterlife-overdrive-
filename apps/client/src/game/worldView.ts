import {
  CHAR_ANIMS,
  RARITY_COLORS,
  contentRu,
  getContent,
  type HubStation,
  type TilesetDef,
} from '@ao/content';
import { Tile } from '@ao/procgen';
import { TILE } from '@ao/shared';
import { EF, ES, Ev, Kind, PickupKind, PropKind, itemBase, type World } from '@ao/sim';
import { Container, Sprite } from 'pixi.js';
import { sfx } from '../audio/sfx';
import type { Atlas, AtlasEntry } from './atlas';
import type { Fx } from './fx';
import { makeSprite, type Renderer } from './renderer';

interface View {
  gen: number;
  kind: number;
  root: Container;
  body: Sprite;
  shadow?: Sprite;
  weapon?: Sprite;
  glow?: Sprite;
  extra?: Sprite;
  entry: AtlasEntry;
  /** Id of the weapon sprite currently shown (players). */
  weaponId?: string;
  look?: number;
}

const hexNum = (h: string) => parseInt(h.slice(1), 16);
const RARITY_NUM = RARITY_COLORS.map(hexNum);

export interface ViewHooks {
  /** Request a hit-stop (seconds). */
  hitStop(sec: number): void;
  toast(text: string, kind?: 'info' | 'warn' | 'good'): void;
  hurtFlash(): void;
  talk(station: number): void;
}

/**
 * Maps sim entities to Pixi display objects and turns sim events into effects and sounds.
 * Views are pooled per entity slot and reused; nothing is allocated per frame once warm.
 */
export class WorldView {
  private views: (View | undefined)[] = [];
  private torches: { sprite: Sprite; glow: Sprite; phase: number; speed: number }[] = [];
  private doors: { sprite: Sprite; i: number; locked: Sprite }[] = [];
  private statics: Container[] = [];
  private time = 0;
  private tileset: TilesetDef;

  constructor(
    private r: Renderer,
    private atlas: Atlas,
    private fx: Fx,
    private world: World,
    private playerSheet: (index: number) => AtlasEntry,
    private npcSheet: (station: number) => AtlasEntry | null,
    private npcOf: (npcIndex: number) => AtlasEntry | null,
    private stations: HubStation[],
    private hooks: ViewHooks,
    tileset: TilesetDef,
    /** Index of the player this device controls (personal loot, own sounds). */
    private local = 0,
  ) {
    this.tileset = tileset;
    this.buildStatics();
  }

  private buildStatics(): void {
    const f = this.world.floor;
    const glow = this.atlas.get('fx.glow');
    for (const p of f.props) {
      const cx = p.x * TILE + TILE / 2;
      const cy = p.y * TILE + TILE / 2;
      if (p.kind === 'torch') {
        const s = makeSprite(this.atlas.get(this.tileset.torch));
        s.position.set(cx, cy);
        this.r.decalLayer.addChild(s);
        const g = makeSprite(glow);
        g.position.set(cx, cy + 2);
        g.tint = this.tileset.light;
        g.alpha = 0.35;
        g.scale.set(1.4);
        this.r.glowLayer.addChild(g);
        this.torches.push({
          sprite: s,
          glow: g,
          phase: (p.x * 13 + p.y * 7) % 10,
          speed: this.tileset.id === 'forest' ? 3.2 : 5.5,
        });
        this.statics.push(s, g);
      } else if (p.kind === 'pillar') {
        const s = makeSprite(this.atlas.get(this.tileset.pillar));
        s.position.set(cx, (p.y + 1) * TILE - 1);
        s.zIndex = (p.y + 1) * TILE - 2;
        this.r.actorLayer.addChild(s);
        this.statics.push(s);
      } else if (p.kind === 'stairs') {
        const s = makeSprite(this.atlas.get(this.tileset.stairs));
        s.anchor.set(0.5);
        s.position.set(cx, cy);
        this.r.decalLayer.addChild(s);
        this.statics.push(s);
      }
    }
    const doorTex = this.atlas.get(this.tileset.door);
    const lockTex = this.atlas.get(this.tileset.doorLocked);
    for (const d of f.doors) {
      const s = new Sprite(doorTex.frames[0]);
      s.position.set(d.x * TILE, d.y * TILE);
      s.visible = false;
      const l = new Sprite(lockTex.frames[0]);
      l.position.set(d.x * TILE, d.y * TILE);
      l.visible = false;
      this.r.decalLayer.addChild(s, l);
      this.doors.push({ sprite: s, locked: l, i: d.y * f.w + d.x });
      this.statics.push(s, l);
    }
  }

  private createView(i: number): View {
    const w = this.world;
    const e = w.e;
    const kind = e.kind[i]!;
    const root = new Container();
    let entry: AtlasEntry;
    let shadow: Sprite | undefined;
    let glow: Sprite | undefined;
    let extra: Sprite | undefined;
    let weapon: Sprite | undefined;
    const layer = this.r.actorLayer;
    const addShadow = (scale: number) => {
      shadow = makeSprite(this.atlas.get('fx.shadow'));
      shadow.anchor.set(0.5);
      shadow.scale.set(scale);
      root.addChild(shadow);
    };
    switch (kind) {
      case Kind.Player:
        entry = this.playerSheet(e.ref[i]!);
        addShadow(1);
        root.sortableChildren = true;
        break;
      case Kind.Enemy: {
        const def = w.content.enemies[e.def[i]!]!;
        entry = this.atlas.get(def.sprite);
        addShadow(Math.max(1, def.radius / 5.5));
        break;
      }
      case Kind.Projectile: {
        const def = w.content.projectiles[e.def[i]!]!;
        entry = this.atlas.get(def.sprite);
        if (def.glow !== undefined) {
          glow = makeSprite(this.atlas.get('fx.glow'));
          glow.tint = def.glow;
          glow.scale.set(0.45);
          glow.alpha = 0.8;
          this.r.glowLayer.addChild(glow);
        }
        break;
      }
      case Kind.Pickup: {
        const k = e.def[i]!;
        if (k === PickupKind.Gold) entry = this.atlas.get('prop.coin');
        else if (k === PickupKind.Potion) entry = this.atlas.get('prop.potion');
        else if (k === PickupKind.Key) entry = this.atlas.get('prop.key');
        else {
          const drop = w.drops[e.ref[i]!];
          entry = this.atlas.get(drop?.item ? `item:${drop.item.base}` : 'prop.coin');
          if (drop?.item && drop.item.rarity >= 1) {
            glow = makeSprite(this.atlas.get(drop.item.rarity >= 2 ? 'fx.beam' : 'fx.glow'));
            glow.anchor.set(0.5, 1);
            glow.tint = RARITY_NUM[drop.item.rarity]!;
            glow.alpha = 0.7;
            if (drop.item.rarity < 2) glow.scale.set(0.5);
            this.r.glowLayer.addChild(glow);
          }
        }
        addShadow(0.7);
        break;
      }
      case Kind.Prop: {
        const k = e.def[i]!;
        if (k === PropKind.Chest) entry = this.atlas.get('prop.chest');
        else if (k === PropKind.Shop) {
          entry = this.atlas.get('prop.pedestal');
          const slot = w.shop[e.ref[i]!];
          const icon = slot?.potion
            ? 'prop.potion'
            : slot?.item
              ? `item:${slot.item.base}`
              : 'prop.coin';
          extra = makeSprite(this.atlas.get(icon));
          extra.anchor.set(0.5, 1);
          extra.position.set(0, -9);
          root.addChild(extra);
        } else if (k === PropKind.Portal) {
          entry = this.atlas.get('prop.portal');
          glow = makeSprite(this.atlas.get('fx.glow'));
          glow.tint = 0x36c4b4;
          glow.scale.set(1.2);
          this.r.glowLayer.addChild(glow);
        } else if (k === PropKind.Spikes) entry = this.atlas.get(this.tileset.spikes);
        else if (k === PropKind.Captive) {
          // The NPC stands in a cage (cage drawn over them).
          entry = this.npcOf(e.ref[i]!) ?? this.atlas.get('fx.white');
          extra = makeSprite(this.atlas.get('prop.cage'));
          root.addChild(extra);
        } else if (k === PropKind.Station) {
          const st = this.stations[e.ref[i]!];
          entry = this.atlas.get(st?.object ?? 'fx.white');
          const npc = this.npcSheet(e.ref[i]!);
          if (npc) {
            extra = makeSprite(npc);
            extra.position.set(-16, 6);
            root.addChild(extra);
          }
          if (st?.id === 'portal' || st?.id === 'altar') {
            glow = makeSprite(this.atlas.get('fx.glow'));
            glow.tint = 0x36c4b4;
            glow.scale.set(st.id === 'portal' ? 1.2 : 0.8);
            this.r.glowLayer.addChild(glow);
          }
        } else entry = this.atlas.get('fx.white');
        break;
      }
      case Kind.Area: {
        entry = this.atlas.get('fx.disc');
        break;
      }
      case Kind.Ally: {
        entry = this.atlas.get('ally.wisp');
        glow = makeSprite(this.atlas.get('fx.glow'));
        glow.tint = 0xaaf6ec;
        glow.scale.set(0.4);
        this.r.glowLayer.addChild(glow);
        break;
      }
      default:
        entry = this.atlas.get('fx.white');
    }
    const body = makeSprite(entry);
    // The stairs are drawn by buildStatics(); the entity only exists for interaction. Without
    // this it fell through to the 'fx.white' placeholder: a white square on top of the stairs.
    if (kind === Kind.Prop && e.def[i] === PropKind.Stairs) body.visible = false;
    if (kind === Kind.Projectile || kind === Kind.Area || kind === Kind.Ally) body.anchor.set(0.5);
    if (kind === Kind.Prop && e.def[i] === PropKind.Spikes) body.anchor.set(0.5);
    root.addChild(body);
    if (kind === Kind.Player) {
      weapon = new Sprite();
      weapon.visible = false;
      root.addChild(weapon);
    }
    const isFloor = kind === Kind.Area || (kind === Kind.Prop && e.def[i] === PropKind.Spikes);
    (isFloor ? this.r.decalLayer : layer).addChild(root);
    return { gen: e.gen[i]!, kind, root, body, shadow, glow, extra, weapon, entry };
  }

  private destroyView(v: View): void {
    v.glow?.destroy();
    v.root.destroy({ children: true });
  }

  sync(alpha: number, dt: number): void {
    this.time += dt;
    const w = this.world;
    const e = w.e;
    for (let i = 0; i < Math.max(e.hi, this.views.length); i++) {
      let v = this.views[i];
      if (!e.alive[i]) {
        if (v) {
          this.destroyView(v);
          this.views[i] = undefined;
        }
        continue;
      }
      // Personal loot: hide other players' drops (and drop a view left by the slot's previous
      // occupant, otherwise it would stay frozen on screen).
      if (e.kind[i] === Kind.Pickup && e.owner[i]! >= 0 && e.owner[i] !== this.local) {
        if (v) {
          this.destroyView(v);
          this.views[i] = undefined;
        }
        continue;
      }
      if (!v || v.gen !== e.gen[i] || v.kind !== e.kind[i]) {
        if (v) this.destroyView(v);
        v = this.createView(i);
        this.views[i] = v;
      }
      const x = e.px[i]! + (e.x[i]! - e.px[i]!) * alpha;
      const y = e.py[i]! + (e.y[i]! - e.py[i]!) * alpha;
      v.root.position.set(Math.round(x), Math.round(y));
      v.root.zIndex = y;
      switch (v.kind) {
        case Kind.Player:
          this.animatePlayer(i, v);
          break;
        case Kind.Enemy:
          this.animateEnemy(i, v);
          break;
        case Kind.Projectile:
          this.animateProjectile(i, v, x, y);
          break;
        case Kind.Pickup:
          this.animatePickup(i, v, x, y);
          break;
        case Kind.Prop:
          this.animateProp(i, v, x, y);
          break;
        case Kind.Area: {
          const total = e.life[i]! || 1;
          const t = 1 - e.timer[i]! / total;
          v.body.tint = e.ref[i]!;
          v.body.scale.set((e.r[i]! / 15) * (0.4 + 0.6 * t));
          v.body.alpha = 0.35 + 0.4 * t + 0.15 * Math.sin(this.time * 30);
          break;
        }
        case Kind.Ally: {
          v.body.texture = v.entry.frames[Math.floor(this.time * 8) & 1]!;
          v.glow?.position.set(x, y);
          if (Math.random() < 0.3) this.fx.mote(x, y, 0xaaf6ec);
          break;
        }
      }
    }
    for (let k = e.hi; k < this.views.length; k++) {
      const v = this.views[k];
      if (v) {
        this.destroyView(v);
        this.views[k] = undefined;
      }
    }
    // Torch flicker
    const torch = this.atlas.get(this.tileset.torch);
    for (const t of this.torches) {
      t.sprite.texture =
        torch.frames[Math.floor(this.time * t.speed + t.phase) % torch.frames.length]!;
      t.glow.alpha =
        0.3 + 0.06 * Math.sin(this.time * 9 + t.phase) + 0.03 * Math.sin(this.time * 23);
    }
    // Doors
    const m = w.map;
    for (const d of this.doors) {
      d.sprite.visible = m.dyn[d.i] !== 0 && m.tiles[d.i] === Tile.Door;
      d.locked.visible = m.tiles[d.i] === Tile.LockedDoor;
    }
  }

  private animatePlayer(i: number, v: View): void {
    const w = this.world;
    const e = w.e;
    const p = w.players[e.ref[i]!];
    if (!p) return;
    if (v.look !== p.lookVersion) {
      v.entry = this.playerSheet(p.index);
      v.look = p.lookVersion;
    }
    if (p.dead) {
      v.body.texture = v.entry.frames[0]!;
      v.body.rotation = Math.min(Math.PI / 2, p.deathT * 0.15) * (v.body.scale.x < 0 ? -1 : 1);
      v.body.alpha = Math.max(p.hardcore ? 0.3 : 0.55, 1 - p.deathT / 60);
      if (v.weapon) v.weapon.visible = false;
      // Co-op: an ally is reviving this hero.
      if (p.revive > 0 && Math.random() < 0.5)
        this.fx.mote(e.x[i]! + (Math.random() - 0.5) * 12, e.y[i]! - 4, 0x7fe3a0, 0.5);
      return;
    }
    v.body.rotation = 0;
    const moving = p.moving || p.dashT > 0;
    const frames = moving ? CHAR_ANIMS.run : CHAR_ANIMS.idle;
    const idx = frames[Math.abs(Math.floor(this.time * (moving ? 10 : 2))) % frames.length]!;
    const flash = e.hitFlash[i]! > 0;
    v.body.texture = (flash ? v.entry.flash : v.entry.frames)[idx]!;
    const aim = p.aim;
    const left = Math.abs(aim) > Math.PI / 2;
    v.body.scale.x = left ? -1 : 1;
    v.body.alpha = e.iframes[i]! > 0 && p.dashT === 0 && w.tick & 2 ? 0.45 : 1;
    if (p.dashT > 0 && Math.random() < 0.6)
      this.fx.mote(e.x[i]!, e.y[i]! - 2, p.dashDamage > 0 ? 0xd89cf2 : 0xa3a1bd, 0.25);
    if (p.shield > 0 && Math.random() < 0.25)
      this.fx.mote(e.x[i]! + (Math.random() - 0.5) * 14, e.y[i]! - 8, 0xece4c8, 0.3);
    for (const b of p.buffs)
      if (Math.random() < 0.2)
        this.fx.mote(e.x[i]! + (Math.random() - 0.5) * 12, e.y[i]! - 4, b.color, 0.4);
    // Weapon
    const wpn = p.loadout.weapon;
    const wv = v.weapon!;
    if (!wpn) {
      wv.visible = false;
      return;
    }
    const base = itemBase(wpn);
    const sprite = base.kind === 'weapon' ? base.def.sprite : 'wpn.sword';
    if (v.weaponId !== sprite) {
      const we = this.atlas.get(sprite);
      wv.texture = we.frames[0]!;
      wv.anchor.set(we.def.ox / we.def.w, we.def.oy / we.def.h);
      v.weaponId = sprite;
    }
    wv.visible = true;
    let rot = aim;
    if (p.swingT > 0 && base.kind === 'weapon') {
      const atk = base.def.attack;
      const t = 1 - p.swingT / p.swingMax;
      if (
        atk.kind === 'melee_arc' ||
        (atk.kind === 'projectile' && atk.melee && p.swingMax === 7)
      ) {
        const arc =
          ((atk.kind === 'melee_arc' ? atk.arc : (atk.melee?.arc ?? 120)) * Math.PI) / 180;
        rot = aim + (left ? 1 : -1) * (-arc / 2 + arc * Math.min(1, t * 1.6));
      }
    }
    const recoil =
      p.swingT > 0 && base.kind === 'weapon' && base.def.attack.kind !== 'melee_arc'
        ? -2 * (p.swingT / p.swingMax)
        : 0;
    wv.rotation = rot;
    wv.scale.y = left ? -1 : 1;
    wv.position.set((left ? -3 : 3) + Math.cos(aim) * recoil, -8 + Math.sin(aim) * recoil);
    wv.zIndex = Math.sin(aim) < -0.35 ? -1 : 1;
    v.body.zIndex = 0;
    wv.tint = flash ? 0xffffff : 0xffffff;
  }

  private animateEnemy(i: number, v: View): void {
    const w = this.world;
    const e = w.e;
    const st = e.state[i]!;
    const flash = e.hitFlash[i]! > 0;
    const moving = Math.abs(e.vx[i]!) + Math.abs(e.vy[i]!) > 8;
    const frame = Math.floor(this.time * (moving ? 6 : 2) + i) & 1;
    v.body.texture = (flash ? v.entry.flash : v.entry.frames)[frame % v.entry.frames.length]!;
    const left = Math.abs(e.face[i]!) > Math.PI / 2;
    let sx = left ? -1 : 1;
    let sy = 1;
    v.body.alpha = 1;
    v.body.tint = 0xffffff;
    v.body.y = 0;
    v.body.x = 0;
    if (st === ES.Spawning) {
      const t = Math.min(1, e.stateT[i]! / 18);
      sy = t;
      v.body.alpha = 0.4 + 0.6 * t;
      v.body.tint = 0xd89cf2;
    } else if (st === ES.Windup) {
      if ((e.stateT[i]! >> 1) & 1) v.body.tint = 0xff7070;
      v.body.x = ((e.stateT[i]! & 1) * 2 - 1) * 0.5;
      sy = 1 - 0.08 * Math.min(1, e.stateT[i]! / 10);
      sx *= 1 + 0.06 * Math.min(1, e.stateT[i]! / 10);
    } else if (st === ES.Dying) {
      const t = 1 - e.life[i]! / 24;
      v.body.alpha = 1 - t;
      sy = 1 - t * 0.6;
      v.body.tint = t < 0.15 ? 0xffffff : 0xffffff;
    } else if (st === ES.Act) {
      const def = w.content.enemies[e.def[i]!]!;
      const phase = e.cooldown[i]!;
      const atks = phase > 0 ? def.phases[phase - 1]!.attacks : def.attacks;
      const act = atks[e.ref[i]!]?.action;
      if (act?.type === 'hop') {
        const total = Math.max(1, Math.round(act.duration * 30));
        const t = Math.min(1, e.stateT[i]! / total);
        v.body.y = -Math.sin(Math.PI * t) * 12;
      }
    }
    if (moving && st === ES.Move) sy *= 1 + Math.sin(this.time * 18 + i) * 0.04;
    if (e.flags[i]! & EF.Flying) v.body.y += Math.sin(this.time * 6 + i) * 2 - 4;
    v.body.scale.set(sx, sy);
    if (e.slowT[i]! > 0) v.body.tint = 0x8ad1f5;
    if (e.burnT[i]! > 0 && Math.random() < 0.3) this.fx.mote(e.x[i]!, e.y[i]! - 8, 0xf08b5c, 0.3);
  }

  private animateProjectile(i: number, v: View, x: number, y: number): void {
    const w = this.world;
    const e = w.e;
    const def = w.content.projectiles[e.def[i]!]!;
    v.body.rotation = def.spin ? (this.time * def.spin * Math.PI) / 180 : e.face[i]!;
    v.body.y = -4;
    v.glow?.position.set(Math.round(x), Math.round(y - 4));
    if (def.trail !== undefined && Math.random() < 0.5) this.fx.mote(x, y - 4, def.trail, 0.25);
  }

  private animatePickup(i: number, v: View, x: number, y: number): void {
    const e = this.world.e;
    const k = e.def[i]!;
    const bob = Math.sin(this.time * 4 + i) * 1.5;
    v.body.y = -4 + bob;
    if (k === PickupKind.Gold) v.body.texture = v.entry.frames[Math.floor(this.time * 6 + i) & 1]!;
    if (v.glow) {
      v.glow.position.set(Math.round(x), Math.round(y));
      v.glow.alpha = 0.55 + 0.2 * Math.sin(this.time * 3 + i);
    }
  }

  private animateProp(i: number, v: View, x: number, y: number): void {
    const w = this.world;
    const e = w.e;
    const k = e.def[i]!;
    if (k === PropKind.Captive) {
      const frames = CHAR_ANIMS.idle;
      v.body.texture = v.entry.frames[frames[Math.floor(this.time * 2 + i) % frames.length]!]!;
      if (v.extra) v.extra.texture = this.atlas.get('prop.cage').frames[e.state[i] ? 1 : 0]!;
      v.body.scale.x = Math.sin(this.time * 0.7 + i) > 0 ? 1 : -1;
      if (e.state[i] && Math.random() < 0.15)
        this.fx.mote(x + (Math.random() - 0.5) * 12, y - 10, 0xf2c94c, 0.6);
    } else if (k === PropKind.Chest) v.body.texture = v.entry.frames[e.state[i] ? 1 : 0]!;
    else if (k === PropKind.Spikes) v.body.texture = v.entry.frames[e.state[i] === 2 ? 1 : 0]!;
    else if (k === PropKind.Shop) {
      const slot = w.shop[e.ref[i]!];
      if (v.extra) {
        v.extra.visible = !slot?.sold;
        v.extra.y = -9 + Math.sin(this.time * 3 + i) * 1.5;
      }
    } else if (k === PropKind.Station) {
      const st = this.stations[e.ref[i]!];
      if (v.entry.frames.length > 1)
        v.body.texture = v.entry.frames[Math.floor(this.time * 3) % v.entry.frames.length]!;
      if (v.extra && st?.npc) {
        const frames = CHAR_ANIMS.idle;
        const npc = this.npcSheet(e.ref[i]!);
        if (npc)
          v.extra.texture = npc.frames[frames[Math.floor(this.time * 2 + i) % frames.length]!]!;
      }
      if (st?.id === 'portal') {
        v.body.rotation = this.time * 0.8;
        v.body.y = -6;
      }
      v.glow?.position.set(Math.round(x), Math.round(y - (st?.id === 'altar' ? 18 : 6)));
      if (st?.id === 'portal' && Math.random() < 0.4)
        this.fx.mote(x + (Math.random() - 0.5) * 20, y - 6, 0x36c4b4, 0.6);
    } else if (k === PropKind.Portal) {
      v.body.rotation = this.time * 0.8;
      v.body.y = -6;
      v.glow?.position.set(Math.round(x), Math.round(y - 6));
      if (Math.random() < 0.4) this.fx.mote(x + (Math.random() - 0.5) * 20, y - 6, 0x36c4b4, 0.6);
    }
    if (k === PropKind.Stairs && w.stairsOpen && Math.random() < 0.15)
      this.fx.mote(x, y, 0x36c4b4, 0.6);
  }

  /** Turn sim events of the last tick into effects, sounds, shake and hit-stop. */
  handleEvents(): void {
    const w = this.world;
    const ev = w.events;
    const e = w.e;
    const content = getContent();
    for (let k = 0; k < ev.n; k++) {
      const type = ev.type[k]!;
      const x = ev.x[k]!;
      const y = ev.y[k]!;
      const a = ev.a[k]!;
      const b = ev.b[k]!;
      const v = ev.v[k]!;
      switch (type) {
        case Ev.Hit: {
          if (a >= 0 && e.kind[a] === Kind.Enemy) {
            const def = content.enemies[e.def[a]!]!;
            this.fx.burst(x, y - 6, def.blood, 4, 60);
            this.fx.number(x, y - 14, b, v === 1 ? 0xf2c94c : 0xffffff);
            sfx.play(v === 1 ? 'crit' : 'hit', { vol: 0.8 });
            this.hooks.hitStop(v === 1 ? 0.05 : 0.025);
          } else if (v === 2) {
            this.fx.burst(x, y, 0xece4c8, 5, 70);
            sfx.play('ui', { pitch: 1.6 });
          } else if (v === 3) {
            this.fx.burst(x, y, 0xa3a1bd, 3, 40, { up: 20 });
          }
          break;
        }
        case Ev.Death: {
          const def = content.enemies[b]!;
          const big = def.rank === 'boss' || def.rank === 'miniboss';
          this.fx.burst(x, y - 6, def.blood, big ? 40 : 14, big ? 120 : 80, { up: 80 });
          this.fx.anim('fx.ring', x, y - 6, {
            tint: def.blood,
            life: 0.3,
            scale0: 0.4,
            scale1: big ? 3 : 1.4,
            glow: true,
          });
          sfx.play(
            def.sprite.includes('skeleton') || def.id === 'boneKnight' ? 'bones' : 'enemyDie',
          );
          this.r.addShake(big ? 6 : 1.5);
          this.hooks.hitStop(big ? 0.25 : 0.04);
          if (def.rank === 'boss') {
            sfx.play('roar', { pitch: 1.3 });
            this.hooks.toast(`${contentRu[def.nameKey] ?? def.id} повержен!`, 'good');
          }
          break;
        }
        case Ev.Shoot: {
          if (a >= 0) {
            const def = content.projectiles[b]!;
            sfx.play(def.glow !== undefined ? 'magic' : 'shoot', { vol: 0.7 });
            this.fx.burst(x + Math.cos(v) * 8, y + Math.sin(v) * 8, def.trail ?? 0xece4c8, 2, 30, {
              up: 10,
            });
          } else sfx.play('enemyShoot', { vol: 0.6 });
          break;
        }
        case Ev.Swing: {
          const thrust = b < 0;
          const range = Math.abs(b);
          if (a >= 0) {
            this.fx.anim(
              'fx.slash',
              x + Math.cos(v) * range * 0.45,
              y + Math.sin(v) * range * 0.45,
              {
                rot: v,
                life: thrust ? 0.1 : 0.16,
                scale0: (range / 26) * (thrust ? 0.6 : 0.9),
                scale1: (range / 26) * (thrust ? 0.8 : 1.15),
                alpha: 0.9,
                // A thrust is a thin stab, not a wide arc.
                squash: thrust ? 0.4 : 1,
              },
            );
            sfx.play('swing', { vol: 0.8 });
          } else {
            this.fx.anim('fx.slash', x + Math.cos(v) * range * 0.5, y + Math.sin(v) * range * 0.5, {
              rot: v,
              life: 0.15,
              tint: 0xff6060,
              scale0: range / 26,
              scale1: (range / 26) * 1.2,
              alpha: 0.8,
            });
            sfx.play('swing', { pitch: 0.7, vol: 0.6 });
          }
          break;
        }
        case Ev.Dash:
          this.fx.burst(x, y, b === 1 ? 0xd89cf2 : 0x73718f, 6, 40, { up: 20 });
          sfx.play('dash', { pitch: a < 0 ? 1.4 : 1 });
          break;
        case Ev.Pickup:
          if (a !== this.local) break;
          if (b === 2) {
            sfx.play('pickup');
            this.fx.burst(x, y, RARITY_NUM[Math.max(0, v)] ?? 0xffffff, 8, 50, { up: 60 });
          } else if (b === 3) sfx.play('potion');
          else if (b === -1) {
            sfx.play('deny');
            this.hooks.toast('Сумка полна', 'warn');
          } else if (b === -2) {
            sfx.play('deny');
            this.hooks.toast('Не хватает золота', 'warn');
          } else if (b === -3) {
            sfx.play('deny');
            this.hooks.toast('Зелий уже максимум', 'warn');
          }
          break;
        case Ev.DoorsClose:
          sfx.play('doorClose');
          this.r.addShake(1.5);
          break;
        case Ev.DoorsOpen:
          sfx.play('doorOpen');
          break;
        case Ev.RoomCleared:
          sfx.play('clear', { vol: 0.8 });
          break;
        case Ev.PlayerHurt:
          if (a !== this.local) {
            this.fx.burst(x, y - 8, 0xcf4440, 4, 50);
            break;
          }
          this.fx.number(x, y - 20, b, 0xcf4440);
          this.fx.burst(x, y - 8, 0xcf4440, 6, 60);
          sfx.play('hurt');
          this.r.addShake(3);
          this.hooks.hurtFlash();
          this.hooks.hitStop(0.06);
          break;
        case Ev.PlayerDown:
          sfx.play('die');
          this.r.addShake(5);
          break;
        case Ev.Skill:
          sfx.play('skill');
          this.fx.anim('fx.ring', x, y, {
            tint: b === 0 ? 0xffffff : v,
            life: 0.3,
            scale0: 0.3,
            scale1: 1.2,
            glow: true,
          });
          break;
        case Ev.Explosion: {
          const radius = v;
          this.fx.anim('fx.ring', x, y, {
            tint: b,
            life: 0.3,
            scale0: 0.2,
            scale1: radius / 14,
            glow: true,
          });
          this.fx.anim('fx.glow', x, y, {
            tint: b,
            life: 0.25,
            scale0: radius / 30,
            scale1: radius / 22,
            glow: true,
            alpha: 0.9,
          });
          this.fx.burst(x, y, b, Math.min(24, 6 + radius / 3), 40 + radius * 2, { up: 60 });
          if (radius > 18) {
            sfx.play('explosion', { vol: Math.min(1, radius / 40) });
            this.r.addShake(Math.min(5, radius / 10));
          }
          break;
        }
        case Ev.Telegraph:
          if (b === -1) {
            sfx.play('roar');
            this.r.addShake(4);
          } else if (v > 0) {
            // Area telegraph: the Area view draws the circle.
          } else if (a >= 0 && e.flags[a]! & EF.Boss) sfx.play('telegraph');
          break;
        case Ev.ChestOpen:
          sfx.play('chest');
          this.fx.burst(x, y - 6, 0xf2c94c, 16, 70, { up: 90 });
          break;
        case Ev.KeyPickup:
          sfx.play('key');
          this.hooks.toast('Ключ найден — ищите запертую дверь', 'good');
          break;
        case Ev.Unlock:
          sfx.play('unlock');
          this.fx.burst(x, y, 0xf2c94c, 10, 60);
          break;
        case Ev.Heal:
          if (b > 0) this.fx.number(x, y - 20, b, 0x4c9e47);
          for (let n = 0; n < 8; n++)
            this.fx.mote(x + (Math.random() - 0.5) * 12, y - Math.random() * 14, 0x4c9e47, 0.6);
          sfx.play('heal');
          break;
        case Ev.Spawn:
          this.fx.anim('fx.ring', x, y, {
            tint: 0x9a4dc4,
            life: 0.4,
            scale0: 1.2,
            scale1: 0.2,
            glow: true,
          });
          sfx.play('spawn', { vol: 0.5 });
          break;
        case Ev.FloorExit:
          sfx.play(b === 1 ? 'victory' : 'stairs');
          break;
        case Ev.Coin:
          if (a === this.local) sfx.play('coin', { vol: b < 0 ? 1 : 0.6 });
          break;
        case Ev.Talk:
          if (b === this.local) {
            sfx.play('ui', { pitch: 1.2 });
            this.hooks.talk(a);
          }
          break;
        case Ev.Rescue: {
          sfx.play('unlock');
          sfx.play('victory', { vol: 0.5 });
          this.fx.burst(x, y - 10, 0xf2c94c, 18, 70, { up: 90 });
          const npc = getContent().npcs[a];
          if (npc) this.hooks.toast(`${contentRu[npc.nameKey] ?? npc.id} свободен!`, 'good');
          break;
        }
        case Ev.Revive:
          sfx.play('heal', { pitch: 1.2 });
          this.fx.anim('fx.ring', x, y - 6, {
            tint: 0x7fe3a0,
            life: 0.4,
            scale0: 0.3,
            scale1: 1.6,
            glow: true,
          });
          for (let n = 0; n < 12; n++)
            this.fx.mote(x + (Math.random() - 0.5) * 16, y - Math.random() * 18, 0x7fe3a0, 0.8);
          if (a === this.local) this.hooks.toast('Вас подняли!', 'good');
          break;
        case Ev.Trap:
          sfx.play('trap', { vol: 0.4 });
          this.fx.burst(x, y, 0xa3a1bd, 3, 30, { up: 30 });
          break;
        default:
          break;
      }
    }
  }

  destroy(): void {
    for (const v of this.views) if (v) this.destroyView(v);
    this.views = [];
    for (const s of this.statics) s.destroy();
    this.statics = [];
    this.torches = [];
    this.doors = [];
  }
}
