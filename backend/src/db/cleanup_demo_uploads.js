const fs = require('fs');
const path = require('path');
const env = require('../config/env');

function removeFiles(directory) {
  if (!fs.existsSync(directory)) return 0;

  let deleted = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      deleted += removeFiles(fullPath);
      if (fs.readdirSync(fullPath).length === 0) {
        fs.rmdirSync(fullPath);
      }
    } else {
      fs.unlinkSync(fullPath);
      deleted += 1;
    }
  }
  return deleted;
}

const uploadDir = path.resolve(process.cwd(), env.uploadDir);
fs.mkdirSync(uploadDir, { recursive: true });

const deletedCount = removeFiles(uploadDir);
console.log(`Cleaned ${deletedCount} uploaded file(s) from ${uploadDir}`);
