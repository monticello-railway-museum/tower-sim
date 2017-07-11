/** Solve a linear system of equations given by a n&times;n matrix
    with a result vector n&times;1. */
function gauss(A) {
    var n = A.length;

    for (var i=0; i<n; i++) {
        // Search for maximum in this column
        var maxEl = Math.abs(A[i][i]);
        var maxRow = i;
        for(var k=i+1; k<n; k++) {
            if (Math.abs(A[k][i]) > maxEl) {
                maxEl = Math.abs(A[k][i]);
                maxRow = k;
            }
        }

        if (maxRow !== i) {
            // Swap maximum row with current row (column by column)
            for (var k=i; k<n+1; k++) {
                var tmp = A[maxRow][k];
                A[maxRow][k] = A[i][k];
                A[i][k] = tmp;
            }
        }

        if (maxEl !== 0) {
            // Make all rows below this one 0 in current column
            for (k=i+1; k<n; k++) {
                var c = -A[k][i]/A[i][i];
                for(var j=i; j<n+1; j++) {
                    if (i==j) {
                        A[k][j] = 0;
                    } else {
                        A[k][j] += c * A[i][j];
                    }
                }
            }
        }
    }


    // Solve equation Ax=b for an upper triangular matrix A
    var x = [];
    x.length = n;
    for (var i=n-1; i>-1; i--) {
        if (A[i][i] === 0)
            x[i] = 0;
        else
            x[i] = A[i][n]/A[i][i];
        for (var k=i-1; k>-1; k--) {
            A[k][n] -= A[k][i] * x[i];
        }
    }
    return x;
}

class Circuit {
    constructor(groundNode) {
        this.groundNode = groundNode;

        this.nodes = new Map();
        this.vSources = new Map();

        this.reset();
    }

    reset() {
        this.nodes.clear();
        this.vSources.clear();
        this.A = [];
        this.C = [];
        this.iSourceValues = [];
        this.vSourceValues = [];
        this.x = undefined;
    }

    nodeNum(node) {
        if (node === this.groundNode)
            return null;
        if (this.nodes.has(node))
            return this.nodes.get(node);

        const nodes = this.nodes.size;
        const vSources = this.vSources.size;

        for (let i = 0; i < nodes; ++i)
            this.A[i][nodes] = 0;
        const z = [];
        z.length = nodes + 1;
        z.fill(0);
        this.A[nodes] = z;

        for (let i = 0; i < vSources; ++i)
            this.C[i][nodes] = 0;

        this.iSourceValues[nodes] = 0;

        this.nodes.set(node, nodes);
        return nodes;
    }

    vSourceNum(vSource) {
        if (this.vSources.has(vSource))
            return this.vSources.get(vSource);

        const nodes = this.nodes.size;
        const vSources = this.vSources.size;

        const z = [];
        z.length = nodes;
        z.fill(0);
        this.C[vSources] = z;
        this.vSourceValues[vSources] = 0;

        this.vSources.set(vSource, vSources);
        return vSources;
    }

    resistor(nodeA, nodeB, value) {
        const G = 1/value;

        const numA = this.nodeNum(nodeA);
        const numB = this.nodeNum(nodeB);

        if (numA != null)
            this.A[numA][numA] += G;
        if (numB != null)
            this.A[numB][numB] += G;
        if (numA != null && numB != null) {
            this.A[numA][numB] -= G;
            this.A[numB][numA] -= G;
        }
    }

    voltageSource(source, nodeNeg, nodePos, value) {
        const { nodes, voltageSources } = this;

        const numSource = this.vSourceNum(source);
        const numNeg = this.nodeNum(nodeNeg);
        const numPos = this.nodeNum(nodePos);

        if (numNeg != null)
            this.C[numSource][numNeg] = -1;
        if (numPos != null)
            this.C[numSource][numPos] = 1;
        this.vSourceValues[numSource] = value;
    }

    currentSource(nodeNeg, nodePos, value) {
        const numNeg = this.nodeNum(nodeNeg);
        const numPos = this.nodeNum(nodePos);
        
        if (numNeg != null)
            this.iSourceValues[nodeNeg] -= value;
        if (numPos != null)
            this.iSourceValues[nodePos] += value;
    }

    solve() {
        const nodes = this.nodes.size;
        const vSources = this.vSources.size;

        for (let i = nodes; i < nodes + vSources; ++i)
            this.A[i] = this.C[i - nodes];

        for (let r = 0; r < nodes; ++r)
            for (let c = 0; c < vSources; ++c)
                this.A[r][c + nodes] = this.A[nodes + c][r];

        for (let r = nodes; r < nodes + vSources; ++r)
            for (let c = nodes; c < nodes + vSources; ++c)
                this.A[r][c] = 0;

        for (let r = 0; r < nodes; ++r)
            this.A[r][nodes + vSources] = this.iSourceValues[r];
        for (let n = 0; n < vSources; ++n)
            this.A[nodes + n][nodes + vSources] = this.vSourceValues[n];

        this.x = gauss(this.A);
    }

    inCircuit(node) {
        return this.nodes.has(node);
    }

    nodeVoltage(node) {
        const num = this.nodes.get(node);
        if (node === this.groundNode)
            return 0;
        if (num == null)
            return undefined;
        return this.x[num];
    }

    voltageSourceCurrent(source) {
        const num = this.vSources.get(source);
        return -this.x[this.nodes.size + num];
    }
};

module.exports = Circuit;

const cir = new Circuit('ground');

//cir.voltageSource(0, 0, 1, 1);
//cir.currentSource(0, 1, 1);
//cir.resistor(1, 2, 10);
//cir.resistor(2, 0, 1);

//cir.resistor(0, 3, 1);
//cir.resistor(0, 4, 1);

// cir.resistor('ground', '1', 2);
// cir.resistor('ground', '2', 8);
// cir.voltageSource('V1', '1', '2', 32);
// cir.resistor('2', '3', 4);
// cir.voltageSource('V2', '3', 'ground', 20);

// console.log(cir);

// cir.solve();

// console.log(cir);

// for (let i = 0; i < 4; ++i)
//     console.log('node', i, 'voltage:', cir.nodeVoltage(i));
// console.log('source 0 current', cir.voltageSourceCurrent(0));
