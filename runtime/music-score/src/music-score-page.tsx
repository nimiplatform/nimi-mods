import React, { useCallback, useRef, useState } from 'react';
import { getPromptLocale } from '@nimiplatform/sdk/mod';
import { enLocale } from './locales/en.js';
import { zhLocale } from './locales/zh.js';
import { UploadZone } from './components/upload-zone.js';
import { ProgressBar, type ProcessingState, type ProcessingStep } from './components/progress-bar.js';
import { ScoreViewer } from './components/score-viewer.js';
import { Controls } from './components/controls.js';
import { decodeAudioFile } from './services/audio-decoder.js';
import { detectPitches, type NoteEvent } from './services/pitch-detector.js';
import { quantize, type QuantizedScore, type ScoreConfig, defaultScoreConfig } from './services/quantizer.js';
import { buildMusicXml } from './services/musicxml-builder.js';
import { downloadMusicXml, downloadMidiFromScore, exportPdf, deriveFilename, isExportable } from './services/export.js';

function yieldToBrowser(): Promise<void> {
    return new Promise((resolve) => {
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(() => resolve());
            return;
        }
        setTimeout(resolve, 0);
    });
}

export function MusicScorePage() {
    const locale = getPromptLocale() === 'zh' ? zhLocale : enLocale;

    // Pipeline state
    const [processing, setProcessing] = useState<ProcessingState>({
        step: 'idle',
        progress: 0,
        message: locale.progress.idle,
    });

    // Result state
    const [noteEvents, setNoteEvents] = useState<NoteEvent[]>([]);
    const [score, setScore] = useState<QuantizedScore | null>(null);
    const [musicXml, setMusicXml] = useState<string | null>(null);
    const [config, setConfig] = useState<ScoreConfig>(defaultScoreConfig());
    const [autoDetectedBpm, setAutoDetectedBpm] = useState(120);
    const [sourceFilename, setSourceFilename] = useState('score');

    // Refs to keep latest state in async pipeline
    const noteEventsRef = useRef<NoteEvent[]>([]);

    const isProcessing = !['idle', 'complete', 'error'].includes(processing.step);

    const updateStep = (step: ProcessingStep, progress: number) => {
        const messageMap: Record<ProcessingStep, string> = {
            idle: locale.progress.idle,
            decoding: locale.progress.decoding,
            'loading-model': locale.progress.loadingModel,
            detecting: locale.progress.detecting,
            quantizing: locale.progress.quantizing,
            rendering: locale.progress.rendering,
            complete: locale.progress.complete,
            error: locale.progress.error,
        };
        setProcessing({ step, progress, message: messageMap[step] });
    };

    // -----------------------------------------------------------------------
    // Main processing pipeline
    // -----------------------------------------------------------------------

    const processFile = useCallback(async (file: File) => {
        // MS-PIPE-001: transition through idle before starting new pipeline
        updateStep('idle', 0);
        await yieldToBrowser();

        try {
            // Step 1: Decode audio
            updateStep('decoding', 0);
            await yieldToBrowser();
            const audioBuffer = await decodeAudioFile(file, (p) => updateStep('decoding', p));

            // Step 2 & 3: Pitch detection
            updateStep('loading-model', 0);
            await yieldToBrowser();
            const notes = await detectPitches(audioBuffer, (p) => {
                updateStep(p.phase, p.progress);
            });

            // Step 4: Quantize
            updateStep('quantizing', 0);
            await yieldToBrowser();
            const quantized = quantize(notes);
            updateStep('quantizing', 100);
            await yieldToBrowser();

            // Step 5: Generate MusicXML and render
            updateStep('rendering', 0);
            await yieldToBrowser();
            const xml = buildMusicXml(quantized);
            await yieldToBrowser();

            setSourceFilename(file.name);
            setNoteEvents(notes);
            noteEventsRef.current = notes;
            setScore(quantized);
            setConfig(quantized.config);
            setAutoDetectedBpm(quantized.config.bpm);
            setMusicXml(xml);
            updateStep('rendering', 100);

            updateStep('complete', 100);
        } catch (e) {
            setProcessing({
                step: 'error',
                progress: 0,
                message: locale.progress.error,
                error: e instanceof Error ? e.message : String(e),
            });
        }
    }, [locale]);

    // -----------------------------------------------------------------------
    // Re-process with updated config
    // -----------------------------------------------------------------------

    const reprocess = useCallback(async () => {
        const notes = noteEventsRef.current;
        if (notes.length === 0) return;

        try {
            updateStep('quantizing', 0);
            await yieldToBrowser();
            const quantized = quantize(notes, config);
            updateStep('quantizing', 100);

            updateStep('rendering', 0);
            await yieldToBrowser();
            const xml = buildMusicXml(quantized);
            setScore(quantized);
            setMusicXml(xml);
            updateStep('rendering', 100);

            updateStep('complete', 100);
        } catch (e) {
            setProcessing({
                step: 'error',
                progress: 0,
                message: locale.progress.error,
                error: e instanceof Error ? e.message : String(e),
            });
        }
    }, [config, locale]);

    // -----------------------------------------------------------------------
    // Export handlers
    // -----------------------------------------------------------------------

    const handleExportMusicXml = useCallback(() => {
        if (musicXml) downloadMusicXml(musicXml, deriveFilename(sourceFilename, 'musicxml'));
    }, [musicXml, sourceFilename]);

    const handleExportMidi = useCallback(() => {
        if (score && score.notes.length > 0) {
            downloadMidiFromScore(score, deriveFilename(sourceFilename, 'mid'));
        }
    }, [score, sourceFilename]);

    const handleExportPdf = useCallback(() => {
        exportPdf();
    }, []);

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    return (
        <div
            data-nimi-mod-root="music-score"
            className="flex h-full min-h-0 flex-1 overflow-hidden bg-gray-50"
        >
            {/* Left sidebar: controls */}
            <div className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-r border-gray-200 bg-white p-3">
                <UploadZone
                    locale={locale.upload}
                    disabled={isProcessing}
                    onFileSelected={processFile}
                />

                {noteEvents.length > 0 && (
                    <Controls
                        locale={locale.controls}
                        keysLocale={locale.keys}
                        config={config}
                        autoDetectedBpm={autoDetectedBpm}
                        disabled={isProcessing}
                        onChange={setConfig}
                        onApply={() => void reprocess()}
                    />
                )}

                {/* Export buttons */}
                {isExportable(score) && (
                    <div className="flex flex-col gap-1.5 rounded-xl border border-gray-200 bg-white p-3">
                        <h3 className="text-xs font-semibold text-gray-700">{locale.export.title}</h3>
                        <div className="flex flex-col gap-1">
                            <ExportButton
                                label={locale.export.musicxml}
                                onClick={handleExportMusicXml}
                            />
                            <ExportButton
                                label={locale.export.midi}
                                onClick={handleExportMidi}
                            />
                            <ExportButton
                                label={locale.export.pdf}
                                onClick={handleExportPdf}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Main content area */}
            <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                <ProgressBar state={processing} />

                {musicXml ? (
                    <ScoreViewer musicXml={musicXml} />
                ) : (
                    processing.step === 'idle' && (
                        <div className="flex flex-1 items-center justify-center">
                            <p className="text-sm text-gray-400">
                                {locale.upload.description}
                            </p>
                        </div>
                    )
                )}
            </div>
        </div>
    );
}

function ExportButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-left text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100"
        >
            {label}
        </button>
    );
}
