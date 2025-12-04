import * as map from '../data/gentle';
import { mutation } from './_generated/server';

async function getDefaultWorld(db: any) {
  const worldStatus = await db
    .query('worldStatus')
    .filter((q: any) => q.eq(q.field('isDefault'), true))
    .unique();
  if (!worldStatus) {
    throw new Error('No default world found');
  }
  return worldStatus;
}

export const updateMap = mutation({
  handler: async (ctx) => {
    const worldStatus = await getDefaultWorld(ctx.db);
    const existing = await ctx.db
      .query('maps')
      .withIndex('worldId', (q) => q.eq('worldId', worldStatus.worldId))
      .unique();

    const mapData = {
      worldId: worldStatus.worldId,
      width: map.mapwidth,
      height: map.mapheight,
      tileSetUrl: map.tilesetpath,
      tileSetDimX: map.tilesetpxw,
      tileSetDimY: map.tilesetpxh,
      tileDim: map.tiledim,
      bgTiles: map.bgtiles,
      objectTiles: map.objmap,
      animatedSprites: map.animatedsprites,
    } as any;

    if (existing) {
      await ctx.db.patch(existing._id, mapData);
      return { updated: true };
    } else {
      await ctx.db.insert('maps', mapData);
      return { inserted: true };
    }
  },
});

export default updateMap;
