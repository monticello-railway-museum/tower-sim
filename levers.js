class Levers {
    constructor(spec) {
        this.levers = { };

        const { levers } = this;

        for (let row of spec) {
            if (!levers[row.lever]) {
                levers[row.lever] = {
                    name: row.lever,
                    type: row.type,
                    rules: [ ],
                    state: 'normal',
                };
            }
            const lever = levers[row.lever];

            function decode(lockSpec) {
                const ret = { };
                lockSpec.split(/\s+/).filter(x => x !== '').forEach(w => {
                    const match = w.match(/^(\()?([^)]*)/);
                    if (match) {
                        const type = match[1] ? 'reverse' : 'normal';
                        //console.log(lockSpec, match[0], ret);
                        if (ret[match[2]] && ret[match[2]] !== type)
                            ret[match[2]] = 'either';
                        else
                            ret[match[2]] = type;
                    }
                });
                return ret;
            }

            lever.rules.push({
                when: row.when ? decode(row.when) : null,
                lock: row.lock ? decode(row.lock) : { },
            });
        }
    }

    names() {
        return Object.keys(this.levers);
    }

    states() {
        const ret = { };
        for (let name in this.levers)
            ret[name] = this.levers[name].state;
        return ret;
    }

    locked(states = this.states()) {
        const { levers } = this;
        const locked = { };
        for (let name in levers)
            locked[name] = false;
        for (let name in levers) {
            const lever = levers[name];
            if (states[name] === 'reverse') {
                for (let rule of lever.rules) {
                    let condition = true;
                    if (rule.when) {
                        for (let test in rule.when) {
                            if (states[test] !== rule.when[test])
                                condition = false;
                        }
                    }
                    if (condition) {
                        for (let lock in rule.lock) {
                            if (rule.lock[lock] === 'either' || rule.lock[lock] === states[lock])
                                locked[lock] = true;
                            else
                                throw new Error(`Lever ${name} rule ${JSON.stringify(rule)} inconsistent with lever ${lock} state ${states[lock]}`);
                        }
                    }
                }
            }
        }
        return locked;
    }

    reset() {
        const { levers } = this;
        for (let name in levers)
            levers[name].state = 'normal';
    }

    canPull(states = this.states()) {
        const { levers } = this;
        const locked = this.locked(states);

        const ret = { };
        for (let name in levers) {
            let canPull = !locked[name];
            try {
                this.locked(Object.assign({ }, states, { [name]: states[name] === 'normal' ? 'reverse' : 'normal' }));
            } catch (e) {
                canPull = false;
            }
            ret[name] = canPull;
        }
        return ret;
    }

    pull(name, override) {
        const { levers } = this;
        const newState = levers[name].state === 'normal' ? 'reverse' : 'normal';
        //console.log('pull', name);
        if (!override)
            this.locked(Object.assign(this.states(), { [name]: newState }));
        levers[name].state = newState;
    }

    toggle(name) {
        const { levers } = this;

        if (levers[name].locked)
            throw new Error(`Lever ${name} is locked ${levers[name].state}`);

        for (let rule of levers[name].rules) {

        }

    }
}

module.exports = Levers;

// const fs = require('fs');
// const util = require('util');

// const netlist = JSON.parse(fs.readFileSync('netlist.json'));
// const l = new Levers(netlist.leverLocking);

// console.log(util.inspect(l.canPull(), { depth: null }));
// l.pull('7');
// console.log(util.inspect(l.canPull(), { depth: null }));
// l.pull('2');
// console.log(util.inspect(l.canPull(), { depth: null }));
