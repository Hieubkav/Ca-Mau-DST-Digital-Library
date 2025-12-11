import React, { useState } from 'react';
import { FolderOpen, FileText, ArrowLeft } from 'lucide-react';
import { CategoryManager } from './CategoryManager';
import { DocumentManager } from './DocumentManager';

interface AdminDashboardProps {
  onBack: () => void;
}

type Tab = 'categories' | 'documents';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<Tab>('categories');

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-xl font-bold text-slate-800">Admin Dashboard</h1>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('categories')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'categories'
                ? 'bg-primary-600 text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <FolderOpen className="h-4 w-4" />
            Danh mục
          </button>
          <button
            onClick={() => setActiveTab('documents')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'documents'
                ? 'bg-primary-600 text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <FileText className="h-4 w-4" />
            Tài liệu
          </button>
        </div>

        {/* Content */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          {activeTab === 'categories' && <CategoryManager />}
          {activeTab === 'documents' && <DocumentManager />}
        </div>
      </div>
    </div>
  );
};
