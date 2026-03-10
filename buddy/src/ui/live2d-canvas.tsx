import React, { useRef, useEffect } from 'react';

interface Live2DCanvasProps {
  onReady: (canvas: HTMLCanvasElement) => void;
  onTap?: (event: React.PointerEvent<HTMLCanvasElement>) => void;
}

export function Live2DCanvas({ onReady, onTap }: Live2DCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readyRef = useRef(false);

  useEffect(() => {
    if (canvasRef.current && !readyRef.current) {
      readyRef.current = true;
      onReady(canvasRef.current);
    }
  }, [onReady]);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full"
      style={{ touchAction: 'none', imageRendering: 'auto' }}
      onPointerUp={onTap}
    />
  );
}
