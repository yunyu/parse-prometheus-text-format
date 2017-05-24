const parsePrometheusTextFormat = require('./index.js');
const fs = require('fs');

var inputStr = fs.readFileSync('testinput.txt', 'utf8');
console.log(JSON.stringify(parsePrometheusTextFormat(inputStr), null, 4));
