import React from 'react';
import ReactDOM from 'react-dom';

import netlist from  './netlist.json';

import levers from './levers';
import Sim from './sim';

import Isvg from 'react-inlinesvg';

console.log('Isvg: ', Isvg);

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  componentDidCatch(error, info) {
    // Display fallback UI
    this.setState({ hasError: true });
    // You can also log the error to an error reporting service
    console.log(error, info);
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return <h1>Something went wrong.</h1>;
    }
    return this.props.children;
  }
}

class Checkbox extends React.Component {
    render() {
        const { label, checked, disabled, onChange } = this.props;
        return (
            <label style={{padding: '3px'}}>
              <span style={disabled ? {color: '#808080'} : {}}>{label}</span>
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
    if (s === '**STRAP**')
        s = '~~~~STRAP';
    if (s === '')
        s = '~~~~';
    return s.toString().replace(/\d+/g, m => ('00000'+m).substr(-5));
}

function mangledCompare(key = x => x) {
    return (a, b) => mangleForSort(key(a)) < mangleForSort(key(b)) ? -1 : 1;
}

function num(x, units = 'V', d = 2) {
    if (typeof(x) === 'number')
        return `${x.toFixed(d)}\u00a0${units}`;
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

class NodeName extends React.Component {
    render() {
        const { node, max } = this.props;
        let names = Array.from(node.names).sort(mangledCompare());
        const primaryName = node.primaryName || names[0];
        names = names.filter(x => x != primaryName);
        if (max && names.length > max)
            names = [ ...names.slice(0, max), '...' ];
        return (
            <span><b>{primaryName}</b>{names.length ? <span> ({names.join(', ')})</span> : null}</span>
        );
    }
}

class Inspector extends React.Component {
    constructor(props) {
        super(props);
        this.state = { };
    }

    render() {
        const { inspected, inspect } = this.props;
        if (inspected.names) {
            const node = inspected;
            let compSortKey = ([comp, terminal]) => `${comp.subnet}/${comp.name}/${terminal}`
            let compare = mangledCompare(compSortKey);
            let wireCompare = mangledCompare((wire) => `${compSortKey([wire.fromComp, wire.fromTerm])}/${compSortKey([wire.toComp, wire.toTerm])}`);
            let Comp = ({comp, terminal}) => (
                <span>
                  ({comp.subnet}) <b>{comp.name} {terminal}</b> ({comp.location ? `${comp.location}` : ''}{comp.index ? ` index ${comp.index}` : ''})
                </span>
            );
            if (this.state.sortByLocation) {
                compSortKey = ([comp, terminal]) => `${comp.subnet}/${comp.location || ''}/${comp.index || ''}/${comp.name}/${terminal}`;
                Comp = ({comp, terminal}) => (
                    <span>
                      ({comp.subnet}{comp.location ? ` ${comp.location}` : ''}{comp.index ? ` index ${comp.index}` : ''}) <b>{comp.name} {terminal}</b>
                    </span>
                );
            }
            let sortWire = (wire) => {
                if (compSortKey([wire.toComp, wire.toTerm]) < compSortKey([wire.fromComp, wire.fromTerm])) {
                    return Object.assign({}, wire, {
                        fromComp: wire.toComp,
                        fromTerm: wire.toTerm,
                        toComp: wire.fromComp,
                        toTerm: wire.fromTerm,
                    });
                } else {
                    return wire;
                }
            };
            return (
                <div>
                  <div style={{color: node.circuit && node.circuit.color}}>
                    <h2>Node <NodeName node={node}/> <InspectLink inspect={inspect} target={null}>[x]</InspectLink></h2>
                    <p>Voltage: <b>{node.circuit ? num(node.circuit.nodeVoltage(node)) : 'unsimulated'}</b></p>
                  </div>
                  <h3>Connections:</h3>
                  <Checkbox label="Sort by location" checked={this.state.sortByLocation}
                            onChange={v => this.setState({sortByLocation: v})}/>
                  <ul>
                    {Array.from(node.members)
                       .map(m => m.payload)
                       .sort(compare)
                       .map(([comp, terminal]) => (
                           <li>
                             <InspectLink inspect={inspect} target={comp}>
                               <Comp comp={comp} terminal={terminal}/>
                             </InspectLink>
                           </li>
                       ))}
                  </ul>
                  <h3>Wires:</h3>
                  <table>
                    {Array.from(node.wires)
                       .map(sortWire)
                       .sort(wireCompare)
                       .map((w) => (
                           <tr>
                             <td>{w.name}</td>
                             <td> 
                               <InspectLink inspect={inspect} target={w.fromComp}>
                                 <Comp comp={w.fromComp} terminal={w.fromTerm}/>
                               </InspectLink>
                             </td>
                             <td> 
                               <InspectLink inspect={inspect} target={w.toComp}>
                                 <Comp comp={w.toComp} terminal={w.toTerm}/>
                               </InspectLink>
                             </td>
                           </tr>
                       ))}
                  </table>
                </div>
            );
        } else {
            const comp = inspected;
            return (
                <div>
                  <h2>Component {comp.name} <InspectLink inspect={inspect} target={null}>[x]</InspectLink></h2>
                  <h3>Properties:</h3>
                  <table style={{paddingLeft: '20px'}}>
                    {Object.keys(comp)
                       .filter(k => typeof(comp[k]) === 'number' || typeof(comp[k]) === 'string')
                       .map(k => {
                           return (
                               <tr>
                                 <td><b>{k}</b>:</td>
                                 <td><tt>{JSON.stringify(comp[k])}</tt></td>
                               </tr>
                           );
                       })}
                  </table>
                  <h3>Terminals:</h3>
                  <table style={{paddingLeft: '20px'}}>
                    {Object.keys(comp.terminals).sort(mangledCompare())
                       .map(t => {
                           const node = comp.terminals[t].shared;
                           return (
                               <tr style={{color: node.circuit && node.circuit.color}}>
                                 <td><b>{t}</b>:</td>
                                 <td style={{textAlign: 'right'}}><b>{node.circuit ? num(node.circuit.nodeVoltage(node)) : 'unsimulated'}</b></td>
                                 <td>
                                   {comp.wireTerminals[t].map(w =>
                                      <InspectLink tag="div" inspect={inspect} target={w.toComp}>
                                        Wire <b>{w.wire.name}</b> to <b>{w.toComp.name} {w.toTerm}</b>
                                      </InspectLink>)}
                                   <InspectLink tag="div" inspect={inspect} target={node}>
                                     Node <NodeName node={node} max={3}/>
                                   </InspectLink>
                                 </td>
                               </tr>
                           );
                       })}
                  </table>
                </div>
            );
        }
    }
}

class InspectLink extends React.Component {
    render() {
        const { inspect, target, children, style, tag: Tag = 'span' } = this.props;
        return (
            <Tag style={Object.assign({cursor: 'pointer'}, style)}
                 onClick={e => { inspect(target); e.stopPropagation(); }}>{children}</Tag>
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
            .filter(c => c.type === 'relay' || c.type === 'bell')
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
        sim.components[`Tower/${name}TCC`].state = levers.states()[name];
    }

    changeOverrideInterlocking(state) {
        const { levers, sim } = this.state;
        this.setState({ overrideInterlocking: state });
        if (!state) {
            levers.reset();
            for (let name in levers.levers)
                sim.components[`Tower/${name}TCC`].state = levers.states()[name];
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
                if (levers.states()[sw] == 'normal' && sim.components[`Sim/SIM-${sw}WCC`].state > 0)
                    sim.components[`Sim/SIM-${sw}WCC`].state--;
                if (levers.states()[sw] == 'reverse' && sim.components[`Sim/SIM-${sw}WCC`].state < 8)
                    sim.components[`Sim/SIM-${sw}WCC`].state++;
            });
        }
        if (!this.state.noBell && sim.components['Tower/BELL'].hasRung && this.bell && this.cowbell) {
            this.ringCount = this.ringCount || 1;
            if (this.ringCount % 5 === 0 || this.state.moreCowbell) {
                this.cowbell.currentTime = 0;
                this.cowbell.play();
            } else {
                this.bell.currentTime = 0;
                this.bell.play();
            }
            sim.components['Tower/BELL'].hasRung = false;
            ++this.ringCount;
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
            if (light.name === '6TKE') {
                num = 2;
                if (sim.components['Tower/6TR'].state === 'up')
                    onColor = '#ff9933';
            } else if (light.name === '9-10TKE') {
                num = 3;
                if (sim.components['Case A/9-10TR'].state === 'up')
                    onColor = '#ff9933';
            } else if (light.name === '12TKE') {
                num = 2;
                if (sim.components['Case A/12TR'].state === 'up')
                    onColor = '#ff9933';
            }
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

        function relayUp(name, bias) {
            if (bias)
                return sim.components[name].state === 'up' && sim.components[name].bias === bias;
            else
                return sim.components[name].state === 'up';
        }

        function updateSignalState(signal, state) {
            const el = document.getElementById(`sig${signal}-state`);
            if (el)
                el.firstElementChild.textContent = state;
        }

        {
            let state = 'BAD ASPECT';
            if (lightOn('1RGE') && !lightOn('1HGE') && !lightOn('1DGE') && !lightOn('1COGE') && !lightOn('1TMGE'))
                state = 'STOP';
            if (!lightOn('1RGE') && !lightOn('1HGE') && !lightOn('1DGE') && lightOn('1COGE') && !lightOn('1TMGE'))
                state = 'Restricting';
            if (!lightOn('1RGE') && lightOn('1HGE') && !lightOn('1DGE') && !lightOn('1COGE') && !lightOn('1TMGE'))
                state = 'Slow Approach';
            if (!lightOn('1RGE') && lightOn('1HGE') && !lightOn('1DGE') && !lightOn('1COGE') && lightOn('1TMGE'))
                state = 'Approach';
            if (!lightOn('1RGE') && !lightOn('1HGE') && lightOn('1DGE') && !lightOn('1COGE') && !lightOn('1TMGE'))
                state = 'Slow Clear';
            if (!lightOn('1RGE') && !lightOn('1HGE') && lightOn('1DGE') && !lightOn('1COGE') && lightOn('1TMGE'))
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
            if (lightOn('14AGE') && lightOn('14BGE') && !relayUp('Sim/SIM-14AAR') && relayUp('Sim/SIM-14BAR', 'forward'))
                state = 'Restricting';
            if (lightOn('14AGE') && lightOn('14BGE') && relayUp('Sim/SIM-14AAR', 'forward') && !relayUp('Sim/SIM-14BAR'))
                state = 'Approach';
            if (lightOn('14AGE') && lightOn('14BGE') && relayUp('Sim/SIM-14AAR', 'reverse') && !relayUp('Sim/SIM-14BAR'))
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
            // const d1 = sim.components['Case A/CASEA'].terminals['T77'].voltage() > 8;
            // const d2 = sim.components['Case A/CASEA'].terminals['T78'].voltage() > 8;
            // const d3 = sim.components['Case A/CASEA'].terminals['T79'].voltage() > 8;
            // if (!d1 && !d2 && !d3)
            //     state = 'Off';
            // if (d1 && d2 && !d3)
            //     state = 'Restricting';
            // if (d1 && !d2 && !d3)
            //     state = 'Approach';
            // if (!d1 && d2 && !d3)
            //     state = 'Approach Diverging';
            // if (!d1 && d2 && d3)
            //     state = 'Advance Approach';
            // if (d1 && d2 && d3)
            //     state = 'Clear';
            if (!relayUp('Sim/SIM-36AAR') && !relayUp('Sim/SIM-36BAR'))
                state = 'Restricting';
            if (relayUp('Sim/SIM-36AAR', 'forward') && !relayUp('Sim/SIM-36BAR'))
                state = 'Approach';
            if (relayUp('Sim/SIM-36AAR', 'reverse') && !relayUp('Sim/SIM-36BAR'))
                state = 'Clear';
            if (relayUp('Sim/SIM-36AAR', 'forward') && relayUp('Sim/SIM-36BAR', 'forward'))
                state = 'Advance Approach';
            if (relayUp('Sim/SIM-36AAR', 'forward') && relayUp('Sim/SIM-36BAR', 'reverse'))
                state = 'Approach Diverging';
            updateSignalState('16d', state);
        }

        {
            if (!lightOn('16AGE') && !lightOn('16BGE'))
                updateSignalState(16, 'BAD ASPECT');
            const g16a = sim.components['Sim/SIM-16AG'];
            const g16b = sim.components['Sim/SIM-16BG'];
            let state = `BAD ASPECT: 16A: ${g16a.angle.toFixed(0)}° 16B: ${g16b.angle.toFixed(0)}° ${lightOn('16COGE') ? "Call-on" : ""}`;
            if (g16a.angle === 0 && g16b.angle === 0 && !lightOn('16COGE'))
                state = 'STOP';
            if (g16a.angle > 0 && g16b.angle === 0 && !lightOn('16COGE')) {
                if (g16a.angle === 45)
                    state = 'Approach';
                else if (g16a.angle === 90)
                    state = 'Clear';
                else
                    state = `16A: ${g16a.angle.toFixed(0)}°`;
            }
            if (g16a.angle === 0 && g16b.angle > 0 && !lightOn('16COGE')) {
                if (g16b.angle === 45)
                    state = 'Diverging Approach';
                else if (g16b.angle === 90)
                    state = 'Diverging Clear';
                else
                    state = `16B: ${g16b.angle.toFixed(0)}°`;
            }
            if (g16a.angle === 0 && g16b.angle === 0 && lightOn('16COGE'))
                state = 'Restricting';
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
                  <Turnout name="switch 6" comp={sim.components['Sim/SIM-6WCC']}/>
                  <Turnout name="switch 9" comp={sim.components['Sim/SIM-9WCC']}/>
                  <Turnout name="switch 10" comp={sim.components['Sim/SIM-10WCC']}/>
                  <Turnout name="switch 12" comp={sim.components['Sim/SIM-12WCC']}/>
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
                    <Checkbox label="No bell"
                              checked={this.state.noBell}
                              onChange={v => this.state.noBell = v}/>
                    {this.ringCount > 10 &&
                      <Checkbox label="More cowbell"
                                checked={this.state.moreCowbell}
                                onChange={v => this.state.moreCowbell = v}/>}
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

            <ErrorBoundary>
            <Isvg
                uniquifyIDs={false}
                src="model-board.svg"
                preloader={ <div>Loading...</div> }>what</Isvg>
            </ErrorBoundary>

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

              <audio ref={x => this.bell = x} src="bell.mp3"/>
              <audio ref={x => this.cowbell = x} src="cowbell.mp3"/>
            </div>
        );
    }
}

ReactDOM.render(
    <Top />,
    document.getElementById('root')
);
