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

/*
Notes:
* No external modules (deep object equality) or ES6 (Object.assign) for performance reasons
* Empty line handling is slightly looser than the original implementation.
* Everything else should be similarly strict.
*/

var ERR_MSG = 'Invalid line: ';

module.exports = function (metrics) {
    var SUMMARY_TYPE = 'SUMMARY';
    var HISTOGRAM_TYPE = 'HISTOGRAM';

    var lines = metrics.split('\n'); // Prometheus format defines UNIX endings
    var converted = [];

    var metric, help, type, samples = [];

    for (var i = 0; i < lines.length; ++i) {
        var line = lines[i].trim();
        var lineMetric = null, lineHelp = null, lineType = null, lineSample = null;
        if (line.length === 0) {
            // ignore blank lines
        } else if (line.startsWith('# ')) { // process metadata lines
            var lineData = line.substring(2);
            var instr = null;
            if (lineData.startsWith('HELP ')) {
                instr = 1;
            } else if (lineData.startsWith('TYPE ')) {
                instr = 2;
            }
            if (instr) {
                lineData = lineData.substring(5);
                var spaceIndex = lineData.indexOf(' ');
                if (spaceIndex !== -1) { // expect another token
                    lineMetric = lineData.substring(0, spaceIndex);
                    var remain = lineData.substring(spaceIndex + 1);
                    if (instr === 1) { // HELP
                        lineHelp = unescapeHelp(remain); // remain could be empty
                    } else { // TYPE
                        if (remain.indexOf(' ') !== -1) {
                            throw ERR_MSG + line;
                        }
                        lineType = remain.toUpperCase();
                    }
                } else {
                    throw ERR_MSG + line;
                }
            }
            // 100% pure comment line, ignore
        } else { // process sample lines
            lineSample = parseSampleLine(line);
            lineMetric = lineSample.name;
        }

        if (lineMetric === metric) { // metadata always has same name
            if (!help && lineHelp) {
                help = lineHelp;
            } else if (!type && lineType) {
                type = lineType;
            }
        }

        // different types allow different suffixes
        var suffixedCount = metric + '_count';
        var suffixedSum = metric + '_sum';
        var suffixedBucket = metric + '_bucket';
        var allowedNames = [metric];
        if (type === SUMMARY_TYPE || type === HISTOGRAM_TYPE) {
            allowedNames.push(suffixedCount);
            allowedNames.push(suffixedSum);
        }
        if (type === HISTOGRAM_TYPE) {
            allowedNames.push(suffixedBucket);
        }

        // encountered new metric family or end of input
        if (i + 1 === lines.length || (lineMetric && allowedNames.indexOf(lineMetric) === -1)) {
            // write current
            if (metric) {
                if (type === SUMMARY_TYPE) {
                    samples = flattenMetrics(samples, 'quantiles', 'quantile', 'value');
                } else if (type === HISTOGRAM_TYPE) {
                    samples = flattenMetrics(samples, 'buckets', 'le', 'bucket');
                }
                converted.push({
                    name: metric,
                    help: help ? help : '',
                    type: type ? type : 'UNTYPED',
                    metrics: samples
                });
            }
            // reset for new metric family
            metric = lineMetric;
            help = lineHelp ? lineHelp : null;
            type = lineType ? lineType : null;
            samples = [];
        }
        if (lineSample) {
            // key is not called value in official implementation if suffixed count, sum, or bucket
            if (lineSample.name !== metric) {
                if (type === SUMMARY_TYPE || type === HISTOGRAM_TYPE) {
                    if (lineSample.name === suffixedCount) {
                        lineSample.count = lineSample.value;
                    } else if (lineSample.name === suffixedSum) {
                        lineSample.sum = lineSample.value;
                    }
                }
                if (type === HISTOGRAM_TYPE && lineSample.name === suffixedBucket) {
                    lineSample.bucket = lineSample.value;
                }
                delete lineSample.value;
            }
            delete lineSample.name;
            // merge into existing sample if labels are deep equal
            var samplesLen = samples.length;
            var lastSample = samplesLen === 0 ? null : samples[samplesLen - 1];
            if (lastSample && shallowObjectEquals(lineSample.labels, lastSample.labels)) {
                delete lineSample.labels;
                for (var key in lineSample) {
                    lastSample[key] = lineSample[key];
                }
            } else {
                samples.push(lineSample);
            }
        }
    }

    return converted;
}

function shallowObjectEquals(obj1, obj2) {
    if (!obj1 || !obj2) {
        return obj1 === obj2;
    }
    if (obj1 === obj2) {
        return true;
    }
    var obj1Keys = Object.keys(obj1);
    if (obj1Keys.length !== Object.keys(obj2).length) {
        return false;
    }
    for (var i = 0; i < obj1Keys.length; ++i) {
        var key = obj1Keys[i];
        if (obj1[key] !== obj2[key]) {
            return false;
        }
    }
    return true;
}

