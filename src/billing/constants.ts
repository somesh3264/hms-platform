// FR-7.4: "calculate applicable taxes (including GST, per Indian billing
// norms)". Actual GST slabs vary by medicine/service category, which is out
// of scope to model here -- this is only a starting default for the bill
// generation form; billing staff can override it per bill.
export const DEFAULT_TAX_PERCENT = 5;
