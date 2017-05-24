const parsePrometheusTextFormat = require('./index.js');
const fs = require('fs');

var inputStr = fs.readFileSync('testinput.txt', 'utf8');
if (process.argv[2] && process.argv[2] == 'bench') {
    var parsed;
    console.time('parse');
    for (let i = 0; i < 50000; ++i) {
        parsed = parsePrometheusTextFormat(inputStr);
    }
    console.timeEnd('parse');
    var stringified = JSON.stringify(parsed, null, 4); // Multiple lines for fair comparison
    console.time('json-parse');
    for (let i = 0; i < 50000; ++i) {
        parsed = JSON.parse(stringified);
    }
    console.timeEnd('json-parse');
} else {
    console.log(JSON.stringify(parsePrometheusTextFormat(inputStr), null, 4));
}
