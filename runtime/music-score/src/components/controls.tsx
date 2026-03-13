import React from 'react';
import type { ScoreConfig } from '../services/quantizer.js';

export interface ControlsProps {
    locale: {
        title: string;
        bpm: string;
        bpmAuto: string;
        timeSignature: string;
        keySignature: string;
        quantizePrecision: string;
        sixteenth: string;
        eighth: string;
        quarter: string;
        apply: string;
    };
    keysLocale: Record<string, string>;
    config: ScoreConfig;
    autoDetectedBpm: number;
    disabled?: boolean;
    onChange: (config: ScoreConfig) => void;
    onApply: () => void;
}

const TIME_SIGNATURES: Array<[number, number]> = [
    [4, 4], [3, 4], [2, 4], [6, 8], [2, 2], [3, 8],
];

const KEY_SIGNATURES: Array<{ fifths: number; name: string }> = [
    { fifths: 0, name: 'C' },
    { fifths: 1, name: 'G' },
    { fifths: 2, name: 'D' },
    { fifths: 3, name: 'A' },
    { fifths: 4, name: 'E' },
    { fifths: 5, name: 'B' },
    { fifths: 6, name: 'F#' },
    { fifths: -1, name: 'F' },
    { fifths: -2, name: 'Bb' },
    { fifths: -3, name: 'Eb' },
    { fifths: -4, name: 'Ab' },
    { fifths: -5, name: 'Db' },
    { fifths: -6, name: 'Gb' },
];

const PRECISION_OPTIONS = [
    { value: 0.25, labelKey: 'sixteenth' as const },
    { value: 0.5, labelKey: 'eighth' as const },
    { value: 1, labelKey: 'quarter' as const },
];

export function Controls({
    locale,
    keysLocale,
    config,
    autoDetectedBpm,
    disabled,
    onChange,
    onApply,
}: ControlsProps) {
    const update = (patch: Partial<ScoreConfig>) => onChange({ ...config, ...patch });

    return (
        <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3">
            <h3 className="text-xs font-semibold text-gray-700">{locale.title}</h3>

            {/* BPM */}
            <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">{locale.bpm}</span>
                <div className="flex items-center gap-2">
                    <input
                        type="number"
                        min={30}
                        max={300}
                        value={config.bpm}
                        disabled={disabled}
                        onChange={(e) => update({ bpm: Number(e.target.value) || 120 })}
                        className="w-20 rounded border border-gray-300 px-2 py-1 text-xs tabular-nums focus:border-blue-400 focus:outline-none disabled:opacity-50"
                    />
                    <button
                        type="button"
                        disabled={disabled}
                        onClick={() => update({ bpm: autoDetectedBpm })}
                        className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-500 hover:bg-gray-200 disabled:opacity-50"
                    >
                        {locale.bpmAuto} ({autoDetectedBpm})
                    </button>
                </div>
            </label>

            {/* Time Signature */}
            <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">{locale.timeSignature}</span>
                <select
                    value={`${config.timeSignature[0]}/${config.timeSignature[1]}`}
                    disabled={disabled}
                    onChange={(e) => {
                        const parts = e.target.value.split('/').map(Number);
                        update({ timeSignature: [parts[0] ?? 4, parts[1] ?? 4] });
                    }}
                    className="w-20 rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none disabled:opacity-50"
                >
                    {TIME_SIGNATURES.map(([n, d]) => (
                        <option key={`${n}/${d}`} value={`${n}/${d}`}>
                            {n}/{d}
                        </option>
                    ))}
                </select>
            </label>

            {/* Key Signature */}
            <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">{locale.keySignature}</span>
                <select
                    value={config.keySignature}
                    disabled={disabled}
                    onChange={(e) => update({ keySignature: Number(e.target.value) })}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none disabled:opacity-50"
                >
                    {KEY_SIGNATURES.map(({ fifths, name }) => (
                        <option key={fifths} value={fifths}>
                            {keysLocale[name] ?? name}
                        </option>
                    ))}
                </select>
            </label>

            {/* Quantize Precision */}
            <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">{locale.quantizePrecision}</span>
                <select
                    value={config.quantizePrecision}
                    disabled={disabled}
                    onChange={(e) => update({ quantizePrecision: Number(e.target.value) })}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none disabled:opacity-50"
                >
                    {PRECISION_OPTIONS.map(({ value, labelKey }) => (
                        <option key={value} value={value}>
                            {locale[labelKey]}
                        </option>
                    ))}
                </select>
            </label>

            {/* Apply button */}
            <button
                type="button"
                disabled={disabled}
                onClick={onApply}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
                {locale.apply}
            </button>
        </div>
    );
}
