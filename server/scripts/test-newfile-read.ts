import fs from 'fs';
import path from 'path';

// Quick debug script to see where newfile.txt is and what it contains.
function check() {
  const paths = [
    path.join(__dirname, '..', 'newfile.txt'),
    path.join(__dirname, '..', '..', 'newfile.txt'),
    path.join(__dirname, '..', 'server', 'newfile.txt'),
    'C:\\Users\\Lenovo\\projects\\capstone\\capstone\\newfile.txt',
    'C:\\Users\\Lenovo\\projects\\capstone\\capstone\\server\\newfile.txt'
  ];

  for (const p of paths) {
    const exists = fs.existsSync(p);
    console.log(`Path: ${p} | Exists: ${exists} | Size: ${exists ? fs.statSync(p).size : 0} bytes`);
    if (exists && fs.statSync(p).size > 0) {
      const content = fs.readFileSync(p, 'utf8');
      console.log(`  First 100 chars: ${content.substring(0, 100).replace(/\n/g, '\\n')}`);
      console.log(`  IndexOf 'CN = [': ${content.indexOf('CN = [')}`);
      console.log(`  IndexOf 'CN =': ${content.indexOf('CN =')}`);
      console.log(`  IndexOf 'OS =': ${content.indexOf('OS =')}`);
    }
  }
}

check();
