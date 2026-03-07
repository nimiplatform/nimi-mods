# Pipeline Contract

> Owner Domain: `TAI-PIPE-*`

## TAI-PIPE-001 Text Generate Diagnostics Flow

Text generation diagnostics flow must include route query and one-shot generation result validation.

## TAI-PIPE-002 Text Embed Diagnostics Flow

Text embedding flow must include route query, embedding generation, and dimension/preview validation.

## TAI-PIPE-003 Image Generate Diagnostics Flow

Image diagnostics flow must support text-to-image request: normalize inputs, execute
`runtime.media.image.generate`, render generated image preview and structured raw response.

## TAI-PIPE-004 Video Generate Diagnostics Flow

Video diagnostics flow must support t2v and i2v modes: normalize inputs, execute
`runtime.media.video.generate`, render job ID and video URL output.

## TAI-PIPE-005 Audio Synthesize Diagnostics Flow

TTS diagnostics flow must include voice list, synthesize, and audio playback verification.

## TAI-PIPE-006 Audio Transcribe Diagnostics Flow

STT diagnostics flow must include route query, audio URL input, transcription execution, and text output.

## TAI-PIPE-007 Voice Clone Diagnostics Flow

Voice clone diagnostics flow captures input shape (ref audio URL, target model) for future SDK integration.

## TAI-PIPE-008 Voice Design Diagnostics Flow

Voice design diagnostics flow captures input shape (instruction text) for future SDK integration.
