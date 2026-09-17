import {
  ValidationOperatorHandler,
} from '../types.js'
import { validateAnd } from './and.js'
import { validateOr } from './or.js'
import { validateContains } from './contains.js'
import { validateAll } from './all.js'
import { validateSequence } from './sequence.js'
import { validateNot } from './not.js'
import { validateSchemaOperator } from './schema.js'
import { validateExists } from './exists.js'
import { validateExpect } from './expect.js'
import { validateDiff } from './diff.js'
import { validateEach } from './each.js'
import { validateExpr } from './expr.js'
import { validateSort } from './sort.js'
import { validateNth, validateFirst, validateLast } from './nth.js'
import {
  validateEq,
  validateNe,
  validateGt,
  validateGte,
  validateLt,
  validateLte,
  validateIn,
  validateNin,
} from './cmp.js'

/** Map of supported collection validation operators. */
export const OPERATORS: Record<string, ValidationOperatorHandler> = {
  $and: validateAnd,
  $or: validateOr,
  $contains: validateContains,
  $all: validateAll,
  $sequence: validateSequence,
  $not: validateNot,
  $schema: validateSchemaOperator,
  $exists: validateExists,
  $expect: validateExpect,
  $diff: validateDiff,
  $each: validateEach,
  $expr: validateExpr,
  $sort: validateSort,
  $nth: validateNth,
  $first: validateFirst,
  $last: validateLast,
  $eq: validateEq,
  $ne: validateNe,
  $gt: validateGt,
  $gte: validateGte,
  $lt: validateLt,
  $lte: validateLte,
  $in: validateIn,
  $nin: validateNin,
}

export { validateAnd } from './and.js'
export { validateOr } from './or.js'
export { validateContains } from './contains.js'
export { validateAll } from './all.js'
export { validateSequence } from './sequence.js'
export { validateNot } from './not.js'
export { validateSchemaOperator } from './schema.js'
export { validateExists } from './exists.js'
export { validateExpect } from './expect.js'
export { validateDiff } from './diff.js'
export { validateEach } from './each.js'
export { validateExpr } from './expr.js'
export { validateSort } from './sort.js'
export { validateNth, validateFirst, validateLast } from './nth.js'
export {
  validateEq,
  validateNe,
  validateGt,
  validateGte,
  validateLt,
  validateLte,
  validateIn,
  validateNin,
} from './cmp.js'
