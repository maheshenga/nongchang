const fs = require('fs');
const path = require('path');

const walkSync = function(dir, filelist) {
  const files = fs.readdirSync(dir);
  filelist = filelist || [];
  files.forEach(function(file) {
    const p = path.join(dir, file);
    if (fs.statSync(p).isDirectory()) {
      filelist = walkSync(p, filelist);
    }
    else {
      if (p.endsWith('.tsx') || p.endsWith('.ts')) {
        filelist.push(p);
      }
    }
  });
  return filelist;
};

const files = walkSync('./src');
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf-8');
  content = content.replace(/兰花/g, '芍药');
  content = content.replace(/春兰/g, '春白芍');
  content = content.replace(/建兰/g, '紫凤朝阳');
  content = content.replace(/墨兰/g, '冠世墨玉');
  content = content.replace(/寒兰/g, '朱砂判');
  content = content.replace(/兰园/g, '芍药园');
  content = content.replace(/兰圃/g, '芍药圃');
  content = content.replace(/野生兰/g, '野生芍药');
  content = content.replace(/品兰/g, '品芍');
  content = content.replace(/兰友/g, '花友');
  fs.writeFileSync(file, content, 'utf-8');
});
console.log('Script done');
