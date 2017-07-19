const Sim = require('./sim');

const sim = new Sim();

for (let wire of sim.wires) {
    if (wire.fromSubnet === wire.toSubnet) {
        if (wire.name === '**STRAP**')
            continue;
        const node = wire.fromComp.terminals[wire.fromTerm];
        const primaryName = node.shared.primaryName;
        let name = `${wire.name}`.replace(/ \*$/, '');
        if (primaryName && primaryName != name)
            name = `${wire.name} (${primaryName})`;
        function resolveStrap(comp, term) {
            const terms = [ term ];
            for (let w of comp.wireTerminals[term]) {
                if (w.wire.name === '**STRAP**' && w.toComp === comp)
                    terms.push(w.toTerm);
            }
            terms.sort();
            return terms.join(',');
        }
        let page = `[${wire.page}]`
        if (!wire.page)
            page = '';
        console.log(`FRONT: ${name} ${page}`);
        console.log(`BACK1: ${wire.fromComp.name} ${resolveStrap(wire.fromComp, wire.fromTerm)}`);
        console.log(`BACK2: ${wire.toComp.name} ${resolveStrap(wire.toComp, wire.toTerm)}`);
        console.log('');
    }
}
