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
import { useImagePreloader } from './hooks/useImagePreloader';
import { usePageFlipSound } from './hooks/usePageFlipSound';

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

// Số trang load trước khi lật
const PRELOAD_AHEAD = 2;
// Default A4 ratio for skeleton
const DEFAULT_RATIO = 1.414;

// Skeleton component cho trang đang load
const PageSkeleton: React.FC<{ pageNumber: number }> = ({ pageNumber }) => (
  <div className="w-full h-full bg-white flex flex-col items-center justify-center gap-3 animate-pulse">
    {/* Skeleton lines */}
    <div className="w-3/4 space-y-3">
      <div className="h-3 bg-slate-200 rounded-full w-full"></div>
      <div className="h-3 bg-slate-200 rounded-full w-5/6"></div>
      <div className="h-3 bg-slate-200 rounded-full w-4/6"></div>
      <div className="h-3 bg-slate-100 rounded-full w-full mt-6"></div>
      <div className="h-3 bg-slate-100 rounded-full w-full"></div>
      <div className="h-3 bg-slate-100 rounded-full w-3/4"></div>
    </div>
    {/* Loading indicator */}
    <div className="flex items-center gap-2 mt-4">
      <Loader2 className="h-4 w-4 animate-spin text-primary-400" />
      <span className="text-xs text-slate-400">Đang tải trang {pageNumber}...</span>
    </div>
  </div>
);

// Image with skeleton - show skeleton while loading, then fade in image
const ImageWithSkeleton: React.FC<{
  src: string;
  alt: string;
  pageNumber: number;
  priority?: boolean;
}> = ({ src, alt, pageNumber, priority = false }) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <div className="w-full h-full relative bg-white">
      {/* Skeleton - show while loading */}
      {!loaded && !error && (
        <div className="absolute inset-0 z-10">
          <PageSkeleton pageNumber={pageNumber} />
        </div>
      )}
      
      {/* Actual image */}
      <img
        src={src}
        alt={alt}
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        loading={priority ? "eager" : "lazy"}
        fetchpriority={priority ? "high" : "low"}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
      
      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
          <div className="text-slate-400 text-sm">Không tải được trang {pageNumber}</div>
        </div>
      )}
    </div>
  );
};

export const FlipbookViewer: React.FC<FlipbookViewerProps> = ({ file, pageImageUrls, onClose }) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [loadedPages, setLoadedPages] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  
  // Image preloader hook for 4-tier loading strategy
  const { preloadForViewer } = useImagePreloader();
  
  // Page flip sound effect (soft & quick)
  const { playFlipSound } = usePageFlipSound({ volume: 0.2, enabled: true });
  
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
      
      // 4-TIER LOADING: Trigger preload when viewer opens
      // Desktop: 2 trang, Mobile: 1 trang
      const initPages = window.innerWidth >= 1024 ? 2 : 1;
      preloadForViewer(pageImageUrls, 1, initPages);
    }
  }, [hasPrerenderedImages, pageImageUrls, preloadForViewer]);
  
  // 4-TIER LOADING: Preload more pages when user flips
  useEffect(() => {
    if (hasPrerenderedImages && pageImageUrls && pageNumber > 1) {
      const initPages = viewMode === 'double' ? 2 : 1;
      preloadForViewer(pageImageUrls, pageNumber, initPages);
    }
  }, [pageNumber, viewMode, hasPrerenderedImages, pageImageUrls, preloadForViewer]);

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

  // Smart lazy loading: Desktop load 2 trang đầu (double view), mobile load 1 trang
  const initialPages = viewMode === 'double' ? 2 : 1;
  
  const shouldRenderPage = useCallback((pageIndex: number) => {
    const currentIndex = pageNumber - 1; // 0-based
    
    // Desktop: load 2 trang đầu, Mobile: load 1 trang đầu
    if (pageIndex < initialPages) return true;
    
    // Load thêm các trang phía trước khi user lật sách
    const maxLoadedIndex = currentIndex + PRELOAD_AHEAD;
    return pageIndex <= maxLoadedIndex;
  }, [pageNumber, initialPages]);

  // Track loaded pages for progress
  const onPageLoadSuccess = useCallback((pageIndex: number) => {
    setLoadedPages(prev => new Set(prev).add(pageIndex));
  }, []);

  // Calculate load progress
  const expectedPages = Math.min(numPages, initialPages + PRELOAD_AHEAD);
  const loadProgress = numPages > 0 
    ? Math.round((loadedPages.size / expectedPages) * 100)
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
    playFlipSound();
  }, [playFlipSound]);

  // Double-tap/click to toggle zoom (works on both desktop and mobile)
  const lastTapRef = useRef<number>(0);
  const isTouchRef = useRef<boolean>(false);
  
  const handleTouchEnd = useCallback(() => {
    isTouchRef.current = true; // Mark as touch device
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      setScale(s => s === 1.0 ? 1.4 : 1.0);
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  }, []);
  
  const handleClick = useCallback(() => {
    // Skip if this click was triggered by touch (avoid double-firing)
    if (isTouchRef.current) {
      isTouchRef.current = false;
      return;
    }
    
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      setScale(s => s === 1.0 ? 1.4 : 1.0);
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  }, []);

  // Mouse wheel to flip pages (desktop only) - attached via useEffect for passive: false
  const lastWheelRef = useRef<number>(0);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const handleWheel = (e: WheelEvent) => {
      // Only on desktop
      if (window.innerWidth < 1024) return;
      
      // Prevent default scroll
      e.preventDefault();
      
      // Debounce: ignore rapid scrolls
      const now = Date.now();
      if (now - lastWheelRef.current < 300) return;
      lastWheelRef.current = now;
      
      if (e.deltaY > 0) {
        // Scroll down = next page
        flipBookRef.current?.pageFlip().flipNext();
      } else if (e.deltaY < 0) {
        // Scroll up = previous page
        flipBookRef.current?.pageFlip().flipPrev();
      }
    };
    
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // FlipBook always uses base dimensions - zoom is handled via CSS transform
  const finalWidth = baseDim.width;
  const finalHeight = baseDim.height;

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
        onClick={handleClick}
        onTouchEnd={handleTouchEnd}
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
             <div 
               className="flex justify-center items-center shadow-2xl rounded-sm transition-transform duration-200 ease-out"
               style={{ 
                 transform: `scale(${scale})`,
                 transformOrigin: 'center center'
               }}
             >
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
                  clickEventForward={false}
                  useMouseEvents={true}
                  swipeDistance={30}
                  showPageCorners={true}
                  disableFlipByClick={true}
               >
                 {pageImageUrls!.map((url, index) => (
                    <PageSheet key={index} number={index + 1}>
                      {shouldRenderPage(index) && url ? (
                        <ImageWithSkeleton
                          src={url}
                          alt={`Trang ${index + 1}`}
                          pageNumber={index + 1}
                          priority={index < initialPages}
                        />
                      ) : (
                        <PageSkeleton pageNumber={index + 1} />
                      )}
                    </PageSheet>
                 ))}
               </HTMLFlipBook>
             </div>
           )}
           
           {/* MODE 2: PDF rendering (fallback for old documents or local files) */}
           {!hasPrerenderedImages && (
             <div 
               className="transition-transform duration-200 ease-out"
               style={{ 
                 transform: `scale(${scale})`,
                 transformOrigin: 'center center'
               }}
             >
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
                    clickEventForward={false}
                    useMouseEvents={true}
                    swipeDistance={30}
                    showPageCorners={true}
                    disableFlipByClick={true}
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
             </div>
           )}
        </div>
      </div>
    </div>
  );
};