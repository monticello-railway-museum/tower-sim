const Circuit = require('./circuit');

const netlist = require('./netlist.json');

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

    setCircuit(circuit) {
        if (this.shared.circuit)
            throw new Error('node circuit already set');
        this.shared.circuit = circuit;
    }

    circuit() {
        return this.shared.circuit;
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

    resistor(nodeA, nodeB, value) {
        if (nodeA && nodeB) {
            const circuit = nodeA.circuit();
            if (nodeB.circuit() !== circuit)
                throw new Error('resistor across different circuits');
            if (circuit)
                circuit.resistor(nodeA.shared, nodeB.shared, value);
        }
    }

    voltageSource(key, nodeNeg, nodePos, value) {
        if (nodeNeg && nodePos) {
            const circuit = nodePos.circuit();
            if (nodeNeg.circuit() !== circuit)
                throw new Error('voltage source across different circuits');
            if (circuit)
                circuit.voltageSource(key, nodeNeg.shared, nodePos.shared, value);
        }
    }

    currentSource(nodeNeg, nodePos, value) {
        if (nodeNeg && nodePos) {
            const circuit = nodePos.circuit();
            if (nodeNeg.circuit() !== circuit)
                throw new Error('voltage source across different circuits');
            if (circuit)
                circuit.currentSource(nodeNeg.shared, nodePos.shared, value);
        }
    }

    nodeVoltage(node) {
        if (node) {
            const circuit = node.circuit();
            if (circuit)
                return circuit.nodeVoltage(node.shared);
        }
    }

    voltageSourceCurrent(key, nodeNeg) {
        if (nodeNeg) {
            const circuit = nodeNeg.circuit();
            if (circuit)
                return circuit.voltageSourceCurrent(key);
        }
    }

    fixupNodes() { }
    prepare() { }
    walk(visit, terminal) { }
    preSolve(time) { }
    postSolve(time) { }
}

class PowerSupply extends Component {
    constructor(props) {
        super(props);
        this.channels = this.channels.map(([neg, pos, v]) => ({
            negative: neg,
            positive: pos,
            voltage: v,
        }));
    }

    walk(visit, terminal) {
        for (let chan of this.channels) {
            if (terminal === chan.negative)
                visit(this.terminals[chan.positive]);
            if (terminal === chan.positive)
                visit(this.terminals[chan.negative]);
        }
    }

    preSolve(time) {
        for (let chan of this.channels)
            this.voltageSource(chan, this.terminals[chan.negative], this.terminals[chan.positive], chan.voltage);
    }

