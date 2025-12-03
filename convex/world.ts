import { ConvexError, v } from 'convex/values';
import { characters } from '../data/characters';
import { internalMutation, mutation, query } from './_generated/server';
import { playerId } from './aiTown/ids';
import { insertInput } from './aiTown/insertInput';
import { kickEngine, startEngine, stopEngine } from './aiTown/main';
import {
    DEFAULT_NAME,
    ENGINE_ACTION_DURATION,
    IDLE_WORLD_TIMEOUT,
    WORLD_HEARTBEAT_INTERVAL,
} from './constants';
import { engineInsertInput } from './engine/abstractGame';

export const defaultWorldStatus = query({
  handler: async (ctx) => {
    let worldStatus = await ctx.db
      .query('worldStatus')
      .filter((q) => q.eq(q.field('isDefault'), true))
      .first();
    if (!worldStatus) return null;

    // Ensure we have a server start timestamp recorded on the worldStatus document.
    // This allows the timer to start at 0 when the server (world) starts.
    const now = Date.now();
    if ((worldStatus as any).serverStartMs == null) {
      try {
        await (ctx as any).db.patch(worldStatus._id, { serverStartMs: now });
        // reload to pick up the patched value
        const reloaded = await ctx.db.get(worldStatus._id);
        if (reloaded) worldStatus = reloaded;
      } catch (e) {
        // ignore patch failures and proceed
      }
    }

    // Ensure we have a per-world seed so simulations are deterministic-ish per world
    if ((worldStatus as any).seed == null) {
      try {
        const seed = Math.floor(Math.abs(now % 2147483647));
        await (ctx as any).db.patch(worldStatus._id, { seed });
        const reloaded = await ctx.db.get(worldStatus._id);
        if (reloaded) worldStatus = reloaded;
      } catch (e) {
        // ignore
      }
    }

    const serverStartMs = (worldStatus as any).serverStartMs ?? now;
    const elapsedMs = Math.max(0, now - serverStartMs);
    const creatures = 5;
    // Activity cycles slowly between 0-100 over ~120 seconds for visual effect.
    const activity = Math.floor(((now / 1000) % 120) / 120 * 100);

    // Use a simple LCG PRNG seeded per-world and generate a short buffer of
    // precomputed values to send to the client. The client will receive 20
    // values every 2 seconds and play them back at ~100ms per value to produce
    // a rapid breathing/flickering effect. Values are clamped to 50..90.
    const seed = (worldStatus as any).seed ?? Math.floor(now % 2147483647);
    const lcg = (s: number) => (s * 1664525 + 1013904223) >>> 0;

    const bucketCount = 20;
    const periodMs = 2000; // 20 values per 2000ms
    const stepMs = Math.floor(periodMs / bucketCount); // ~100ms

    const baseStep = Math.floor(now / stepMs);

    const clamp = (v: number) => Math.max(50, Math.min(90, Math.floor(v)));

    const breathValues: number[] = [];
    const intensityValues: number[] = [];
    for (let i = 0; i < bucketCount; i++) {
      // derive different pseudorandom values for each bucket
      const bRand = lcg(seed + baseStep + i) % 41; // 0..40
      const bJitter = (lcg(seed + baseStep + i + 1) % 11) - 5; // -5..5
      breathValues.push(clamp(50 + bRand + bJitter));

      const iRand = lcg(seed + baseStep + i + 2) % 41; // 0..40
      const iJitter = (lcg(seed + baseStep + i + 3) % 11) - 5; // -5..5
      // intensity partly reflects activity but stays within 50..90
      const intValue = Math.floor(50 + ((activity / 100) * 20) + (iRand / 2) + iJitter);
      intensityValues.push(clamp(intValue));
    }

    // expose current averaged values for convenience as well
    const breath = breathValues[0];
    const intensity = intensityValues[0];

    return {
      ...worldStatus,
      elapsedMs,
      creatures,
      activity,
      breath,
      intensity,
      breathValues,
      intensityValues,
      serverNowMs: now,
    };
  },
});

export const heartbeatWorld = mutation({
  args: {
    worldId: v.id('worlds'),
  },
  handler: async (ctx, args) => {
    const worldStatus = await ctx.db
      .query('worldStatus')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .first();
    if (!worldStatus) {
      throw new Error(`Invalid world ID: ${args.worldId}`);
    }
    const now = Date.now();

    // Skip the update (and then potentially make the transaction readonly)
    // if it's been viewed sufficiently recently..
    if (!worldStatus.lastViewed || worldStatus.lastViewed < now - WORLD_HEARTBEAT_INTERVAL / 2) {
      await ctx.db.patch(worldStatus._id, {
        lastViewed: Math.max(worldStatus.lastViewed ?? now, now),
      });
    }

    // Restart inactive worlds, but leave worlds explicitly stopped by the developer alone.
    if (worldStatus.status === 'stoppedByDeveloper') {
      console.debug(`World ${worldStatus._id} is stopped by developer, not restarting.`);
    }
    if (worldStatus.status === 'inactive') {
      console.log(`Restarting inactive world ${worldStatus._id}...`);
      await ctx.db.patch(worldStatus._id, { status: 'running' });
      await startEngine(ctx, worldStatus.worldId);
    }
  },
});

export const stopInactiveWorlds = internalMutation({
  handler: async (ctx) => {
    const cutoff = Date.now() - IDLE_WORLD_TIMEOUT;
    const worlds = await ctx.db.query('worldStatus').collect();
    for (const worldStatus of worlds) {
      if (cutoff < worldStatus.lastViewed || worldStatus.status !== 'running') {
        continue;
      }
      console.log(`Stopping inactive world ${worldStatus._id}`);
      await ctx.db.patch(worldStatus._id, { status: 'inactive' });
      await stopEngine(ctx, worldStatus.worldId);
    }
  },
});

