const fs = require('fs');
const splitLines = require('split-lines');

const STATE_NAME = 0;
const STATE_STARTOFLABELNAME = 1;
const STATE_ENDOFNAME = 2;
const STATE_VALUE = 3;
const STATE_ENDOFLABELS = 4;
const STATE_LABELNAME = 5;
const STATE_LABELVALUEQUOTE = 6;
const STATE_LABELVALUEEQUALS = 7;
const STATE_LABELVALUE = 8;
const STATE_LABELVALUESLASH = 9;
const STATE_NEXTLABEL = 10;
const ERR_MSG = 'Invalid line: ';

var metricsFile = fs.readFileSync('metrics', 'utf8');
console.time('parse');
var convertedMetrics = parse(metricsFile);
console.timeEnd('parse');
// console.log(JSON.stringify(convertedMetrics, null, 4));

function parse(metrics) {
    var lines = splitLines(metrics);
    var converted = [];

    var metric;
    var help;
    var type;
    var samples = [];

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        var lineMetric = undefined, lineHelp = undefined, lineType = undefined, lineSample = undefined;
        if (line.length == 0) {
            // ignore blank lines
        } else if (line.startsWith('# ')) {
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
        } else {
            lineSample = parseSampleLine(line);
            lineMetric = lineSample.name;
        }

        if (lineMetric == metric) {
            if (!help && lineHelp) {
                help = lineHelp;
            } else if (!type && lineType) {
                type = lineType;
            }
        }

        var allowedNames = [metric];
        if (type == 'SUMMARY') {
            allowedNames.push(metric + '_count');
            allowedNames.push(metric + '_sum');
        } else if (type == 'HISTOGRAM') {
            allowedNames.push(metric + '_count');
            allowedNames.push(metric + '_sum');
            allowedNames.push(metric + '_bucket');
        }

        if (i + 1 == lines.length || (lineMetric && allowedNames.indexOf(lineMetric) == -1)) {
            if (metric) {
                converted.push({
                    name: metric,
                    help: help,
                    type: type ? type : 'UNTYPED',
                    samples: samples
                });
            }
            metric = lineMetric;
            help = lineHelp ? lineHelp : undefined;
            type = lineType ? lineType : undefined;
            samples = [];
        }
        if (lineSample) {
            samples.push(lineSample);
        }
    }
    return converted;
}

function unescapeHelp(line) {
    var result = '';
    slash = false

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
    // adapted from https://github.com/prometheus/client_python/blob/ce7f2978499dbd24e1028ef8966e50f374f51f5a/prometheus_client/parser.py#L48
    var name = '', labelname = '', labelvalue = '', value = '', labels = undefined;
    var state = STATE_NAME;

    for (var c = 0; c < line.length; c++) {
        var charAt = line.charAt(c);
        if (state == STATE_NAME) {
            if (charAt == '{') {
                state = STATE_STARTOFLABELNAME;
            } else if (charAt == ' ' || charAt == '\t') {
                state = STATE_ENDOFNAME;
            } else {
                name += charAt;
            }
        } else if (state == STATE_ENDOFNAME) {
            if (charAt == ' ' || charAt == '\t') {
                // do nothing
            } else if (charAt == '{') {
                state = STATE_STARTOFLABELNAME;
            } else {
                value += charAt;
                state = STATE_VALUE;
            }
        } else if (state == STATE_STARTOFLABELNAME) {
            if (charAt == ' ' || charAt == '\t') {
                // do nothing
            } else if (charAt == '}') {
                state = STATE_ENDOFLABELS;
            } else {
                labelname += charAt;
                state = STATE_LABELNAME;
            }
        } else if (state == STATE_LABELNAME) {
            if (charAt == '=') {
                state = STATE_LABELVALUEQUOTE;
            } else if (charAt == '}') {
                state = STATE_ENDOFLABELS;
            } else if (charAt == ' ' || charAt == '\t') {
                state = STATE_LABELVALUEEQUALS;
            } else {
                labelname += charAt;
            }
        } else if (state == STATE_LABELVALUEEQUALS) {
            if (charAt == '=') {
                state = STATE_LABELVALUEQUOTE;
            } else if (charAt == ' ' || charAt == '\t') {
                // do nothing
            } else {
                throw ERR_MSG + line;
            }
        } else if (state == STATE_LABELVALUEQUOTE) {
            if (charAt == '"') {
                state = STATE_LABELVALUE;
            } else if (charAt == ' ' || charAt == '\t') {
                // do nothing
            } else {
                throw ERR_MSG + line;
            }
        } else if (state == STATE_LABELVALUE) {
            if (charAt == '\\') {
                state = STATE_LABELVALUESLASH;
            } else if (charAt == '"') {
                if (!labels) {
                    labels = {};
                }
                labels[labelname] = labelvalue;
                labelname = '';
                labelvalue = '';
                state = STATE_NEXTLABEL;
            } else {
                labelvalue += charAt;
            }
        } else if (state == STATE_LABELVALUESLASH) {
            state = STATE_LABELVALUE;
            if (charAt == '\\') {
                labelvalue += '\\';
            } else if (charAt == 'n') {
                labelvalue += '\n';
            } else if (charAt == '"') {
                labelvalue += '"';
            } else {
                labelvalue += ('\\' + charAt);
            }
        } else if (state == STATE_NEXTLABEL) {
            if (charAt == ',') {
                state = STATE_LABELNAME;
            } else if (charAt == '}') {
                state = STATE_ENDOFLABELS;
            } else if (charAt == ' ' || charAt == '\t') {
                // do nothing
            } else {
                throw ERR_MSG + line;
            }
        } else if (state == STATE_ENDOFLABELS) {
            if (charAt == ' ' || charAt == '\t') {
                // do nothing
            } else {
                value += charAt;
                state = STATE_VALUE;
            }
        } else if (state == STATE_VALUE) {
            if (charAt == ' ' || charAt == '\t') {
                break; // timestamps are NOT supported - ignoring
            } else {
                value += charAt;
            }
        }
    }

    return {
        name: name,
        value: value,
        labels: labels
    };
}
