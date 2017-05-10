var fs = require('fs');
var splitLines = require('split-lines');
var equal = require('deep-equal');

var SUMMARY_TYPE = 'SUMMARY';
var HISTOGRAM_TYPE = 'HISTOGRAM';

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
var ERR_MSG = 'Invalid line: ';

var metricsFile = fs.readFileSync('metrics', 'utf8');
var convertedMetrics;
console.time('parse');
convertedMetrics = parse(metricsFile);
console.timeEnd('parse');
console.log(JSON.stringify(convertedMetrics, null, 4));

function parse(metrics) {
    var lines = splitLines(metrics);
    var converted = [];

    var metric, help, type, samples = [];

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        var lineMetric = null, lineHelp = null, lineType = null, lineSample = null;
        if (line.length == 0) {
            // ignore blank lines
        } else if (line.startsWith('# ')) { // process metadata lines
            var parts = line.substring(2).split(' ');
            if (parts.length < 3) {
                // do nothing
            } else {
                var instr = parts[0].toUpperCase();
                parts.shift();
                var name = parts[0];
                parts.shift();
                if (instr == 'HELP') {
                    // JS split with limit does not give back remainder, this is easier
                    lineHelp = unescapeHelp(parts.join(' '));
                    lineMetric = name;
                } else if (instr == 'TYPE') {
                    lineType = parts[0].toUpperCase();
                    lineMetric = name;
                }
            }
        } else { // process sample lines
            lineSample = parseSampleLine(line);
            lineMetric = lineSample.name;
        }

        if (lineMetric == metric) { // metadata always has same name
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
        if (type == SUMMARY_TYPE || type == HISTOGRAM_TYPE) {
            allowedNames.push(suffixedCount);
            allowedNames.push(suffixedSum);
        }
        if (type == HISTOGRAM_TYPE) {
            allowedNames.push(suffixedBucket);
        }

        // encountered new metric family or end of input
        if (i + 1 == lines.length || (lineMetric && allowedNames.indexOf(lineMetric) == -1)) {
            // write current
            if (metric) {
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
            if (lineSample.name != metric) {
                if (type == SUMMARY_TYPE || type == HISTOGRAM_TYPE) {
                    if (lineSample.name == suffixedCount) {
                        lineSample.count = lineSample.value;
                    } else if (lineSample.name == suffixedSum) {
                        lineSample.sum = lineSample.value;
                    }
                }
                if (type == HISTOGRAM_TYPE && lineSample.name == suffixedBucket) {
                    lineSample.bucket = lineSample.value;
                }
                delete lineSample.value;
            }
            delete lineSample.name;
            // merge into existing sample if labels are deep equal
            var samplesLen = samples.length;
            var lastSample = samplesLen == 0 ? null : samples[samplesLen - 1];
            if (lastSample && equal(lineSample.labels, lastSample.labels)) {
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

// adapted from https://github.com/prometheus/client_python/blob/0.0.19/prometheus_client/parser.py
function unescapeHelp(line) {
    var result = '';
    slash = false;

    for (var c = 0; c < line.length; c++) {
        var char = line.charAt(c);
        if (slash) {
            if (char == '\\') {
                result += '\\';
            } else if (char == 'n') {
                result += '\n';
            } else {
                result += ('\\' + char);
            }
            slash = false;
        } else {
            if (char == '\\') {
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
    var name = '', labelname = '', labelvalue = '', value = '', labels = undefined;
    var state = STATE_NAME;

    for (var c = 0; c < line.length; c++) {
        var char = line.charAt(c);
        if (state == STATE_NAME) {
            if (char == '{') {
                state = STATE_STARTOFLABELNAME;
            } else if (char == ' ' || char == '\t') {
                state = STATE_ENDOFNAME;
            } else {
                name += char;
            }
        } else if (state == STATE_ENDOFNAME) {
            if (char == ' ' || char == '\t') {
                // do nothing
            } else if (char == '{') {
                state = STATE_STARTOFLABELNAME;
            } else {
                value += char;
                state = STATE_VALUE;
            }
        } else if (state == STATE_STARTOFLABELNAME) {
            if (char == ' ' || char == '\t') {
                // do nothing
            } else if (char == '}') {
                state = STATE_ENDOFLABELS;
            } else {
                labelname += char;
                state = STATE_LABELNAME;
            }
        } else if (state == STATE_LABELNAME) {
            if (char == '=') {
                state = STATE_LABELVALUEQUOTE;
            } else if (char == '}') {
                state = STATE_ENDOFLABELS;
            } else if (char == ' ' || char == '\t') {
                state = STATE_LABELVALUEEQUALS;
            } else {
                labelname += char;
            }
        } else if (state == STATE_LABELVALUEEQUALS) {
            if (char == '=') {
                state = STATE_LABELVALUEQUOTE;
            } else if (char == ' ' || char == '\t') {
                // do nothing
            } else {
                throw ERR_MSG + line;
            }
        } else if (state == STATE_LABELVALUEQUOTE) {
            if (char == '"') {
                state = STATE_LABELVALUE;
            } else if (char == ' ' || char == '\t') {
                // do nothing
            } else {
                throw ERR_MSG + line;
            }
        } else if (state == STATE_LABELVALUE) {
            if (char == '\\') {
                state = STATE_LABELVALUESLASH;
            } else if (char == '"') {
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
        } else if (state == STATE_LABELVALUESLASH) {
            state = STATE_LABELVALUE;
            if (char == '\\') {
                labelvalue += '\\';
            } else if (char == 'n') {
                labelvalue += '\n';
            } else if (char == '"') {
                labelvalue += '"';
            } else {
                labelvalue += ('\\' + char);
            }
        } else if (state == STATE_NEXTLABEL) {
            if (char == ',') {
                state = STATE_LABELNAME;
            } else if (char == '}') {
                state = STATE_ENDOFLABELS;
            } else if (char == ' ' || char == '\t') {
                // do nothing
            } else {
                throw ERR_MSG + line;
            }
        } else if (state == STATE_ENDOFLABELS) {
            if (char == ' ' || char == '\t') {
                // do nothing
            } else {
                value += char;
                state = STATE_VALUE;
            }
        } else if (state == STATE_VALUE) {
            if (char == ' ' || char == '\t') {
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
