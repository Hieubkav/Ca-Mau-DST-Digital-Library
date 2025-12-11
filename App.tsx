import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Uploader } from './components/Uploader';
import { FlipbookViewer } from './components/FlipbookViewer';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { DocumentItem, ViewMode } from './types';

const App: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.HOME);
  const [currentFile, setCurrentFile] = useState<File | string | null>(null);
  const [currentPageImages, setCurrentPageImages] = useState<(string | null)[] | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkRoute = () => {
      setIsAdmin(window.location.pathname === '/admin');
    };
    checkRoute();
    window.addEventListener('popstate', checkRoute);
    return () => window.removeEventListener('popstate', checkRoute);
  }, []);

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    setIsAdmin(path === '/admin');
  };

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

  // Handle local file preview or Upload quick view
  const handleFileSelected = (file: File) => {
    setCurrentFile(file);
    setCurrentPageImages(undefined); // Local files don't have pre-rendered images
    setViewMode(ViewMode.FLIPBOOK);
  };

  // Handle successful upload to Firebase
  const handleUploadSuccess = () => {
      // Sidebar will auto-update via realtime listener
  };

  // Handle selecting a document from the Sidebar (Firebase URL)
  const handleSelectDocument = (doc: DocumentItem) => {
    if (doc.url) {
        setCurrentFile(doc.url); // Pass URL string to Flipbook
        setCurrentPageImages(doc.pageImageUrls); // Pass pre-rendered images if available
        setViewMode(ViewMode.FLIPBOOK);
        // Close sidebar on mobile
        if (window.innerWidth < 1024) setSidebarOpen(false);
    } else {
        alert("Tài liệu này không có đường dẫn hợp lệ.");
    }
  };

  const handleCloseDocument = () => {
    setViewMode(ViewMode.HOME);
    setCurrentFile(null);
    setCurrentPageImages(undefined);
  };

  const handleGoHome = () => {
    setViewMode(ViewMode.HOME);
    setCurrentFile(null);
    setCurrentPageImages(undefined);
  };

  if (isAdmin) {
    return <AdminDashboard onBack={() => navigateTo('/')} />;
  }

  return (
    <div className="flex h-screen w-full flex-col bg-slate-50 overflow-hidden font-sans">
      <Header toggleSidebar={toggleSidebar} onGoHome={handleGoHome} />
      
      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar isOpen={sidebarOpen} onSelectDocument={handleSelectDocument} />
        
        {/* Overlay for mobile sidebar */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 z-20 bg-slate-900/20 backdrop-blur-[2px] lg:hidden transition-opacity"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main className="flex-1 relative flex flex-col w-full h-full overflow-hidden bg-white shadow-xl lg:rounded-tl-2xl border-l border-slate-200/50 clip-content">
          {viewMode === ViewMode.HOME && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-slate-400">
                <p className="text-lg">Chọn tài liệu từ thư viện bên trái để xem</p>
              </div>
            </div>
          )}

          {viewMode === ViewMode.UPLOAD && (
             <Uploader 
                onFileSelected={handleFileSelected} 
                onUploadSuccess={handleUploadSuccess}
             />
          )}

          {viewMode === ViewMode.FLIPBOOK && currentFile && (
            <div className="h-full w-full relative animate-in zoom-in-95 duration-300">
               <FlipbookViewer 
                 file={currentFile} 
                 pageImageUrls={currentPageImages}
                 onClose={handleCloseDocument} 
               />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;