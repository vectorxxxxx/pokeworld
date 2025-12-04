import { mutation } from './_generated/server';

// Mutation to repair stored asset paths in the `maps` collection.
// It removes any leading `/ai-town` prefix and ensures paths are absolute
// to the domain root (e.g. `/assets/summer/combined-tilesheet.png`).
export default mutation({
  handler: async (ctx) => {
    const maps = await ctx.db.query('maps').collect();
    for (const m of maps) {
      if (!m || !m.tileSetUrl || typeof m.tileSetUrl !== 'string') continue;
      const url: string = m.tileSetUrl;
      // Strip any leading `/ai-town` prefix, then ensure the path starts with '/'.
      const stripped = url.replace(/^\/?ai-town\/?/, '').replace(/^\/+/, '');
      const fixed = '/' + stripped;
      if (fixed !== url) {
        try {
          await ctx.db.patch(m._id, { tileSetUrl: fixed });
          console.log(`Patched map ${m._id}: '${url}' -> '${fixed}'`);
        } catch (e) {
          console.error('Failed to patch map', m._id, e);
        }
      }
    }
  },
});
