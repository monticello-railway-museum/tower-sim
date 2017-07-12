const fs = require('fs');
const xlsx = require('xlsx');

const wb = xlsx.readFile('signal netlist.ods');

function mangleForSort(s) {
    if (s === undefined)
        return 'undefined';
    return s.toString().replace(/\d+/g, m => ('00000'+m).substr(-5));
}

function compKey(keyFn) {
    return (a, b) => keyFn(a) < keyFn(b) ? -1 : 1;
}

function doSheet(name) {
    const sheet = wb.Sheets[name];
    if (sheet) {
        let json = xlsx.utils.sheet_to_json(sheet);
        if (name === 'Components') {
            json.forEach(comp => {
                ['1H','2H','3H','4H','5H','6H','7H','8H','9H','10H',
                 'key'].forEach(k => delete comp[k]);
            });
            json = json.filter(x => x.component != null);
            json.sort(compKey(x => mangleForSort(`${x.subnet}/${x.component}`)));
        }
        return json;
    }
}

const ob = {
    comps: doSheet('Components'),
    towerWires: doSheet('Tower wires'),
    caseAWires: doSheet('Case A wires'),
    caseBWires: doSheet('Case B wires'),
    caseCWires: doSheet('Case C wires'),
    crossConnections: doSheet('Cross-connections'),
    levers: doSheet('Tower levers'),
    leverLocking: doSheet('Lever locking'),
    simulation: doSheet('Simulation'),
};

fs.writeFileSync('netlist.json', JSON.stringify(ob, null, 2));
