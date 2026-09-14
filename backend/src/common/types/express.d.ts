import "express";

declare module "express" {
  interface Request {
    /** Id de correlação da requisição (ver RequestLoggerMiddleware) — usado para juntar, nos logs, a linha de acesso HTTP às linhas de domínio que essa requisição disparou. */
    id?: string;
  }
}
