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
    var x= new Array(n);
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
    constructor(numNodes, numVoltageSources) {
        this.nodes = numNodes - 1;
        this.voltageSources = numVoltageSources;

        const { nodes, voltageSources } = this;

        this.A = [];
        this.A.length = nodes + voltageSources;
        for (let i = 0; i < this.A.length; ++i) {
            this.A[i] = [];
            this.A[i].length = nodes + voltageSources + 1;
            this.A[i].fill(0);
        }
    }

    resistor(nodeA, nodeB, value) {
        const G = 1/value;

        if (nodeA != 0)
            this.A[nodeA - 1][nodeA - 1] += G;
        if (nodeB != 0)
            this.A[nodeB - 1][nodeB - 1] += G;
        if (nodeA != 0 && nodeB != 0) {
            this.A[nodeA - 1][nodeB - 1] -= G;
            this.A[nodeB - 1][nodeA - 1] -= G;
        }
    }

    voltageSource(sourceNum, nodeNeg, nodePos, value) {
        const { nodes, voltageSources } = this;

        if (nodeNeg != 0) {
            this.A[nodeNeg - 1][nodes + sourceNum] = -1;
            this.A[nodes + sourceNum][nodeNeg - 1] = -1;
        }
        if (nodePos != 0) {
            this.A[nodePos - 1][nodes + sourceNum] = 1;
            this.A[nodes + sourceNum][nodePos - 1] = 1;
        }
        this.A[nodes + sourceNum][nodes + voltageSources] = value;
    }

    solve() {
        this.x = gauss(this.A);
    }

    nodeVoltage(node) {
        if (node === 0)
            return 0;
        return this.x[node - 1];
    }

    voltageSourceCurrent(sourceNum) {
        return this.x[this.nodes + sourceNum];
    }
};

module.exports = Circuit;

// const cir = new Circuit(5, 1);

// cir.voltageSource(0, 0, 1, 1);
// cir.resistor(1, 2, 10);
// cir.resistor(2, 0, 1);

// cir.resistor(0, 3, 1);
// cir.resistor(0, 4, 1);

// console.log(cir.A.toString());

// cir.solve();

// for (let i = 0; i < 4; ++i)
//     console.log('node', i, 'voltage:', cir.nodeVoltage(i));
// console.log('source 0 current', cir.voltageSourceCurrent(0));
