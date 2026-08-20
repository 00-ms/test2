const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const webp = require('node-webpmux');

function tmpFile(ext) {
  return path.join(os.tmpdir(), `wa-bot-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d));
    proc.on('error', (err) => reject(new Error(`ffmpeg not found or failed to start: ${err.message}`)));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
    });
  });
}

/**
 * Convert an image or short video buffer into an animated/static WhatsApp sticker (webp),
 * with pack/author exif metadata injected.
 */
async function toSticker(buffer, isVideo, packName, authorName) {
  const inPath = tmpFile(isVideo ? 'mp4' : 'png');
  const outPath = tmpFile('webp');
  fs.writeFileSync(inPath, buffer);

  try {
    if (isVideo) {
      await runFfmpeg([
        '-y', '-i', inPath,
        '-t', '6',
        '-vf', "scale='min(512,iw)':'min(512,ih)':force_original_aspect_ratio=decrease,fps=15,pad=512:512:(512-iw)/2:(512-ih)/2:color=#00000000",
        '-loop', '0',
        '-preset', 'default',
        '-an',
        '-vsync', '0',
        outPath
      ]);
    } else {
      await runFfmpeg([
        '-y', '-i', inPath,
        '-vf', "scale='min(512,iw)':'min(512,ih)':force_original_aspect_ratio=decrease,pad=512:512:(512-iw)/2:(512-ih)/2:color=#00000000",
        outPath
      ]);
    }

    const img = new webp.Image();
    await img.load(outPath);
    const exif = {
      'sticker-pack-id': `${Date.now()}`,
      'sticker-pack-name': packName || 'Sticker Pack',
      'sticker-pack-publisher': authorName || 'WA Bot',
      emojis: ['😀']
    };
    const exifBuffer = Buffer.concat([
      Buffer.from([
        0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41,
        0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00
      ]),
      Buffer.from(JSON.stringify(exif), 'utf8')
    ]);
    img.exif = exifBuffer;
    const finalBuffer = await img.save(null);
    return finalBuffer;
  } finally {
    fs.existsSync(inPath) && fs.unlinkSync(inPath);
    fs.existsSync(outPath) && fs.unlinkSync(outPath);
  }
}

/**
 * Convert a webp sticker buffer into an mp4 video buffer (for .tovid).
 * Static stickers become a short still-frame video.
 */
async function stickerToVideo(buffer) {
  const inPath = tmpFile('webp');
  const outPath = tmpFile('mp4');
  fs.writeFileSync(inPath, buffer);

  try {
    await runFfmpeg([
      '-y', '-i', inPath,
      '-movflags', 'faststart',
      '-pix_fmt', 'yuv420p',
      '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2',
      outPath
    ]);
    return fs.readFileSync(outPath);
  } finally {
    fs.existsSync(inPath) && fs.unlinkSync(inPath);
    fs.existsSync(outPath) && fs.unlinkSync(outPath);
  }
}

module.exports = { toSticker, stickerToVideo };
