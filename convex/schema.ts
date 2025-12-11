import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  categories: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    active: v.boolean(),
    order: v.number(),
    createdAt: v.number(),
  }).index("by_name", ["name"])
    .index("by_active", ["active"])
    .index("by_order", ["order"]),

  documents: defineTable({
    title: v.string(),
    categoryId: v.id("categories"),
    date: v.string(),
    storageId: v.id("_storage"),
    active: v.boolean(),
    order: v.number(),
    createdAt: v.number(),
  }).index("by_categoryId", ["categoryId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_active", ["active"])
    .index("by_order", ["order"]),
});
