/**
 * Decodes audio files (MP3, WAV, OGG, FLAC) into mono AudioBuffer at 22050Hz.
 * The 22050Hz sample rate is required by basic-pitch for pitch detection.
 */

const TARGET_SAMPLE_RATE = 22050;

export async function decodeAudioFile(
    file: File,
    onProgress?: (progress: number) => void,
): Promise<AudioBuffer> {
    onProgress?.(0);

    const arrayBuffer = await file.arrayBuffer();
    onProgress?.(30);

    // Create an OfflineAudioContext at the target sample rate.
    // We use a 1-sample context first to decode, then resample.
    const tempCtx = new AudioContext();
    const decoded = await tempCtx.decodeAudioData(arrayBuffer);
    await tempCtx.close();
    onProgress?.(60);

    // Resample to target rate and mix down to mono
    const duration = decoded.duration;
    const targetLength = Math.ceil(duration * TARGET_SAMPLE_RATE);
    const offlineCtx = new OfflineAudioContext(1, targetLength, TARGET_SAMPLE_RATE);

    const source = offlineCtx.createBufferSource();
    source.buffer = decoded;
    source.connect(offlineCtx.destination);
    source.start(0);

    const resampled = await offlineCtx.startRendering();
    onProgress?.(100);

    return resampled;
}

export function getAudioDuration(buffer: AudioBuffer): number {
    return buffer.duration;
}

export function getSampleRate(buffer: AudioBuffer): number {
    return buffer.sampleRate;
}

export const SUPPORTED_AUDIO_TYPES = [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/wave',
    'audio/ogg',
    'audio/flac',
    'audio/x-flac',
];

export const SUPPORTED_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac'];

export function isAudioFileSupported(file: File): boolean {
    if (SUPPORTED_AUDIO_TYPES.includes(file.type)) return true;
    const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
    return ext != null && SUPPORTED_EXTENSIONS.includes(ext);
}
