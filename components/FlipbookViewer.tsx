import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import HTMLFlipBook from 'react-pageflip';
import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Loader2, 
  RectangleVertical, 
  RectangleHorizontal,
  X
} from 'lucide-react';
import { Button } from './ui/Button';

// Local worker - bundled with Vite for faster loading
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

interface FlipbookViewerProps {
  file: File | string;
  pageImageUrls?: (string | null)[]; // Pre-rendered page images for fast loading
  onClose: () => void;
}

// Minimal Page Component to avoid layout conflicts with react-pageflip
const PageSheet = React.forwardRef<HTMLDivElement, any>((props, ref) => {
  return (
    <div 
      ref={ref} 
      className="bg-white overflow-hidden border-r border-slate-200"
      // Explicitly set background to white to avoid transparency issues during flips
      style={{ backgroundColor: 'white' }} 
    >
        {props.children}
        {/* Page Number */}
        <div className="absolute bottom-4 right-4 text-[10px] text-slate-400 font-medium select-none z-10">
            {props.number}
        </div>
        {/* Gradient spine effect for realism */}
        <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-slate-100/50 to-transparent pointer-events-none" />
    </div>
  );
});
PageSheet.displayName = 'PageSheet';

// Buffer: số trang render trước/sau trang hiện tại
const RENDER_BUFFER = 4;
// Default A4 ratio for skeleton
const DEFAULT_RATIO = 1.414;

