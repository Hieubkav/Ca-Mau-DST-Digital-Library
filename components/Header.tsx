import React from 'react';
import { Menu } from 'lucide-react';
import { Button } from './ui/Button';

interface HeaderProps {
  toggleSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({ toggleSidebar }) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/80 backdrop-blur-md shadow-sm">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={toggleSidebar} className="lg:hidden">
            <Menu className="h-5 w-5" />
          </Button>
          
          <div className="flex flex-col">
            <h1 className="text-xs font-bold tracking-widest text-primary-600 uppercase">
              Sở Khoa Học Và Công Nghệ Cà Mau
            </h1>
            <h2 className="font-serif text-lg font-bold text-slate-900 leading-tight">
              Tài Liệu Nội Bộ & Thư Viện Số
            </h2>
          </div>
        </div>
        
        {/* Right side tools removed as requested */}
      </div>
    </header>
  );
};