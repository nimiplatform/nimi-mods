import React, { useEffect, useRef, useState } from 'react';

// Type for OSMD — imported dynamically to allow tree-shaking
type OSMD = import('opensheetmusicdisplay').OpenSheetMusicDisplay;

export interface ScoreViewerProps {
    musicXml: string | null;
    onReady?: () => void;
}

export function ScoreViewer({ musicXml, onReady }: ScoreViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const osmdRef = useRef<OSMD | null>(null);
    const [zoom, setZoom] = useState(1.0);
    const [osmdReady, setOsmdReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Initialize OSMD once
    useEffect(() => {
        let cancelled = false;

        async function init() {
            if (!containerRef.current) return;

            try {
                const { OpenSheetMusicDisplay } = await import('opensheetmusicdisplay');
                if (cancelled) return;

                const osmd = new OpenSheetMusicDisplay(containerRef.current, {
                    autoResize: true,
                    drawTitle: true,
                    drawComposer: false,
                    drawCredits: false,
                    drawPartNames: false,
                    drawPartAbbreviations: false,
                });
                osmdRef.current = osmd;
                setOsmdReady(true);
            } catch (e) {
                if (!cancelled) {
                    setError(`Failed to load sheet music renderer: ${e instanceof Error ? e.message : String(e)}`);
                }
            }
        }

        init();
        return () => { cancelled = true; };
    }, []);

    // Load and render MusicXML when it changes or OSMD becomes ready
    useEffect(() => {
        if (!musicXml || !osmdReady || !osmdRef.current) return;

        let cancelled = false;

        async function render() {
            const osmd = osmdRef.current;
            if (!osmd || cancelled) return;

            try {
                setError(null);
                await osmd.load(musicXml!);
                if (cancelled) return;
                osmd.zoom = zoom;
                osmd.render();
                onReady?.();
            } catch (e) {
                if (!cancelled) {
                    setError(`Failed to render score: ${e instanceof Error ? e.message : String(e)}`);
                }
            }
        }

        render();
        return () => { cancelled = true; };
    }, [musicXml, zoom, onReady, osmdReady]);

    const handleZoom = (delta: number) => {
        setZoom((prev) => Math.max(0.3, Math.min(3.0, prev + delta)));
    };

    if (error) {
        return (
            <div className="flex items-center justify-center rounded-xl border border-red-200 bg-red-50 p-6">
                <p className="text-xs text-red-600">{error}</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col rounded-xl border border-gray-200 bg-white">
            {/* Zoom controls */}
            <div className="flex items-center justify-end gap-2 border-b border-gray-100 px-3 py-1.5">
                <button
                    type="button"
                    onClick={() => handleZoom(-0.1)}
                    className="rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100"
                >
                    -
                </button>
                <span className="text-xs tabular-nums text-gray-400">
                    {Math.round(zoom * 100)}%
                </span>
                <button
                    type="button"
                    onClick={() => handleZoom(0.1)}
                    className="rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100"
                >
                    +
                </button>
            </div>

            {/* Score container */}
            <div
                ref={containerRef}
                className="min-h-[300px] overflow-auto p-4"
                style={{ maxHeight: 'calc(100vh - 300px)' }}
            />
        </div>
    );
}