export const FlipbookViewer: React.FC<FlipbookViewerProps> = ({ file, pageImageUrls, onClose }) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [loadedPages, setLoadedPages] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  
  // Check if we have pre-rendered images
  const hasPrerenderedImages = pageImageUrls && pageImageUrls.length > 0 && pageImageUrls.some(url => url);
  
  // View mode state
  const [viewMode, setViewMode] = useState<'single' | 'double'>('double');
  
  // Actual PDF page dimensions from first page - start with default for instant skeleton
  const [pdfRatio, setPdfRatio] = useState<number>(DEFAULT_RATIO);
  
  const flipBookRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);
  
  // Calculated base dimensions (before zoom)
  const [baseDim, setBaseDim] = useState({ width: 0, height: 0 });
  
  // Reset state when file changes to avoid dimension inheritance from previous document
  useEffect(() => {
    setPdfRatio(DEFAULT_RATIO);
    setNumPages(0);
    setPageNumber(1);
    setIsLoading(true);
    setLoadedPages(new Set());
    setScale(1.0);
    setBaseDim({ width: 0, height: 0 }); // Reset dimensions to force recalculation
  }, [file, pageImageUrls]);
  
  // For pre-rendered images: load first image to get ratio and set numPages immediately
  useEffect(() => {
    if (hasPrerenderedImages && pageImageUrls) {
      setNumPages(pageImageUrls.length);
      setIsLoading(false);
      
      // Load first image to get actual ratio
      const firstUrl = pageImageUrls.find(url => url);
      if (firstUrl) {
        const img = new Image();
        img.onload = () => {
          const ratio = img.height / img.width;
          setPdfRatio(ratio);
        };
        img.src = firstUrl;
      }
    }
  }, [hasPrerenderedImages, pageImageUrls]);

  // Single PDF parse - reuse the document from react-pdf (no duplicate parsing!)
  const onDocumentLoadSuccess = useCallback(async (pdf: any) => {
    pdfDocRef.current = pdf;
    setNumPages(pdf.numPages);
    setIsLoading(false);
    
    // Get actual PDF dimensions from the already-loaded document
    try {
      const firstPage = await pdf.getPage(1);
      const viewport = firstPage.getViewport({ scale: 1 });
      const ratio = viewport.height / viewport.width;
      setPdfRatio(ratio);
    } catch (e) {
      console.warn('Could not get PDF dimensions, using default A4 ratio');
    }
  }, []);

  // Check if page should be rendered (lazy loading)
  const shouldRenderPage = useCallback((pageIndex: number) => {
    const current = pageNumber - 1; // 0-based
    return Math.abs(pageIndex - current) <= RENDER_BUFFER;
  }, [pageNumber]);

  // Track loaded pages for progress
  const onPageLoadSuccess = useCallback((pageIndex: number) => {
    setLoadedPages(prev => new Set(prev).add(pageIndex));
  }, []);

  // Calculate load progress
  const loadProgress = numPages > 0 
    ? Math.round((loadedPages.size / Math.min(numPages, RENDER_BUFFER * 2 + 1)) * 100)
    : 0;

  // Robust dimension calculation - uses actual PDF ratio (instant with default)
  useEffect(() => {
    const calculateLayout = () => {
      if (!containerRef.current) return;
      
      const containerW = containerRef.current.clientWidth;
      const containerH = containerRef.current.clientHeight;
      const windowW = window.innerWidth;
      
      const isMobile = windowW < 1024;
      const mode = isMobile ? 'single' : 'double';
      setViewMode(mode);

      // Use actual PDF ratio instead of fixed A4
      const RATIO = pdfRatio;
      
      let targetWidth;
      let targetHeight;

      if (mode === 'single') {
        // Single mode: Try to fit vertically first, then horizontally
        const maxH = containerH - 40;
        const maxW = containerW - 40;
        
        targetHeight = maxH;
        targetWidth = targetHeight / RATIO;
        
        if (targetWidth > maxW) {
            targetWidth = maxW;
            targetHeight = targetWidth * RATIO;
        }
      } else {
        // Double mode: 2 pages side by side
        const maxH = containerH - 60;
        const maxW = (containerW - 80) / 2;
        
        targetHeight = maxH;
        targetWidth = targetHeight / RATIO;

        if (targetWidth > maxW) {
            targetWidth = maxW;
            targetHeight = targetWidth * RATIO;
        }
      }

      // Sanity checks
      if (targetWidth < 200) targetWidth = 200;
      if (targetHeight < 200 * RATIO) targetHeight = 200 * RATIO;

      setBaseDim({
        width: Math.floor(targetWidth),
        height: Math.floor(targetHeight)
      });
    };

    calculateLayout();
    window.addEventListener('resize', calculateLayout);
    return () => window.removeEventListener('resize', calculateLayout);
  }, [pdfRatio, file, pageImageUrls]);

  const nextFlip = useCallback(() => {
    if (flipBookRef.current) {
      flipBookRef.current.pageFlip().flipNext();
    }
  }, []);

  const prevFlip = useCallback(() => {
    if (flipBookRef.current) {
      flipBookRef.current.pageFlip().flipPrev();
    }
  }, []);

  const onFlip = useCallback((e: any) => {
    setPageNumber(e.data + 1);
  }, []);

  // Actual dimensions passed to components (base * zoom)
  const finalWidth = baseDim.width * scale;
  const finalHeight = baseDim.height * scale;

  return (
    <div className="flex flex-col h-full w-full bg-slate-100/50">
      {/* Modern Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-white border-b border-slate-200 shadow-sm z-30 shrink-0 h-14">
        <div className="flex items-center gap-3">
           <Button variant="ghost" size="icon" onClick={onClose} className="text-slate-500 hover:text-red-600 hover:bg-red-50 -ml-1 transition-colors" title="Đóng">
             <X className="h-5 w-5" />
           </Button>
           <div className="h-5 w-px bg-slate-200 hidden sm:block"></div>
           <span className="text-sm font-semibold text-slate-700 font-mono">
             {pageNumber} / {numPages}
           </span>
           {/* Only show progress for PDF rendering mode */}
           {!hasPrerenderedImages && loadProgress < 100 && numPages > 0 && (
             <div className="flex items-center gap-2 text-xs text-slate-500">
               <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                 <div 
                   className="h-full bg-primary-500 transition-all duration-300"
                   style={{ width: `${loadProgress}%` }}
                 />
               </div>
               <span>{loadProgress}%</span>
             </div>
           )}
        </div>
        
        <div className="flex items-center gap-1 bg-slate-50 p-0.5 rounded-lg border border-slate-200">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600" onClick={() => setScale(s => Math.max(0.5, s - 0.1))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs w-10 text-center font-medium text-slate-600 hidden sm:inline-block select-none">
            {Math.round(scale * 100)}%
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600" onClick={() => setScale(s => Math.min(1.5, s + 0.1))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
           <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600" onClick={() => setScale(1)} title="Reset">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
           <div className="hidden lg:flex bg-slate-50 rounded-lg p-0.5 border border-slate-200 mr-2">
              <button 
                onClick={() => setViewMode('single')}
                className={`p-1.5 rounded transition-all ${viewMode === 'single' ? 'bg-white shadow-sm text-primary-600' : 'text-slate-400 hover:text-slate-600'}`}
                title="1 Trang"
              >
                <RectangleVertical className="h-4 w-4" />
              </button>
              <button 
                onClick={() => setViewMode('double')}
                className={`p-1.5 rounded transition-all ${viewMode === 'double' ? 'bg-white shadow-sm text-primary-600' : 'text-slate-400 hover:text-slate-600'}`}
                title="2 Trang"
              >
                <RectangleHorizontal className="h-4 w-4" />
              </button>
           </div>
           
           <div className="flex items-center gap-1">
             <Button variant="outline" size="sm" onClick={prevFlip} disabled={pageNumber <= 1} className="h-8 px-2">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="primary" size="sm" onClick={nextFlip} disabled={pageNumber >= numPages} className="h-8 px-2 shadow-primary-200">
              <ChevronRight className="h-4 w-4" />
            </Button>
           </div>
        </div>
      </div>

      {/* Book Container */}
      <div 
        className="flex-1 relative w-full overflow-hidden flex items-center justify-center bg-slate-200/50"
        ref={containerRef}
      >
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(#94a3b8_1px,transparent_1px)] [background-size:24px_24px] opacity-20 pointer-events-none"></div>

        {/* Scrollable Area */}
        <div className="relative w-full h-full overflow-auto flex items-center justify-center py-8">
           {/* Skeleton UI - shows immediately while loading */}
           {isLoading && baseDim.width > 0 && (
             <div className="absolute inset-0 flex items-center justify-center z-10">
               <div 
                 className="bg-white rounded-sm shadow-2xl animate-pulse flex items-center justify-center"
                 style={{ 
                   width: viewMode === 'double' ? baseDim.width * 2 : baseDim.width, 
                   height: baseDim.height 
                 }}
               >
                 <div className="flex flex-col items-center gap-3">
                   <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
                   <span className="text-sm font-medium text-slate-600">Đang tải...</span>
                 </div>
               </div>
             </div>
           )}
           
           {/* MODE 1: Pre-rendered images (FAST) */}
           {hasPrerenderedImages && numPages > 0 && baseDim.width > 0 && (
             <div className="flex justify-center items-center shadow-2xl rounded-sm">
               <HTMLFlipBook
                  key={`img-${viewMode}-${baseDim.width}-${pdfRatio}`}
                  width={finalWidth}
                  height={finalHeight}
                  size="fixed"
                  minWidth={200}
                  maxWidth={1000}
                  minHeight={300}
                  maxHeight={1500}
                  maxShadowOpacity={0.2}
                  showCover={false}
                  mobileScrollSupport={true}
                  ref={flipBookRef}
                  onFlip={onFlip}
                  className={`flip-book ${viewMode === 'double' ? 'mx-auto' : ''}`}
                  style={{ margin: '0 auto' }}
                  startPage={0}
                  drawShadow={true}
                  flippingTime={800}
                  usePortrait={viewMode === 'single'}
                  startZIndex={0}
                  autoSize={false}
                  clickEventForward={true}
                  useMouseEvents={true}
                  swipeDistance={30}
                  showPageCorners={true}
                  disableFlipByClick={false}
               >
                 {pageImageUrls!.map((url, index) => (
                    <PageSheet key={index} number={index + 1}>
                      {url ? (
                        <img 
                          src={url} 
                          alt={`Trang ${index + 1}`}
                          className="w-full h-full object-cover bg-white"
                          loading={index < 4 ? "eager" : "lazy"}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-slate-50">
                          <div className="text-slate-300 text-sm">Trang {index + 1}</div>
                        </div>
                      )}
                    </PageSheet>
                 ))}
               </HTMLFlipBook>
             </div>
           )}
           
           {/* MODE 2: PDF rendering (fallback for old documents or local files) */}
           {!hasPrerenderedImages && (
             <Document
              file={file}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={null}
              error={
                  <div className="flex flex-col items-center justify-center p-8 bg-white rounded-xl shadow-lg border border-red-100">
                       <div className="text-red-500 font-bold mb-2">Lỗi đọc file</div>
                       <p className="text-sm text-slate-500">File không hợp lệ hoặc bị hỏng.</p>
                  </div>
              }
              className="flex justify-center items-center shadow-2xl rounded-sm"
            >
               {numPages > 0 && baseDim.width > 0 && (
                 <HTMLFlipBook
                    key={`pdf-${viewMode}-${baseDim.width}-${pdfRatio}`}
                    width={finalWidth}
                    height={finalHeight}
                    size="fixed"
                    minWidth={200}
                    maxWidth={1000}
                    minHeight={300}
                    maxHeight={1500}
                    maxShadowOpacity={0.2}
                    showCover={false}
                    mobileScrollSupport={true}
                    ref={flipBookRef}
                    onFlip={onFlip}
                    className={`flip-book ${viewMode === 'double' ? 'mx-auto' : ''}`}
                    style={{ margin: '0 auto' }}
                    startPage={0}
                    drawShadow={true}
                    flippingTime={800}
                    usePortrait={viewMode === 'single'}
                    startZIndex={0}
                    autoSize={false}
                    clickEventForward={true}
                    useMouseEvents={true}
                    swipeDistance={30}
                    showPageCorners={true}
                    disableFlipByClick={false}
                 >
                   {Array.from(new Array(numPages), (el, index) => (
                      <PageSheet key={index} number={index + 1}>
                          {shouldRenderPage(index) ? (
                            <Page 
                              pageNumber={index + 1} 
                              width={finalWidth}
                              onLoadSuccess={() => onPageLoadSuccess(index)}
                              loading={
                                 <div className="w-full h-full flex items-center justify-center bg-white">
                                    <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
                                 </div>
                              }
                              renderTextLayer={false} 
                              renderAnnotationLayer={false}
                              className="page-pdf-render"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-slate-50">
                              <div className="text-slate-300 text-sm">Trang {index + 1}</div>
                            </div>
                          )}
                      </PageSheet>
                   ))}
                 </HTMLFlipBook>
               )}
            </Document>
           )}
        </div>
      </div>
    </div>
  );
};