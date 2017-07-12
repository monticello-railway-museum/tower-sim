const React = require('react');
const ReactDOM = require('react-dom');

const netlist = require('./netlist.json');

const levers = require('./levers');
const Sim = require('./sim');

const Isvg = require('react-inlinesvg');

class Checkbox extends React.Component {
    render() {
        const { label, checked, disabled, onChange } = this.props;
        return (
            <label style={{padding: '3px'}}>
              {label}
              <input type='checkbox' checked={checked} disabled={disabled}
                     onChange={e => { onChange(e.target.checked); e.preventDefault(); }}/>
            </label>
        );
    }
}

class Lever extends React.Component {
    render() {
        const { name, state, locked, onClick, electricLocked, override } = this.props;
        return <div style={electricLocked ? {background: '#ff8888'} : {}}>
            <Checkbox label={name} checked={state === 'reverse'}
                      disabled={!override && (locked || electricLocked)}
                      onChange={onClick}/>
        </div>;
    }
}

class Levers extends React.Component {
    render() {
        const { levers, locks, override, onPull } = this.props;
        const states = levers.states();
        const canPull = override ? [] : levers.canPull();
        return <div style={{display: 'flex', justifyContent: 'space-between'}}>
            {levers.names().map(n => (
                 <Lever name={n} state={states[n]} locked={!canPull[n]}
                        onClick={() => onPull(n)}
                        electricLocked={locks && locks[n]}
                        override={override} />))}
        </div>;
    }
}

function mangleForSort(s) {
    if (s === undefined)
        return 'undefined';
    return s.toString().replace(/\d+/g, m => ('00000'+m).substr(-5));
}

function mangledCompare(key = x => x) {
    return (a, b) => mangleForSort(key(a)) < mangleForSort(key(b)) ? -1 : 1;
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
    '#660000',
    '#006600',
    '#000066',
    '#660066',
    '#666600',
    '#006666',
];

class Turnout extends React.Component {
    render() {
        const { name, comp } = this.props;
        return (
            <span style={{padding: '3px'}}>
              <span style={{paddingRight: '5px'}}>{name}</span>
              <input type='range' min='0' max='8'
                     value={comp.state} onChange={e => comp.state = e.target.value}/>
            </span>
        );
    }
}

class Switch extends React.Component {
    render() {
        const { name, comp } = this.props;
        return (
            <Checkbox label={name}
                      checked={comp.state === 'closed'}
                      onChange={v => comp.state = (v ? 'closed' : 'open')}/>
        );
    }
}

