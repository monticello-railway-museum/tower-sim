const React = require('react');
const ReactDOM = require('react-dom');

const netlist = require('./netlist.json');

const levers = require('./levers');
const Sim = require('./sim');

class Lever extends React.Component {
    render() {
        const { name, state, locked, onClick } = this.props;
        return <div>
            {name}
            <input type='checkbox' checked={state === 'reverse'} disabled={locked}
                   onClick={onClick} />
        </div>;
    }
}

class Levers extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            levers: new levers(netlist.leverLocking),
        };
    }

    pullLever(name) {
        const { levers } = this.state;
        levers.pull(name);
        this.setState({ levers });
        if (this.props.onPull)
            this.props.onPull(name, levers.states()[name]);
    }

    render() {
        const { levers } = this.state;
        const states = levers.states();
        const canPull = levers.canPull();
        return <div style={{columnCount: 16}}>
            {levers.names().map(n => (
                 <Lever name={n} state={states[n]} locked={!canPull[n]}
                        onClick={() => this.pullLever(n)} />))}
        </div>;
    }
}

function mangleForSort(s) {
    if (s === undefined)
        return 'undefined';
    return s.toString().replace(/\d+/g, m => ('00000'+m).substr(-5));
}

function mangledCompare(a, b) {
    return mangleForSort(a) < mangleForSort(b) ? -1 : 1;
}

function num(x, units = 'V', d = 2) {
    if (typeof(x) === 'number')
        return `${x.toFixed(d)} ${units}`;
    else
        return 'floating';
}

const circuitColors = [
    '#1b9e77',
    '#d95f02',
    '#7570b3',
    '#e7298a',
    '#66a61e',
    '#e6ab02',
    '#a6761d',
    '#666666',
    // '#660000',
    // '#006600',
    // '#000066',
];

class Turnout extends React.Component {
    render() {
        const { name, comp } = this.props;
        return (
            <span>{name} <input type='range' min='0' max='8'
                value={comp.state} onChange={e => comp.state = e.target.value}/></span>
        );
    }
}

class Switch extends React.Component {
    render() {
        const { name, comp } = this.props;
        return (
            <span style={{paddingRight: '8px'}}>{name}<input type='checkbox'
                checked={comp.state === 'closed'}
                onChange={e => {comp.state = (e.target.checked ? 'closed' : 'open'); e.preventDefault();}}/></span>
        );
    }
}

class Inspector extends React.Component {
    render() {
        const { inspected, inspect } = this.props;
        if (inspected.names) {
            const node = inspected;
            const names = Array.from(node.names).sort(mangledCompare).join(', ');
            return (
                <div>
                  <h2>Node {names}</h2>
                  <p>Voltage: {num(node.circuit.nodeVoltage(node))}</p>
                  <p>Connections:</p>
                  <ul>
                    {Array.from(node.members)
                       .map(m => m.payload)
                       .map(([comp, terminal]) => (
                           <li><InspectLink inspect={inspect} target={comp}>({comp.subnet}) {comp.name} {terminal}</InspectLink></li>
                       ))}
                  </ul>
                </div>
            );
        } else {
            const comp = inspected;
            return (
                <div>
                  <h2>Component {comp.name}</h2>
                  <p>Terminals:</p>
                  <ul>
                    {Object.keys(comp.terminals).sort(mangledCompare)
                       .map(t => {
                           const node = comp.terminals[t].shared;
                           const names = Array.from(node.names).sort(mangledCompare).join(', ');
                           return (
                               <li><InspectLink inspect={inspect} target={node}>
                                 {t}: Node {names}: {node.circuit ? num(node.circuit.nodeVoltage(node)) : 'unconnected'}
                               </InspectLink></li>
                           );
                       })}
                  </ul>
                </div>
            );
        }
    }
}

class InspectLink extends React.Component {
    render() {
        const { inspect, target, children } = this.props;
        return (
            <span style={{cursor: 'pointer'}} onClick={() => inspect(target)}>{children}</span>
        );
    }
}

