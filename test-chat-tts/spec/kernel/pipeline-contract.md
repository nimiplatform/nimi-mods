# Pipeline Contract

> Owner Domain: `TCT-PIPE-*`

## TCT-PIPE-001 Chat Diagnostics Flow

Chat diagnostics flow must include route query and one-shot generation result validation.

## TCT-PIPE-002 TTS Diagnostics Flow

TTS diagnostics flow must include provider list, voice list, synthesize, and playback verification input.

## TCT-PIPE-003 Image Diagnostics Flow

Image diagnostics flow must support both minimal text-to-image and image-to-image request shapes:

1. normalize t2i/i2i inputs
2. execute `runtime.media.image.generate`
3. render generated image preview and structured raw response
