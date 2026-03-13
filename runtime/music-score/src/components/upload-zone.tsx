import React, { useCallback, useRef, useState } from 'react';
import { isAudioFileSupported } from '../services/audio-decoder.js';

export interface UploadZoneProps {
    locale: {
        title: string;
        description: string;
        hint: string;
        button: string;
    };
    disabled?: boolean;
    onFileSelected: (file: File) => void;
}

export function UploadZone({ locale, disabled, onFileSelected }: UploadZoneProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleFile = useCallback(
        (file: File) => {
            if (isAudioFileSupported(file)) {
                onFileSelected(file);
            }
        },
        [onFileSelected],
    );

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragging(false);
            if (disabled) return;
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
        },
        [disabled, handleFile],
    );

    const handleDragOver = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            if (!disabled) setIsDragging(true);
        },
        [disabled],
    );

    const handleDragLeave = useCallback(() => setIsDragging(false), []);

    const handleInputChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            // Reset so the same file can be selected again
            e.target.value = '';
        },
        [handleFile],
    );

    return (
        <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => !disabled && inputRef.current?.click()}
            className={[
                'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-colors',
                isDragging
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100',
                disabled ? 'pointer-events-none opacity-50' : '',
            ].join(' ')}
        >
            <input
                ref={inputRef}
                type="file"
                accept=".mp3,.wav,.ogg,.flac,audio/*"
                className="hidden"
                onChange={handleInputChange}
            />

            {/* Music note icon */}
            <svg
                className="mb-3 h-10 w-10 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"
                />
            </svg>

            <p className="text-sm font-medium text-gray-700">{locale.title}</p>
            <p className="mt-1 text-xs text-gray-500">{locale.description}</p>
            <p className="mt-1 text-xs text-gray-400">{locale.hint}</p>

            <button
                type="button"
                disabled={disabled}
                className="mt-3 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
                {locale.button}
            </button>
        </div>
    );
}
