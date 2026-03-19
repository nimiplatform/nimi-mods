import React, { useRef, useEffect } from 'react';

interface Live2DCanvasProps {
  onReady: (canvas: HTMLCanvasElement) => void;
  onWheel?: (event: React.WheelEvent<HTMLCanvasElement>) => void;
  onPointerDown?: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove?: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp?: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerCancel?: (event: React.PointerEvent<HTMLCanvasElement>) => void;
}

export function Live2DCanvas({
  onReady,
  onWheel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: Live2DCanvasProps) {
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
      style={{ touchAction: 'none', imageRendering: 'auto', cursor: 'grab' }}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    />
  );
}
