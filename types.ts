export interface DocumentItem {
  id: string;
  title: string;
  category: string;
  date: string;
  url: string; // URL từ Firebase Storage
  pageImageUrls?: (string | null)[]; // Pre-rendered page images
  isNew?: boolean;
}

export interface Category {
  id: string;
  name: string;
  items: DocumentItem[];
}

export enum ViewMode {
  HOME = 'HOME',
  UPLOAD = 'UPLOAD',
  FLIPBOOK = 'FLIPBOOK'
}