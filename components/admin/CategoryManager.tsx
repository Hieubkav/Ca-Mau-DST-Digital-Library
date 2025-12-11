import React, { useState } from 'react';
import { Plus, Pencil, Trash2, X, Check, Loader2, Eye, EyeOff, GripVertical } from 'lucide-react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

export const CategoryManager: React.FC = () => {
  const categories = useQuery(api.categories.list);
  const createCategory = useMutation(api.categories.create);
  const updateCategory = useMutation(api.categories.update);
  const toggleActive = useMutation(api.categories.toggleActive);
  const reorderCategories = useMutation(api.categories.reorder);
  const removeCategory = useMutation(api.categories.remove);

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<Id<"categories"> | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [loading, setLoading] = useState(false);
  const [draggedId, setDraggedId] = useState<Id<"categories"> | null>(null);

  const handleAdd = async () => {
    if (!formData.name.trim()) return;
    setLoading(true);
    try {
      await createCategory({ name: formData.name, description: formData.description || undefined });
      setFormData({ name: '', description: '' });
      setIsAdding(false);
    } catch (e: any) {
      alert(e.message);
    }
    setLoading(false);
  };

  const handleUpdate = async () => {
    if (!editingId || !formData.name.trim()) return;
    setLoading(true);
    try {
      await updateCategory({ id: editingId, name: formData.name, description: formData.description || undefined });
      setEditingId(null);
      setFormData({ name: '', description: '' });
    } catch (e: any) {
      alert(e.message);
    }
    setLoading(false);
  };

  const handleDelete = async (id: Id<"categories">) => {
    if (!confirm('Bạn có chắc muốn xóa danh mục này?')) return;
    try {
      await removeCategory({ id });
    } catch (e: any) {
      alert(e.message);
    }
  };

  const startEdit = (cat: any) => {
    setEditingId(cat._id);
    setFormData({ name: cat.name, description: cat.description || '' });
    setIsAdding(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsAdding(false);
    setFormData({ name: '', description: '' });
  };

  // Drag & Drop handlers
  const handleDragStart = (id: Id<"categories">) => {
    setDraggedId(id);
  };

  const handleDragOver = (e: React.DragEvent, targetId: Id<"categories">) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId || !categories) return;
    
    const draggedIndex = categories.findIndex(c => c._id === draggedId);
    const targetIndex = categories.findIndex(c => c._id === targetId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    // Reorder locally for visual feedback
    const newOrder = [...categories];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, removed);
    
    // Update order in database
    reorderCategories({ ids: newOrder.map(c => c._id) });
  };

  const handleDragEnd = () => {
    setDraggedId(null);
  };

  if (categories === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-slate-800">Quản lý Danh mục</h2>
        {!isAdding && !editingId && (
          <button
            onClick={() => { setIsAdding(true); setFormData({ name: '', description: '' }); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Thêm danh mục
          </button>
        )}
      </div>

      {/* Add/Edit Form */}
      {(isAdding || editingId) && (
        <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <h3 className="font-medium mb-3">{isAdding ? 'Thêm danh mục mới' : 'Chỉnh sửa danh mục'}</h3>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Tên danh mục *"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none"
            />
            <input
              type="text"
              placeholder="Mô tả (tùy chọn)"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={isAdding ? handleAdd : handleUpdate}
                disabled={loading || !formData.name.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {isAdding ? 'Thêm' : 'Lưu'}
              </button>
              <button
                onClick={cancelEdit}
                className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
              >
                <X className="h-4 w-4" />
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category List */}
      {categories.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          Chưa có danh mục nào. Hãy thêm danh mục đầu tiên!
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="w-10"></th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">Tên danh mục</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">Mô tả</th>
                <th className="text-center py-3 px-4 font-semibold text-slate-600">Số tài liệu</th>
                <th className="text-center py-3 px-4 font-semibold text-slate-600">Trạng thái</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-600">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr 
                  key={cat._id} 
                  className={`border-b border-slate-100 hover:bg-slate-50 ${!cat.active ? 'opacity-50' : ''} ${draggedId === cat._id ? 'opacity-30' : ''}`}
                  draggable
                  onDragStart={() => handleDragStart(cat._id)}
                  onDragOver={(e) => handleDragOver(e, cat._id)}
                  onDragEnd={handleDragEnd}
                >
                  <td className="py-3 px-2">
                    <div className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600">
                      <GripVertical className="h-4 w-4" />
                    </div>
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-800">{cat.name}</td>
                  <td className="py-3 px-4 text-slate-600">{cat.description || '-'}</td>
                  <td className="py-3 px-4 text-center">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {cat.documentCount}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => toggleActive({ id: cat._id })}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        cat.active 
                          ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {cat.active ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                      {cat.active ? 'Hiện' : 'Ẩn'}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => startEdit(cat)}
                        className="p-2 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(cat._id)}
                        disabled={cat.documentCount > 0}
                        className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title={cat.documentCount > 0 ? 'Không thể xóa danh mục đang có tài liệu' : 'Xóa'}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
