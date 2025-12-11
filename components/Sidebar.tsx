import React, { useState, useEffect, useMemo } from 'react';
import { 
  ChevronRight, 
  FolderOpen, 
  Loader2
} from 'lucide-react';
import { Category, DocumentItem } from '../types';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';

interface SidebarProps {
  isOpen: boolean;
  onSelectDocument: (doc: DocumentItem) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onSelectDocument }) => {
  const [expandedCats, setExpandedCats] = useState<string[]>([]);
  
  // Fetch only active documents (realtime)
  const documents = useQuery(api.documents.listActiveDocuments);
  const loading = documents === undefined;

  // Group documents by category
  const categories = useMemo(() => {
    if (!documents) return [];
    
    const grouped: Record<string, DocumentItem[]> = {};
    documents.forEach((d: any) => {
      const doc: DocumentItem = {
        id: d._id,
        title: d.title,
        category: d.category,
        date: d.date,
        url: d.url || "",
        pageImageUrls: d.pageImageUrls,
      };
      if (!grouped[d.category]) grouped[d.category] = [];
      grouped[d.category].push(doc);
    });

    return Object.keys(grouped).map((key, index) => ({
      id: `cat-${index}`,
      name: key,
      items: grouped[key]
    }));
  }, [documents]);

  // Auto expand first category
  useEffect(() => {
    if (categories.length > 0 && expandedCats.length === 0) {
      setExpandedCats([categories[0].id]);
    }
  }, [categories]);

  const toggleCat = (id: string) => {
    setExpandedCats(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  return (
    <aside 
      className={`
        fixed inset-y-0 left-0 z-30 w-80 transform border-r border-slate-200 bg-white/95 backdrop-blur-xl transition-transform duration-300 ease-in-out lg:static lg:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}
    >
      <div className="flex h-full flex-col">
        {/* Header Space matching main header height */}
        <div className="h-16 shrink-0 lg:hidden" /> 
        
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mb-4 px-2">
             <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
               Thư Viện Tài Liệu
             </h3>
          </div>

          {loading ? (
             <div className="flex flex-col items-center justify-center py-10 space-y-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
                <span className="text-xs text-slate-400">Đang đồng bộ dữ liệu...</span>
             </div>
          ) : (
            <div className="space-y-2">
                {categories.length === 0 && !loading && (
                    <div className="text-center py-8 text-sm text-slate-400">
                        Chưa có tài liệu nào.<br/>Hãy upload file đầu tiên!
                    </div>
                )}

                {categories.map(category => (
                    <div key={category.id} className="rounded-xl border border-transparent bg-slate-50/50 overflow-hidden transition-all hover:border-slate-200 hover:bg-white hover:shadow-sm">
                    <button
                        onClick={() => toggleCat(category.id)}
                        className="flex w-full items-center justify-between px-3 py-3 text-sm font-semibold text-slate-700"
                    >
                        <div className="flex items-center gap-2.5">
                        <div className={`p-1.5 rounded-md ${expandedCats.includes(category.id) ? 'bg-primary-100 text-primary-600' : 'bg-slate-200 text-slate-500'}`}>
                            <FolderOpen className="h-4 w-4" />
                        </div>
                        <span>{category.name}</span>
                        <span className="text-xs font-normal text-slate-400">({category.items.length})</span>
                        </div>
                        <ChevronRight 
                        className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${expandedCats.includes(category.id) ? 'rotate-90' : ''}`} 
                        />
                    </button>
                    
                    {expandedCats.includes(category.id) && (
                        <div className="border-t border-slate-100 bg-white">
                        {category.items.map(doc => (
                            <button
                            key={doc.id}
                            onClick={() => onSelectDocument(doc)}
                            className="flex w-full items-start px-4 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-50 hover:text-primary-700 group transition-colors border-l-2 border-transparent hover:border-primary-500"
                            >
                            <span className="font-medium line-clamp-1 w-full group-hover:translate-x-1 transition-transform">{doc.title}</span>
                            </button>
                        ))}
                        </div>
                    )}
                    </div>
                ))}
            </div>
          )}
        </div>
        

      </div>
    </aside>
  );
};