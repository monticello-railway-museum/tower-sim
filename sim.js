const xlsx = require('xlsx');

const wb = xlsx.readFile('/home/bdowning/Documents/signal netlist.ods');

const comps = xlsx.utils.sheet_to_json(wb.Sheets['Components']);
const wires = xlsx.utils.sheet_to_json(wb.Sheets['Tower wires']);
const levers = xlsx.utils.sheet_to_json(wb.Sheets['Tower levers']);

const components = { };

const closed = 1e-6;

class Node {
    constructor(payload) {
        this.shared = {
            names: new Set(),
            members: new Set([this]),
        };
        this.payload = payload;
    }

    addName(name) {
        this.shared.names.add(name);
    }

    join(other) {
        if (other.shared === this.shared)
            return;
        for (let name of other.shared.names) {
            this.shared.names.add(name);
        }
        const otherShared = other.shared;
        for (let member of otherShared.members) {
            this.shared.members.add(member);
            member.shared = this.shared;
        }
    }

    nodeNum() {
        return this.shared.nodeNum;
    }
}

class Component {
    constructor(props) {
        Object.assign(this, props);
        this.terminals = { };
        this.schedule = null;
    }

    forEachTerminal(fn) {
        for (let term in this.terminals) {
            fn(term, this.terminals[term]);
        }
    }

    fixupNodes() { }
    prepare() { }
    walk(visit, terminal) { }
    preSolve(circuit) { }
    postSolve(circuit) { }
}

class PowerSupply extends Component {
    constructor(props, voltage = 10) {
        super(props);
        this.voltage = voltage;
    }

    walk(visit, terminal) {
        visit(this.terminals['+']);
        visit(this.terminals['-']);
    }

    preSolve(circuit) {
        circuit.voltageSource(0, this.terminals['-'].nodeNum(), this.terminals['+'].nodeNum(), this.voltage);
    }
}

class Bus extends Component {
    fixupNodes() {
        let firstNode = null;
        this.forEachTerminal((term, node) => {
            if (firstNode) {
                firstNode.join(node);
            } else {
                firstNode = node;
            }
        });
    }
}

class Light extends Component {
    constructor(props) {
        super(props);
    }

    walk(visit, terminal) {
        visit(this.terminals['+']);
        visit(this.terminals['-']);
    }
}

class Switch extends Component {
    constructor(props, state = 'open') {
        super(props);
        this.state = state;
    }

    walk(visit, terminal) {
        visit(this.terminals['+']);
        visit(this.terminals['-']);
    }
}

class Lever extends Component {
    constructor(props, state = 'normal') {
        super(props);
        this.state = state;
        this.pairs = [ ];
    }

    walk(visit, terminal) {
        for (let pair of this.pairs) {
            if (terminal === pair.from)
                visit(this.terminals[pair.to]);
            if (terminal === pair.to)
                visit(this.terminals[pair.from]);
        }
    }

    prepare() {
        for (let lever of levers) {
            if (lever.lever !== this.name)
                continue;
            if (lever.state)
                this.pairs.push(lever);
        }
    }

    preSolve(circuit) {
        for (let pair of this.pairs) {
            const fromNum = this.terminals[pair.from].nodeNum();
            const toNum = this.terminals[pair.to].nodeNum();
            if (this.state === pair.state && fromNum != null && toNum != null) {
                circuit.resistor(fromNum, toNum, closed);
            }
        }
    }
}

class Relay extends Component {
    constructor(props, state = 'down') {
        super(props);
        this.state = state;
        this.coilResistance = 100;
        this.contacts = [ ];
    }

    walk(visit, terminal) {
        if (terminal === 'COIL+')
            visit(this.terminals['COIL-']);
        if (terminal === 'COIL-')
            visit(this.terminals['COIL+']);
        const match = terminal.match(/^\d+/);
        console.log('relay walk', terminal, match);
        if (match) {
            visit(this.terminals[`${match[0]}H`]);
            visit(this.terminals[`${match[0]}F`]);
            visit(this.terminals[`${match[0]}B`]);
        }
    }

    prepare() {
        this.forEachTerminal((term, node) => {
            if (term === 'COIL+') {
                this.coilP = node;
            } else if (term === 'COIL-') {
                this.coilN = node;
            }

            const match = term.match(/^(\d+)H$/);
            if (match) {
                this.contacts.push({
                    number: parseInt(match[1]),
                    heel: node,
                    front: this.terminals[`${match[1]}F`],
                    back: this.terminals[`${match[1]}B`],
                });
            }
        });
    }

