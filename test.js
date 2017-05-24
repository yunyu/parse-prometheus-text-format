const parsePrometheusTextFormat = require('./index.js');
const fs = require('fs');

var inputStr = fs.readFileSync('testinput.txt', 'utf8');
if (process.argv[2] && process.argv[2] == 'bench') {
    var parsed;
    console.time('parse');
    for (var i = 0; i < 50000; i++) {
        parsed = parsePrometheusTextFormat(inputStr);
    }
    console.timeEnd('parse');
} else {
    console.log(JSON.stringify(parsePrometheusTextFormat(inputStr), null, 4));
}
