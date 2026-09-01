// bills.category is a plain TEXT column (not a foreign key), so "is this
// bill's category a debt category" has to be resolved by name against
// categories.is_debt at query time -- shared here since bills.js and
// paychecks.js both hand bill rows to the frontend and both need it.
export const BILLS_WITH_CATEGORY_SELECT =
  'SELECT bills.*, categories.is_debt AS category_is_debt FROM bills LEFT JOIN categories ON categories.name = bills.category';
