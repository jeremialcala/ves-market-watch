/** Errores RFC 7807 del contrato (`application/problem+json`). */

export interface Problem {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
}

export class ApiError extends Error {
  readonly problem: Problem;
  /** Segundos del header Retry-After cuando el error fue un 429. */
  readonly retryAfterS?: number;

  constructor(problem: Problem, retryAfterS?: number) {
    super(problem.detail ?? problem.title);
    this.name = "ApiError";
    this.problem = problem;
    this.retryAfterS = retryAfterS;
  }

  get status(): number {
    return this.problem.status;
  }
}

export function esProblem(valor: unknown): valor is Problem {
  return (
    typeof valor === "object" &&
    valor !== null &&
    "title" in valor &&
    "status" in valor
  );
}
