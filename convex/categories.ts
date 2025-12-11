import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// List all categories sorted by order (for admin)
export const list = query({
  handler: async (ctx) => {
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_order")
      .collect();
    
    const categoriesWithCount = await Promise.all(
      categories.map(async (cat) => {
        const docs = await ctx.db
          .query("documents")
          .withIndex("by_categoryId", (q) => q.eq("categoryId", cat._id))
          .collect();
        return { ...cat, documentCount: docs.length };
      })
    );
    
    return categoriesWithCount;
  },
});

// List only active categories sorted by order (for public)
export const listActive = query({
  handler: async (ctx) => {
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_order")
      .filter((q) => q.eq(q.field("active"), true))
      .collect();
    
    return categories;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get max order
    const allCats = await ctx.db.query("categories").collect();
    const maxOrder = allCats.reduce((max, c) => Math.max(max, c.order || 0), 0);
    
    return await ctx.db.insert("categories", {
      name: args.name,
      description: args.description,
      active: true,
      order: maxOrder + 1,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("categories"),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      name: args.name,
      description: args.description,
    });
  },
});

export const toggleActive = mutation({
  args: { id: v.id("categories") },
  handler: async (ctx, args) => {
    const cat = await ctx.db.get(args.id);
    if (cat) {
      await ctx.db.patch(args.id, { active: !cat.active });
    }
  },
});

export const reorder = mutation({
  args: {
    ids: v.array(v.id("categories")),
  },
  handler: async (ctx, args) => {
    // Update order based on array position
    await Promise.all(
      args.ids.map((id, index) => ctx.db.patch(id, { order: index }))
    );
  },
});

export const remove = mutation({
  args: { id: v.id("categories") },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_categoryId", (q) => q.eq("categoryId", args.id))
      .collect();
    
    if (docs.length > 0) {
      throw new Error("Không thể xóa danh mục đang có tài liệu");
    }
    
    await ctx.db.delete(args.id);
  },
});
