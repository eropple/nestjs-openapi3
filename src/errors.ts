export class OpenapiError extends Error {}

/**
 * NestJS does some stuff with the way it structures its internals
 * that require us to do some introspection and break
 * some otherwise-smart encapsulation. If you see this error, it
 * means that something unexpected happened in this process. The
 * most likely culprit is a breaking change to NestJS's internal
 * APIs.
 */
export class ArchaeologyFailedError extends OpenapiError {}

export class BadArgumentError extends OpenapiError {}

/**
 * Thrown when we fail to determine a type from the TypeScript
 * metadata we're given. Usually means that a given property or
 * parameter requires explicit declaration.
 */
export class InferenceError extends OpenapiError {}

/**
 * Thrown when there is a problem in the definition of a particular
 * object (i.e., a parameter that is insufficiently specified).
 */
export class DefinitionError extends OpenapiError {}
