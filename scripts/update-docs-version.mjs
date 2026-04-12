/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Get version from arguments or environment variable
const version = process.argv[2] || process.env.NEW_VERSION;

if (!version) {
  console.error('Error: No version provided.');
  process.exit(1);
}

const getMarkdownFiles = (dir) => {
  const files = fs.readdirSync(path.join(rootDir, dir));
  return files
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(dir, f));
};

const docsToUpdate = [
  'README.md',
  ...getMarkdownFiles('docs'),
];

docsToUpdate.forEach(relativePath => {
  const filePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(filePath)) {
    console.warn(`Warning: File ${filePath} not found.`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace vX.Y.Z patterns. 
  // Specifically targeting the banner format: vX.Y.Z READY
  const newContent = content.replace(/v\d+\.\d+\.\d+/, `v${version}`);
  
  if (content !== newContent) {
    fs.writeFileSync(filePath, newContent);
    console.log(`Updated version to v${version} in ${relativePath}`);
  } else {
    console.log(`No version change needed in ${relativePath}`);
  }
});