class Inspector extends React.Component {
    render() {
        const { inspected, inspect } = this.props;
        if (inspected.names) {
            const node = inspected;
            const names = Array.from(node.names).sort(mangledCompare()).join(', ');
            return (
                <div>
                  <div style={{color: node.circuit && node.circuit.color}}>
                    <h2>Node {names} <InspectLink inspect={inspect} target={null}>[x]</InspectLink></h2>
                    <p>Voltage: {node.circuit ? num(node.circuit.nodeVoltage(node)) : 'unsimulated'}</p>
                  </div>
                  <p>Connections:</p>
                  <ul>
                    {Array.from(node.members)
                       .map(m => m.payload)
                       .sort(mangledCompare(([comp, terminal]) => `${comp.subnet}/${comp.name}/${terminal}`))
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
                  <h2>Component {comp.name} <InspectLink inspect={inspect} target={null}>[x]</InspectLink></h2>
                  <p>Terminals:</p>
                  <ul>
                    {Object.keys(comp.terminals).sort(mangledCompare())
                       .map(t => {
                           const node = comp.terminals[t].shared;
                           const names = Array.from(node.names).sort(mangledCompare()).join(', ');
                           return (
                               <li style={{color: node.circuit && node.circuit.color}}>
                                 <InspectLink inspect={inspect} target={node}>
                                   {t}: Node {names}: {node.circuit ? num(node.circuit.nodeVoltage(node)) : 'unsimulated'}
                                 </InspectLink>
                               </li>
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

class Relay extends React.Component {
    render() {
        const { comp, time, inspect } = this.props;
        return (
            <div style={{clear: 'right'}}>
              <InspectLink inspect={inspect} target={comp}>{comp.name}</InspectLink>:
              <div style={{float: 'right'}}>
                <span style={{marginRight: '10px'}}>{num(comp.current, 'A', 3)}</span>
                <span style={((comp.lastStateChange || -3) + 2 > time) ? {fontWeight: 'bold'} : {}}>
                  {comp.state}
                </span>
              </div>
            </div>
        );
    }
}

class Light extends React.Component {
    render() {
        const { comp, inspect } = this.props;
        return (
            <div style={{clear: 'right'}}>
              <InspectLink inspect={inspect} target={comp}>{comp.name}</InspectLink>:
              <div style={{float: 'right'}}>
                <span style={{marginRight: '10px'}}>{num(comp.current, 'A', 3)}</span>
                <span style={comp.on ? {fontWeight: 'bold'} : {}}>
                  {comp.on ? 'on' : 'off'}
                </span>
              </div>
            </div>
        );
    }
}

function voltage(wire) {
    if (wire === 'multiple')
        return 'multiple';
    else if (wire === undefined)
        return 'undefined'
    else
        return num(wire.circuit.nodeVoltage(wire.node));
}

class Wire extends React.Component {
    render() {
        const { wire, name, inspect } = this.props;
        return (
            <div style={{color: wire.color, clear: 'right'}}>
              <InspectLink inspect={inspect} target={wire.node}>
                {name}: <div style={{float: 'right'}}>{voltage(wire)}</div>
              </InspectLink>
            </div>
        );
    }
}

class Top extends React.Component {
    constructor(props) {
        super(props);

        const sim = new Sim();

        this.state = {
            sim,
            time: 0,
            wireFilter: '',
            inspected: null,
            locks: { },
            overrideInterlocking: false,
            levers: new levers(netlist.leverLocking),
        }
        let nextColor = 0;
        this.wires = new Map();
        this.circuitColors = new Map();
        for (let node of sim.visited) {
            if (!this.circuitColors.has(node.circuit)) {
                const color = circuitColors[nextColor++];
                this.circuitColors.set(node.circuit, color);
                node.circuit.color = color;
            }
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
        this.wireNames = Array.from(this.wires.keys())
            .sort(mangledCompare());
        this.relays = Array.from(sim.activeComponents)
            .filter(c => c.type === 'relay')
            .sort(mangledCompare(x => x.name));
        this.lights = Array.from(sim.activeComponents)
            .filter(c => c.type === 'light')
            .sort(mangledCompare(x => x.name));

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

    pullLever(name) {
        const { levers, sim } = this.state;
        levers.pull(name, this.state.overrideInterlocking);
        this.setState({ levers });
        sim.components[`Tower/LVR-${name}`].state = levers.states()[name];
    }

    changeOverrideInterlocking(state) {
        const { levers, sim } = this.state;
        this.setState({ overrideInterlocking: state });
        if (!state) {
            levers.reset();
            for (let name in levers.levers)
                sim.components[`Tower/LVR-${name}`].state = levers.states()[name];
        }
    }

    sim() {
        let { time, sim, levers, locks, autoSwitches } = this.state;
        time += 0.1;
        sim.sim(time);
        locks['7'] = sim.components['Tower/FLOOR PB 7'].terminals['1H'].voltage(0) < 5;
        locks['11'] = sim.components['Tower/FLOOR PB 11'].terminals['1H'].voltage(0) < 5;
        locks['13'] = sim.components['Tower/FLOOR PB 13'].terminals['1H'].voltage(0) < 5;
        if (autoSwitches) {
            ['6', '9', '10', '12'].forEach(sw => {
                if (levers.states()[sw] == 'normal' && sim.components[`Sim/SIM-${sw}SCC`].state > 0)
                    sim.components[`Sim/SIM-${sw}SCC`].state--;
                if (levers.states()[sw] == 'reverse' && sim.components[`Sim/SIM-${sw}SCC`].state < 8)
                    sim.components[`Sim/SIM-${sw}SCC`].state++;
            });
        }
        this.setState({ time, sim, locks });
        this.tid = setTimeout(() => this.sim(), 100);
    }

    render() {
        const { time, sim, inspected } = this.state;
        const psus = [ ];
        let totalPower = 0;

        let wireFilterFn = n => false;
        if (this.state.wireFilter) {
            try {
                const filterRe = new RegExp(this.state.wireFilter, 'i');
                wireFilterFn = n => n && n.match(filterRe);
            } catch (e) {}
        }

        for (let psu of sim.psus) {
            for (let chan of psu.channels) {
                const chanN = psu.terminals[chan.negative];
                psus.push(
                    <div style={{color: this.circuitColors.get(chanN.circuit())}}>
                      <InspectLink inspect={this.inspect} target={psu}>
                        {psu.name} {chan.negative} {chan.positive}:
                      </InspectLink>
                      <span style={{float: 'right'}}>{num(chan.voltage)} {num(chan.power, 'W')} {num(chan.current, 'A')}</span>
                    </div>
                );
                totalPower += chan.power;
            }
        }
        psus.push(
            <div style={{fontWeight: 'bold'}}>
              Total System Power:
              <span style={{float: 'right'}}>{num(totalPower, 'W')}</span>
            </div>
        );

        for (let light of this.lights) {
            const offColor = '#4d4d4d';
            let onColor = '#ff3333';
            if (light.name.match(/GKE$/))
                onColor = '#33ff33';
            else if (light.name.match(/[AB]TKE$/))
                onColor = '#eeeeee';
            else if (light.name.match(/[AB]TKE1$/))
                onColor = '#33ff33';
            else if (light.name.match(/WCKE$/))
                onColor = '#ffcc00';
            let num = 1;
            if (light.name === '6TKE')
                num = 2;
            else if (light.name === '9-10TKE')
                num = 3;
            else if (light.name === '12TKE')
                num = 2;
            function maybeClickable(el, name, sw) {
                if (!el.onclick) {
                    if (light.name === name) {
                        el.style.cursor = 'hand';
                        const comp = sim.components[sw];
                        el.onclick = e => comp.state = (comp.state === 'closed') ? 'open' : 'closed';
                    }
                }
            }
            for (let i = 1; i <= num; ++i) {
                const el = document.getElementById(num > 1 ? `${light.name}-${i}` : light.name);
                if (el) {
                    el.lastElementChild.style.fill = light.on ? onColor : offColor;
                    maybeClickable(el, '1ATKE', 'Sim/SIM-1TRSW');
                    maybeClickable(el, '2ATKE', 'Sim/SIM-2TRSW');
                    maybeClickable(el, '6TKE', 'Sim/SIM-6TRSW');
                    maybeClickable(el, '9-10TKE', 'Sim/SIM-9-10TRSW');
                    maybeClickable(el, '12TKE', 'Sim/SIM-12TRSW');
                    maybeClickable(el, '14ATKE', 'Sim/SIM-14ATRSW');
                    maybeClickable(el, '14BTKE', 'Sim/SIM-14BTRSW');
                    maybeClickable(el, '16ATKE', 'Sim/SIM-16APRSW');
                }
            }
        }

        function lightOn(name) {
            return sim.components[`Sim/SIM-${name}`].on;
        }

        function relayUp(name) {
            return sim.components[name].state === 'up';
        }

        function updateSignalState(signal, state) {
            const el = document.getElementById(`sig${signal}-state`);
            if (el)
                el.firstElementChild.textContent = state;
        }

        {
            let state = 'BAD ASPECT';
            if (lightOn('1RGE') && !lightOn('1HGE') && !lightOn('1DGE') && !lightOn('1TMGE'))
                state = 'STOP';
            if (!lightOn('1RGE') && lightOn('1HGE') && !lightOn('1DGE') && !lightOn('1TMGE'))
                state = 'Restricting';
            if (!lightOn('1RGE') && !lightOn('1HGE') && lightOn('1DGE') && !lightOn('1TMGE'))
                state = 'Slow Clear';
            if (!lightOn('1RGE') && !lightOn('1HGE') && lightOn('1DGE') && lightOn('1TMGE'))
                state = 'Clear';
            updateSignalState(1, state);
        }

        {
            let state = 'BAD ASPECT';
            if (lightOn('2ARGE') && !lightOn('2AHGE') && !lightOn('2ADGE') && !lightOn('2BHGE'))
                state = 'STOP';
            if (!lightOn('2ARGE') && lightOn('2AHGE') && !lightOn('2ADGE') && !lightOn('2BHGE'))
                state = 'Approach';
            if (!lightOn('2ARGE') && !lightOn('2AHGE') && lightOn('2ADGE') && !lightOn('2BHGE'))
                state = 'Clear';
            if (lightOn('2ARGE') && !lightOn('2AHGE') && !lightOn('2ADGE') && lightOn('2BHGE'))
                state = 'Restricting';
            updateSignalState(2, state);
        }

        {
            let state = 'BAD ASPECT';
            if (lightOn('3RGE') && !lightOn('3HGE') && !lightOn('3DGE') && lightOn('3MGE'))
                state = 'STOP';
            if (!lightOn('3RGE') && lightOn('3HGE') && !lightOn('3DGE') && lightOn('3MGE'))
                state = 'Approach';
            if (!lightOn('3RGE') && !lightOn('3HGE') && lightOn('3DGE') && lightOn('3MGE'))
                state = 'Clear';
            if (lightOn('3RGE') && !lightOn('3HGE') && lightOn('3DGE') && !lightOn('3MGE'))
                state = 'Restricting';
            updateSignalState(3, state);
        }

        {
            let state = 'BAD ASPECT';
            if (lightOn('4RGE') && !lightOn('4HGE'))
                state = 'STOP';
            if (!lightOn('4RGE') && lightOn('4HGE'))
                state = 'Approach';
            updateSignalState(4, state);
        }

        {
            let state = 'BAD ASPECT';
            if (lightOn('5RGE') && !lightOn('5HGE'))
                state = 'STOP';
            if (!lightOn('5RGE') && lightOn('5HGE'))
                state = 'Approach';
            updateSignalState(5, state);
        }

        {
            let state = 'BAD ASPECT';
            if (lightOn('14AGE') && lightOn('14BGE') && !relayUp('Sim/SIM-14AAR') && !relayUp('Sim/SIM-14BAR'))
                state = 'STOP';
            if (lightOn('14AGE') && lightOn('14BGE') && !relayUp('Sim/SIM-14AAR') && relayUp('Sim/SIM-14BAR'))
                state = 'Restricting';
            if (lightOn('14AGE') && lightOn('14BGE') && relayUp('Sim/SIM-14AAR') && !relayUp('Sim/SIM-14BAR'))
                state = 'Clear';
            updateSignalState(14, state);
        }

        {
            let state = 'BAD ASPECT';
            if (lightOn('15ARGE') && lightOn('15BRGE') && !lightOn('15BHGE') && !lightOn('15BDGE'))
                state = 'STOP';
            if (lightOn('15ARGE') && !lightOn('15BRGE') && lightOn('15BHGE') && !lightOn('15BDGE'))
                state = 'Restricting';
            if (lightOn('15ARGE') && !lightOn('15BRGE') && !lightOn('15BHGE') && lightOn('15BDGE'))
                state = 'Diverging Clear';
            updateSignalState(15, state);
        }

        {
            let state = 'BAD ASPECT';
            if (!lightOn('16AGE') && !lightOn('16BGE'))
                updateSignalState(16, state);
            if (!relayUp('Sim/SIM-16AHMR') && !relayUp('Sim/SIM-16BHMR') && !lightOn('16CRGE'))
                state = 'STOP';
            if (!relayUp('Sim/SIM-16AHMR') && !relayUp('Sim/SIM-16BHMR') && lightOn('16CRGE'))
                state = 'Restricting';
            if (relayUp('Sim/SIM-16AHMR') && !relayUp('Sim/SIM-16BHMR') && !lightOn('16CRGE')) {
                state = 'Approach';
                if (relayUp('Case A/16ADR'))
                    state = 'Clear';
            }
            if (!relayUp('Sim/SIM-16AHMR') && relayUp('Sim/SIM-16BHMR') && !lightOn('16CRGE')) {
                state = 'Diverging Approach';
                if (relayUp('Case A/16BDR'))
                    state = 'Diverging Clear';
            }
            updateSignalState(16, state);
        }

        return (
            <div>
              <div style={{background: 'white',
                           position: 'fixed',
                           top: '0px',
                           left: '0px',
                           padding: '10px',
                           width: '100%',
                           padding: '10px',
                           boxSizing: 'border-box'}}>
                <Levers levers={this.state.levers} locks={this.state.locks}
                        onPull={name => this.pullLever(name)}
                        override={this.state.overrideInterlocking}/>
                <div style={{display: 'flex', justifyContent: 'space-between'}}>
                  <Turnout name="switch 6" comp={sim.components['Sim/SIM-6SCC']}/>
                  <Turnout name="switch 9" comp={sim.components['Sim/SIM-9SCC']}/>
                  <Turnout name="switch 10" comp={sim.components['Sim/SIM-10SCC']}/>
                  <Turnout name="switch 12" comp={sim.components['Sim/SIM-12SCC']}/>
                </div>
                <div>
                  <Switch name="1TR" comp={sim.components['Sim/SIM-1TRSW']}/>
                  <Switch name="6TR" comp={sim.components['Sim/SIM-6TRSW']}/>
                  <Switch name="2TR" comp={sim.components['Sim/SIM-2TRSW']}/>
                  <Switch name="9-10TR" comp={sim.components['Sim/SIM-9-10TRSW']}/>
                  <Switch name="14BTR" comp={sim.components['Sim/SIM-14BTRSW']}/>
                  <Switch name="14ATR" comp={sim.components['Sim/SIM-14ATRSW']}/>
                  <Switch name="12TR" comp={sim.components['Sim/SIM-12TRSW']}/>
                  <Switch name="16APR" comp={sim.components['Sim/SIM-16APRSW']}/>
                </div>
                <div>
                  <Switch name="22HDGPR" comp={sim.components['Sim/SIM-22HDGPRSW']}/>
                  <Switch name="23HDGPR" comp={sim.components['Sim/SIM-23HDGPRSW']}/>
                  <div style={{float: 'right'}}>
                    <span style={sim.components['Tower/1-2-3ASR'].state === 'down' ? {background: '#ff8888'} : {}}>
                      <Switch name="6TE" comp={sim.components['Tower/6TE']}/>
                    </span>
                    <span style={sim.components['Tower/4-5ASR'].state === 'down' ? {background: '#ff8888'} : {}}>
                      <Switch name="9-10TE" comp={sim.components['Tower/9-10TE']}/>
                    </span>
                    <span style={sim.components['Tower/14-15-16ASR'].state === 'down' ? {background: '#ff8888'} : {}}>
                      <Switch name="12TE" comp={sim.components['Tower/12TE']}/>
                    </span>
                    <Switch name="2-3COPB" comp={sim.components['Tower/2-3COPB']}/>
                    <Switch name="14-16COPB" comp={sim.components['Tower/14-16COPB']}/>
                    <span style={sim.components['Tower/14ATKE1'].on ? {background: '#bbbbff'} : {}}>
                      <Switch name="NB" comp={sim.components['Tower/NB PB']}/>
                    </span>
                    <span style={sim.components['Tower/14BTKE1'].on ? {background: '#bbbbff'} : {}}>
                      <Switch name="SB" comp={sim.components['Tower/SB PB']}/>
                    </span>
                  </div>
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between'}}>
                  <div>
                    <Checkbox label="Automatic switch tending"
                              checked={this.state.autoSwitches}
                              onChange={v => this.state.autoSwitches = v}/>
                  </div>
                  <div>
                    <Checkbox label="1 locks 16, not 12"
                              checked={this.state.levers.mods['1lock16']}
                              onChange={v => this.state.levers.mods['1lock16'] = v}/>
                    <Checkbox label="No 9, 10, 12 interlocks"
                              checked={this.state.levers.mods['noSwInterlocks']}
                              onChange={v => this.state.levers.mods['noSwInterlocks'] = v}/>
                    <Checkbox label="Override interlocking"
                              checked={this.state.overrideInterlocking}
                              onChange={v => this.changeOverrideInterlocking(v)}/>
                  </div>
                </div>
              </div>
              <div ref={top => this.topElement = top} style={{height: '140px'}}/>

              {inspected && (<Inspector inspect={this.inspect} inspected={inspected}/>)}

              <Isvg uniquifyIDs={false} src="model-board.svg"/>

              <p><b>PSUs:</b></p>
              <div style={{columnCount: 2}}>{psus}</div>

              <p><b>Lights:</b></p>
              <div style={{columnCount: 4}}>
                {this.lights.map(c => <Light comp={c} inspect={this.inspect}/>)}
              </div>

              <p><b>Relays:</b></p>
              <div style={{columnCount: 4}}>
                {this.relays.map(c => <Relay comp={c} time={time} inspect={this.inspect}/>)}
              </div>

              <p><b>Wire voltages:</b> <input type="text" placeholder="filter regex" value={this.state.wireFilter} onChange={e => this.setState({wireFilter: e.target.value})}/></p>
              <div style={{columnCount: 4}}>
                {this.wireNames.filter(wireFilterFn).map(n => <Wire name={n} wire={this.wires.get(n)} inspect={this.inspect}/>)}
              </div>
            </div>
        );
    }
}

ReactDOM.render(
    <Top />,
    document.getElementById('root')
);
