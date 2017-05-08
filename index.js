const fs = require('fs');
const splitLines = require('split-lines');

var metrics = fs.readFileSync('metrics', 'utf8');
var lines = splitLines(metrics);

for (let line of lines) {
    line = line.trim();
    if (line.length == 0) {
        // ignore blank lines
    } else if (line.charAt(0) == '#') {

    } else {
        console.log(parseSampleLine(line));
    }
}

function parseSampleLine(line) {
    var name = '';
    var labelname = '';
    var labelvalue = '';
    var value = '';
    var labels = new Map();

    var state = 'name';

    for (var c = 0; c < line.length; c++) {
        var charAt = line.charAt(c);
        if (state == 'name') {
            if (charAt == '{') {
                state = "startoflabelname";
            } else if (charAt == ' ' || charAt == '\t') {
                state = "endofname";
            } else {
                name += charAt;
            }
        } else if (state == "endofname") {
            if (charAt == ' ' || charAt == '\t') {
                // do nothing
            } else if (charAt == '{') {
                state = "startoflabelname";
            } else {
                value += charAt;
                state = "value";
            }
        } else if (state == "startoflabelname") {
            if (charAt == ' ' || charAt == '\t') {
                // do nothing
            } else if (charAt == '}') {
                state = "endoflabels";
            } else {
                labelname += charAt;
                state = "labelname";
            }
        } else if (state == "labelname") {
            if (charAt == '=') {
                state = "labelvaluequote";
            } else if (charAt == '}') {
                state = "endoflabels";
            } else if (charAt == ' ' || charAt == '\t') {
                state = "labelvalueequals";
            } else {
                labelname += charAt;
            }
        } else if (state == "labelvalueequals") {
            if (charAt == '=') {
                state = "labelvaluequote";
            } else if (charAt == ' ' || charAt == '\t') {
                // do nothing
            } else {
                throw "Invalid line: " + line;
            }
        } else if (state == "labelvaluequote") {
            if (charAt == '"') {
                state = "labelvalue";
            } else if (charAt == ' ' || charAt == '\t') {
                // do nothing
            } else {
                throw "Invalid line: " + line;
            }
        } else if (state == "labelvalue") {
            if (charAt == '\\') {
                state = "labelvalueslash";
            } else if (charAt == '"') {
                labels.set(labelname, labelvalue);
                labelname = '';
                labelvalue = '';
                state = "nextlabel";
            } else {
                labelvalue += charAt;
            }
        } else if (state == "labelvalueslash") {
            state = "labelvalue";
            if (charAt == '\\') {
                labelvalue += '\\';
            } else if (charAt == 'n') {
                labelvalue += '\n';
            } else if (charAt == '"') {
                labelvalue += '"';
            } else {
                labelvalue += ('\\' + charAt);
            }
        } else if (state == "nextlabel") {
            if (charAt == ',') {
                state = "labelname";
            } else if (charAt == '}') {
                state = "endoflabels";
            } else if (charAt == ' ' || charAt == '\t') {
                // do nothing
            } else {
                throw "Invalid line: " + line;
            }
        } else if (state == "endoflabels") {
            if (charAt == ' ' || charAt == '\t') {
                // do nothing
            } else {
                value += charAt;
                state = "value";
            }
        } else if (state == "value") {
            if (charAt == ' ' || charAt == '\t') {
                break; // timestamps are NOT supported - ignoring
            } else {
                value += charAt;
            }
        }
    }

    return {
        name: name,
        labelname: labelname,
        labelvalue: labelvalue,
        value: value,
        labels: labels
    };
}