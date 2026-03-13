import test from 'node:test';
import assert from 'node:assert/strict';
import { isAudioFileSupported } from '../src/services/audio-decoder.js';

function fakeFile(name: string, type: string): File {
    return new File([], name, { type });
}

test('isAudioFileSupported accepts MP3 by MIME type', () => {
    assert.equal(isAudioFileSupported(fakeFile('track.mp3', 'audio/mpeg')), true);
});

test('isAudioFileSupported accepts WAV by MIME type', () => {
    assert.equal(isAudioFileSupported(fakeFile('track.wav', 'audio/wav')), true);
});

test('isAudioFileSupported accepts OGG by MIME type', () => {
    assert.equal(isAudioFileSupported(fakeFile('track.ogg', 'audio/ogg')), true);
});

test('isAudioFileSupported accepts FLAC by extension fallback', () => {
    assert.equal(isAudioFileSupported(fakeFile('track.flac', '')), true);
});

test('isAudioFileSupported rejects non-audio file', () => {
    assert.equal(isAudioFileSupported(fakeFile('document.pdf', 'application/pdf')), false);
});

test('isAudioFileSupported rejects unknown extension with no MIME', () => {
    assert.equal(isAudioFileSupported(fakeFile('track.xyz', '')), false);
});
