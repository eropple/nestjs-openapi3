import { OpenapiError } from '../errors';

export class PathAlreadyExistsError extends OpenapiError {}
export class PathDoesNotExistError extends OpenapiError {}
export class OperationAlreadyExistsError extends OpenapiError {}
export class OperationDoesNotExistError extends OpenapiError {}