    preSolve(circuit) {
        if (this.coilP && this.coilP.nodeNum() != null
            && this.coilN && this.coilN.nodeNum() != null) {
            circuit.resistor(this.coilP.nodeNum(), this.coilN.nodeNum(), this.coilResistance);
        }
        if (this.state === 'down') {
            this.contacts.forEach(c => {
                console.log('  ', c);
                if (c.heel.nodeNum() != null && c.back && c.back.nodeNum() != null)
                    circuit.resistor(c.heel.nodeNum(), c.back.nodeNum(), closed);
            });
        } else if (this.state === 'up') {
            this.contacts.forEach(c => {
                console.log('  ', c);
                if (c.heel.nodeNum() != null && c.front && c.front.nodeNum() != null)
                    circuit.resistor(c.heel.nodeNum(), c.front.nodeNum(), closed);
            });
        }
    }

    postSolve(circuit) {
        if (this.coilP && this.coilP.nodeNum() != null
            && this.coilN && this.coilN.nodeNum() != null) {
            const voltsP = circuit.nodeVoltage(this.coilP.nodeNum());
            const voltsN = circuit.nodeVoltage(this.coilN.nodeNum());
            const amps = (voltsP - voltsN) / this.coilResistance;
            console.log(this.name, 'coil+ volts', voltsP, 'coil- volts', voltsN, 'current', amps);
        }
    }
}

const componentTypeMap = {
    relay: Relay,
    button: Switch,
    bus: Bus,
    lever: Lever,
    light: Light,
    'power supply': PowerSupply,
};

for (let comp of comps) {
    const type = componentTypeMap[comp.type] || Component;
    components[comp.component] = new type({
        name: comp.component,
        type: comp.type,
        subnet: comp.subnet,
        location: comp.location,
        terminals: { },
    });
}

function getComponentTerminal(spec) {
    let match = "";
    for (let comp in components) {
        if (spec.substr(0, comp.length) === comp) {
            if (comp.length > match.length)
                match = comp;
        }
    }
    if (match !== "") {
        return [ components[match], spec.substr(match.length).trim() ];
    } else {
        components[spec] = new Component({
            name: spec,
            type: 'terminal',
            terminals: { },
        });
        return [ components[spec], '' ];
    }

}

function wireComponent(wire) {
    const [ fromComp, fromTerm ] = getComponentTerminal(wire.from);
    const [ toComp, toTerm ] = getComponentTerminal(wire.to);
    // console.log(`from <${fromComp.name}> ${fromTerm}`);
    // console.log(`  to <${toComp.name}> ${toTerm}`);
    if (!fromComp.terminals[fromTerm])
        fromComp.terminals[fromTerm] = new Node([fromComp, fromTerm]);
    if (!toComp.terminals[toTerm])
        toComp.terminals[toTerm] = new Node([toComp, toTerm]);
    fromComp.terminals[fromTerm].join(toComp.terminals[toTerm]);
    const node = fromComp.terminals[fromTerm];
    node.addName(wire.signal);
    // node.addName(`<${fromComp.name} ${fromTerm}>`);
    // node.addName(`<${toComp.name} ${toTerm}>`);
}

for (let wire of wires) {
    wireComponent(wire);
}

for (let name in components) {
    components[name].fixupNodes();
}

const craggN = components['CRAGG'].terminals['-'];

function maybeSchedule(comp, time, bias, state) {
    if (comp.schedule && comp.schedule.bias === bias && comp.schedule.state === state)
            return;
    comp.schedule = { time, bias, state };
}

let numNodes = 0;
const visited = new Set();
const activeComponents = new Set();

function visit(node) {
    if (!node || visited.has(node.shared))
        return;
    visited.add(node.shared);
    // console.log('visit', node);
    node.shared.nodeNum = numNodes++;
    for (let { payload: [ comp, term ] } of node.shared.members) {
        console.log(comp.name, term);
        activeComponents.add(comp);
        comp.walk(visit, term);
    }
}
visit(craggN);

for (let comp of activeComponents) {
    comp.prepare();
}
console.log(numNodes);

const Circuit = require('./circuit');

let circuit = new Circuit(numNodes, 1);
for (let comp of activeComponents) {
    comp.preSolve(circuit);
}
for (let i = 1; i < numNodes; ++i) {
    //circuit.resistor(0, i, 1e9);
}
console.log('pre solve');
circuit.solve();
console.log('post solve');
for (let node of visited) {
    console.log('node', Array.from(node.names).join(' '));
    console.log('  ', circuit.nodeVoltage(node.nodeNum), 'volts');
}
console.log('psu current', circuit.voltageSourceCurrent(0));
for (let comp of activeComponents) {
    comp.postSolve(circuit);
}


// function sim(time) {
//     console.log(`*** sim ${time.toFixed(2)} ***`);

//     for (let name in components) {
//         const comp = components[name];
//         if (comp.schedule && comp.schedule.time <= time) {
//             console.log(comp.name, comp.schedule);
//             comp.bias = comp.schedule.bias;
//             comp.state = comp.schedule.state;
//             comp.schedule = null;
//         }
//     }

//     visited.clear();

//     for (let name in components) {
//         let comp = components[name];
//         if (comp.type === 'light') {
//             comp.pathImp = Infinity;
//         }

//         if (comp.type === 'relay') {
//             comp.pathImp = Infinity;
//         }
//     }

