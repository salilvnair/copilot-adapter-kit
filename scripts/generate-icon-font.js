const fs = require('fs');
const path = require('path');

async function main() {
  const rootDir = path.resolve(__dirname, '..');
  const inputFile = path.join(rootDir, 'resources', 'cak-icon-src.svg');
  const outputDir = path.join(rootDir, 'resources');

  console.log('Input SVG:', inputFile);

  const { SVGIcons2SVGFontStream } = await import('svgicons2svgfont');
  const svg2ttf = (await import('svg2ttf')).default;
  const ttf2woff = (await import('ttf2woff')).default;

  const svgFont = await new Promise((resolve, reject) => {
    const fontStream = new SVGIcons2SVGFontStream({
      fontName: 'cak-icons',
      normalize: true,
      fontHeight: 1024,
    });

    let data = '';
    fontStream.on('data', (chunk) => { data += chunk.toString(); });
    fontStream.on('end', () => resolve(data));
    fontStream.on('error', reject);

    const glyph = fs.createReadStream(inputFile);
    glyph.metadata = { unicode: ['\uE001'], name: 'cak-icon' };
    fontStream.write(glyph);
    fontStream.end();
  });

  console.log('SVG font generated, length:', svgFont.length);

  const ttf = svg2ttf(svgFont, {});
  console.log('TTF generated, length:', ttf.buffer.length);

  const woff = ttf2woff(ttf.buffer);
  const woffPath = path.join(outputDir, 'cak-icons.woff');
  fs.writeFileSync(woffPath, Buffer.from(woff.buffer));
  console.log('WOFF written to:', woffPath);
  console.log('\nDone! Use $(cak-icon) in status bar.');
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