class Top extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            time: 0,
            sim: new Sim(),
            wireFilter: '',
            inspected: null,
        }
        let nextColor = 0;
        this.wires = new Map();
        this.circuitColors = new Map();
        for (let node of this.state.sim.visited) {
            if (!this.circuitColors.has(node.circuit))
                this.circuitColors.set(node.circuit, circuitColors[nextColor++]);
            for (let name of node.names) {
                if (this.wires.has(name)) {
                    this.wires.set(name, 'multiple');
                } else {
                    this.wires.set(name, {
                        node,
                        circuit: node.circuit,
                        color: this.circuitColors.get(node.circuit),
                    });
                }
            }
        }
        this.wireNames = Array.from(this.wires.keys()).sort(mangledCompare);

        this.inspect = target => {
            this.setState({inspected: target})
            this.topElement.scrollIntoView();
        };
    }

    componentDidMount() {
        this.tid = setTimeout(() => this.sim(), 100);
    }

    componentWillUnmount() {
    }

    sim() {
        let { time, sim } = this.state;
        time += 0.1;
        sim.sim(time);
        this.setState({ time, sim });
        this.tid = setTimeout(() => this.sim(), 100);
    }

    render() {
        const { time, sim, inspected } = this.state;
        const psus = [ ];

        function voltage(wire) {
            if (wire === 'multiple')
                return 'multiple';
            else if (wire === undefined)
                return 'undefined'
            else
                return num(wire.circuit.nodeVoltage(wire.node));
        }

        const renderWire = (n) => {
            const wire = this.wires.get(n);
            return (
                <div style={{color: wire.color}}>
                  <InspectLink inspect={this.inspect} target={wire.node}>
                    {n}: <div style={{float: 'right'}}>{voltage(wire)}</div>
                  </InspectLink>
                </div>
            );
        }

        let wireFilterFn = n => true;
        if (this.state.wireFilter) {
            try {
                const filterRe = new RegExp(this.state.wireFilter);
                wireFilterFn = n => n && n.match(filterRe);
            } catch (e) {}
        }

        for (let psu of sim.psus) {
            for (let chan of psu.channels) {
                const chanN = psu.terminals[chan.negative];
                psus.push(
                    <div style={{color: this.circuitColors.get(chanN.circuit())}}>
                      {psu.name} {chan.negative} {chan.positive}: <span style={{float: 'right'}}>{num(chan.current, 'A')}</span>
                    </div>
                );
            }
        }

        return (
            <div>
              <div style={{background: 'white', position: 'fixed', top: '0px', left: '0px', padding: '10px'}}>
                <Levers onPull={(name, state) => sim.components[`Tower/LVR-${name}`].state = state}/>
                <div>
                  <Turnout name="switch 6" comp={sim.components['Sim/SIM-6SCC']}/>
                switch 9 <input type='range' min='0' max='1'/>
                switch 10 <input type='range' min='0' max='1'/>
                  <Turnout name="switch 12" comp={sim.components['Sim/SIM-12SCC']}/>
                </div>
                <div>
                  <Switch name="1AR" comp={sim.components['Sim/SIM-1ARSW']}/>
                  <Switch name="2TR" comp={sim.components['Sim/SIM-2TRSW']}/>
                  <Switch name="6TR" comp={sim.components['Sim/SIM-6TRSW']}/>
                  <Switch name="9-10TPR" comp={sim.components['Sim/SIM-9-10TPRSW']}/>
                  <Switch name="12TPR" comp={sim.components['Sim/SIM-12TPRSW']}/>
                  <Switch name="14ATR" comp={sim.components['Sim/SIM-14ATRSW']}/>
                  <Switch name="14BTR" comp={sim.components['Sim/SIM-14BTRSW']}/>
                  <Switch name="16APR" comp={sim.components['Sim/SIM-16APRSW']}/>
                </div>
              </div>
              <div ref={top => this.topElement = top} style={{height: '80px'}}/>
              {inspected && (<Inspector inspect={this.inspect} inspected={inspected}/>)}
              <p><b>PSUs:</b></p>
              <div style={{columnCount: 4}}>{psus}</div>
              <p><b>Relays:</b></p>
              <div style={{columnCount: 4}}>
                {Array.from(sim.activeComponents)
                   .filter(c => c.type === 'relay')
                   .sort((a, b) => mangleForSort(a.name) < mangleForSort(b.name) ? -1 : 1)
                   .map(c => <div>
                        <InspectLink inspect={this.inspect} target={c}>{c.name}</InspectLink>:
                        <div style={{float: 'right'}}><span style={((c.lastStateChange || -3) + 2 > time) ? {fontWeight: 'bold'} : {}}>{c.state}</span></div></div>)}
              </div>
              <p><b>Wire voltages:</b> <input type="text" placeholder="filter regex" value={this.state.wireFilter} onChange={e => this.setState({wireFilter: e.target.value})}/></p>
              <div style={{columnCount: 4}}>
                {this.wireNames.filter(wireFilterFn).map(renderWire)}
              </div>
            </div>
        );
    }
}

ReactDOM.render(
    <Top />,
    document.getElementById('root')
);