//     const imp = visit(craggN.shared, 0, time);

//     for (let name in components) {
//         let comp = components[name];
//         if (comp.type === 'light') {
//             if (comp.pathImp < Infinity) {
//                 if (comp.state !== 'lit') {
//                     console.log('light', comp.name, 'is lit');
//                     comp.state = 'lit';
//                 }
//             } else {
//                 if (comp.state !== 'out') {
//                     console.log('light', comp.name, 'is out');
//                     comp.state = 'out';
//                 }
//             }
//         }

//         if (comp.type === 'relay') {
//             if (comp.pathImp < Infinity) {
//                 if (comp.state === 'down') {
//                     maybeSchedule(comp, time + 0.1, comp.coilBias, 'up');
//                 } else if (comp.state === 'up' && comp.bias !== comp.coilBias) {
//                     maybeSchedule(comp, time + 0.1, 'forward', 'down');
//                 } else {
//                     comp.schedule = null;
//                 }
//             } else {
//                 if (comp.state === 'up') {
//                     maybeSchedule(comp, time + 0.1, 'forward', 'down');
//                 } else {
//                     comp.schedule = null;
//                 }
//             }
//         }
//     }

//     return imp;
// }

// function visit(node, impedance, time) {
//     if (node === craggP.shared)
//         return impedance;
//     if (visited.has(node))
//         return visited.get(node);
//     //console.log('visit', Array.from(node.names).join(' '), impedance);
//     visited.set(node, Infinity);
//     let minImpedance = Infinity;
//     for (let { payload: [ comp, term ] } of node.members) {
//         if (comp.type === 'light') {
//             let pair;
//             if (term === '+')
//                 pair = '-';
//             if (term === '-')
//                 pair = '+';
//             if (pair) {
//                 const nextNode = comp.terminals[pair];
//                 if (nextNode) {
//                     const imp = visit(nextNode.shared, impedance + 100, time);
//                     if (minImpedance > imp)
//                         minImpedance = imp;
//                     if (comp.pathImp > imp)
//                         comp.pathImp = imp;
//                 }
//             }
//         }

//         if (comp.type === 'lever') {
//             const pair = comp.pairs[term];
//             if (pair && comp.state === pair.when) {
//                 const nextNode = comp.terminals[pair.join];
//                 if (nextNode) {
//                     const imp = visit(nextNode.shared, impedance, time);
//                     if (minImpedance > imp)
//                         minImpedance = imp;
//                 }
//             }

//         }

//         if (comp.type === 'relay') {
//             let pair;
//             let coil = false;
//             let coilImp = 0;
//             if (term.substr(-1) === 'H') {
//                 if (comp.state === 'down') {
//                     pair = term.substr(0, term.length - 1) + 'B';
//                 } else {
//                     pair = term.substr(0, term.length - 1) + 'F';
//                 }
//             } else if (term.substr(-1) === 'F' && comp.state === 'up') {
//                 pair = term.substr(0, term.length - 1) + 'H';
//             } else if (term.substr(-1) === 'B' && comp.state === 'down') {
//                 pair = term.substr(0, term.length - 1) + 'H';
//             } else if (term === 'COIL+') {
//                 pair = 'COIL-';
//                 coil = 'reverse';
//                 coilImp = 100;
//             } else if (term === 'COIL-') {
//                 pair = 'COIL+';
//                 coil = 'forward';
//                 coilImp = 100;
//             }
//             if (pair) {
//                 const nextNode = comp.terminals[pair];
//                 if (nextNode) {
//                     // console.log('relay', comp.name, term, pair);
//                     const imp = visit(nextNode.shared, impedance + coilImp, time);
//                     if (minImpedance > imp)
//                         minImpedance = imp;
//                     if (coil && comp.pathImp > imp) {
//                         comp.pathImp = imp;
//                         comp.coilBias = coil;
//                     }
//                 }
//             }
//         }
//     }
//     visited.set(node, minImpedance);
//     // console.log('visit return', minImpedance);
//     return minImpedance;
// }

// let t = 0.0;

// for (; t < 0.5; t += 0.05) {
//     sim(t);
// }

// components['LVR-1'].state = 'reverse';

// for (; t < 1.0; t += 0.05) {
//     sim(t);
// }

// components['LVR-6'].state = 'reverse';

// for (; t < 1.5; t += 0.05) {
//     sim(t);
// }

// components['LVR-12'].state = 'reverse';

// for (; t < 2.0; t += 0.05) {
//     sim(t);
// }

// for (let node of allNodes.values()) {
//     if (node.wireLocs.length === 1)
//         continue;
//     console.log('node', Array.from(node.names).join(' '));
//     for (let { payload: [ comp, term ] } of node.members) {
//         console.log(`  connected to <${comp.name}> ${term}`);
//     }
//     node.wireLocs.sort();
//     for (let wireLoc of node.wireLocs) {
//         console.log('  wire: ', wireLoc);
//     }
// }

