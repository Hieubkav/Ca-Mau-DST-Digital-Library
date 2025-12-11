import React, { useRef, useState, useEffect } from 'react';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from './ui/Button';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Id } from '../convex/_generated/dataModel';
import { pdfjs } from 'react-pdf';

// Use local worker
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

interface UploaderProps {
  onFileSelected: (file: File) => void;
  onUploadSuccess: () => void;
}

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

export const Uploader: React.FC<UploaderProps> = ({ onFileSelected, onUploadSuccess }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [docName, setDocName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categories = useQuery(api.categories.list);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const saveDocument = useMutation(api.documents.saveDocument);

  // Set default category when categories load
  useEffect(() => {
    if (categories && categories.length > 0 && !selectedCategoryId) {
      setSelectedCategoryId(categories[0]._id);
    }
  }, [categories]);

  // Drag & Drop Handlers
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]?.type === 'application/pdf') {
        const f = e.dataTransfer.files[0];
        setFile(f);
        setDocName(f.name.replace('.pdf', ''));
    }
  };
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
        const f = e.target.files[0];
        setFile(f);
        setDocName(f.name.replace('.pdf', ''));
    }
  };

  // Upload Logic: Convex Storage + Database with pre-rendered images
  const handleUpload = async () => {
    if (!file || !selectedCategoryId) {
      alert("Vui lòng chọn danh mục trước khi tải lên");
      return;
    }

    setUploading(true);
    setProgress(0);
    setProgressText("Đang tải PDF...");
    
    try {
        // 1. Upload original PDF file
        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: file,
        });
        
        if (!result.ok) throw new Error("Upload PDF thất bại");
        const { storageId } = await result.json();
        setProgress(10);
        
        // 2. Load PDF and convert pages to images
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
                method: "POST",
                headers: { "Content-Type": "image/jpeg" },
                body: blob,
            });
            
            if (!imgResult.ok) throw new Error(`Upload trang ${i} thất bại`);
            const { storageId: imgStorageId } = await imgResult.json();
            pageImageIds.push(imgStorageId);
            
            // Update progress (10-90%)
            setProgress(10 + Math.round((i / numPages) * 80));
        }
        
        // 3. Save document metadata with page images
        setProgressText("Đang lưu...");
        await saveDocument({
            title: docName || file.name.replace('.pdf', ''),
            categoryId: selectedCategoryId as Id<"categories">,
            storageId,
            pageImages: pageImageIds,
        });
        
        setProgress(100);
        setProgressText("Hoàn tất!");
        setUploading(false);
        onUploadSuccess();
        alert("Đã tải lên thành công!");
        setFile(null);
        setDocName("");

    } catch (error: any) {
        console.error("Upload failed", error);
        alert("Lỗi: " + (error.message || "Upload thất bại"));
        setUploading(false);
        setProgressText("");
    }
  };

  // Nếu người dùng chỉ muốn xem nhanh mà không lưu
  const handleQuickView = () => {
      if(file) onFileSelected(file);
  };

  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center animate-in fade-in duration-700 overflow-y-auto">
      <div className="max-w-xl w-full bg-white/60 backdrop-blur-sm p-8 rounded-3xl shadow-sm border border-slate-200/60">
        
        <div className="mb-6 space-y-2">
          <h2 className="text-3xl font-serif font-bold text-slate-900">
            Thư viện
          </h2>
        </div>

        {!file ? (
            // STATE 1: CHƯA CHỌN FILE
            <div
            className={`
                relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 transition-all duration-300 cursor-pointer group
                ${isDragging 
                ? 'border-primary-500 bg-primary-50/50 scale-[1.02]' 
                : 'border-slate-300 hover:border-primary-400 hover:bg-slate-50'
                }
            `}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            >
            <div className={`mb-4 rounded-full bg-primary-50 p-4 text-primary-600 ring-4 ring-primary-50/50 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6`}>
                <Upload className="h-8 w-8" />
            </div>
            
            <h3 className="mb-1 text-lg font-semibold text-slate-800">
                Tải tài liệu lên
            </h3>
            <p className="mb-4 text-xs text-slate-500 font-medium">
                PDF (Tối đa 50MB) - Kéo thả hoặc click
            </p>
            
            <input
                type="file"
                accept="application/pdf"
                className="hidden"
                ref={fileInputRef}
                onChange={handleInputChange}
            />
            </div>
        ) : (
            // STATE 2: ĐÃ CHỌN FILE - ĐIỀN THÔNG TIN
            <div className="text-left w-full space-y-4 animate-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="bg-red-100 p-2 rounded-lg text-red-600">
                        <FileText className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{file.name}</p>
                        <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <button onClick={() => setFile(null)} className="text-slate-400 hover:text-red-500 p-1">
                        <AlertCircle className="h-5 w-5" />
                    </button>
                </div>

                <div className="space-y-3">
                    <div>
                        <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider ml-1">Tên hiển thị</label>
                        <input 
                            type="text" 
                            value={docName}
                            onChange={(e) => setDocName(e.target.value)}
                            className="w-full mt-1 px-4 py-2 rounded-lg border border-slate-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-sm transition-all"
                            placeholder="Nhập tên tài liệu..."
                        />
                    </div>
                    
                    <div>
                        <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider ml-1">Danh mục</label>
                        <select 
                            value={selectedCategoryId}
                            onChange={(e) => setSelectedCategoryId(e.target.value)}
                            className="w-full mt-1 px-4 py-2 rounded-lg border border-slate-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none text-sm bg-white"
                        >
                            {!categories || categories.length === 0 ? (
                              <option value="">-- Chưa có danh mục --</option>
                            ) : (
                              categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)
                            )}
                        </select>
                        {(!categories || categories.length === 0) && (
                          <p className="text-xs text-amber-600 mt-1">Hãy vào /admin để tạo danh mục trước</p>
                        )}
                    </div>
                </div>

                {uploading ? (
                     <div className="mt-6 space-y-2">
                        <div className="flex justify-between text-xs font-medium text-slate-600">
                            <span className="flex items-center gap-2">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              {progressText || "Đang xử lý..."}
                            </span>
                            <span>{Math.round(progress)}%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-primary-600 transition-all duration-300 ease-out rounded-full"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <p className="text-xs text-slate-400 mt-2">Việc này có thể mất vài phút với file lớn</p>
                     </div>
                ) : (
                    <div className="flex gap-3 mt-6">
                        <Button variant="secondary" className="flex-1" onClick={handleQuickView}>
                            Xem Ngay (Offline)
                        </Button>
                        <Button variant="primary" className="flex-1 gap-2" onClick={handleUpload}>
                            <CheckCircle2 className="h-4 w-4" />
                            Lưu Lên Cloud
                        </Button>
                    </div>
                )}
            </div>
        )}
      </div>
    </div>
  );
};