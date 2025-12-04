import { query } from './_generated/server';

async function getDefaultWorld(db: any) {
  const worldStatus = await db
    .query('worldStatus')
    .filter((q: any) => q.eq(q.field('isDefault'), true))
    .unique();
  if (!worldStatus) throw new Error('No default world');
  return worldStatus;
}

export const printMap = query({
  handler: async (ctx) => {
    const worldStatus = await getDefaultWorld(ctx.db);
    const mapRow = await ctx.db
      .query('maps')
      .withIndex('worldId', (q: any) => q.eq('worldId', worldStatus.worldId))
      .unique();
    return mapRow || null;
  },
});

export default printMap;
