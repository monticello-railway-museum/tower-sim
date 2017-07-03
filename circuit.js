const math = require('mathjs');

function matrixAdd(matrix, index, value) {
    matrix.set(index, matrix.get(index) + value);
}

class Circuit {
    constructor(numNodes, numVoltageSources) {
        this.nodes = numNodes - 1;
        this.voltageSources = numVoltageSources;

        const { nodes, voltageSources } = this;

        this.A = math.zeros(nodes + voltageSources,
                            nodes + voltageSources,
                            'sparse');
        this.z = math.zeros(nodes + voltageSources,
                            1,
                            'sparse');

        this.usedNodes = new Set();
    }

    resistor(nodeA, nodeB, value) {
        const G = 1/value;

        if (nodeA != 0)
            matrixAdd(this.A, [nodeA - 1, nodeA - 1], G);
        if (nodeB != 0)
            matrixAdd(this.A, [nodeB - 1, nodeB - 1], G);
        if (nodeA != 0 && nodeB != 0) {
            matrixAdd(this.A, [nodeA - 1, nodeB - 1], -G);
            matrixAdd(this.A, [nodeB - 1, nodeA - 1], -G);
        }

        this.usedNodes.add(nodeA);
        this.usedNodes.add(nodeB);
    }

    voltageSource(sourceNum, nodeNeg, nodePos, value) {
        const { nodes, voltageSources } = this;

        if (nodeNeg != 0) {
            this.A.set([nodeNeg - 1, nodes + sourceNum], -1);
            this.A.set([nodes + sourceNum, nodeNeg - 1], -1);
        }
        if (nodePos != 0) {
            this.A.set([nodePos - 1, nodes + sourceNum], 1);
            this.A.set([nodes + sourceNum, nodePos - 1], 1);
        }
        this.z.set([nodes + sourceNum, 0], value);

        this.usedNodes.add(nodeNeg);
        this.usedNodes.add(nodePos);
    }

    solve() {
        const { nodes } = this;

        for (let i = 0; i < nodes; ++i) {
            if (!this.usedNodes.has(i + 1)) {
                console.log('ground node', i + 1);
                this.A.set([i, i], 1);
            }
        }
        console.log(this.A.toString());
        this.x = math.multiply(math.inv(this.A), this.z);
    }

    nodeVoltage(node) {
        if (node === 0)
            return 0;
        return this.x.get([node - 1, 0]);
    }

    voltageSourceCurrent(sourceNum) {
        return this.x.get([this.nodes + sourceNum, 0]);
    }
};

module.exports = Circuit;

// const cir = new Circuit(5, 1);

// cir.voltageSource(0, 0, 1, 1);
// cir.resistor(1, 2, 0.1);
// cir.resistor(2, 0, 1);

// //cir.resistor(0, 3, 1);
// //cir.resistor(0, 4, 1);

// console.log(cir.A.toString());

// cir.solve();

// for (let i = 0; i < 4; ++i)
//     console.log('node', i, 'voltage:', cir.nodeVoltage(i));
// console.log('source 0 current', cir.voltageSourceCurrent(0));
