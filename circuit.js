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
    }

    solve() {
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

const cir = new Circuit(3, 1);

cir.voltageSource(0, 0, 1, 1);
cir.resistor(1, 2, 0.1);
cir.resistor(2, 0, 1);

cir.solve();

for (let i = 0; i < 3; ++i)
    console.log('node', i, 'voltage:', cir.nodeVoltage(i));
console.log('source 0 current', cir.voltageSourceCurrent(0));
