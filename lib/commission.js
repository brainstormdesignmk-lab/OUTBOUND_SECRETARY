// ========================================
// RENT COMMISSION RULES
// ========================================
export function getRentDefaults() {
  return {
    depositMonths: 1,
    minimumStayMonths: 12,
    advanceRentMonths: 1
  };
}

export function calculateRentCommission(monthlyRent) {
  if (!monthlyRent || monthlyRent <= 0) {
    return {
      ownerFee: 0,
      tenantFee: 0,
      totalFee: 0,
      rule: 'invalid',
      ownerCommissionRate: 0,
      tenantCommissionRate: 0
    };
  }

  const isUnder1000 = monthlyRent < 1000;
  
  const ownerFee = isUnder1000 
    ? monthlyRent * 0.5 
    : monthlyRent * 1.0;
    
  const tenantFee = monthlyRent * 0.5;
  
  return {
    ownerFee: Math.round(ownerFee),
    tenantFee: Math.round(tenantFee),
    totalFee: Math.round(ownerFee + tenantFee),
    rule: isUnder1000 ? 'under_1000' : 'over_1000',
    ownerCommissionRate: isUnder1000 ? 0.5 : 1.0,
    tenantCommissionRate: 0.5
  };
}
