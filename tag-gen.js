const fs = require('fs');

const PDFDocument = require('pdfkit');

const Sim = require('./sim');

const sim = new Sim();

const bigSize = 12;
const smallSize = 6;

const margin = 0.5 * 72;

const paperWidth = 8.5 * 72;
const paperHeight = 11 * 72;

const tagHeight = 0.675 * 72;
const tagWidth = 1.25 * 72;
const tagMargin = 0.05 * 72;

//const tagHeight = 1.00;
//const tagWidth = 0.87;

const tagsPerPage = Math.floor((paperHeight - margin * 2) / tagHeight);

const pdf = new PDFDocument({ autoFirstPage: false, size: [ paperWidth, paperHeight ], margin });
pdf.pipe(fs.createWriteStream('out.pdf'));

const y0 = (paperHeight - tagHeight * tagsPerPage) / 2;
const x0 = (paperWidth - tagWidth * 4) / 2;

pdf.on('pageAdded', () => {
    // for (let r = 0; r < tagsPerPage; ++r) {
    //     const y = y0 + tagHeight * r;
    //     for (let c = 0; c < 4; ++c) {
    //         const x = x0 + tagWidth * c;
    //         console.log(x, y, tagsPerPage);
    //         pdf.moveTo(x, y)
    //             .lineTo(x + tagWidth, y)
    //             .lineTo(x + tagWidth, y + tagHeight)
    //             .lineTo(x, y + tagHeight)
    //             .lineTo(x, y)
    //             .stroke();
    //     }
    // }

    pdf.save();
    pdf.lineWidth(0.2);

    for (let r = 0; r <= tagsPerPage; ++r) {
        const y = y0 + tagHeight * r;
        pdf.moveTo(margin, y)
            .lineTo(paperWidth - margin, y)
            .stroke();
    }
    for (let c = 0; c <= 4; ++c) {
        const x = x0 + tagWidth * c;
        pdf.moveTo(x, margin)
            .lineTo(x, paperHeight - margin)
            .stroke();
    }

    pdf.restore();
});
pdf.addPage();

function inTag(c, r, fn) {
    pdf.save();
    pdf.translate(x0 + c * tagWidth, y0 + r * tagHeight);
    if (c % 2 === 1)
        pdf.rotate(180, { origin: [ tagWidth / 2, tagHeight / 2 ] });
    fn();
    pdf.restore();
}

let r = 0;
for (let wire of sim.wires) {
    if (wire.fromSubnet === wire.toSubnet && wire.fromSubnet === 'Case A') {
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
                if (w.wire.name === '**STRAP**' && w.toComp === comp
                    && w.toTerm.slice(-1) === term.slice(-1)) {
                    terms.push(w.toTerm);
                }
            }
            terms.sort();
            return terms.join(',');
        }
        let page = `[${wire.page}]`
        if (!wire.page)
            page = '';
        const fromTerm = resolveStrap(wire.fromComp, wire.fromTerm);
        const toTerm = resolveStrap(wire.toComp, wire.toTerm);
        console.log(`FRONT: ${name} ${page}`);
        console.log(`BACK1: ${wire.fromComp.name} ${fromTerm}`);
        console.log(`BACK2: ${wire.toComp.name} ${toTerm}`);
        console.log('');

        function center(string, xc, yc) {
            const w = pdf.widthOfString(string);
            const h = pdf.currentLineHeight();

            pdf.save();
            const scale = (tagWidth - tagMargin * 2) / w;
            if (scale < 1) {
                pdf.scale(scale, 1, { origin: [ xc, yc ] });
            }
            pdf.text(string, xc - w / 2, yc - h / 2);
            pdf.restore();
        }

        const xc = tagWidth / 2;
        const yc = tagHeight / 2;

        [0, 2].forEach(c => {
            inTag(c, r, () => {
                pdf.font('Helvetica');
                pdf.fontSize(smallSize);
                pdf.text(`Wire`, tagMargin, tagMargin);

                pdf.font('Helvetica-Bold');
                pdf.fontSize(bigSize);

                const th = pdf.currentLineHeight();

                if (primaryName && primaryName !== wire.name) {
                    center(wire.name || '', xc, yc - th/2);
                    pdf.font('Helvetica');
                    pdf.fontSize(bigSize * 0.8);
                    center(`(${primaryName})`, xc, yc + th/2);
                } else {
                    center(wire.name || '', xc, yc);
                }

                // if (wire.page) {
                //     pdf.font('Helvetica');
                //     pdf.fontSize(smallSize);
                //     pdf.text(`Page ${wire.page}`, tagMargin, tagHeight - tagMargin - pdf.currentLineHeight());
                // }
            });
        });

        function doTerm(comp, term, otherComp, otherTerm) {
            pdf.font('Helvetica');
            pdf.fontSize(smallSize);
            pdf.text(`Terminal`, tagMargin, tagMargin);

            pdf.font('Helvetica-Bold');
            pdf.fontSize(bigSize);
            center(`${comp.name} ${term}`, xc, yc);
            pdf.font('Helvetica');
            pdf.fontSize(smallSize);
            pdf.text(`This:  ${otherComp.name} ${otherTerm}`, tagMargin, tagHeight - tagMargin - pdf.currentLineHeight());
        }

        inTag(1, r, () => doTerm(wire.fromComp, fromTerm, wire.toComp, toTerm));
        inTag(3, r, () => doTerm(wire.toComp, toTerm, wire.fromComp, fromTerm));

        if (++r >= tagsPerPage) {
            pdf.addPage();
            r = 0;
        }
    }
}

pdf.end();
