import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2 } from 'lucide-react';

// Configure the worker for Vite
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PdfViewerProps {
  url: string;
}

export default function PdfViewer({ url }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPageNumber(1);
  }

  const zoomIn = () => setScale(prev => Math.min(prev + 0.2, 3.0));
  const zoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.5));
  
  const previousPage = () => setPageNumber(prev => Math.max(prev - 1, 1));
  const nextPage = () => setPageNumber(prev => Math.min(prev + 1, numPages));

  return (
    <div 
      className="flex flex-col h-full bg-zinc-200 rounded-2xl border-0 shadow-inner overflow-hidden select-none relative" 
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 md:p-3 bg-white border-b border-zinc-200 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-1 md:gap-2">
          <button 
            onClick={zoomOut}
            className="p-2 text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors"
            title="Diminuir Zoom"
          >
            <ZoomOut className="w-4 h-4 md:w-5 md:h-5" />
          </button>
          <span className="text-xs md:text-sm font-medium text-zinc-600 w-10 md:w-12 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button 
            onClick={zoomIn}
            className="p-2 text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors"
            title="Aumentar Zoom"
          >
            <ZoomIn className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <button 
            onClick={previousPage}
            disabled={pageNumber <= 1}
            className="p-2 text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
          </button>
          <span className="text-xs md:text-sm font-medium text-zinc-700">
            {pageNumber} de {numPages || '-'}
          </span>
          <button 
            onClick={nextPage}
            disabled={pageNumber >= numPages}
            className="p-2 text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </div>
      </div>

      {/* PDF Container */}
      <div className="flex-1 overflow-auto p-4 md:p-8 flex justify-center bg-zinc-100">
        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3 mt-20">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="font-medium text-sm">Carregando documento...</p>
            </div>
          }
          error={
            <div className="flex flex-col items-center justify-center h-full text-red-500 gap-3 mt-20">
              <p className="font-medium text-sm">Erro ao carregar o PDF.</p>
            </div>
          }
          className="max-w-full"
        >
          <Page 
            pageNumber={pageNumber} 
            scale={scale} 
            renderTextLayer={false} 
            renderAnnotationLayer={false}
            className="shadow-lg rounded overflow-hidden"
          />
        </Document>
      </div>
    </div>
  );
}
