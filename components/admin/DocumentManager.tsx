import React, { useState, useRef } from 'react';
import { Plus, Pencil, Trash2, X, Check, Loader2, Upload, FileText, Eye, EyeOff, GripVertical } from 'lucide-react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { pdfjs } from 'react-pdf';

// Use local worker
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

// Convert PDF page to image blob
async function renderPageToBlob(pdfDoc: any, pageNum: number, scale = 1.5): Promise<Blob> {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  
  await page.render({ canvasContext: ctx, viewport }).promise;
  
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.85);
  });
}

export const DocumentManager: React.FC = () => {
  const documents = useQuery(api.documents.listDocuments);
  const categories = useQuery(api.categories.list);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const saveDocument = useMutation(api.documents.saveDocument);
  const updateDocument = useMutation(api.documents.updateDocument);
  const toggleActive = useMutation(api.documents.toggleActive);
  const reorderDocuments = useMutation(api.documents.reorder);
  const deleteDocument = useMutation(api.documents.deleteDocument);

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<Id<"documents"> | null>(null);
  const [formData, setFormData] = useState({ title: '', categoryId: '' });
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [draggedId, setDraggedId] = useState<Id<"documents"> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const f = e.target.files[0];
      setFile(f);
      if (!formData.title) {
        setFormData({ ...formData, title: f.name.replace('.pdf', '') });
      }
    }
  };

  const handleAdd = async () => {
    if (!formData.title.trim() || !formData.categoryId || !file) {
      alert('Vui lòng điền đầy đủ thông tin và chọn file');
      return;
    }
    setLoading(true);
    setUploadProgress(0);
    setProgressText("Đang tải PDF...");

    try {
      // 1. Upload original PDF
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!result.ok) throw new Error('Upload PDF thất bại');
      const { storageId } = await result.json();
      setUploadProgress(10);

      // 2. Convert PDF pages to images
      setProgressText("Đang xử lý trang...");
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdfDoc.numPages;

      const pageImageIds: Id<"_storage">[] = [];

      for (let i = 1; i <= numPages; i++) {
        setProgressText(`Đang xử lý trang ${i}/${numPages}...`);

        // Render page to image
        const blob = await renderPageToBlob(pdfDoc, i);

        // Upload image
        const imgUploadUrl = await generateUploadUrl();
        const imgResult = await fetch(imgUploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'image/jpeg' },
          body: blob,
        });

        if (!imgResult.ok) throw new Error(`Upload trang ${i} thất bại`);
        const { storageId: imgStorageId } = await imgResult.json();
        pageImageIds.push(imgStorageId);

        // Update progress (10-90%)
        setUploadProgress(10 + Math.round((i / numPages) * 80));
      }

      // 3. Save document with page images
      setProgressText("Đang lưu...");
      await saveDocument({
        title: formData.title,
        categoryId: formData.categoryId as Id<"categories">,
        storageId,
        pageImages: pageImageIds,
      });

      setUploadProgress(100);
      setProgressText("Hoàn tất!");
      setFormData({ title: '', categoryId: '' });
      setFile(null);
      setIsAdding(false);
    } catch (e: any) {
      alert(e.message);
    }
    setLoading(false);
    setUploadProgress(0);
    setProgressText("");
  };

  const handleUpdate = async () => {
    if (!editingId || !formData.title.trim() || !formData.categoryId) return;
    setLoading(true);
    try {
      await updateDocument({
        id: editingId,
        title: formData.title,
        categoryId: formData.categoryId as Id<"categories">,
      });
      setEditingId(null);
      setFormData({ title: '', categoryId: '' });
    } catch (e: any) {
      alert(e.message);
    }
    setLoading(false);
  };

  const handleDelete = async (id: Id<"documents">) => {
    if (!confirm('Bạn có chắc muốn xóa tài liệu này?')) return;
    try {
      await deleteDocument({ id });
    } catch (e: any) {
      alert(e.message);
    }
  };

  const startEdit = (doc: any) => {
    setEditingId(doc._id);
    setFormData({ title: doc.title, categoryId: doc.categoryId });
    setIsAdding(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsAdding(false);
    setFormData({ title: '', categoryId: '' });
    setFile(null);
  };

  // Drag & Drop handlers
  const handleDragStart = (id: Id<"documents">) => {
    setDraggedId(id);
  };

  const handleDragOver = (e: React.DragEvent, targetId: Id<"documents">) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId || !documents) return;
    
    const draggedIndex = documents.findIndex(d => d._id === draggedId);
    const targetIndex = documents.findIndex(d => d._id === targetId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    const newOrder = [...documents];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, removed);
    
    reorderDocuments({ ids: newOrder.map(d => d._id) });
  };

  const handleDragEnd = () => {
    setDraggedId(null);
  };

  if (documents === undefined || categories === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-slate-800">Quản lý Tài liệu</h2>
        {!isAdding && !editingId && (
          <button
            onClick={() => { setIsAdding(true); setFormData({ title: '', categoryId: categories[0]?._id || '' }); }}
            disabled={categories.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Thêm tài liệu
          </button>
        )}
      </div>

      {categories.length === 0 && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
          Bạn cần tạo ít nhất 1 danh mục trước khi thêm tài liệu.
        </div>
      )}

      {/* Add/Edit Form */}
      {(isAdding || editingId) && (
        <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <h3 className="font-medium mb-3">{isAdding ? 'Thêm tài liệu mới' : 'Chỉnh sửa tài liệu'}</h3>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Tên tài liệu *"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none"
            />
            <select
              value={formData.categoryId}
              onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
              className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none bg-white"
            >
              <option value="">-- Chọn danh mục --</option>
              {categories.map((cat) => (
                <option key={cat._id} value={cat._id}>{cat.name}</option>
              ))}
            </select>

            {isAdding && (
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                  file ? 'border-green-300 bg-green-50' : 'border-slate-300 hover:border-primary-400'
                }`}
              >
                {file ? (
                  <div className="flex items-center justify-center gap-2 text-green-700">
                    <FileText className="h-5 w-5" />
                    <span className="font-medium">{file.name}</span>
                    <span className="text-sm">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                  </div>
                ) : (
                  <div className="text-slate-500">
                    <Upload className="h-6 w-6 mx-auto mb-1" />
                    <span>Click để chọn file PDF</span>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            )}

            {loading && uploadProgress > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-600">
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {progressText || "Đang xử lý..."}
                  </span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-600 transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400">Việc này có thể mất vài phút với file lớn</p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={isAdding ? handleAdd : handleUpdate}
                disabled={loading || !formData.title.trim() || !formData.categoryId || (isAdding && !file)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {isAdding ? 'Tải lên' : 'Lưu'}
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

      {/* Document List */}
      {documents.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          Chưa có tài liệu nào.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="w-10"></th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">Tên tài liệu</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">Danh mục</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">Ngày tạo</th>
                <th className="text-center py-3 px-4 font-semibold text-slate-600">Trạng thái</th>
                <th className="text-right py-3 px-4 font-semibold text-slate-600">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr 
                  key={doc._id} 
                  className={`border-b border-slate-100 hover:bg-slate-50 ${!doc.active ? 'opacity-50' : ''} ${draggedId === doc._id ? 'opacity-30' : ''}`}
                  draggable
                  onDragStart={() => handleDragStart(doc._id)}
                  onDragOver={(e) => handleDragOver(e, doc._id)}
                  onDragEnd={handleDragEnd}
                >
                  <td className="py-3 px-2">
                    <div className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600">
                      <GripVertical className="h-4 w-4" />
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-red-500" />
                      <span className="font-medium text-slate-800">{doc.title}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                      {doc.category}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-600">{doc.date}</td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => toggleActive({ id: doc._id })}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        doc.active 
                          ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {doc.active ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                      {doc.active ? 'Hiện' : 'Ẩn'}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {doc.url && (
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Xem file"
                        >
                          <FileText className="h-4 w-4" />
                        </a>
                      )}
                      <button
                        onClick={() => startEdit(doc)}
                        className="p-2 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(doc._id)}
                        className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
