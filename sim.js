const xlsx = require('xlsx');

const wb = xlsx.readFile('/home/bdowning/Documents/signal netlist.ods');

const comps = xlsx.utils.sheet_to_json(wb.Sheets['Components']);
const wires = xlsx.utils.sheet_to_json(wb.Sheets['Tower wires']);
const levers = xlsx.utils.sheet_to_json(wb.Sheets['Tower levers']);

const components = { };

const allNodes = new Set();

class Node {
    constructor(payload) {
        this.shared = {
            names: new Set(),
            members: new Set([this]),
        };
        allNodes.add(this.shared);
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
        allNodes.delete(otherShared);
    }
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
        components[spec] = {
            name: spec,
            type: 'terminal',
            terminals: { },
        };
        return [ components[spec], '' ];
    }

}

for (let comp of comps) {
    components[comp.component] = {
        name: comp.component,
        type: comp.type,
        subnet: comp.subnet,
        location: comp.location,
        terminals: { },
    };
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

wireComponent({ from: 'N10-TWR MAIN', to: 'N10-CASEA' });
wireComponent({ from: 'B10-TWR MAIN', to: '2TR COIL+' });
wireComponent({ from: 'N10-TWR MAIN', to: '2TR COIL-' });
wireComponent({ from: 'B10-TWR MAIN', to: '6TR COIL+' });
wireComponent({ from: 'N10-TWR MAIN', to: '6TR COIL-' });
wireComponent({ from: 'B10-TWR MAIN', to: '14ATR COIL+' });
wireComponent({ from: 'N10-TWR MAIN', to: '14ATR COIL-' });
wireComponent({ from: 'B10-TWR MAIN', to: '14BTR COIL+' });
wireComponent({ from: 'N10-TWR MAIN', to: '14BTR COIL-' });

wireComponent({ from: 'B10-TWR MAIN', to: '6TPSR COIL+' });
wireComponent({ from: 'B10-TWR MAIN', to: '6NWPPR COIL+' });
wireComponent({ from: 'N10-TWR MAIN', to: '6NWPPR COIL-' });

for (let name in components) {
    const comp = components[name];
    if (comp.type === 'bus') {
        let firstNode = null;
        for (let term in comp.terminals) {
            const node = comp.terminals[term];
            if (firstNode) {
                firstNode.join(node);
            } else {
                firstNode = node;
            }
        }
    }

    if (comp.type === 'relay') {
        comp.bias = 'forward';
        comp.state = 'down';
        comp.schedule = null;
        for (let i = 1; i <= 10; ++i) {
            // if (comp.terminals[`${i}H`] && comp.terminals[`${i}B`]) {
            //     comp.terminals[`${i}H`].join(comp.terminals[`${i}B`]);
            // }
            // if (comp.terminals['COIL-'] && comp.terminals['COIL+']) {
            //     comp.terminals['COIL-'].join(comp.terminals['COIL+']);
            // }
        }
    }

    if (comp.type === 'lever') {
        comp.state = 'normal';
        comp.pairs = { };
    }
}

for (let lever of levers) {
    console.log(lever);
    const comp = components[lever.lever];
    if (lever.state) {
        comp.pairs[lever.from] = {
            when: lever.state,
            join: lever.to,
        };
        comp.pairs[lever.to] = {
            when: lever.state,
            join: lever.from,
        };
    }
}

const craggP = components['CRAGG'].terminals['+'];
const craggN = components['CRAGG'].terminals['-'];

function maybeSchedule(comp, time, bias, state) {
    if (comp.schedule && comp.schedule.bias === bias && comp.schedule.state === state)
            return;
    comp.schedule = { time, bias, state };
}

const visited = new Map();

function sim(time) {
    console.log(`*** sim ${time.toFixed(2)} ***`);

    for (let name in components) {
        const comp = components[name];
        if (comp.schedule && comp.schedule.time <= time) {
            console.log(comp.name, comp.schedule);
            comp.bias = comp.schedule.bias;
            comp.state = comp.schedule.state;
            comp.schedule = null;
        }
    }

    visited.clear();

    for (let name in components) {
        let comp = components[name];
        if (comp.type === 'light') {
            comp.pathImp = Infinity;
        }

        if (comp.type === 'relay') {
            comp.pathImp = Infinity;
        }
    }

    const imp = visit(craggN.shared, 0, time);

    for (let name in components) {
        let comp = components[name];
        if (comp.type === 'light') {
            if (comp.pathImp < Infinity) {
                if (comp.state !== 'lit') {
                    console.log('light', comp.name, 'is lit');
                    comp.state = 'lit';
                }
            } else {
                if (comp.state !== 'out') {
                    console.log('light', comp.name, 'is out');
                    comp.state = 'out';
                }
            }
        }

        if (comp.type === 'relay') {
            if (comp.pathImp < Infinity) {
                if (comp.state === 'down') {
                    maybeSchedule(comp, time + 0.1, comp.coilBias, 'up');
                } else if (comp.state === 'up' && comp.bias !== comp.coilBias) {
                    maybeSchedule(comp, time + 0.1, 'forward', 'down');
                } else {
                    comp.schedule = null;
                }
            } else {
                if (comp.state === 'up') {
                    maybeSchedule(comp, time + 0.1, 'forward', 'down');
                } else {
                    comp.schedule = null;
                }
            }
        }
    }

    return imp;
}

function visit(node, impedance, time) {
    if (node === craggP.shared)
        return impedance;
    if (visited.has(node))
        return visited.get(node);
    //console.log('visit', Array.from(node.names).join(' '), impedance);
    visited.set(node, Infinity);
    let minImpedance = Infinity;
    for (let { payload: [ comp, term ] } of node.members) {
        if (comp.type === 'light') {
            let pair;
            if (term === '+')
                pair = '-';
            if (term === '-')
                pair = '+';
            if (pair) {
                const nextNode = comp.terminals[pair];
                if (nextNode) {
                    const imp = visit(nextNode.shared, impedance + 100, time);
                    if (minImpedance > imp)
                        minImpedance = imp;
                    if (comp.pathImp > imp)
                        comp.pathImp = imp;
                }
            }
        }

        if (comp.type === 'lever') {
            const pair = comp.pairs[term];
            if (pair && comp.state === pair.when) {
                const nextNode = comp.terminals[pair.join];
                if (nextNode) {
                    const imp = visit(nextNode.shared, impedance, time);
                    if (minImpedance > imp)
                        minImpedance = imp;
                }
            }

        }

        if (comp.type === 'relay') {
            let pair;
            let coil = false;
            let coilImp = 0;
            if (term.substr(-1) === 'H') {
                if (comp.state === 'down') {
                    pair = term.substr(0, term.length - 1) + 'B';
                } else {
                    pair = term.substr(0, term.length - 1) + 'F';
                }
            } else if (term.substr(-1) === 'F' && comp.state === 'up') {
                pair = term.substr(0, term.length - 1) + 'H';
            } else if (term.substr(-1) === 'B' && comp.state === 'down') {
                pair = term.substr(0, term.length - 1) + 'H';
            } else if (term === 'COIL+') {
                pair = 'COIL-';
                coil = 'reverse';
                coilImp = 100;
            } else if (term === 'COIL-') {
                pair = 'COIL+';
                coil = 'forward';
                coilImp = 100;
            }
            if (pair) {
                const nextNode = comp.terminals[pair];
                if (nextNode) {
                    // console.log('relay', comp.name, term, pair);
                    const imp = visit(nextNode.shared, impedance + coilImp, time);
                    if (minImpedance > imp)
                        minImpedance = imp;
                    if (coil && comp.pathImp > imp) {
                        comp.pathImp = imp;
                        comp.coilBias = coil;
                    }
                }
            }
        }
    }
    visited.set(node, minImpedance);
    // console.log('visit return', minImpedance);
    return minImpedance;
}

let t = 0.0;

for (; t < 0.5; t += 0.05) {
    sim(t);
}

components['LVR-1'].state = 'reverse';

for (; t < 1.0; t += 0.05) {
    sim(t);
}

components['LVR-6'].state = 'reverse';

for (; t < 1.5; t += 0.05) {
    sim(t);
}

components['LVR-12'].state = 'reverse';

for (; t < 2.0; t += 0.05) {
    sim(t);
}

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

