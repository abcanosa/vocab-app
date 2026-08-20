const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'src', 'app.jsx')],
  bundle: true,
  minify: true,
  sourcemap: true,
  outfile: path.join(publicDir, 'bundle.js'),
  jsx: 'automatic',
  loader: { '.js': 'jsx' },
  target: ['chrome100', 'firefox100', 'safari15', 'edge100'],
});

const indexHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<title>Vocab Cards</title>
<link rel="stylesheet" href="/styles.css" />
</head>
<body>
<div id="root"></div>
<script src="/bundle.js"></script>
</body>
</html>
`;

fs.writeFileSync(path.join(publicDir, 'index.html'), indexHtml);

console.log('Frontend built to public/bundle.js and public/index.html');
