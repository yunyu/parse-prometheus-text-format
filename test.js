/**
 * @license
 * Copyright 2017 Yunyu Lin. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// TODO: use real test framework
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