export const restartDeadWorlds = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();

    // Restart an engine if it hasn't run for 2x its action duration.
    const engineTimeout = now - ENGINE_ACTION_DURATION * 2;
    const worlds = await ctx.db.query('worldStatus').collect();
    for (const worldStatus of worlds) {
      if (worldStatus.status !== 'running') {
        continue;
      }
      const engine = await ctx.db.get(worldStatus.engineId);
      if (!engine) {
        throw new Error(`Invalid engine ID: ${worldStatus.engineId}`);
      }
      if (engine.currentTime && engine.currentTime < engineTimeout) {
        console.warn(`Restarting dead engine ${engine._id}...`);
        await kickEngine(ctx, worldStatus.worldId);
      }
    }
  },
});

export const userStatus = query({
  args: {
    worldId: v.id('worlds'),
  },
  handler: async (ctx, args) => {
    // const identity = await ctx.auth.getUserIdentity();
    // if (!identity) {
    //   return null;
    // }
    // return identity.tokenIdentifier;
    return DEFAULT_NAME;
  },
});

export const joinWorld = mutation({
  args: {
    worldId: v.id('worlds'),
  },
  handler: async (ctx, args) => {
    // const identity = await ctx.auth.getUserIdentity();
    // if (!identity) {
    //   throw new ConvexError(`Not logged in`);
    // }
    // const name =
    //   identity.givenName || identity.nickname || (identity.email && identity.email.split('@')[0]);
    const name = DEFAULT_NAME;

    // if (!name) {
    //   throw new ConvexError(`Missing name on ${JSON.stringify(identity)}`);
    // }
    const world = await ctx.db.get(args.worldId);
    if (!world) {
      throw new ConvexError(`Invalid world ID: ${args.worldId}`);
    }
    // const { tokenIdentifier } = identity;
    return await insertInput(ctx, world._id, 'join', {
      name,
      character: characters[Math.floor(Math.random() * characters.length)].name,
      description: `${DEFAULT_NAME} is a human player`,
      // description: `${identity.givenName} is a human player`,
      tokenIdentifier: DEFAULT_NAME,
    });
  },
});

export const leaveWorld = mutation({
  args: {
    worldId: v.id('worlds'),
  },
  handler: async (ctx, args) => {
    // const identity = await ctx.auth.getUserIdentity();
    // if (!identity) {
    //   throw new Error(`Not logged in`);
    // }
    // const { tokenIdentifier } = identity;
    const world = await ctx.db.get(args.worldId);
    if (!world) {
      throw new Error(`Invalid world ID: ${args.worldId}`);
    }
    // const existingPlayer = world.players.find((p) => p.human === tokenIdentifier);
    const existingPlayer = world.players.find((p) => p.human === DEFAULT_NAME);
    if (!existingPlayer) {
      return;
    }
    await insertInput(ctx, world._id, 'leave', {
      playerId: existingPlayer.id,
    });
  },
});

export const sendWorldInput = mutation({
  args: {
    engineId: v.id('engines'),
    name: v.string(),
    args: v.any(),
  },
  handler: async (ctx, args) => {
    // const identity = await ctx.auth.getUserIdentity();
    // if (!identity) {
    //   throw new Error(`Not logged in`);
    // }
    return await engineInsertInput(ctx, args.engineId, args.name as any, args.args);
  },
});

export const worldState = query({
  args: {
    worldId: v.id('worlds'),
  },
  handler: async (ctx, args) => {
    const world = await ctx.db.get(args.worldId);
    if (!world) {
      throw new Error(`Invalid world ID: ${args.worldId}`);
    }
    const worldStatus = await ctx.db
      .query('worldStatus')
      .withIndex('worldId', (q) => q.eq('worldId', world._id))
      .unique();
    if (!worldStatus) {
      throw new Error(`Invalid world status ID: ${world._id}`);
    }
    const engine = await ctx.db.get(worldStatus.engineId);
    if (!engine) {
      throw new Error(`Invalid engine ID: ${worldStatus.engineId}`);
    }
    return { world, engine };
  },
});

export const gameDescriptions = query({
  args: {
    worldId: v.id('worlds'),
  },
  handler: async (ctx, args) => {
    const playerDescriptions = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .collect();
    const agentDescriptions = await ctx.db
      .query('agentDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .collect();
    const worldMap = await ctx.db
      .query('maps')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .first();
    if (!worldMap) {
      throw new Error(`No map for world: ${args.worldId}`);
    }
    return { worldMap, playerDescriptions, agentDescriptions };
  },
});

export const previousConversation = query({
  args: {
    worldId: v.id('worlds'),
    playerId,
  },
  handler: async (ctx, args) => {
    // Walk the player's history in descending order, looking for a nonempty
    // conversation.
    const members = ctx.db
      .query('participatedTogether')
      .withIndex('playerHistory', (q) => q.eq('worldId', args.worldId).eq('player1', args.playerId))
      .order('desc');

    for await (const member of members) {
      const conversation = await ctx.db
        .query('archivedConversations')
        .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('id', member.conversationId))
        .unique();
      if (!conversation) {
        throw new Error(`Invalid conversation ID: ${member.conversationId}`);
      }
      if (conversation.numMessages > 0) {
        return conversation;
      }
    }
    return null;
  },
});
