const fs = require('fs');
const yauzl = require('yauzl');
const pptxPath = String.raw`c:\Users\31663\.trae-cn\attachments\6ab3cb6f0dd9182f2abcb0ff\c55547be-961c-4db7-a24c-03e117f7284e_806464e3-5aa5-4739-8a61-f182ee1ee3bc_《地理信息系统设计与实现》-第六章.pptx`;

yauzl.open(pptxPath, { lazyEntries: true }, (err, z) => {
  if (err) { console.error(err.message); process.exit(1); }
  const slides = {};
  z.on('entry', (e) => {
    if (/ppt[\\/]slides[\\/]slide\d+\.xml$/.test(e.fileName)) {
      z.openReadStream(e, (err, rs) => {
        let buf = '';
        rs.on('data', (d) => (buf += d));
        rs.on('end', () => {
          const n = parseInt(e.fileName.match(/slide(\d+)\.xml/)[1]);
          slides[n] = buf;
          z.readEntry();
        });
      });
    } else {
      z.readEntry();
    }
  });
  z.on('end', () => {
    const out = [];
    Object.keys(slides).sort((a, b) => a - b).forEach((n) => {
      const xml = slides[n];
      const m = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
      const texts = m.map((x) => x.replace(/<[^>]+>/g, '')).filter((t) => t.trim());
      out.push('=== Slide ' + n + ' ===');
      out.push(...texts);
      out.push('');
    });
    fs.writeFileSync(String.raw`D:\temporarydeskpro\geo_course\_ppt_text.txt`, out.join('\n'), 'utf-8');
    console.log('slides:', Object.keys(slides).length);
  });
  z.readEntry();
});
