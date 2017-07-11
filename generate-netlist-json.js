const fs = require('fs');
const xlsx = require('xlsx');

const wb = xlsx.readFile('signal netlist.ods');

const ob = {
    comps: xlsx.utils.sheet_to_json(wb.Sheets['Components']),
    towerWires: xlsx.utils.sheet_to_json(wb.Sheets['Tower wires']),
    caseAWires: xlsx.utils.sheet_to_json(wb.Sheets['Case A wires']),
    caseBWires: xlsx.utils.sheet_to_json(wb.Sheets['Case B wires']),
    caseCWires: xlsx.utils.sheet_to_json(wb.Sheets['Case C wires']),
    crossConnections: xlsx.utils.sheet_to_json(wb.Sheets['Cross-connections']),
    levers: xlsx.utils.sheet_to_json(wb.Sheets['Tower levers']),
    leverLocking: xlsx.utils.sheet_to_json(wb.Sheets['Lever locking']),
    simulation: xlsx.utils.sheet_to_json(wb.Sheets['Simulation']),
};

fs.writeFileSync('netlist.json', JSON.stringify(ob));
