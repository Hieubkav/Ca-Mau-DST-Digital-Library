import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Generate upload URL for file storage
export const generateUploadUrl = mutation(async (ctx) => {
  return await ctx.storage.generateUploadUrl();
});

// Save document metadata after upload
export const saveDocument = mutation({
  args: {
    title: v.string(),
    categoryId: v.id("categories"),
    storageId: v.id("_storage"),
    pageImages: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    // Get max order
    const allDocs = await ctx.db.query("documents").collect();
    const maxOrder = allDocs.reduce((max, d) => Math.max(max, d.order || 0), 0);
    
    const documentId = await ctx.db.insert("documents", {
      title: args.title,
      categoryId: args.categoryId,
      date: new Date().toISOString().split("T")[0],
      storageId: args.storageId,
      pageImages: args.pageImages,
      active: true,
      order: maxOrder + 1,
      createdAt: Date.now(),
    });
    return documentId;
  },
});

// Get all documents sorted by order (for admin)
export const listDocuments = query({
  handler: async (ctx) => {
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_order")
      .collect();

    const docsWithDetails = await Promise.all(
      documents.map(async (doc) => {
        const category = await ctx.db.get(doc.categoryId);
        // Get page image URLs if available
        const pageImageUrls = doc.pageImages 
          ? await Promise.all(doc.pageImages.map(id => ctx.storage.getUrl(id)))
          : undefined;
        return {
          ...doc,
          url: await ctx.storage.getUrl(doc.storageId),
          pageImageUrls,
          category: category?.name || "Không xác định",
        };
      })
    );

    return docsWithDetails;
  },
});

// Get only active documents sorted by order (for public)
export const listActiveDocuments = query({
  handler: async (ctx) => {
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_order")
      .filter((q) => q.eq(q.field("active"), true))
      .collect();

    const docsWithDetails = await Promise.all(
      documents.map(async (doc) => {
        const category = await ctx.db.get(doc.categoryId);
        // Only include if category is also active
        if (!category?.active) return null;
        // Get page image URLs if available
        const pageImageUrls = doc.pageImages 
          ? await Promise.all(doc.pageImages.map(id => ctx.storage.getUrl(id)))
          : undefined;
        return {
          ...doc,
          url: await ctx.storage.getUrl(doc.storageId),
          pageImageUrls,
          category: category.name,
        };
      })
    );

    return docsWithDetails.filter(Boolean);
  },
});

// Get documents by category
export const listByCategory = query({
  args: { categoryId: v.id("categories") },
  handler: async (ctx, args) => {
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_categoryId", (q) => q.eq("categoryId", args.categoryId))
      .order("desc")
      .collect();

    const docsWithUrls = await Promise.all(
      documents.map(async (doc) => ({
        ...doc,
        url: await ctx.storage.getUrl(doc.storageId),
      }))
    );

    return docsWithUrls;
  },
});

// Update document
export const updateDocument = mutation({
  args: {
    id: v.id("documents"),
    title: v.string(),
    categoryId: v.id("categories"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      title: args.title,
      categoryId: args.categoryId,
    });
  },
});

// Toggle document active status
export const toggleActive = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (doc) {
      await ctx.db.patch(args.id, { active: !doc.active });
    }
  },
});

// Reorder documents
export const reorder = mutation({
  args: {
    ids: v.array(v.id("documents")),
  },
  handler: async (ctx, args) => {
    await Promise.all(
      args.ids.map((id, index) => ctx.db.patch(id, { order: index }))
    );
  },
});

// Delete a document (including PDF and all page images)
export const deleteDocument = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (doc) {
      // Delete original PDF
      await ctx.storage.delete(doc.storageId);
      
      // Delete all page images if exist
      if (doc.pageImages && doc.pageImages.length > 0) {
        await Promise.all(doc.pageImages.map(id => ctx.storage.delete(id)));
      }
      
      await ctx.db.delete(args.id);
    }
  },
});
