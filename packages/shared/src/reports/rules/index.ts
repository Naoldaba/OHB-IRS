/** Business Rules Engine — declarative DSL, evaluator, field catalog, and
 *  config validation. Shared verbatim by the API (authority) and the web app
 *  (immediate UX feedback). See IMPLEMENTATION_PLAN §6. */
export * from './rule-ast';
export * from './field-catalog';
export * from './evaluate';
export * from './validate-rules';