function flattenMetrics(metrics, groupName, keyName, valueName) {
    var flattened = null;
    for (var i = 0; i < metrics.length; ++i) {
        var sample = metrics[i];
        if (sample.labels && sample.labels[keyName] && sample[valueName]) {
            if (!flattened) {
                flattened = {};
                flattened[groupName] = {};
            }
            flattened[groupName][sample.labels[keyName]] = sample[valueName];
        } else if (!sample.labels && sample.count && sample.sum) {
            flattened.count = sample.count;
            flattened.sum = sample.sum;
        }
    }
    if (flattened) {
        return [flattened];
    } else {
        return metrics;
    }
}

// adapted from https://github.com/prometheus/client_python/blob/0.0.19/prometheus_client/parser.py
function unescapeHelp(line) {
    var result = '';
    slash = false;

    for (var c = 0; c < line.length; ++c) {
        var char = line.charAt(c);
        if (slash) {
            if (char === '\\') {
                result += '\\';
            } else if (char === 'n') {
                result += '\n';
            } else {
                result += ('\\' + char);
            }
            slash = false;
        } else {
            if (char === '\\') {
                slash = true;
            } else {
                result += char;
            }
        }
    }

    if (slash) {
        result += '\\';
    }

    return result;
}

function parseSampleLine(line) {
    var STATE_NAME = 0;
    var STATE_STARTOFLABELNAME = 1;
    var STATE_ENDOFNAME = 2;
    var STATE_VALUE = 3;
    var STATE_ENDOFLABELS = 4;
    var STATE_LABELNAME = 5;
    var STATE_LABELVALUEQUOTE = 6;
    var STATE_LABELVALUEEQUALS = 7;
    var STATE_LABELVALUE = 8;
    var STATE_LABELVALUESLASH = 9;
    var STATE_NEXTLABEL = 10;

    var name = '', labelname = '', labelvalue = '', value = '', labels = undefined;
    var state = STATE_NAME;

    for (var c = 0; c < line.length; ++c) {
        var char = line.charAt(c);
        if (state === STATE_NAME) {
            if (char === '{') {
                state = STATE_STARTOFLABELNAME;
            } else if (char === ' ' || char === '\t') {
                state = STATE_ENDOFNAME;
            } else {
                name += char;
            }
        } else if (state === STATE_ENDOFNAME) {
            if (char === ' ' || char === '\t') {
                // do nothing
            } else if (char === '{') {
                state = STATE_STARTOFLABELNAME;
            } else {
                value += char;
                state = STATE_VALUE;
            }
        } else if (state === STATE_STARTOFLABELNAME) {
            if (char === ' ' || char === '\t') {
                // do nothing
            } else if (char === '}') {
                state = STATE_ENDOFLABELS;
            } else {
                labelname += char;
                state = STATE_LABELNAME;
            }
        } else if (state === STATE_LABELNAME) {
            if (char === '=') {
                state = STATE_LABELVALUEQUOTE;
            } else if (char === '}') {
                state = STATE_ENDOFLABELS;
            } else if (char === ' ' || char === '\t') {
                state = STATE_LABELVALUEEQUALS;
            } else {
                labelname += char;
            }
        } else if (state === STATE_LABELVALUEEQUALS) {
            if (char === '=') {
                state = STATE_LABELVALUEQUOTE;
            } else if (char === ' ' || char === '\t') {
                // do nothing
            } else {
                throw ERR_MSG + line;
            }
        } else if (state === STATE_LABELVALUEQUOTE) {
            if (char === '"') {
                state = STATE_LABELVALUE;
            } else if (char === ' ' || char === '\t') {
                // do nothing
            } else {
                throw ERR_MSG + line;
            }
        } else if (state === STATE_LABELVALUE) {
            if (char === '\\') {
                state = STATE_LABELVALUESLASH;
            } else if (char === '"') {
                if (!labels) {
                    labels = {};
                }
                labels[labelname] = labelvalue;
                labelname = '';
                labelvalue = '';
                state = STATE_NEXTLABEL;
            } else {
                labelvalue += char;
            }
        } else if (state === STATE_LABELVALUESLASH) {
            state = STATE_LABELVALUE;
            if (char === '\\') {
                labelvalue += '\\';
            } else if (char === 'n') {
                labelvalue += '\n';
            } else if (char === '"') {
                labelvalue += '"';
            } else {
                labelvalue += ('\\' + char);
            }
        } else if (state === STATE_NEXTLABEL) {
            if (char === ',') {
                state = STATE_LABELNAME;
            } else if (char === '}') {
                state = STATE_ENDOFLABELS;
            } else if (char === ' ' || char === '\t') {
                // do nothing
            } else {
                throw ERR_MSG + line;
            }
        } else if (state === STATE_ENDOFLABELS) {
            if (char === ' ' || char === '\t') {
                // do nothing
            } else {
                value += char;
                state = STATE_VALUE;
            }
        } else if (state === STATE_VALUE) {
            if (char === ' ' || char === '\t') {
                break; // timestamps are NOT supported - ignoring
            } else {
                value += char;
            }
        }
    }

    return {
        name: name,
        value: value,
        labels: labels
    };
}
