const fs = require('fs');
const xlsx = require('xlsx');

const wb = xlsx.readFile('/home/bdowning/Documents/signal netlist.ods');

const ob = {
    comps: xlsx.utils.sheet_to_json(wb.Sheets['Components']),
    towerWires: xlsx.utils.sheet_to_json(wb.Sheets['Tower wires']),
    caseAWires: xlsx.utils.sheet_to_json(wb.Sheets['Case A wires']),
    caseBWires: xlsx.utils.sheet_to_json(wb.Sheets['Case C wires']),
    caseCWires: xlsx.utils.sheet_to_json(wb.Sheets['Case C wires']),
    crossConnections: xlsx.utils.sheet_to_json(wb.Sheets['Cross-connections']),
    levers: xlsx.utils.sheet_to_json(wb.Sheets['Tower levers']),
};

fs.writeFileSync('netlist.json', JSON.stringify(ob));
