
import { calculateFinancials } from './calculation.js';

console.log("--- TEST REPRODUCING USER CASE ---");
console.log("Budget: 32000, Owners: 2, Type: unifamiliar");

const r = calculateFinancials({
    presupuesto: 32000,
    savingsKwh: 5000,
    numOwners: 2,
    tipo: 'unifamiliar'
});

console.log(`Owners: ${r.numOwners}`);
console.log(`Deduction Total: ${r.irpfDeduction}`);
console.log(`Deduction Per Owner: ${r.irpfDeductionPerOwner}`);

const budgetPerOwner = 32000 / 2;
console.log(`Budget Per Owner: ${budgetPerOwner}`);
const expectedDeductionPerOwner = Math.min(9000, budgetPerOwner * 0.60);
console.log(`Expected Deduction Per Owner: ${expectedDeductionPerOwner}`);
console.log(`Total Expected: ${expectedDeductionPerOwner * 2}`);

console.log(`Actual Total: ${r.irpfDeduction}`);

if (r.irpfDeduction === expectedDeductionPerOwner * 2) {
    console.log("SUCCESS");
} else {
    console.log("FAILURE");
}