    postSolve(time) {
        for (let chan of this.channels) {
            chan.current = this.voltageSourceCurrent(chan, this.terminals[chan.negative]);
            chan.power = chan.voltage * chan.current;
        }
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

class Resistor extends Component {
    constructor(props) {
        super(props);
    }
    
    walk(visit, terminal) {
        visit(this.terminals['+']);
        visit(this.terminals['-']);
    }

    preSolve(time) {
        this.resistor(this.terminals['-'], this.terminals['+'], this.resistance);
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

    prepare() {
        if (this.volts == null)
            this.volts = 10;
        if (this.watts == null)
            this.watts = 2;
        this.resistance = this.volts / (this.watts / this.volts);
        this.onThreshold = this.watts / this.volts / 20;
    }

    preSolve(time) {
        this.resistor(this.terminals['-'], this.terminals['+'], this.resistance);
    }

    postSolve(time) {
        const voltsP = this.nodeVoltage(this.terminals['+']);
        const voltsN = this.nodeVoltage(this.terminals['-']);
        if (voltsP != null && voltsN != null) {
            const amps = (voltsP - voltsN) / this.resistance;
            this.current = amps;
            this.on = (Math.abs(this.current) > this.onThreshold);
            this.power = this.current * (voltsP - voltsN);
        }
    }
}

class Switch extends Component {
    constructor(props, state) {
        super(props);
        if (state != null)
            this.state = state;
        if (this.state == null)
            this.state = 'open';
        this.contacts = [ ];
    }

    walk(visit, terminal) {
        const match = terminal.match(/^\d+/);
        console.log('switch walk', this.name, terminal, match);
        if (match) {
            visit(this.terminals[`${match[0]}H`]);
            visit(this.terminals[`${match[0]}F`]);
            visit(this.terminals[`${match[0]}B`]);
        }
    }

    prepare() {
        this.forEachTerminal((term, node) => {
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
        this.contacts.sort((a, b) => a.number - b.number);
    }

    preSolve(time) {
        if (this.state === 'closed') {
            this.contacts.forEach(c => {
                this.resistor(c.heel, c.front, closed);
            });
        } else {
            this.contacts.forEach(c => {
                this.resistor(c.heel, c.back, closed);
            });
        }
    }
}

class SimSCC extends Switch {
    constructor(props, state = 0) {
        super(props, state);
    }

    prepare() {
        super.prepare();
        const { contacts: c } = this;
        this.stateMap = [
            [ { from: c[0].heel, to: c[0].front },
              { from: c[1].heel, to: c[1].front },
              { from: c[2].heel, to: c[2].front },
              { from: c[3].heel, to: c[3].front } ],
            [ { from: c[1].heel, to: c[1].front },
              { from: c[2].heel, to: c[2].front },
              { from: c[3].heel, to: c[3].front } ],
            [ { from: c[2].heel, to: c[2].front },
              { from: c[3].heel, to: c[3].front } ],
            [ { from: c[0].heel, to: c[0].back },
              { from: c[2].heel, to: c[2].front },
              { from: c[3].heel, to: c[3].front } ],
            [ { from: c[0].heel, to: c[0].back },
              { from: c[1].heel, to: c[1].back },
              { from: c[2].heel, to: c[2].front },
              { from: c[3].heel, to: c[3].front } ],
            [ { from: c[0].heel, to: c[0].back },
              { from: c[1].heel, to: c[1].back },
              { from: c[3].heel, to: c[3].front } ],
            [ { from: c[0].heel, to: c[0].back },
              { from: c[1].heel, to: c[1].back } ],
            [ { from: c[0].heel, to: c[0].back },
              { from: c[1].heel, to: c[1].back },
              { from: c[2].heel, to: c[2].back } ],
            [ { from: c[0].heel, to: c[0].back },
              { from: c[1].heel, to: c[1].back },
              { from: c[2].heel, to: c[2].back },
              { from: c[3].heel, to: c[3].back } ],
        ]
    }

    preSolve(time) {
        for (let c of this.stateMap[this.state])
            this.resistor(c.from, c.to, closed);
    }
}


class Lever extends Component {
    constructor(props, state = 'normal') {
        super(props);
        this.state = state;
        this.pairs = [ ];
        for (let lever of netlist.levers) {
            if (lever.lever !== this.name)
                continue;
            if (lever.state)
                this.pairs.push(lever);
        }
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
    }

    preSolve(time) {
        for (let pair of this.pairs) {
            if (this.state === pair.state)
                this.resistor(this.terminals[pair.from], this.terminals[pair.to], closed);
        }
    }
}

function maybeSchedule(comp, time, bias, state) {
    if (comp.schedule && comp.schedule.bias === bias && comp.schedule.state === state)
            return;
    comp.schedule = { time, bias, state };
}

class Relay extends Component {
    constructor(props, state = 'down') {
        super(props);
        this.state = state;
        this.bias = 'forward';
        this.coilResistance = this.resistance || 100;
        this.contacts = [ ];
        this.polarContacts = [ ];
        this.pickupTime = parseFloat(this.pickupTime) || 0.3;
        this.dropTime = parseFloat(this.dropTime) || 0.05;
    }

    walk(visit, terminal) {
        if (terminal === 'COIL+')
            visit(this.terminals['COIL-']);
        if (terminal === 'COIL-')
            visit(this.terminals['COIL+']);
        const match = terminal.match(/^(\d+)[HFB]/);
        console.log('relay walk', terminal, match);
        if (match) {
            visit(this.terminals[`${match[1]}H`]);
            visit(this.terminals[`${match[1]}F`]);
            visit(this.terminals[`${match[1]}B`]);
        }
        const polarMatch = terminal.match(/^(\d+)[P+-]/);
        console.log('relay walk', terminal, match);
        if (polarMatch) {
            visit(this.terminals[`${polarMatch[1]}P`]);
            visit(this.terminals[`${polarMatch[1]}+`]);
            visit(this.terminals[`${polarMatch[1]}-`]);
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
            const match2 = term.match(/^(\d+)P$/);
            if (match2) {
                this.polarContacts.push({
                    number: parseInt(match2[1]),
                    heel: node,
                    positive: this.terminals[`${match2[1]}+`],
                    negative: this.terminals[`${match2[1]}-`],
                });
            }
        });
    }

    preSolve(time) {
        this.resistor(this.coilP, this.coilN, this.coilResistance);
        if (this.state === 'down') {
            this.contacts.forEach(c => {
                this.resistor(c.heel, c.back, closed);
            });
        } else if (this.state === 'up') {
            this.contacts.forEach(c => {
                this.resistor(c.heel, c.front, closed);
            });
            this.polarContacts.forEach(c => {
                if (this.bias === 'forward')
                    this.resistor(c.heel, c.positive, closed);
                else
                    this.resistor(c.heel, c.negative, closed);
            });
        }
    }

    postSolve(time) {
        const voltsP = this.nodeVoltage(this.coilP);
        const voltsN = this.nodeVoltage(this.coilN);
        if (voltsP != null && voltsN != null) {
            const amps = (voltsP - voltsN) / this.coilResistance;
            this.current = amps;
            const bias = amps >= 0 ? 'forward' : 'reverse';
            //console.log(this.name, this.subnet, 'coil+ volts', voltsP, 'coil- volts', voltsN, 'ohms', this.coilResistance, 'current', amps);
            let pickup = Math.abs(amps) > 0.005;
            if (this.subtype === 'biased neutral')
                pickup = amps > 0.005;
            if (pickup) {
                if (this.state === 'down')
                    maybeSchedule(this, time + this.pickupTime, bias, 'up');
                else if (this.bias !== bias)
                    maybeSchedule(this, time + this.dropTime, bias, 'down');
                else
                    this.schedule = null;
            } else {
                if (this.state === 'up')
                    maybeSchedule(this, time + this.dropTime, bias, 'down');
                else
                    this.schedule = null;
            }
        }
    }
}

const componentTypeMap = {
    'bus': Bus,
    'button': Switch,
    'fuse': Bus,
    'lever': Lever,
    'light': Light,
    'power supply': PowerSupply,
    'relay': Relay,
    'resistor': Resistor,
    'sim-scc': SimSCC,
    'switch': Switch,
    'test terminal': Bus,
};

class Sim {
    constructor() {
        this.components = { };
        this.circuits = [ ];

        this.visited = new Set();
        this.activeComponents = new Set();

        this.psus = [ ];

        const { components, circuits, psus, visited, activeComponents } = this;

        function spawnComponent(comp) {
            const type = componentTypeMap[comp.type] || Component;
            const config = Object.assign({ }, {
                name: comp.component,
                type: comp.type,
                subtype: comp.subtype,
                subnet: comp.subnet,
                location: comp.location,
                resistance: comp.resistance ? parseFloat(comp.resistance) : undefined,
                terminals: { },
            }, comp.config ? JSON.parse(comp.config) : { });
            components[`${comp.subnet}/${comp.component}`] = new type(config);
        }

        for (let comp of netlist.comps)
            spawnComponent(comp);

        
function getComponentTerminal(subnet, spec) {
    let match = "";
    for (let name in components) {
        const comp = components[name];
        if (subnet === comp.subnet && spec.substr(0, comp.name.length) === comp.name) {
            if (comp.name.length > match.length)
                match = comp.name;
        }
    }
    if (match !== "") {
        return [ components[`${subnet}/${match}`], spec.substr(match.length).trim() ];
    } else {
        console.warn('Unknown component', subnet, spec);
        components[`${subnet}/${spec}`] = new Component({
            name: spec,
            subnet: subnet,
            type: 'terminal',
            terminals: { },
        });
        return [ components[`${subnet}/${spec}`], '' ];
    }

}

        function wireComponent(wire, fromSubnet, toSubnet = fromSubnet) {
            const [ fromComp, fromTerm ] =
                  getComponentTerminal(fromSubnet || wire.fromSubnet, wire.from);
            const [ toComp, toTerm ] =
                  getComponentTerminal(toSubnet || wire.toSubnet, wire.to);
            if (wire.splice) {
                const [ spliceComp, spliceTerm ] =
                      getComponentTerminal(wire.spliceSubnet, wire.splice);
                spliceComp.terminals[spliceTerm] = fromComp.terminals[fromTerm];
                fromComp.terminals[fromTerm] = undefined;
            }
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

        for (let wire of netlist.towerWires)
            wireComponent(wire, 'Tower');
        for (let wire of netlist.caseAWires)
            wireComponent(wire, 'Case A');
        for (let wire of netlist.caseCWires)
            wireComponent(wire, 'Case C');
        for (let wire of netlist.crossConnections) {
            if (!wire.resistance) {
                wireComponent(wire);
            } else {
                const name = `WIRE-${wire.gauge}GA-${wire.length}FT-${wire.fromSubnet}/${wire.from}-${wire.toSubnet}/${wire.to}`;
                spawnComponent({
                    component: name,
                    subnet: 'Interconnects',
                    type: 'resistor',
                    resistance: wire.resistance,
                });
                wireComponent({ from: wire.from, to: `${name} +` }, wire.fromSubnet, 'Interconnects');
                wireComponent({ from: wire.to, to: `${name} -` }, wire.toSubnet, 'Interconnects');
            }
        }
        for (let row of netlist.simulation) {
            if (row.component) {
                spawnComponent(Object.assign({
                    component: row.name,
                    subnet: row.fromSubnet,
                    type: row.component,
                    config: row.config,
                }));
            } else if (row.from) {
                wireComponent(row);
            }
        }

        for (let name in components) {
            components[name].fixupNodes();
            if (components[name].type === 'power supply')
                psus.push(components[name]);
        }

        for (let psu of psus) {
            for (let chan of psu.channels) {
                const psuN = psu.terminals[chan.negative];

                let circuit = psuN.circuit();
                if (!circuit) {
                    circuit = new Circuit(psuN.shared);
                    circuits.push(circuit);
                }

                function visit(node) {
                    if (!node || visited.has(node.shared))
                        return;
                    visited.add(node.shared);
                    node.setCircuit(circuit);
                    for (let { payload: [ comp, term ] } of node.shared.members) {
                        console.log(comp.subnet, comp.name, term);
                        activeComponents.add(comp);
                        comp.walk(visit, term);
                    }
                }
                visit(psuN);
            }
        }

        for (let comp of activeComponents) {
            comp.prepare();
        }
    }

    sim(time) {
        const { activeComponents, circuits, visited } = this;

        console.log(`*** sim ${time.toFixed(2)} ***`);

        for (let comp of activeComponents) {
            if (comp.schedule && comp.schedule.time <= time) {
                console.log(comp.name, comp.schedule);
                comp.bias = comp.schedule.bias;
                comp.state = comp.schedule.state;
                comp.lastStateChange = comp.schedule.time;
                comp.schedule = null;
            }
        }

        for (let circuit of circuits)
            circuit.reset();
        for (let comp of activeComponents) {
            comp.preSolve(time);
        }
        //console.log('pre solve');
    //    console.log(circuit);

        // for (let node of circuit.nodes.keys()) {
        //     circuit.resistor(circuit.groundNode, node, 1e-3);
        // }
        for (let circuit of circuits)
            circuit.solve();
        //console.log('post solve');
    //    console.log(circuit);
        for (let node of visited) {
            // console.log('node', Array.from(node.names).join(' '));
            // console.log('  ', circuit.nodeVoltage(node.nodeNum), 'volts');
        }
        for (let comp of activeComponents) {
            comp.postSolve(time);
        }
    }
}

module.exports = Sim;


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

// const s = new Sim();

// let t = 0.0;

// for (; t < 0.5; t += 0.05) {
//     s.sim(t);
// }

// s.components['Tower/LVR-1'].state = 'reverse';

// for (; t < 1.0; t += 0.05) {
//     s.sim(t);
// }

// s.components['Tower/LVR-6'].state = 'reverse';

// for (; t < 1.5; t += 0.05) {
//     s.sim(t);
// }

// s.components['Tower/LVR-12'].state = 'reverse';

// for (; t < 2.0; t += 0.05) {
//     s.sim(t);
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

