const fs = require('fs');

const mockPath = 'src/data/mockData.js';
let content = fs.readFileSync(mockPath, 'utf8');

const dipJson = fs.readFileSync('diploma_json.json', 'utf8');

// The file ends with:
//   }
// ];
// export const examPrompts = { ...

content = content.replace(/\n\];\s*export const examPrompts/, ',\n' + dipJson.replace(/^/gm, '  ') + '\n];\nexport const examPrompts');

fs.writeFileSync(mockPath, content);
console.log('Injection successful');
